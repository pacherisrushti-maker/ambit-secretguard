"""
AMBIT SecretGuard – Secret Scanner Engine
Detects possible exposed credentials with severity classification.
"""

import re
from dataclasses import dataclass, field
from typing import List, Optional


@dataclass
class SecretFinding:
    file_path: str
    line_number: int
    secret_type: str
    severity: str          # critical / high / medium / low
    masked_value: str
    description: str
    line_content: str = ""


SECRET_PATTERNS = [
    # AWS
    {
        "name": "AWS Access Key ID",
        "pattern": r"AKIA[0-9A-Z]{16}",
        "severity": "critical",
        "description": "Amazon Web Services Access Key ID exposed. Rotate immediately.",
    },
    {
        "name": "AWS Secret Access Key",
        "pattern": r"(?i)aws[_\-\s]?(secret[_\-\s]?)?access[_\-\s]?key['\"]?\s*[:=]\s*['\"]?([A-Za-z0-9+/]{40})",
        "severity": "critical",
        "description": "Amazon Web Services Secret Access Key exposed.",
    },
    # GitHub tokens
    {
        "name": "GitHub Personal Access Token",
        "pattern": r"ghp_[0-9A-Za-z]{36}",
        "severity": "critical",
        "description": "GitHub Personal Access Token (Classic) exposed.",
    },
    {
        "name": "GitHub OAuth Token",
        "pattern": r"gho_[0-9A-Za-z]{36}",
        "severity": "critical",
        "description": "GitHub OAuth token exposed.",
    },
    {
        "name": "GitHub Actions Token",
        "pattern": r"ghs_[0-9A-Za-z]{36}",
        "severity": "critical",
        "description": "GitHub Actions token exposed.",
    },
    # GCP
    {
        "name": "GCP API Key",
        "pattern": r"AIza[0-9A-Za-z\-_]{35}",
        "severity": "high",
        "description": "Google Cloud Platform API key exposed.",
    },
    {
        "name": "GCP Service Account",
        "pattern": r'"type"\s*:\s*"service_account"',
        "severity": "critical",
        "description": "Google Cloud service account key file detected.",
    },
    # Azure
    {
        "name": "Azure Storage Key",
        "pattern": r"(?i)AccountKey=[A-Za-z0-9+/]{86}==",
        "severity": "critical",
        "description": "Azure Storage Account Key exposed.",
    },
    {
        "name": "Azure Connection String",
        "pattern": r"(?i)DefaultEndpointsProtocol=https?;AccountName=\w+;AccountKey=",
        "severity": "high",
        "description": "Azure connection string with credentials exposed.",
    },
    # Database URLs
    {
        "name": "MySQL Connection String",
        "pattern": r"mysql://[^:]+:[^@]+@[^/]+/\w+",
        "severity": "high",
        "description": "MySQL database connection string with credentials.",
    },
    {
        "name": "PostgreSQL Connection String",
        "pattern": r"postgres(ql)?://[^:]+:[^@]+@[^/]+/\w+",
        "severity": "high",
        "description": "PostgreSQL database connection string with credentials.",
    },
    {
        "name": "MongoDB Connection String",
        "pattern": r"mongodb(\+srv)?://[^:]+:[^@]+@[^/]+",
        "severity": "high",
        "description": "MongoDB connection string with credentials.",
    },
    # Private keys
    {
        "name": "RSA Private Key",
        "pattern": r"-----BEGIN RSA PRIVATE KEY-----",
        "severity": "critical",
        "description": "RSA private key material embedded in source code.",
    },
    {
        "name": "Private Key",
        "pattern": r"-----BEGIN PRIVATE KEY-----",
        "severity": "critical",
        "description": "PEM private key material embedded in source code.",
    },
    # Stripe
    {
        "name": "Stripe Secret Key",
        "pattern": r"sk_(live|test)_[0-9A-Za-z]{24,}",
        "severity": "critical",
        "description": "Stripe secret API key exposed.",
    },
    {
        "name": "Stripe Publishable Key",
        "pattern": r"pk_(live|test)_[0-9A-Za-z]{24,}",
        "severity": "medium",
        "description": "Stripe publishable key detected.",
    },
    # Slack
    {
        "name": "Slack Token",
        "pattern": r"xox[baprs]-[0-9]{12}-[0-9]{12}-[0-9A-Za-z]{24}",
        "severity": "high",
        "description": "Slack Bot/App token exposed.",
    },
    # SendGrid
    {
        "name": "SendGrid API Key",
        "pattern": r"SG\.[A-Za-z0-9_\-]{22}\.[A-Za-z0-9_\-]{43}",
        "severity": "high",
        "description": "SendGrid API key exposed.",
    },
    # JWT
    {
        "name": "JWT Token",
        "pattern": r"eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}",
        "severity": "medium",
        "description": "JSON Web Token (JWT) hardcoded in source code.",
    },
    # Generic API key/password
    {
        "name": "Generic API Key",
        "pattern": r"(?i)(api[_\-]?key|apikey|api[_\-]?secret)['\"]?\s*[:=]\s*['\"]?([A-Za-z0-9_\-]{16,64})['\"]?",
        "severity": "high",
        "description": "Generic API key or secret detected.",
    },
    {
        "name": "Hardcoded Password",
        "pattern": r"(?i)(password|passwd|pwd|secret)['\"]?\s*[:=]\s*['\"]([^'\"$\s]{8,})['\"]",
        "severity": "high",
        "description": "Hardcoded password or secret string detected.",
    },
    # .env secrets
    {
        "name": "Environment Secret",
        "pattern": r"(?m)^(?!#)([A-Z_]{3,}(?:SECRET|KEY|TOKEN|PASSWORD|PASS|PWD|APIKEY|API_KEY))\s*=\s*(.{8,})",
        "severity": "medium",
        "description": "Secret variable defined in environment configuration file.",
    },
    # Test/demo patterns (for demonstration)
    {
        "name": "Test API Key (Demo)",
        "pattern": r"TEST_API_KEY_[A-Z0-9]{16,}",
        "severity": "high",
        "description": "Demo test API key pattern detected – used for SecretGuard demonstration.",
    },
    {
        "name": "Demo Secret Token",
        "pattern": r"DEMO_SECRET_[A-Za-z0-9]{16,}",
        "severity": "medium",
        "description": "Demo secret token detected – used for SecretGuard demonstration.",
    },
]

