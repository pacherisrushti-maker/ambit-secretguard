"""
AMBIT SecretGuard – Database Layer
SQLite database with all required tables.
"""

import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "secretguard.db")


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    conn = get_db()
    cur = conn.cursor()

    cur.executescript("""
    CREATE TABLE IF NOT EXISTS connected_accounts (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        username    TEXT NOT NULL,
        avatar_url  TEXT,
        profile_url TEXT,
        token_hint  TEXT,           -- masked last 4 chars only
        token_enc   TEXT,           -- full token stored for persistence across restarts
        connected_at TEXT NOT NULL DEFAULT (datetime('now')),
        is_active   INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS repositories (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id      INTEGER REFERENCES connected_accounts(id),
        repo_full_name  TEXT NOT NULL UNIQUE,
        repo_name       TEXT NOT NULL,
        owner           TEXT NOT NULL,
        description     TEXT,
        private         INTEGER NOT NULL DEFAULT 0,
        default_branch  TEXT DEFAULT 'main',
        html_url        TEXT,
        webhook_id      TEXT,
        is_test_repo    INTEGER NOT NULL DEFAULT 0,
        last_scanned_at TEXT,
        security_status TEXT NOT NULL DEFAULT 'not_scanned',
        connected_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS commits (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        repo_id         INTEGER REFERENCES repositories(id),
        commit_sha      TEXT NOT NULL,
        author_name     TEXT,
        author_email    TEXT,
        commit_message  TEXT,
        committed_at    TEXT,
        files_changed   TEXT,       -- JSON array of file paths
        detected_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS repository_modifications (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        repo_id         INTEGER REFERENCES repositories(id),
        commit_id       INTEGER REFERENCES commits(id),
        file_path       TEXT NOT NULL,
        modification_type TEXT NOT NULL DEFAULT 'modified',  -- added/modified/removed
        detected_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS security_alerts (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        repo_id         INTEGER REFERENCES repositories(id),
        commit_id       INTEGER REFERENCES commits(id),
        file_path       TEXT NOT NULL,
        line_number     INTEGER,
        secret_type     TEXT NOT NULL,
        severity        TEXT NOT NULL,
        masked_value    TEXT,
        description     TEXT,
        status          TEXT NOT NULL DEFAULT 'unresolved',  -- unresolved/resolved
        detected_at     TEXT NOT NULL DEFAULT (datetime('now')),
        resolved_at     TEXT,
        resolved_by     TEXT,
        estimated_fix_minutes INTEGER,
        actual_fix_minutes    INTEGER
    );

    CREATE TABLE IF NOT EXISTS scan_history (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        repo_id         INTEGER REFERENCES repositories(id),
        scan_type       TEXT NOT NULL DEFAULT 'manual',  -- manual/webhook
        started_at      TEXT NOT NULL DEFAULT (datetime('now')),
        completed_at    TEXT,
        duration_seconds REAL,
        files_scanned   INTEGER DEFAULT 0,
        files_inspected INTEGER DEFAULT 0,
        leaks_found     INTEGER DEFAULT 0,
        status          TEXT NOT NULL DEFAULT 'running'  -- running/completed/failed
    );

    CREATE TABLE IF NOT EXISTS remediation_history (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        alert_id        INTEGER REFERENCES security_alerts(id),
        action          TEXT NOT NULL,   -- 'created'/'updated'/'resolved'
        actor           TEXT,
        notes           TEXT,
        timestamp       TEXT NOT NULL DEFAULT (datetime('now'))
    );
    """)

    # --- Migration: add token_enc column if it doesn't exist yet (for existing DBs) ---
    try:
        cur.execute("ALTER TABLE connected_accounts ADD COLUMN token_enc TEXT")
        print("[DB] Migration: added token_enc column to connected_accounts.")
    except Exception:
        pass  # Column already exists — that's fine

    conn.commit()
    conn.close()
    print("[DB] Database initialized successfully.")


def load_tokens_to_env():
    """
    On startup, reload all stored tokens from the DB back into os.environ
    so they survive backend restarts without needing to reconnect accounts.
    """
    try:
        conn = get_db()
        rows = conn.execute(
            "SELECT username, token_enc FROM connected_accounts WHERE is_active=1 AND token_enc IS NOT NULL"
        ).fetchall()
        conn.close()
        count = 0
        for row in rows:
            username = row["username"]
            token = row["token_enc"]
            if username and token:
                key = f"GITHUB_TOKEN_{username.upper().replace('-', '_')}"
                os.environ[key] = token
                count += 1
        if count:
            print(f"[DB] Restored {count} GitHub token(s) from database into environment.")
    except Exception as e:
        print(f"[DB] Warning: could not load tokens from DB: {e}")


if __name__ == "__main__":
    init_db()
