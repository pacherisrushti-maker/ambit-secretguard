"""
AMBIT SecretGuard – Webhook Handler
Verifies GitHub webhook signatures and processes push events.
"""

import hashlib
import hmac
import json
import os
import datetime
from typing import Optional

from database import get_db
from secret_scanner import scan_content, get_estimated_fix_minutes


WEBHOOK_SECRET = os.getenv("GITHUB_WEBHOOK_SECRET", "ambit-secretguard-webhook-secret")


def verify_signature(payload_bytes: bytes, signature_header: str) -> bool:
    """Verify GitHub HMAC-SHA256 webhook signature."""
    if not signature_header:
        return False
    if not signature_header.startswith("sha256="):
        return False
    expected = "sha256=" + hmac.new(
        WEBHOOK_SECRET.encode("utf-8"),
        payload_bytes,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature_header)


def _get_repo_id(conn, full_name: str) -> Optional[int]:
    row = conn.execute(
        "SELECT id FROM repositories WHERE repo_full_name = ?", (full_name,)
    ).fetchone()
    return row["id"] if row else None


def _get_token_for_repo(conn, repo_id: int) -> Optional[str]:
    """Retrieve the stored token for a repo's account (stored in env vars by account username)."""
    row = conn.execute("""
        SELECT ca.username FROM repositories r
        JOIN connected_accounts ca ON ca.id = r.account_id
        WHERE r.id = ?
    """, (repo_id,)).fetchone()
    if not row:
        return None
    username = row["username"]
    # Tokens stored as environment variables named GITHUB_TOKEN_<USERNAME>
    token = os.getenv(f"GITHUB_TOKEN_{username.upper().replace('-','_')}")
    return token


def process_push_event(payload: dict) -> dict:
    """
    Process an incoming GitHub push webhook event.
    1. Identify the repository.
    2. Store commit info.
    3. Scan added/modified lines for secrets.
    4. Create alerts if needed.
    Returns a summary dict.
    """
    now = datetime.datetime.utcnow().isoformat()
    repo_full = payload.get("repository", {}).get("full_name", "")
    ref = payload.get("ref", "")
    commits = payload.get("commits", [])

    if not repo_full or not commits:
        return {"status": "skipped", "reason": "no commits or missing repo"}

    conn = get_db()
    repo_id = _get_repo_id(conn, repo_full)

    if not repo_id:
        conn.close()
        return {"status": "skipped", "reason": f"repository {repo_full} not connected"}

    token = _get_token_for_repo(conn, repo_id)
    summary = {
        "repo": repo_full,
        "commits_processed": 0,
        "alerts_created": 0,
        "files_scanned": 0,
    }

    # Start scan record
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO scan_history (repo_id, scan_type, started_at, status)
        VALUES (?, 'webhook', ?, 'running')
    """, (repo_id, now))
    scan_id = cur.lastrowid
    conn.commit()

    scan_start = datetime.datetime.utcnow()
    total_files = 0
    total_leaks = 0

    for commit in commits:
        sha = commit.get("id", "")
        author_name = commit.get("author", {}).get("name", "Unknown")
        author_email = commit.get("author", {}).get("email", "")
        message = commit.get("message", "")
        committed_at = commit.get("timestamp", now)

        added_files = commit.get("added", [])
        modified_files = commit.get("modified", [])
        removed_files = commit.get("removed", [])
        all_changed = added_files + modified_files

        # Store commit
        cur.execute("""
            INSERT OR IGNORE INTO commits
            (repo_id, commit_sha, author_name, author_email, commit_message, committed_at, files_changed, detected_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (repo_id, sha, author_name, author_email, message, committed_at,
              json.dumps(all_changed + removed_files), now))
        commit_db_id = cur.lastrowid
        conn.commit()

        # Store modifications
        for f in added_files:
            cur.execute("""
                INSERT INTO repository_modifications (repo_id, commit_id, file_path, modification_type, detected_at)
                VALUES (?, ?, ?, 'added', ?)
            """, (repo_id, commit_db_id, f, now))

        for f in modified_files:
            cur.execute("""
                INSERT INTO repository_modifications (repo_id, commit_id, file_path, modification_type, detected_at)
                VALUES (?, ?, ?, 'modified', ?)
            """, (repo_id, commit_db_id, f, now))

        for f in removed_files:
            cur.execute("""
                INSERT INTO repository_modifications (repo_id, commit_id, file_path, modification_type, detected_at)
                VALUES (?, ?, ?, 'removed', ?)
            """, (repo_id, commit_db_id, f, now))

        conn.commit()

        # Scan files using patch content from webhook payload
        for file_info in commit.get("added", []) + commit.get("modified", []):
            total_files += 1
            # Try to get patch content from the commit payload
            # The push webhook gives us file names but not patch content directly.
            # We scan what we can get from the commit message and file names,
            # then fetch file content via API if token is available.
            content_to_scan = f"# File: {file_info}\n# Commit: {message}\n"

            # Attempt to fetch actual file content if we have a token
            if token:
                try:
                    from github_service import get_file_content
                    owner, repo_name = repo_full.split("/", 1)
                    file_content = get_file_content(token, owner, repo_name, file_info, sha)
                    if file_content:
                        content_to_scan = file_content
                except Exception as e:
                    print(f"[Webhook] Could not fetch file content: {e}")

            findings = scan_content(content_to_scan, file_info)
            total_leaks += len(findings)

            for finding in findings:
                est_minutes = get_estimated_fix_minutes(finding.severity)
                # Dedup check
                existing = conn.execute("""
                    SELECT id FROM security_alerts
                    WHERE repo_id = ? AND file_path = ? AND secret_type = ? AND status = 'unresolved'
                """, (repo_id, finding.file_path, finding.secret_type)).fetchone()

                if existing:
                    continue

                cur.execute("""
                    INSERT INTO security_alerts
                    (repo_id, commit_id, file_path, line_number, secret_type, severity,
                     masked_value, description, status, detected_at, estimated_fix_minutes)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'unresolved', ?, ?)
                """, (repo_id, commit_db_id, finding.file_path, finding.line_number,
                      finding.secret_type, finding.severity, finding.masked_value,
                      finding.description, now, est_minutes))
                alert_id = cur.lastrowid

                # Remediation log
                cur.execute("""
                    INSERT INTO remediation_history (alert_id, action, actor, notes, timestamp)
                    VALUES (?, 'created', 'system', ?, ?)
                """, (alert_id, f"Alert auto-created by webhook scan. Severity: {finding.severity}", now))

                summary["alerts_created"] += 1

        conn.commit()
        summary["commits_processed"] += 1

    # Update repo security status
    if total_leaks > 0:
        security_status = "possible_leak"
    else:
        security_status = "secure"

    conn.execute("""
        UPDATE repositories
        SET last_scanned_at = ?, security_status = ?
        WHERE id = ?
    """, (now, security_status, repo_id))

    # Close scan record
    scan_end = datetime.datetime.utcnow()
    duration = (scan_end - scan_start).total_seconds()
    conn.execute("""
        UPDATE scan_history
        SET completed_at = ?, duration_seconds = ?, files_scanned = ?,
            files_inspected = ?, leaks_found = ?, status = 'completed'
        WHERE id = ?
    """, (scan_end.isoformat(), duration, total_files, total_files, total_leaks, scan_id))

    conn.commit()
    conn.close()

    summary["files_scanned"] = total_files
    return summary
