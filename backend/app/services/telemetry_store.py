from __future__ import annotations

import datetime as dt
import json
import sqlite3
import threading
import uuid
from collections import Counter
from pathlib import Path


_DB_LOCK = threading.RLock()
_SCHEMA_VERSION = 1


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _telemetry_root() -> Path:
    return _repo_root() / "profiles"


def _telemetry_db_path() -> Path:
    return _telemetry_root() / "telemetry.sqlite3"


def _utc_now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def _isoformat(value: dt.datetime) -> str:
    return value.astimezone(dt.timezone.utc).isoformat()


def _coerce_datetime(value: dt.datetime | str | None) -> dt.datetime:
    if value is None:
        return _utc_now()
    if isinstance(value, dt.datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=dt.timezone.utc)
        return value.astimezone(dt.timezone.utc)
    parsed = dt.datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=dt.timezone.utc)
    return parsed.astimezone(dt.timezone.utc)


def _connect() -> sqlite3.Connection:
    db_path = _telemetry_db_path()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path, timeout=30, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    _ensure_schema(conn)
    return conn


def _ensure_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS metadata (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS activity_events (
            event_id TEXT PRIMARY KEY,
            occurred_at TEXT NOT NULL,
            event_type TEXT NOT NULL,
            profile_id TEXT NOT NULL,
            division TEXT NOT NULL,
            project_name TEXT,
            install_id TEXT NOT NULL,
            payload_json TEXT NOT NULL DEFAULT '{}'
        );

        CREATE TABLE IF NOT EXISTS report_batches (
            batch_id TEXT PRIMARY KEY,
            created_at TEXT NOT NULL,
            window_start TEXT NOT NULL,
            window_end TEXT NOT NULL,
            status TEXT NOT NULL,
            destination TEXT,
            payload_json TEXT NOT NULL DEFAULT '{}'
        );
        """
    )
    conn.execute(
        "INSERT OR IGNORE INTO metadata(key, value) VALUES ('schema_version', ?)",
        (str(_SCHEMA_VERSION),),
    )
    conn.execute(
        "INSERT OR IGNORE INTO metadata(key, value) VALUES ('installation_id', ?)",
        (uuid.uuid4().hex,),
    )
    conn.commit()


def get_installation_id() -> str:
    with _DB_LOCK:
        conn = _connect()
        try:
            row = conn.execute("SELECT value FROM metadata WHERE key = 'installation_id'").fetchone()
            return str(row["value"] if row else "")
        finally:
            conn.close()


def record_event(
    event_type: str,
    profile_id: str,
    division: str,
    *,
    project_name: str | None = None,
    payload: dict | None = None,
    occurred_at: dt.datetime | str | None = None,
) -> str:
    event_id = uuid.uuid4().hex
    occurred = _isoformat(_coerce_datetime(occurred_at))
    payload_json = json.dumps(payload or {}, sort_keys=True)

    with _DB_LOCK:
        conn = _connect()
        try:
            install_id = get_installation_id()
            conn.execute(
                """
                INSERT INTO activity_events(
                    event_id, occurred_at, event_type, profile_id, division,
                    project_name, install_id, payload_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    event_id,
                    occurred,
                    str(event_type or "").strip(),
                    str(profile_id or "").strip(),
                    str(division or "").strip() or "Unassigned",
                    str(project_name or "").strip() or None,
                    install_id,
                    payload_json,
                ),
            )
            conn.commit()
            return event_id
        finally:
            conn.close()


def pending_batch_count() -> int:
    with _DB_LOCK:
        conn = _connect()
        try:
            row = conn.execute(
                "SELECT COUNT(*) AS count FROM report_batches WHERE status != 'uploaded'"
            ).fetchone()
            return int(row["count"] if row else 0)
        finally:
            conn.close()


def generate_weekly_report(window_start: dt.datetime | str, window_end: dt.datetime | str) -> dict:
    start = _coerce_datetime(window_start)
    end = _coerce_datetime(window_end)
    if end <= start:
        raise ValueError("window_end must be after window_start")

    start_iso = _isoformat(start)
    end_iso = _isoformat(end)

    with _DB_LOCK:
        conn = _connect()
        try:
            install_id = get_installation_id()
            rows = conn.execute(
                """
                SELECT occurred_at, event_type, profile_id, division, project_name, payload_json
                FROM activity_events
                WHERE occurred_at >= ? AND occurred_at < ?
                ORDER BY occurred_at ASC
                """,
                (start_iso, end_iso),
            ).fetchall()
        finally:
            conn.close()

    event_totals: Counter[str] = Counter()
    profiles: dict[str, dict] = {}
    divisions: dict[str, dict] = {}

    for row in rows:
        profile_id = str(row["profile_id"])
        division = str(row["division"] or "Unassigned")
        event_type = str(row["event_type"])
        occurred_at = str(row["occurred_at"])
        project_name = str(row["project_name"] or "") or None

        event_totals[event_type] += 1

        profile_summary = profiles.setdefault(
            profile_id,
            {
                "profile_id": profile_id,
                "division": division,
                "last_active_at": occurred_at,
                "total_events": 0,
                "event_totals": Counter(),
                "projects_touched": set(),
            },
        )
        profile_summary["division"] = division
        profile_summary["last_active_at"] = max(profile_summary["last_active_at"], occurred_at)
        profile_summary["total_events"] += 1
        profile_summary["event_totals"][event_type] += 1
        if project_name:
            profile_summary["projects_touched"].add(project_name)

        division_summary = divisions.setdefault(
            division,
            {
                "division": division,
                "profile_ids": set(),
                "total_events": 0,
                "last_active_at": occurred_at,
                "event_totals": Counter(),
            },
        )
        division_summary["profile_ids"].add(profile_id)
        division_summary["total_events"] += 1
        division_summary["last_active_at"] = max(division_summary["last_active_at"], occurred_at)
        division_summary["event_totals"][event_type] += 1

    profile_list = []
    for profile_summary in profiles.values():
        profile_list.append(
            {
                "profile_id": profile_summary["profile_id"],
                "division": profile_summary["division"],
                "last_active_at": profile_summary["last_active_at"],
                "total_events": profile_summary["total_events"],
                "event_totals": dict(sorted(profile_summary["event_totals"].items())),
                "projects_touched": sorted(profile_summary["projects_touched"]),
            }
        )
    profile_list.sort(key=lambda item: (item["last_active_at"], item["profile_id"]), reverse=True)

    division_list = []
    for division_summary in divisions.values():
        division_list.append(
            {
                "division": division_summary["division"],
                "profile_count": len(division_summary["profile_ids"]),
                "last_active_at": division_summary["last_active_at"],
                "total_events": division_summary["total_events"],
                "event_totals": dict(sorted(division_summary["event_totals"].items())),
            }
        )
    division_list.sort(key=lambda item: item["division"].lower())

    return {
        "schema_version": 1,
        "generated_at": _isoformat(_utc_now()),
        "report_type": "weekly_activity_summary",
        "installation": {
            "installation_id": install_id,
            "scope": "single_device",
        },
        "window": {
            "start": start_iso,
            "end": end_iso,
        },
        "remote_export": {
            "status": "not_configured",
            "destination": None,
            "pending_batches": pending_batch_count(),
        },
        "summary": {
            "total_events": len(rows),
            "active_profiles": len(profile_list),
            "division_count": len(division_list),
        },
        "event_totals": dict(sorted(event_totals.items())),
        "divisions": division_list,
        "profiles": profile_list,
    }