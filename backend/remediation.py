"""
AMBIT SecretGuard – Remediation Time Tracker
Calculates and records remediation time for security alerts.
"""

import datetime
from database import get_db


def calculate_actual_minutes(detected_at: str, resolved_at: str) -> float:
    """Calculate actual resolution time in minutes."""
    try:
        start = datetime.datetime.fromisoformat(detected_at)
        end = datetime.datetime.fromisoformat(resolved_at)
        delta = end - start
        return round(delta.total_seconds() / 60, 1)
    except Exception:
        return 0.0


def resolve_alert(alert_id: int, resolved_by: str = "admin", notes: str = "") -> dict:
    """Mark an alert as resolved and record remediation time."""
    now = datetime.datetime.utcnow().isoformat()
    conn = get_db()

    alert = conn.execute(
        "SELECT * FROM security_alerts WHERE id = ?", (alert_id,)
    ).fetchone()

    if not alert:
        conn.close()
        return {"error": "Alert not found"}

    if alert["status"] == "resolved":
        conn.close()
        return {"error": "Alert already resolved"}

    detected_at = alert["detected_at"]
    actual_minutes = calculate_actual_minutes(detected_at, now)

    conn.execute("""
        UPDATE security_alerts
        SET status = 'resolved', resolved_at = ?, resolved_by = ?, actual_fix_minutes = ?
        WHERE id = ?
    """, (now, resolved_by, actual_minutes, alert_id))

    conn.execute("""
        INSERT INTO remediation_history (alert_id, action, actor, notes, timestamp)
        VALUES (?, 'resolved', ?, ?, ?)
    """, (alert_id, resolved_by, notes or f"Resolved by {resolved_by}", now))

    conn.commit()
    conn.close()

    return {
        "alert_id": alert_id,
        "resolved_at": now,
        "actual_fix_minutes": actual_minutes,
        "estimated_fix_minutes": alert["estimated_fix_minutes"],
        "status": "resolved",
    }


def get_remediation_stats() -> dict:
    """Get aggregated remediation statistics."""
    conn = get_db()

    rows = conn.execute("""
        SELECT severity, estimated_fix_minutes, actual_fix_minutes, status
        FROM security_alerts
    """).fetchall()

    stats = {
        "total": len(rows),
        "resolved": 0,
        "unresolved": 0,
        "avg_estimated_minutes": 0,
        "avg_actual_minutes": 0,
        "by_severity": {},
    }

    estimated_vals = []
    actual_vals = []

    for row in rows:
        sev = row["severity"]
        if sev not in stats["by_severity"]:
            stats["by_severity"][sev] = {"total": 0, "resolved": 0}

        stats["by_severity"][sev]["total"] += 1

        if row["status"] == "resolved":
            stats["resolved"] += 1
            stats["by_severity"][sev]["resolved"] += 1
            if row["actual_fix_minutes"]:
                actual_vals.append(row["actual_fix_minutes"])
        else:
            stats["unresolved"] += 1

        if row["estimated_fix_minutes"]:
            estimated_vals.append(row["estimated_fix_minutes"])

    if estimated_vals:
        stats["avg_estimated_minutes"] = round(sum(estimated_vals) / len(estimated_vals), 1)
    if actual_vals:
        stats["avg_actual_minutes"] = round(sum(actual_vals) / len(actual_vals), 1)

    conn.close()
    return stats
