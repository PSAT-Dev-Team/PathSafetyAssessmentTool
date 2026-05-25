from pathlib import Path
import sys


sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.services import telemetry_store  # noqa: E402


def _patch_db(monkeypatch, tmp_path):
    db_path = tmp_path / "profiles" / "telemetry.sqlite3"
    monkeypatch.setattr(telemetry_store, "_telemetry_db_path", lambda: db_path)
    return db_path


def test_record_event_creates_local_db(monkeypatch, tmp_path):
    db_path = _patch_db(monkeypatch, tmp_path)

    event_id = telemetry_store.record_event(
        "project_list_viewed",
        "profile-a",
        "Road Safety",
        payload={"project_count": 4},
    )

    assert event_id
    assert db_path.exists()
    assert telemetry_store.get_installation_id()


def test_generate_weekly_report_groups_by_division_and_profile(monkeypatch, tmp_path):
    _patch_db(monkeypatch, tmp_path)

    telemetry_store.record_event(
        "profile_login",
        "profile-a",
        "Road Safety",
        occurred_at="2026-05-18T09:00:00+00:00",
    )
    telemetry_store.record_event(
        "project_opened",
        "profile-a",
        "Road Safety",
        project_name="AMK AVE 8",
        occurred_at="2026-05-18T09:10:00+00:00",
    )
    telemetry_store.record_event(
        "project_created",
        "profile-b",
        "Transport Planning",
        project_name="Serangoon Avenue 1",
        occurred_at="2026-05-19T10:00:00+00:00",
    )

    report = telemetry_store.generate_weekly_report(
        "2026-05-18T00:00:00+00:00",
        "2026-05-25T00:00:00+00:00",
    )

    assert report["summary"]["total_events"] == 3
    assert report["summary"]["active_profiles"] == 2
    assert report["summary"]["division_count"] == 2
    assert report["event_totals"]["project_opened"] == 1
    assert report["remote_export"]["status"] == "not_configured"
    assert report["profiles"][0]["last_active_at"] >= report["profiles"][1]["last_active_at"]
    assert any(item["division"] == "Road Safety" for item in report["divisions"])


def test_generate_weekly_report_rejects_invalid_window(monkeypatch, tmp_path):
    _patch_db(monkeypatch, tmp_path)

    try:
        telemetry_store.generate_weekly_report(
            "2026-05-25T00:00:00+00:00",
            "2026-05-18T00:00:00+00:00",
        )
    except ValueError as exc:
        assert "window_end" in str(exc)
    else:
        raise AssertionError("Expected generate_weekly_report to reject an invalid window")