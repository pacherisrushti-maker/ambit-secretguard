"""
AMBIT SecretGuard – GitHub Service
Handles GitHub API calls: repos, commits, file contents, webhook management.
"""

import os
import requests
from typing import Optional, Dict, List

GITHUB_API = "https://api.github.com"


def _headers(token: str) -> dict:
    return {
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


def get_authenticated_user(token: str) -> Optional[dict]:
    """Fetch the authenticated GitHub user's profile."""
    try:
        r = requests.get(f"{GITHUB_API}/user", headers=_headers(token), timeout=10)
        if r.status_code == 200:
            return r.json()
    except Exception as e:
        print(f"[GitHub] get_authenticated_user error: {e}")
    return None


def get_repository(token: str, owner: str, repo: str) -> Optional[dict]:
    """Fetch repository information."""
    try:
        r = requests.get(f"{GITHUB_API}/repos/{owner}/{repo}", headers=_headers(token), timeout=10)
        if r.status_code == 200:
            return r.json()
    except Exception as e:
        print(f"[GitHub] get_repository error: {e}")
    return None


def get_commits(token: str, owner: str, repo: str, per_page: int = 20) -> List[dict]:
    """Fetch recent commits for a repository."""
    try:
        r = requests.get(
            f"{GITHUB_API}/repos/{owner}/{repo}/commits",
            headers=_headers(token),
            params={"per_page": per_page},
            timeout=10,
        )
        if r.status_code == 200:
            return r.json()
    except Exception as e:
        print(f"[GitHub] get_commits error: {e}")
    return []


def get_commit_detail(token: str, owner: str, repo: str, sha: str) -> Optional[dict]:
    """Fetch full commit details including file patches."""
    try:
        r = requests.get(
            f"{GITHUB_API}/repos/{owner}/{repo}/commits/{sha}",
            headers=_headers(token),
            timeout=15,
        )
        if r.status_code == 200:
            return r.json()
    except Exception as e:
        print(f"[GitHub] get_commit_detail error: {e}")
    return None


def get_file_content(token: str, owner: str, repo: str, path: str, ref: str = "HEAD") -> Optional[str]:
    """Fetch the decoded content of a file."""
    import base64
    try:
        r = requests.get(
            f"{GITHUB_API}/repos/{owner}/{repo}/contents/{path}",
            headers=_headers(token),
            params={"ref": ref},
            timeout=10,
        )
        if r.status_code == 200:
            data = r.json()
            if data.get("encoding") == "base64":
                return base64.b64decode(data["content"]).decode("utf-8", errors="ignore")
    except Exception as e:
        print(f"[GitHub] get_file_content error: {e}")
    return None


def list_repo_files(token: str, owner: str, repo: str, path: str = "", ref: str = "HEAD") -> List[dict]:
    """Recursively list all files in a repository."""
    try:
        r = requests.get(
            f"{GITHUB_API}/repos/{owner}/{repo}/git/trees/{ref}",
            headers=_headers(token),
            params={"recursive": "1"},
            timeout=15,
        )
        if r.status_code == 200:
            tree = r.json().get("tree", [])
            return [item for item in tree if item.get("type") == "blob"]
    except Exception as e:
        print(f"[GitHub] list_repo_files error: {e}")
    return []


def create_webhook(token: str, owner: str, repo: str, webhook_url: str, secret: str) -> Optional[dict]:
    """Create a push-event webhook on the given repository."""
    payload = {
        "name": "web",
        "active": True,
        "events": ["push"],
        "config": {
            "url": webhook_url,
            "content_type": "json",
            "secret": secret,
            "insecure_ssl": "0",
        },
    }
    try:
        r = requests.post(
            f"{GITHUB_API}/repos/{owner}/{repo}/hooks",
            headers=_headers(token),
            json=payload,
            timeout=10,
        )
        if r.status_code in (200, 201):
            return r.json()
        print(f"[GitHub] create_webhook failed: {r.status_code} {r.text[:200]}")
    except Exception as e:
        print(f"[GitHub] create_webhook error: {e}")
    return None


def delete_webhook(token: str, owner: str, repo: str, hook_id: int) -> bool:
    """Delete an existing webhook."""
    try:
        r = requests.delete(
            f"{GITHUB_API}/repos/{owner}/{repo}/hooks/{hook_id}",
            headers=_headers(token),
            timeout=10,
        )
        return r.status_code == 204
    except Exception as e:
        print(f"[GitHub] delete_webhook error: {e}")
    return False


def push_test_file(token: str, owner: str, repo: str, branch: str = "main") -> Optional[dict]:
    """
    Push a harmless demo file containing a clearly fake test credential
    to the specified repository. Used ONLY for demonstration purposes.
    The fake credential pattern triggers the scanner but is not a real secret.
    """
    import base64, datetime

    timestamp = datetime.datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    filename = f"secretguard_demo_{timestamp}.txt"
    fake_content = (
        "# AMBIT SecretGuard – Demonstration File\n"
        "# This file was automatically created by SecretGuard for testing purposes.\n"
        "# The credential below is COMPLETELY FAKE and has no real access.\n"
        "#\n"
        f"# Created: {datetime.datetime.utcnow().isoformat()}\n"
        "#\n"
        "# --- FAKE TEST CREDENTIAL (DO NOT USE) ---\n"
        "TEST_API_KEY_AMBIT = TEST_API_KEY_DEMO1234567890ABCDEF\n"
        "# --- END FAKE TEST CREDENTIAL ---\n"
        "#\n"
        "# SecretGuard detected this pattern and raised a HIGH alert.\n"
        "# Please resolve this alert to complete the demonstration workflow.\n"
    )

    encoded = base64.b64encode(fake_content.encode()).decode()
    payload = {
        "message": f"[SecretGuard Demo] Add test credential detection file – {timestamp}",
        "content": encoded,
        "branch": branch,
    }
    try:
        r = requests.put(
            f"{GITHUB_API}/repos/{owner}/{repo}/contents/{filename}",
            headers=_headers(token),
            json=payload,
            timeout=15,
        )
        if r.status_code in (200, 201):
            return {"filename": filename, "response": r.json()}
        print(f"[GitHub] push_test_file failed: {r.status_code} {r.text[:300]}")
    except Exception as e:
        print(f"[GitHub] push_test_file error: {e}")
    return None
