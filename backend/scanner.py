"""
Secret Scanner Engine
Detects leaked secrets, credentials, and API keys in Git repositories and cloud configs.
"""

import re
import os
import subprocess
from dataclasses import dataclass, field
from typing import List, Optional
from enum import Enum

class Severity(str, Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"

@dataclass
class LeakResult:
    repo_name: str
    file_path: str
    line_number: int
    line_content: str
    secret_type: str
    severity: str
    matched_value: str
    description: str
    commit_hash: Optional[str] = None
    author: Optional[str] = None

# ---------------------------------------------------------------------------
# Secret patterns – ordered from most to least critical
# ---------------------------------------------------------------------------
SECRET_PATTERNS = [
    # AWS
    {
        "name": "AWS Access Key ID",
        "pattern": r"AKIA[0-9A-Z]{16}",
        "severity": Severity.CRITICAL,
        "description": "Amazon Web Services Access Key ID exposed. Immediate rotation required.",
    },
    {
        "name": "AWS Secret Access Key",
        "pattern": r"(?i)aws[_\-\s]?(secret[_\-\s]?)?access[_\-\s]?key['\"]?\s*[:=]\s*['\"]?([A-Za-z0-9+/]{40})",
        "severity": Severity.CRITICAL,
        "description": "Amazon Web Services Secret Access Key exposed.",
    },
    # GCP
    {
        "name": "GCP Service Account Key",
        "pattern": r'"type"\s*:\s*"service_account"',
        "severity": Severity.CRITICAL,
        "description": "Google Cloud Platform service account key file detected.",
    },
    {
        "name": "GCP API Key",
        "pattern": r"AIza[0-9A-Za-z\-_]{35}",
        "severity": Severity.HIGH,
        "description": "Google Cloud Platform API key exposed.",
    },
    # Azure
    {
        "name": "Azure Storage Account Key",
        "pattern": r"(?i)AccountKey=[A-Za-z0-9+/]{86}==",
        "severity": Severity.CRITICAL,
        "description": "Azure Storage Account Key exposed.",
    },
    {
        "name": "Azure Connection String",
        "pattern": r"(?i)DefaultEndpointsProtocol=https?;AccountName=\w+;AccountKey=",
        "severity": Severity.HIGH,
        "description": "Azure connection string with credentials exposed.",
    },
    # GitHub / GitLab
    {
        "name": "GitHub Personal Access Token",
        "pattern": r"ghp_[0-9A-Za-z]{36}",
        "severity": Severity.CRITICAL,
        "description": "GitHub Personal Access Token (Classic) exposed.",
    },
    {
        "name": "GitHub OAuth Token",
        "pattern": r"gho_[0-9A-Za-z]{36}",
        "severity": Severity.CRITICAL,
        "description": "GitHub OAuth token exposed.",
    },
    {
        "name": "GitLab Personal Access Token",
        "pattern": r"glpat-[0-9A-Za-z\-_]{20}",
        "severity": Severity.HIGH,
        "description": "GitLab Personal Access Token exposed.",
    },
    # Generic API Keys
    {
        "name": "Generic API Key",
        "pattern": r"(?i)(api[_\-]?key|apikey|api[_\-]?secret)['\"]?\s*[:=]\s*['\"]?([A-Za-z0-9_\-]{16,64})['\"]?",
        "severity": Severity.HIGH,
        "description": "Generic API key or secret detected.",
    },
    # Passwords
    {
        "name": "Hardcoded Password",
        "pattern": r"(?i)(password|passwd|pwd|secret)['\"]?\s*[:=]\s*['\"]([^'\"$\s]{8,})['\"]",
        "severity": Severity.HIGH,
        "description": "Hardcoded password or secret string detected.",
    },
    # Database connection strings
    {
        "name": "Database Connection String (MySQL)",
        "pattern": r"mysql://[^:]+:[^@]+@[^/]+/\w+",
        "severity": Severity.HIGH,
        "description": "MySQL database connection string with credentials.",
    },
    {
        "name": "Database Connection String (PostgreSQL)",
        "pattern": r"postgres(ql)?://[^:]+:[^@]+@[^/]+/\w+",
        "severity": Severity.HIGH,
        "description": "PostgreSQL database connection string with credentials.",
    },
    {
        "name": "Database Connection String (MongoDB)",
        "pattern": r"mongodb(\+srv)?://[^:]+:[^@]+@[^/]+",
        "severity": Severity.HIGH,
        "description": "MongoDB connection string with credentials.",
    },
    # Private Keys
    {
        "name": "RSA Private Key",
        "pattern": r"-----BEGIN RSA PRIVATE KEY-----",
        "severity": Severity.CRITICAL,
        "description": "RSA private key material embedded in source code.",
    },
    {
        "name": "EC Private Key",
        "pattern": r"-----BEGIN EC PRIVATE KEY-----",
        "severity": Severity.CRITICAL,
        "description": "Elliptic Curve private key material embedded in source code.",
    },
    {
        "name": "PEM Private Key",
        "pattern": r"-----BEGIN PRIVATE KEY-----",
        "severity": Severity.CRITICAL,
        "description": "PEM private key material embedded in source code.",
    },
    # JWT / Bearer Tokens
    {
        "name": "JWT Token",
        "pattern": r"eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}",
        "severity": Severity.MEDIUM,
        "description": "JSON Web Token (JWT) hardcoded in source.",
    },
    # Stripe
    {
        "name": "Stripe Secret Key",
        "pattern": r"sk_(live|test)_[0-9A-Za-z]{24,}",
        "severity": Severity.CRITICAL,
        "description": "Stripe secret API key exposed.",
    },
    # Slack
    {
        "name": "Slack Token",
        "pattern": r"xox[baprs]-[0-9]{12}-[0-9]{12}-[0-9A-Za-z]{24}",
        "severity": Severity.HIGH,
        "description": "Slack Bot/App token exposed.",
    },
    # Twilio
    {
        "name": "Twilio Account SID",
        "pattern": r"AC[0-9a-fA-F]{32}",
        "severity": Severity.MEDIUM,
        "description": "Twilio Account SID detected.",
    },
    # SendGrid
    {
        "name": "SendGrid API Key",
        "pattern": r"SG\.[A-Za-z0-9_\-]{22}\.[A-Za-z0-9_\-]{43}",
        "severity": Severity.HIGH,
        "description": "SendGrid API key exposed.",
    },
    # .env file secrets
    {
        "name": "Dotenv Secret",
        "pattern": r"(?m)^(?!#)([A-Z_]{3,}(?:SECRET|KEY|TOKEN|PASSWORD|PASS|PWD|APIKEY|API_KEY))\s*=\s*(.{8,})",
        "severity": Severity.MEDIUM,
        "description": "Secret variable defined in environment configuration file.",
    },
]

# File extensions to skip (binary files, etc.)
SKIP_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".svg", ".ico",
    ".zip", ".tar", ".gz", ".rar", ".7z",
    ".exe", ".dll", ".so", ".dylib",
    ".pdf", ".doc", ".docx", ".xls", ".xlsx",
    ".pyc", ".class", ".o", ".obj",
    ".lock", ".sum",
}

