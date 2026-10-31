"""
SecretGuard API — FastAPI backend
Scans local Git repositories and cloud configs for leaked secrets.
"""

import os
import glob
from typing import List, Optional
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from scanner import scan_repository, scan_cloud_config, get_git_log, LeakResult

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------
app = FastAPI(
    title="SecretGuard API",
    description="Detect leaked secrets in Git repositories and cloud configs",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Path to the 4 test repositories (relative to this file's location)
# ---------------------------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TEST_REPOS_DIR = os.path.join(BASE_DIR, "..", "test-repos")

# ---------------------------------------------------------------------------
# Pydantic response models
# ---------------------------------------------------------------------------

class LeakItem(BaseModel):
    repo_name: str
    file_path: str
    line_number: int
    line_content: str
    secret_type: str
    severity: str
    matched_value: str
    description: str

class RepoInfo(BaseModel):
    name: str
    path: str
    has_leaks: Optional[bool] = None
    leak_count: Optional[int] = None
    last_commit: Optional[dict] = None
    status: str  # "clean" | "vulnerable" | "not_scanned"

class ScanResult(BaseModel):
    repo_name: str
    path: str
    total_leaks: int
    critical: int
    high: int
    medium: int
    low: int
    leaks: List[LeakItem]
    git_info: dict

class DashboardStats(BaseModel):
    total_repos: int
    repos_with_leaks: int
    clean_repos: int
    total_secrets: int
    critical_count: int
    high_count: int
    medium_count: int
    low_count: int
    secret_types: dict

# ---------------------------------------------------------------------------
# Helper utilities
# ---------------------------------------------------------------------------

def _leak_to_item(lr: LeakResult) -> LeakItem:
    return LeakItem(
        repo_name=lr.repo_name,
        file_path=lr.file_path,
        line_number=lr.line_number,
        line_content=lr.line_content,
        secret_type=lr.secret_type,
        severity=lr.severity,
        matched_value=lr.matched_value,
        description=lr.description,
    )


def _count_by_severity(leaks: List[LeakResult]) -> dict:
    counts = {"critical": 0, "high": 0, "medium": 0, "low": 0}
    for lk in leaks:
        counts[lk.severity] += 1
    return counts


def _list_test_repos() -> List[str]:
    """Return absolute paths to all subdirectories inside test-repos/."""
    test_repos_abs = os.path.abspath(TEST_REPOS_DIR)
    if not os.path.isdir(test_repos_abs):
        return []
    return [
        os.path.join(test_repos_abs, d)
        for d in os.listdir(test_repos_abs)
        if os.path.isdir(os.path.join(test_repos_abs, d))
    ]


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/")
def root():
    return {"message": "SecretGuard API is running 🛡️", "version": "1.0.0"}


@app.get("/repos", response_model=List[RepoInfo])
def list_repos():
    """List all available test repositories."""
    paths = _list_test_repos()
    if not paths:
        return []

    repos = []
    for p in sorted(paths):
        name = os.path.basename(p)
        git_info = get_git_log(p)
        repos.append(
            RepoInfo(
                name=name,
                path=p,
                status="not_scanned",
                last_commit=git_info or None,
            )
        )
    return repos


@app.get("/scan/{repo_name}", response_model=ScanResult)
def scan_repo(repo_name: str):
    """Scan a specific test repository for secrets."""
    test_repos_abs = os.path.abspath(TEST_REPOS_DIR)
    repo_path = os.path.join(test_repos_abs, repo_name)

    if not os.path.isdir(repo_path):
        raise HTTPException(status_code=404, detail=f"Repository '{repo_name}' not found.")

    leaks = scan_repository(repo_path)
    # Also check cloud config files specifically
    cloud_leaks = scan_cloud_config(repo_path)
    # Merge, deduplicate by (file_path, line_number, secret_type)
    seen = set()
    all_leaks: List[LeakResult] = []
    for lk in leaks + cloud_leaks:
        key = (lk.file_path, lk.line_number, lk.secret_type)
        if key not in seen:
            seen.add(key)
            all_leaks.append(lk)

    counts = _count_by_severity(all_leaks)
    git_info = get_git_log(repo_path)

    return ScanResult(
        repo_name=repo_name,
        path=repo_path,
        total_leaks=len(all_leaks),
        critical=counts["critical"],
        high=counts["high"],
        medium=counts["medium"],
        low=counts["low"],
        leaks=[_leak_to_item(lk) for lk in all_leaks],
        git_info=git_info,
    )


@app.get("/scan-all", response_model=List[ScanResult])
def scan_all_repos():
    """Scan all test repositories at once."""
    paths = _list_test_repos()
    results = []
    for p in sorted(paths):
        repo_name = os.path.basename(p)
        leaks = scan_repository(p)
        cloud_leaks = scan_cloud_config(p)
        seen = set()
        all_leaks: List[LeakResult] = []
        for lk in leaks + cloud_leaks:
            key = (lk.file_path, lk.line_number, lk.secret_type)
            if key not in seen:
                seen.add(key)
                all_leaks.append(lk)

        counts = _count_by_severity(all_leaks)
        git_info = get_git_log(p)

        results.append(
            ScanResult(
                repo_name=repo_name,
                path=p,
                total_leaks=len(all_leaks),
                critical=counts["critical"],
                high=counts["high"],
                medium=counts["medium"],
                low=counts["low"],
                leaks=[_leak_to_item(lk) for lk in all_leaks],
                git_info=git_info,
            )
        )
    return results


@app.get("/dashboard", response_model=DashboardStats)
def dashboard_stats():
    """Return aggregated statistics across all repositories."""
    paths = _list_test_repos()
    total_secrets = 0
    repos_with_leaks = 0
    clean_repos = 0
    severity_totals = {"critical": 0, "high": 0, "medium": 0, "low": 0}
    secret_type_counts: dict = {}

    for p in paths:
        leaks = scan_repository(p)
        cloud_leaks = scan_cloud_config(p)
        seen = set()
        all_leaks: List[LeakResult] = []
        for lk in leaks + cloud_leaks:
            key = (lk.file_path, lk.line_number, lk.secret_type)
            if key not in seen:
                seen.add(key)
                all_leaks.append(lk)

        if all_leaks:
            repos_with_leaks += 1
        else:
            clean_repos += 1

        total_secrets += len(all_leaks)
        for lk in all_leaks:
            severity_totals[lk.severity] += 1
            secret_type_counts[lk.secret_type] = secret_type_counts.get(lk.secret_type, 0) + 1

    return DashboardStats(
        total_repos=len(paths),
        repos_with_leaks=repos_with_leaks,
        clean_repos=clean_repos,
        total_secrets=total_secrets,
        critical_count=severity_totals["critical"],
        high_count=severity_totals["high"],
        medium_count=severity_totals["medium"],
        low_count=severity_totals["low"],
        secret_types=secret_type_counts,
    )


@app.post("/scan-path")
def scan_custom_path(body: dict):
    """Scan any arbitrary directory path (power-user feature)."""
    path = body.get("path", "")
    if not path or not os.path.isdir(path):
        raise HTTPException(status_code=400, detail="Invalid or non-existent directory path.")

    leaks = scan_repository(path)
    counts = _count_by_severity(leaks)
    git_info = get_git_log(path)
    repo_name = os.path.basename(os.path.normpath(path))

    return ScanResult(
        repo_name=repo_name,
        path=path,
        total_leaks=len(leaks),
        critical=counts["critical"],
        high=counts["high"],
        medium=counts["medium"],
        low=counts["low"],
        leaks=[_leak_to_item(lk) for lk in leaks],
        git_info=git_info,
    )


@app.post("/scan-file", response_model=ScanResult)
async def scan_uploaded_file(file: UploadFile = File(...)):
    """
    Accept a single file upload and scan its contents for secrets.
    Returns the same ScanResult shape as other endpoints.
    """
    import tempfile

    filename = file.filename or "uploaded_file"
    content = await file.read()

    # Write to a temp file so we can reuse the existing scan_file logic
    with tempfile.TemporaryDirectory() as tmpdir:
        dest = os.path.join(tmpdir, filename)
        with open(dest, "wb") as fh:
            fh.write(content)

        from scanner import scan_file
        leaks = scan_file(dest, repo_name=filename, base_path=tmpdir)

    counts = _count_by_severity(leaks)

    return ScanResult(
        repo_name=filename,
        path=filename,
        total_leaks=len(leaks),
        critical=counts["critical"],
        high=counts["high"],
        medium=counts["medium"],
        low=counts["low"],
        leaks=[_leak_to_item(lk) for lk in leaks],
        git_info={},
    )
