from __future__ import annotations

import datetime as dt
import sqlite3

from flask import jsonify, request

from . import bp
from app.services import profile_store, telemetry_store


def _today_utc() -> dt.datetime:
    now = dt.datetime.now(dt.timezone.utc)
    return now.replace(hour=0, minute=0, second=0, microsecond=0)


@bp.get("/stats")
def get_stats():
    try:
        days = int(request.args.get("days", 30))
    except (TypeError, ValueError):
        days = 30
    days = max(1, min(days, 365))

    # ── Profile data ─────────────────────────────────────────────────────────
    overview = profile_store.get_overview()
    profiles = overview.get("profiles", [])
    total_accounts = len(profiles)

    # ── Telemetry queries ─────────────────────────────────────────────────────
    today = _today_utc()
    window_start = today - dt.timedelta(days=days - 1)

    today_iso = today.isoformat()
    window_iso = window_start.isoformat()

    conn: sqlite3.Connection | None = None
    try:
        conn = telemetry_store._connect()

        logins_today: int = int(
            (conn.execute(
                "SELECT COUNT(*) AS c FROM activity_events"
                " WHERE event_type='profile_login' AND occurred_at >= ?",
                (today_iso,),
            ).fetchone() or {}).get("c", 0)  # type: ignore[index]
        )

        day_rows = conn.execute(
            """
            SELECT substr(occurred_at, 1, 10) AS day, COUNT(*) AS c
            FROM activity_events
            WHERE event_type = 'profile_login' AND occurred_at >= ?
            GROUP BY day
            ORDER BY day ASC
            """,
            (window_iso,),
        ).fetchall()
        day_map: dict[str, int] = {row["day"]: int(row["c"]) for row in day_rows}

        profile_login_rows = conn.execute(
            "SELECT profile_id, COUNT(*) AS c FROM activity_events"
            " WHERE event_type = 'profile_login' GROUP BY profile_id"
        ).fetchall()
        profile_login_map: dict[str, int] = {
            row["profile_id"]: int(row["c"]) for row in profile_login_rows
        }
    except Exception as exc:
        profile_login_map = {}
        day_map = {}
        logins_today = 0
        print(f"[Admin] Telemetry query failed: {exc}", flush=True)
    finally:
        if conn:
            conn.close()

    # ── Fill every day in the window with 0 if no events ─────────────────────
    logins_by_day = [
        {
            "date": (window_start + dt.timedelta(days=i)).strftime("%Y-%m-%d"),
            "count": day_map.get(
                (window_start + dt.timedelta(days=i)).strftime("%Y-%m-%d"), 0
            ),
        }
        for i in range(days)
    ]

    total_logins = sum(profile_login_map.values())

    # ── Enrich profiles ───────────────────────────────────────────────────────
    enriched = []
    for p in profiles:
        enriched.append({
            "id":             p.get("id", ""),
            "name":           p.get("name", ""),
            "division":       p.get("division", ""),
            "created_at":     p.get("created_at", ""),
            "last_active_at": p.get("last_active_at", ""),
            "project_count":  p.get("project_count", 0),
            "total_logins":   profile_login_map.get(p.get("id", ""), 0),
        })
    enriched.sort(key=lambda x: x["last_active_at"] or "", reverse=True)

    return jsonify({
        "ok":             True,
        "total_accounts": total_accounts,
        "logins_today":   logins_today,
        "total_logins":   total_logins,
        "logins_by_day":  logins_by_day,
        "profiles":       enriched,
    })