# Files/dirs to skip
SKIP_PATHS = {
    ".git", "node_modules", "__pycache__", ".venv", "venv",
    "dist", "build", ".next", ".nuxt",
}


def _should_skip_file(filepath: str) -> bool:
    """Return True if the file should not be scanned."""
    _, ext = os.path.splitext(filepath)
    if ext.lower() in SKIP_EXTENSIONS:
        return True
    parts = set(filepath.replace("\\", "/").split("/"))
    return bool(parts & SKIP_PATHS)


def _mask_secret(value: str) -> str:
    """Return a masked representation of the secret for safe display."""
    if len(value) <= 8:
        return "*" * len(value)
    visible = max(4, len(value) // 6)
    return value[:visible] + "*" * (len(value) - visible * 2) + value[-visible:]


def scan_file(filepath: str, repo_name: str, base_path: str) -> List[LeakResult]:
    """Scan a single file for secrets and return a list of LeakResult objects."""
    relative_path = os.path.relpath(filepath, base_path).replace("\\", "/")

    if _should_skip_file(relative_path):
        return []

    try:
        with open(filepath, "r", encoding="utf-8", errors="ignore") as fh:
            lines = fh.readlines()
    except (OSError, PermissionError):
        return []

    results: List[LeakResult] = []
    seen: set = set()  # Deduplicate by (line_number, pattern_name)

    for line_num, line in enumerate(lines, start=1):
        line_stripped = line.rstrip("\n")
        for pattern_def in SECRET_PATTERNS:
            matches = re.findall(pattern_def["pattern"], line_stripped)
            if not matches:
                continue

            dedup_key = (line_num, pattern_def["name"])
            if dedup_key in seen:
                continue
            seen.add(dedup_key)

            raw_match = matches[0]
            matched_value = raw_match if isinstance(raw_match, str) else raw_match[-1]
            masked = _mask_secret(matched_value)

            results.append(
                LeakResult(
                    repo_name=repo_name,
                    file_path=relative_path,
                    line_number=line_num,
                    line_content=line_stripped[:200],
                    secret_type=pattern_def["name"],
                    severity=pattern_def["severity"],
                    matched_value=masked,
                    description=pattern_def["description"],
                )
            )

    return results


def scan_repository(repo_path: str) -> List[LeakResult]:
    """
    Recursively scan all files in a repository directory.
    Returns a flat list of LeakResult objects.
    """
    repo_name = os.path.basename(os.path.normpath(repo_path))
    results: List[LeakResult] = []

    for root, dirs, files in os.walk(repo_path):
        # Prune unwanted directories in-place
        dirs[:] = [d for d in dirs if d not in SKIP_PATHS]
        for fname in files:
            full_path = os.path.join(root, fname)
            results.extend(scan_file(full_path, repo_name, repo_path))

    return results


def get_git_log(repo_path: str) -> dict:
    """Retrieve the latest commit metadata for display purposes."""
    try:
        result = subprocess.run(
            ["git", "log", "-1", "--format=%H|%an|%ae|%s|%ad", "--date=short"],
            cwd=repo_path,
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode == 0 and result.stdout.strip():
            parts = result.stdout.strip().split("|")
            if len(parts) >= 5:
                return {
                    "hash": parts[0][:8],
                    "author": parts[1],
                    "email": parts[2],
                    "message": parts[3],
                    "date": parts[4],
                }
    except Exception:
        pass
    return {}


def scan_cloud_config(base_path: str) -> List[LeakResult]:
    """
    Specifically scan common cloud config file locations for exposed credentials.
    Wraps scan_repository but focuses on known sensitive paths.
    """
    cloud_files = [
        ".aws/credentials",
        ".aws/config",
        ".gcloud/application_default_credentials.json",
        "service-account.json",
        "gcp-key.json",
        ".azure/azureProfile.json",
        "azure-credentials.json",
        "terraform.tfvars",
        ".env",
        ".env.local",
        ".env.production",
    ]

    results: List[LeakResult] = []
    repo_name = os.path.basename(os.path.normpath(base_path))

    for cf in cloud_files:
        full_path = os.path.join(base_path, cf)
        if os.path.isfile(full_path):
            results.extend(scan_file(full_path, f"{repo_name} (cloud config)", base_path))

    return results