SKIP_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".svg", ".ico",
    ".zip", ".tar", ".gz", ".rar", ".7z",
    ".exe", ".dll", ".so", ".dylib",
    ".pdf", ".doc", ".docx", ".xls", ".xlsx",
    ".pyc", ".class", ".o", ".obj",
    ".lock", ".sum", ".woff", ".woff2", ".ttf", ".eot",
}

SKIP_PATHS = {
    ".git", "node_modules", "__pycache__", ".venv", "venv",
    "dist", "build", ".next", ".nuxt", "vendor",
}

SEVERITY_FIX_MINUTES = {
    "critical": 60,
    "high": 30,
    "medium": 20,
    "low": 10,
}


def _mask_secret(value: str) -> str:
    """Return a safe masked representation of the secret."""
    if not value:
        return "****"
    if len(value) <= 8:
        return value[:2] + "*" * (len(value) - 2)
    prefix = value[:4]
    return prefix + "*" * max(10, len(value) - 4)


def scan_text_lines(lines: List[str], file_path: str) -> List[SecretFinding]:
    """Scan a list of text lines for secret patterns."""
    findings: List[SecretFinding] = []
    seen = set()

    for line_num, line in enumerate(lines, start=1):
        line_stripped = line.rstrip("\n")
        for pattern_def in SECRET_PATTERNS:
            try:
                matches = re.findall(pattern_def["pattern"], line_stripped)
            except re.error:
                continue

            if not matches:
                continue

            dedup_key = (line_num, pattern_def["name"])
            if dedup_key in seen:
                continue
            seen.add(dedup_key)

            raw = matches[0]
            matched_value = raw if isinstance(raw, str) else (raw[-1] if raw else "")
            masked = _mask_secret(matched_value)

            findings.append(SecretFinding(
                file_path=file_path,
                line_number=line_num,
                secret_type=pattern_def["name"],
                severity=pattern_def["severity"],
                masked_value=masked,
                description=pattern_def["description"],
                line_content=line_stripped[:200],
            ))

    return findings


def scan_content(content: str, file_path: str) -> List[SecretFinding]:
    """Scan raw string content for secrets."""
    lines = content.splitlines()
    return scan_text_lines(lines, file_path)


def get_estimated_fix_minutes(severity: str) -> int:
    return SEVERITY_FIX_MINUTES.get(severity.lower(), 20)
