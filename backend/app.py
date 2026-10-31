"""
AMBIT SecretGuard – Main Flask Application
GitHub Repository Monitoring and Secret Leak Detection System.
"""

import os
import json
import datetime
import threading

from flask import Flask, request, jsonify, abort
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv()

from database import init_db, get_db, load_tokens_to_env
from github_service import (
    get_authenticated_user,
    get_repository,
    get_commits,
    push_test_file,
    create_webhook,
    delete_webhook,
)
from webhook_handler import verify_signature, process_push_event
from repository_scanner import scan_repository
from remediation import resolve_alert, get_remediation_stats

# ---------------------------------------------------------------------------
app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

WEBHOOK_SECRET = os.getenv("GITHUB_WEBHOOK_SECRET", "ambit-secretguard-webhook-secret")
WEBHOOK_URL = os.getenv("WEBHOOK_PUBLIC_URL", "")   # e.g. https://your-ngrok-url.ngrok.io/webhook

# ---------------------------------------------------------------------------
# Startup
# ---------------------------------------------------------------------------
init_db()
load_tokens_to_env()   # Restore GitHub tokens from DB so they survive restarts

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _row_to_dict(row):
    return dict(row) if row else None


def _rows_to_list(rows):
    return [dict(r) for r in rows]


def _error(msg: str, code: int = 400):
    return jsonify({"error": msg}), code


def _get_token_for_account(username: str) -> str | None:
    """Return the GitHub token for an account — checks env first, then DB."""
    key = f"GITHUB_TOKEN_{username.upper().replace('-', '_')}"
    token = os.getenv(key)
    if token:
        return token
    # Fallback: load from database (handles restarts where env was cleared)
    try:
        conn = get_db()
        row = conn.execute(
            "SELECT token_enc FROM connected_accounts WHERE username=? AND is_active=1",
            (username,)
        ).fetchone()
        conn.close()
        if row and row["token_enc"]:
            token = row["token_enc"]
            # Cache back into env for this session
            os.environ[key] = token
            return token
    except Exception:
        pass
    return None

# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "AMBIT SecretGuard", "timestamp": datetime.datetime.utcnow().isoformat()})

# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------

@app.route("/api/dashboard", methods=["GET"])
def dashboard():
    conn = get_db()

    accounts = conn.execute("SELECT COUNT(*) as c FROM connected_accounts WHERE is_active=1").fetchone()["c"]
    repos = conn.execute("SELECT COUNT(*) as c FROM repositories").fetchone()["c"]
    commits = conn.execute("SELECT COUNT(*) as c FROM commits").fetchone()["c"]
    mods = conn.execute("SELECT COUNT(*) as c FROM repository_modifications").fetchone()["c"]

    scan_row = conn.execute("SELECT SUM(files_scanned) as fs, SUM(leaks_found) as lf FROM scan_history WHERE status='completed'").fetchone()
    files_scanned = scan_row["fs"] or 0
    total_leaks = scan_row["lf"] or 0

    alerts_all = conn.execute("SELECT COUNT(*) as c FROM security_alerts").fetchone()["c"]
    critical = conn.execute("SELECT COUNT(*) as c FROM security_alerts WHERE severity='critical'").fetchone()["c"]
    resolved = conn.execute("SELECT COUNT(*) as c FROM security_alerts WHERE status='resolved'").fetchone()["c"]
    pending = conn.execute("SELECT COUNT(*) as c FROM security_alerts WHERE status='unresolved'").fetchone()["c"]

    conn.close()
    return jsonify({
        "connected_accounts": accounts,
        "monitored_repositories": repos,
        "total_commits": commits,
        "total_modifications": mods,
        "files_scanned": files_scanned,
        "possible_leaks": total_leaks,
        "critical_alerts": critical,
        "resolved_alerts": resolved,
        "pending_alerts": pending,
        "total_alerts": alerts_all,
    })

