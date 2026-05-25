from __future__ import annotations

import datetime as dt
import json
import sqlite3
import threading
import uuid
from collections import Counter
from pathlib import Path


def _json_loads_dict(value: str | None) -> dict:
    if not value:
        return {}
    try:
        parsed = json.loads(value)
    except Exception:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _coerce_int(value: object, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


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
    daily_activity: dict[str, dict] = {}
    page_totals: Counter[str] = Counter()
    treatment_totals: Counter[int] = Counter()
    manual_correction_events = 0
    manual_correction_rows = 0
    manual_correction_cells = 0
    project_creation_durations_ms: list[int] = []
    workflows_using_imported_geometry = 0

    for row in rows:
        profile_id = str(row["profile_id"])
        division = str(row["division"] or "Unassigned")
        event_type = str(row["event_type"])
        occurred_at = str(row["occurred_at"])
        project_name = str(row["project_name"] or "") or None
        payload = _json_loads_dict(row["payload_json"])
        occurred_dt = _coerce_datetime(occurred_at)
        day_key = occurred_dt.date().isoformat()

        event_totals[event_type] += 1

        day_summary = daily_activity.setdefault(
            day_key,
            {
                "date": day_key,
                "total_events": 0,
                "login_count": 0,
                "page_view_count": 0,
                "profile_ids": set(),
            },
        )
        day_summary["total_events"] += 1
        day_summary["profile_ids"].add(profile_id)
        if event_type == "profile_login":
            day_summary["login_count"] += 1
        if event_type == "page_view":
            day_summary["page_view_count"] += 1

        if event_type == "page_view":
            page = str(payload.get("page") or "").strip() or "unknown"
            page_totals[page] += 1

        if event_type == "manual_corrections_saved":
            manual_correction_events += 1
            manual_correction_rows += _coerce_int(payload.get("changed_row_count"))
            manual_correction_cells += _coerce_int(payload.get("changed_cell_count"))

        if event_type == "project_created":
            duration_ms = _coerce_int(payload.get("duration_ms"), default=-1)
            if duration_ms >= 0:
                project_creation_durations_ms.append(duration_ms)
            if payload.get("used_selection_geometry"):
                workflows_using_imported_geometry += 1

        if event_type == "treatments_applied":
            treatment_counts = payload.get("treatment_counts")
            if isinstance(treatment_counts, dict):
                for treatment_id, count in treatment_counts.items():
                    numeric_id = _coerce_int(treatment_id, default=-1)
                    if numeric_id > 0:
                        treatment_totals[numeric_id] += max(0, _coerce_int(count))
            else:
                segment_count = max(1, _coerce_int(payload.get("segment_count"), default=1))
                raw_treatment_ids = payload.get("treatment_ids")
                if isinstance(raw_treatment_ids, list):
                    for treatment_id in raw_treatment_ids:
                        numeric_id = _coerce_int(treatment_id, default=-1)
                        if numeric_id > 0:
                            treatment_totals[numeric_id] += segment_count

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

    daily_activity_list = []
    for day_summary in sorted(daily_activity.values(), key=lambda item: item["date"]):
        daily_activity_list.append(
            {
                "date": day_summary["date"],
                "total_events": day_summary["total_events"],
                "login_count": day_summary["login_count"],
                "session_count_proxy": day_summary["login_count"],
                "unique_active_profiles": len(day_summary["profile_ids"]),
                "page_view_count": day_summary["page_view_count"],
            }
        )

    if project_creation_durations_ms:
        project_creation_duration = {
            "count": len(project_creation_durations_ms),
            "average_ms": round(sum(project_creation_durations_ms) / len(project_creation_durations_ms), 2),
            "minimum_ms": min(project_creation_durations_ms),
            "maximum_ms": max(project_creation_durations_ms),
        }
    else:
        project_creation_duration = {
            "count": 0,
            "average_ms": None,
            "minimum_ms": None,
            "maximum_ms": None,
        }

    most_used_pages = [
        {"page": page, "visit_count": count}
        for page, count in sorted(page_totals.items(), key=lambda item: (-item[1], item[0]))
    ]
    most_used_treatments = [
        {"treatment_id": treatment_id, "application_count": count}
        for treatment_id, count in sorted(treatment_totals.items(), key=lambda item: (-item[1], item[0]))
    ]

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
        "daily_activity": daily_activity_list,
        "derived_metrics": {
            "session_count_proxy": event_totals.get("profile_login", 0),
            "projects_created": event_totals.get("project_created", 0),
            "projects_opened": event_totals.get("project_opened", 0),
            "projects_deleted": event_totals.get("project_deleted", 0),
            "page_views": event_totals.get("page_view", 0),
            "single_item_autocode_runs": event_totals.get("autocode_single_requested", 0),
            "full_project_autocode_runs": event_totals.get("autocode_bulk_requested", 0),
            "manual_correction_events": manual_correction_events,
            "manual_correction_rows": manual_correction_rows,
            "manual_correction_cells": manual_correction_cells,
            "workflows_using_imported_geometry": workflows_using_imported_geometry,
            "project_creation_duration": project_creation_duration,
            "most_used_pages": most_used_pages,
            "most_used_treatments": most_used_treatments,
        },
        "event_totals": dict(sorted(event_totals.items())),
        "divisions": division_list,
        "profiles": profile_list,
    }