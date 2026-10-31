"""
AMBIT SecretGuard – Repository Scanner
Full repository scanning (manual Scan Now trigger).
Also fetches recent commits to populate the modifications/change-detection table.
"""

import datetime
import json
import os
from typing import Optional

from database import get_db
from secret_scanner import scan_content, get_estimated_fix_minutes
from github_service import list_repo_files, get_file_content, get_commits, get_commit_detail

SKIP_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".svg", ".ico",
    ".zip", ".tar", ".gz", ".rar", ".7z",
    ".exe", ".dll", ".so", ".dylib",
    ".pdf", ".doc", ".docx", ".xls", ".xlsx",
    ".pyc", ".class", ".o", ".obj", ".lock", ".sum",
    ".woff", ".woff2", ".ttf", ".eot", ".otf",
}


def _should_skip(path: str) -> bool:
    _, ext = os.path.splitext(path)
    if ext.lower() in SKIP_EXTENSIONS:
        return True
    parts = set(path.replace("\\", "/").split("/"))
    return bool(parts & {"node_modules", "__pycache__", ".git", "dist", "build", "vendor"})


def _fetch_and_store_commits(conn, repo_id: int, token: str, owner: str, repo_name: str) -> int:
    """
    Fetch the most recent commits from GitHub and record each changed file
    in the commits + repository_modifications tables.
    Returns the number of new commits stored.
    """
    now = datetime.datetime.utcnow().isoformat()
    cur = conn.cursor()
    new_count = 0

    try:
        commits = get_commits(token, owner, repo_name, per_page=20)
    except Exception:
        return 0

    for commit_data in commits:
        sha = commit_data.get("sha", "")
        if not sha:
            continue

        # Skip if already recorded
        existing = conn.execute(
            "SELECT id FROM commits WHERE repo_id=? AND commit_sha=?", (repo_id, sha)
        ).fetchone()
        if existing:
            commit_db_id = existing["id"]
        else:
            # Try to get file-level detail (adds one API call per commit, capped by per_page)
            detail = get_commit_detail(token, owner, repo_name, sha) or {}
            author_info = commit_data.get("commit", {}).get("author", {})
            author_name  = author_info.get("name", "")
            author_email = author_info.get("email", "")
            message      = commit_data.get("commit", {}).get("message", "")
            committed_at = author_info.get("date", now)

            changed_files = [f.get("filename", "") for f in detail.get("files", [])]
            files_json = json.dumps(changed_files)

            cur.execute("""
                INSERT INTO commits
                (repo_id, commit_sha, author_name, author_email, commit_message, committed_at, files_changed, detected_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (repo_id, sha, author_name, author_email, message, committed_at, files_json, now))
            commit_db_id = cur.lastrowid
            new_count += 1

            # Record each changed file as a modification
            for f in detail.get("files", []):
                filepath = f.get("filename", "")
                raw_status = f.get("status", "modified")
                # GitHub uses 'added', 'removed', 'modified', 'renamed'
                mod_type = raw_status if raw_status in ("added", "removed", "modified") else "modified"

                # Dedup
                dup = conn.execute("""
                    SELECT id FROM repository_modifications
                    WHERE repo_id=? AND commit_id=? AND file_path=?
                """, (repo_id, commit_db_id, filepath)).fetchone()
                if not dup:
                    cur.execute("""
                        INSERT INTO repository_modifications
                        (repo_id, commit_id, file_path, modification_type, detected_at)
                        VALUES (?, ?, ?, ?, ?)
                    """, (repo_id, commit_db_id, filepath, mod_type, now))

    conn.commit()
    return new_count


def scan_repository(repo_id: int, token: str, owner: str, repo_name: str) -> dict:
    """
    Perform a full repository scan:
    1. Fetch recent commits → populate modifications table.
    2. List all files via GitHub API.
    3. Fetch and scan each text file for secrets.
    4. Store findings in DB.
    Returns a scan summary.
    """
    now = datetime.datetime.utcnow().isoformat()
    conn = get_db()
    cur = conn.cursor()

    # Create scan record
    cur.execute("""
        INSERT INTO scan_history (repo_id, scan_type, started_at, status)
        VALUES (?, 'manual', ?, 'running')
    """, (repo_id, now))
    scan_id = cur.lastrowid
    conn.commit()

    scan_start = datetime.datetime.utcnow()
    files_scanned = 0
    files_inspected = 0
    leaks_found = 0

    # ── Step 1: Fetch commits and build modifications log ──────────────────
    new_commits = _fetch_and_store_commits(conn, repo_id, token, owner, repo_name)

    # ── Step 2: List all files ─────────────────────────────────────────────
    try:
        file_list = list_repo_files(token, owner, repo_name)
    except Exception as e:
        conn.execute("""
            UPDATE scan_history SET status = 'failed', completed_at = ?
            WHERE id = ?
        """, (datetime.datetime.utcnow().isoformat(), scan_id))
        conn.commit()
        conn.close()
        return {"error": str(e), "scan_id": scan_id}

    # ── Step 3: Scan file contents for secrets ─────────────────────────────
    for file_item in file_list:
        path = file_item.get("path", "")
        if _should_skip(path):
            continue

        files_scanned += 1
        content = get_file_content(token, owner, repo_name, path)
        if not content:
            continue

        files_inspected += 1
        findings = scan_content(content, path)
        leaks_found += len(findings)

        for finding in findings:
            # Dedup by repo + file + type + unresolved
            existing = conn.execute("""
                SELECT id FROM security_alerts
                WHERE repo_id = ? AND file_path = ? AND secret_type = ? AND status = 'unresolved'
            """, (repo_id, finding.file_path, finding.secret_type)).fetchone()
            if existing:
                continue

            est_minutes = get_estimated_fix_minutes(finding.severity)
            cur.execute("""
                INSERT INTO security_alerts
                (repo_id, file_path, line_number, secret_type, severity,
                 masked_value, description, status, detected_at, estimated_fix_minutes)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'unresolved', ?, ?)
            """, (repo_id, finding.file_path, finding.line_number, finding.secret_type,
                  finding.severity, finding.masked_value, finding.description, now, est_minutes))
            alert_id = cur.lastrowid

            cur.execute("""
                INSERT INTO remediation_history (alert_id, action, actor, notes, timestamp)
                VALUES (?, 'created', 'system', ?, ?)
            """, (alert_id, f"Alert from manual scan. Severity: {finding.severity}", now))

    conn.commit()

    scan_end = datetime.datetime.utcnow()
    duration = (scan_end - scan_start).total_seconds()

    # Update scan record
    conn.execute("""
        UPDATE scan_history
        SET completed_at = ?, duration_seconds = ?, files_scanned = ?,
            files_inspected = ?, leaks_found = ?, status = 'completed'
        WHERE id = ?
    """, (scan_end.isoformat(), duration, files_scanned, files_inspected, leaks_found, scan_id))

    # Update repo status
    status = "possible_leak" if leaks_found > 0 else "secure"
    conn.execute("""
        UPDATE repositories SET last_scanned_at = ?, security_status = ? WHERE id = ?
    """, (scan_end.isoformat(), status, repo_id))

    conn.commit()
    conn.close()

    return {
        "scan_id": scan_id,
        "duration_seconds": round(duration, 2),
        "files_scanned": files_scanned,
        "files_inspected": files_inspected,
        "leaks_found": leaks_found,
        "new_commits_logged": new_commits,
        "status": "completed",
        "message": (
            f"Scan complete. {files_inspected} files inspected, {leaks_found} leak(s) found. "
            f"{new_commits} new commit(s) logged."
        ),
    }