# ---------------------------------------------------------------------------
# GitHub Account Connection
# ---------------------------------------------------------------------------

@app.route("/api/accounts", methods=["GET"])
def list_accounts():
    conn = get_db()
    rows = conn.execute("SELECT * FROM connected_accounts WHERE is_active=1 ORDER BY connected_at DESC").fetchall()
    conn.close()
    result = []
    for r in rows:
        d = dict(r)
        # Tell the frontend whether we have a usable token (don't expose the actual token)
        d["token_active"] = bool(d.get("token_enc") or os.getenv(f"GITHUB_TOKEN_{d['username'].upper().replace('-','_')}"))
        d.pop("token_enc", None)  # Never expose full token to frontend
        result.append(d)
    return jsonify(result)



@app.route("/api/accounts/connect", methods=["POST"])
def connect_account():
    """Connect a GitHub account using a personal access token."""
    data = request.get_json(force=True)
    token = data.get("token", "").strip()

    if not token:
        return _error("GitHub token is required")

    user = get_authenticated_user(token)
    if not user:
        return _error("Invalid GitHub token or authentication failed", 401)

    username = user.get("login", "")
    avatar_url = user.get("avatar_url", "")
    profile_url = user.get("html_url", "")
    token_hint = "****" + token[-4:] if len(token) >= 4 else "****"

    conn = get_db()
    # Deactivate existing connection for same username
    conn.execute("UPDATE connected_accounts SET is_active=0 WHERE username=?", (username,))

    conn.execute("""
        INSERT INTO connected_accounts (username, avatar_url, profile_url, token_hint, token_enc, connected_at, is_active)
        VALUES (?, ?, ?, ?, ?, ?, 1)
    """, (username, avatar_url, profile_url, token_hint, token, datetime.datetime.utcnow().isoformat()))
    conn.commit()
    conn.close()

    # Also store in environment for this session
    os.environ[f"GITHUB_TOKEN_{username.upper().replace('-', '_')}"] = token

    return jsonify({
        "username": username,
        "avatar_url": avatar_url,
        "profile_url": profile_url,
        "token_hint": token_hint,
        "message": f"Account @{username} connected successfully",
    })


@app.route("/api/accounts/<int:account_id>/disconnect", methods=["POST"])
def disconnect_account(account_id):
    conn = get_db()
    row = conn.execute("SELECT * FROM connected_accounts WHERE id=?", (account_id,)).fetchone()
    if not row:
        conn.close()
        return _error("Account not found", 404)

    conn.execute("UPDATE connected_accounts SET is_active=0 WHERE id=?", (account_id,))
    conn.commit()
    conn.close()
    return jsonify({"message": "Account disconnected"})

# ---------------------------------------------------------------------------
# Repositories
# ---------------------------------------------------------------------------

@app.route("/api/repositories", methods=["GET"])
def list_repositories():
    conn = get_db()
    rows = conn.execute("""
        SELECT r.*, ca.username as account_username, ca.avatar_url as account_avatar
        FROM repositories r
        LEFT JOIN connected_accounts ca ON ca.id = r.account_id
        ORDER BY r.connected_at DESC
    """).fetchall()

    result = []
    for row in rows:
        d = dict(row)
        # Attach commit + alert counts
        d["commit_count"] = conn.execute(
            "SELECT COUNT(*) as c FROM commits WHERE repo_id=?", (row["id"],)
        ).fetchone()["c"]
        d["modification_count"] = conn.execute(
            "SELECT COUNT(*) as c FROM repository_modifications WHERE repo_id=?", (row["id"],)
        ).fetchone()["c"]
        d["alert_count"] = conn.execute(
            "SELECT COUNT(*) as c FROM security_alerts WHERE repo_id=? AND status='unresolved'", (row["id"],)
        ).fetchone()["c"]
        result.append(d)

    conn.close()
    return jsonify(result)


@app.route("/api/repositories/connect", methods=["POST"])
def connect_repository():
    """Connect a GitHub repository."""
    data = request.get_json(force=True)
    account_id = data.get("account_id")
    repo_full_name = data.get("repo_full_name", "").strip()
    is_test_repo = data.get("is_test_repo", False)

    if not account_id or not repo_full_name:
        return _error("account_id and repo_full_name are required")

    conn = get_db()
    account = conn.execute("SELECT * FROM connected_accounts WHERE id=?", (account_id,)).fetchone()
    if not account:
        conn.close()
        return _error("Account not found", 404)

    username = account["username"]
    token = _get_token_for_account(username)
    if not token:
        conn.close()
        return _error(f"No token found for account @{username}. Please reconnect the account.")

    # Auto-prefix owner if the user submitted just a repo name (no slash)
    if "/" not in repo_full_name:
        owner = username
        repo_name = repo_full_name
        repo_full_name = f"{username}/{repo_full_name}"  # fix full name for storage
    else:
        owner, repo_name = repo_full_name.split("/", 1)

    # Validate repo exists on GitHub
    repo_data = get_repository(token, owner, repo_name)
    if not repo_data:
        conn.close()
        return _error(
            f"Repository '{repo_full_name}' not found or not accessible. "
            f"Make sure the repository exists on GitHub and the token has access. "
            f"Expected format: '{username}/repository-name'",
            401
        )

    # Upsert repo
    existing = conn.execute("SELECT id FROM repositories WHERE repo_full_name=?", (repo_full_name,)).fetchone()
    if existing:
        conn.execute("""
            UPDATE repositories SET account_id=?, description=?, private=?, default_branch=?,
            html_url=?, is_test_repo=? WHERE repo_full_name=?
        """, (account_id, repo_data.get("description",""), int(repo_data.get("private", False)),
              repo_data.get("default_branch","main"), repo_data.get("html_url",""),
              int(is_test_repo), repo_full_name))
        repo_id = existing["id"]
    else:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO repositories
            (account_id, repo_full_name, repo_name, owner, description, private, default_branch,
             html_url, is_test_repo, security_status, connected_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'not_scanned', ?)
        """, (account_id, repo_full_name, repo_name, owner, repo_data.get("description",""),
              int(repo_data.get("private", False)), repo_data.get("default_branch","main"),
              repo_data.get("html_url",""), int(is_test_repo), datetime.datetime.utcnow().isoformat()))
        repo_id = cur.lastrowid

    conn.commit()
    conn.close()

    return jsonify({
        "repo_id": repo_id,
        "repo_full_name": repo_full_name,
        "message": f"Repository '{repo_full_name}' connected successfully",
    })


@app.route("/api/repositories/<int:repo_id>/disconnect", methods=["POST"])
def disconnect_repository(repo_id):
    conn = get_db()
    row = conn.execute("SELECT * FROM repositories WHERE id=?", (repo_id,)).fetchone()
    if not row:
        conn.close()
        return _error("Repository not found", 404)
    conn.execute("DELETE FROM repositories WHERE id=?", (repo_id,))
    conn.commit()
    conn.close()
    return jsonify({"message": "Repository disconnected"})


@app.route("/api/repositories/scan", methods=["POST"])
def scan_repo():
    """Trigger a manual scan for a repository."""
    data = request.get_json(force=True)
    repo_id = data.get("repo_id")

    if not repo_id:
        return _error("repo_id is required")

    conn = get_db()
    row = conn.execute("""
        SELECT r.*, ca.username FROM repositories r
        LEFT JOIN connected_accounts ca ON ca.id = r.account_id
        WHERE r.id=?
    """, (repo_id,)).fetchone()
    conn.close()

    if not row:
        return _error("Repository not found", 404)

    username = row["username"]
    token = _get_token_for_account(username)
    if not token:
        return _error(f"No token found for account @{username}. Please reconnect the account.")

    owner = row["owner"]
    repo_name = row["repo_name"]

    # Run scan in background thread so we can return immediately
    def _run():
        scan_repository(repo_id, token, owner, repo_name)

    thread = threading.Thread(target=_run, daemon=True)
    thread.start()

    return jsonify({"message": f"Scan started for {row['repo_full_name']}", "repo_id": repo_id})

# ---------------------------------------------------------------------------
# Alerts
# ---------------------------------------------------------------------------

@app.route("/api/alerts", methods=["GET"])
def list_alerts():
    repo_id = request.args.get("repo_id")
    severity = request.args.get("severity")
    status = request.args.get("status")
    date_from = request.args.get("date_from")
    date_to = request.args.get("date_to")

    query = """
        SELECT sa.*, r.repo_full_name, r.repo_name, ca.username as account_username
        FROM security_alerts sa
        LEFT JOIN repositories r ON r.id = sa.repo_id
        LEFT JOIN connected_accounts ca ON ca.id = r.account_id
        WHERE 1=1
    """
    params = []

    if repo_id:
        query += " AND sa.repo_id = ?"
        params.append(repo_id)
    if severity:
        query += " AND sa.severity = ?"
        params.append(severity.lower())
    if status:
        query += " AND sa.status = ?"
        params.append(status.lower())
    if date_from:
        query += " AND sa.detected_at >= ?"
        params.append(date_from)
    if date_to:
        query += " AND sa.detected_at <= ?"
        params.append(date_to)

    query += " ORDER BY sa.detected_at DESC"

    conn = get_db()
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return jsonify(_rows_to_list(rows))


@app.route("/api/alerts/<int:alert_id>", methods=["GET"])
def get_alert(alert_id):
    conn = get_db()
    row = conn.execute("""
        SELECT sa.*, r.repo_full_name, r.repo_name, ca.username as account_username
        FROM security_alerts sa
        LEFT JOIN repositories r ON r.id = sa.repo_id
        LEFT JOIN connected_accounts ca ON ca.id = r.account_id
        WHERE sa.id = ?
    """, (alert_id,)).fetchone()
    history = conn.execute(
        "SELECT * FROM remediation_history WHERE alert_id=? ORDER BY timestamp", (alert_id,)
    ).fetchall()
    conn.close()

    if not row:
        return _error("Alert not found", 404)

    result = dict(row)
    result["remediation_history"] = _rows_to_list(history)
    return jsonify(result)


@app.route("/api/alerts/<int:alert_id>/resolve", methods=["POST"])
def resolve_alert_endpoint(alert_id):
    data = request.get_json(force=True) or {}
    resolved_by = data.get("resolved_by", "admin")
    notes = data.get("notes", "")
    result = resolve_alert(alert_id, resolved_by, notes)
    if "error" in result:
        return _error(result["error"])
    return jsonify(result)

# ---------------------------------------------------------------------------
# Modifications
# ---------------------------------------------------------------------------

@app.route("/api/modifications", methods=["GET"])
def list_modifications():
    repo_id = request.args.get("repo_id")
    query = """
        SELECT rm.*, c.commit_sha, c.author_name, c.author_email, c.commit_message, c.committed_at,
               r.repo_full_name, r.repo_name, ca.username as account_username
        FROM repository_modifications rm
        LEFT JOIN commits c ON c.id = rm.commit_id
        LEFT JOIN repositories r ON r.id = rm.repo_id
        LEFT JOIN connected_accounts ca ON ca.id = r.account_id
        WHERE 1=1
    """
    params = []
    if repo_id:
        query += " AND rm.repo_id = ?"
        params.append(repo_id)
    query += " ORDER BY rm.detected_at DESC"

    conn = get_db()
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return jsonify(_rows_to_list(rows))


@app.route("/api/repositories/<int:repo_id>/fetch-commits", methods=["POST"])
def fetch_commits(repo_id):
    """Fetch recent commits for a repo and store them in the modifications table."""
    from repository_scanner import _fetch_and_store_commits

    conn = get_db()
    row = conn.execute("""
        SELECT r.*, ca.username FROM repositories r
        LEFT JOIN connected_accounts ca ON ca.id = r.account_id
        WHERE r.id = ?
    """, (repo_id,)).fetchone()

    if not row:
        conn.close()
        return _error("Repository not found", 404)

    username = row["username"]
    token = _get_token_for_account(username)
    if not token:
        conn.close()
        return _error(f"No token for account @{username}. Please reconnect.")

    owner     = row["owner"]
    repo_name = row["repo_name"]

    new_commits = _fetch_and_store_commits(conn, repo_id, token, owner, repo_name)
    conn.close()

    return jsonify({
        "message": f"Fetched commits for {row['repo_full_name']}. {new_commits} new commit(s) logged.",
        "new_commits": new_commits,
        "repo_id": repo_id,
    })

# ---------------------------------------------------------------------------
# Scan History
# ---------------------------------------------------------------------------


@app.route("/api/scan-history", methods=["GET"])
def scan_history():
    repo_id = request.args.get("repo_id")
    conn = get_db()
    query = """
        SELECT sh.*, r.repo_full_name, r.repo_name
        FROM scan_history sh
        LEFT JOIN repositories r ON r.id = sh.repo_id
        WHERE 1=1
    """
    params = []
    if repo_id:
        query += " AND sh.repo_id = ?"
        params.append(repo_id)
    query += " ORDER BY sh.started_at DESC LIMIT 100"
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return jsonify(_rows_to_list(rows))

# ---------------------------------------------------------------------------
# Remediation History
# ---------------------------------------------------------------------------

@app.route("/api/remediation-history", methods=["GET"])
def remediation_history():
    conn = get_db()
    rows = conn.execute("""
        SELECT rh.*, sa.severity, sa.secret_type, sa.file_path,
               sa.estimated_fix_minutes, sa.actual_fix_minutes,
               r.repo_full_name
        FROM remediation_history rh
        LEFT JOIN security_alerts sa ON sa.id = rh.alert_id
        LEFT JOIN repositories r ON r.id = sa.repo_id
        ORDER BY rh.timestamp DESC LIMIT 200
    """).fetchall()
    conn.close()
    return jsonify(_rows_to_list(rows))


@app.route("/api/remediation-stats", methods=["GET"])
def remediation_stats():
    return jsonify(get_remediation_stats())

# ---------------------------------------------------------------------------
# Demo Workflow
# ---------------------------------------------------------------------------

@app.route("/api/demo/push-test-modification", methods=["POST"])
def demo_push_test():
    """
    Push a harmless demo file to the test repository (is_test_repo=1).
    Requires user confirmation in the request body: {"confirmed": true}
    """
    data = request.get_json(force=True) or {}

    if not data.get("confirmed"):
        return _error("User confirmation required. Send {\"confirmed\": true} to proceed.")

    repo_id = data.get("repo_id")

    conn = get_db()

    if repo_id:
        row = conn.execute("""
            SELECT r.*, ca.username FROM repositories r
            LEFT JOIN connected_accounts ca ON ca.id = r.account_id
            WHERE r.id = ?
        """, (repo_id,)).fetchone()
    else:
        row = conn.execute("""
            SELECT r.*, ca.username FROM repositories r
            LEFT JOIN connected_accounts ca ON ca.id = r.account_id
            WHERE r.is_test_repo = 1
            ORDER BY r.connected_at DESC LIMIT 1
        """).fetchone()

    conn.close()

    if not row:
        return _error("No test repository found. Please connect a repository and mark it as test repo.")

    username = row["username"]
    token = _get_token_for_account(username)
    if not token:
        return _error(f"No token found for account @{username}.")

    owner = row["owner"]
    repo_name = row["repo_name"]
    branch = row["default_branch"] or "main"

    result = push_test_file(token, owner, repo_name, branch)
    if not result:
        return _error("Failed to push test file to GitHub. Check token permissions.")

    return jsonify({
        "message": "Test modification pushed successfully",
        "repo": row["repo_full_name"],
        "filename": result.get("filename"),
        "note": "This file contains a FAKE test credential pattern. SecretGuard will detect it.",
    })

# ---------------------------------------------------------------------------
# GitHub Webhook Receiver
# ---------------------------------------------------------------------------

@app.route("/webhook", methods=["POST"])
def webhook():
    event_type = request.headers.get("X-GitHub-Event", "unknown")
    signature = request.headers.get("X-Hub-Signature-256", "")
    payload_bytes = request.get_data()

    if not verify_signature(payload_bytes, signature):
        abort(401, description="Invalid webhook signature")

    if event_type == "ping":
        return jsonify({"message": "pong"})

    if event_type != "push":
        return jsonify({"message": f"Event '{event_type}' received but not processed"})

    try:
        payload = json.loads(payload_bytes)
    except json.JSONDecodeError:
        return _error("Invalid JSON payload", 400)

    summary = process_push_event(payload)
    return jsonify({"message": "Push event processed", "summary": summary})

# ---------------------------------------------------------------------------
# Webhook Setup
# ---------------------------------------------------------------------------

@app.route("/api/repositories/<int:repo_id>/setup-webhook", methods=["POST"])
def setup_webhook(repo_id):
    """Register a GitHub webhook on the repository."""
    if not WEBHOOK_URL:
        return _error("WEBHOOK_PUBLIC_URL environment variable not set. Set it to your public URL (e.g. ngrok URL).")

    conn = get_db()
    row = conn.execute("""
        SELECT r.*, ca.username FROM repositories r
        LEFT JOIN connected_accounts ca ON ca.id = r.account_id
        WHERE r.id = ?
    """, (repo_id,)).fetchone()
    conn.close()

    if not row:
        return _error("Repository not found", 404)

    username = row["username"]
    token = _get_token_for_account(username)
    if not token:
        return _error(f"No token found for account @{username}.")

    hook = create_webhook(token, row["owner"], row["repo_name"], WEBHOOK_URL + "/webhook", WEBHOOK_SECRET)
    if not hook:
        return _error("Failed to create webhook on GitHub. Check permissions.")

    conn = get_db()
    conn.execute("UPDATE repositories SET webhook_id=? WHERE id=?", (str(hook["id"]), repo_id))
    conn.commit()
    conn.close()

    return jsonify({"message": "Webhook created", "hook_id": hook["id"], "url": WEBHOOK_URL + "/webhook"})


@app.route("/api/repositories/<int:repo_id>/remove-webhook", methods=["POST"])
def remove_webhook(repo_id):
    conn = get_db()
    row = conn.execute("""
        SELECT r.*, ca.username FROM repositories r
        LEFT JOIN connected_accounts ca ON ca.id = r.account_id
        WHERE r.id = ?
    """, (repo_id,)).fetchone()
    conn.close()

    if not row or not row["webhook_id"]:
        return _error("Repository or webhook not found", 404)

    username = row["username"]
    token = _get_token_for_account(username)
    if not token:
        return _error(f"No token found for account @{username}.")

    ok = delete_webhook(token, row["owner"], row["repo_name"], int(row["webhook_id"]))
    if ok:
        conn = get_db()
        conn.execute("UPDATE repositories SET webhook_id=NULL WHERE id=?", (repo_id,))
        conn.commit()
        conn.close()
        return jsonify({"message": "Webhook removed"})

    return _error("Failed to remove webhook from GitHub.")

# ---------------------------------------------------------------------------

if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    debug = os.getenv("FLASK_DEBUG", "1") == "1"
    print(f"[SecretGuard] AMBIT SecretGuard backend starting on http://localhost:{port}")
    app.run(host="0.0.0.0", port=port, debug=debug)
