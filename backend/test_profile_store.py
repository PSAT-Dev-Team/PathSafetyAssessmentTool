from pathlib import Path
import json
import sys

import pytest


sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.services import profile_store  # noqa: E402


def _patch_roots(monkeypatch, tmp_path):
    profiles_root = tmp_path / "profiles"
    legacy_root = tmp_path / "data"
    monkeypatch.setattr(profile_store, "_profiles_root", lambda: profiles_root)
    monkeypatch.setattr(profile_store, "_legacy_projects_root", lambda: legacy_root)
    monkeypatch.setattr(profile_store, "_ACTIVE_PROFILE_ID", None)
    return profiles_root, legacy_root


def test_create_profile_hashes_pin(monkeypatch, tmp_path):
    profiles_root, _ = _patch_roots(monkeypatch, tmp_path)

    profile = profile_store.create_profile("Alice", "1234", "Road Safety")

    registry = json.loads((profiles_root / "profiles.json").read_text(encoding="utf-8"))
    stored = registry["profiles"][0]
    assert profile["name"] == "Alice"
    assert profile["division"] == "Road Safety"
    assert stored["pin_hash"] != "1234"
    assert stored["pin_salt"]
    assert stored["slug"] == "alice"


def test_login_and_logout_profile(monkeypatch, tmp_path):
    _patch_roots(monkeypatch, tmp_path)
    profile = profile_store.create_profile("Office A", "2468", "Transport Planning")

    active = profile_store.login_profile(profile["id"], "2468")

    assert active["id"] == profile["id"]
    assert active["division"] == "Transport Planning"
    assert active["last_active_at"]
    assert profile_store.get_active_profile()["id"] == profile["id"]

    profile_store.logout_profile()

    assert profile_store.get_active_profile() is None


def test_move_legacy_projects_to_profile(monkeypatch, tmp_path):
    profiles_root, legacy_root = _patch_roots(monkeypatch, tmp_path)
    profile = profile_store.create_profile("Analyst", "4321", "Data Office")

    (legacy_root / "Project One").mkdir(parents=True)
    (legacy_root / "Project Two").mkdir(parents=True)

    result = profile_store.move_legacy_projects_to_profile(profile["id"])

    destination_root = profiles_root / profile["slug"] / "projects"
    assert result["moved"] == ["Project One", "Project Two"]
    assert not (legacy_root / "Project One").exists()
    assert (destination_root / "Project One").exists()
    assert (destination_root / "Project Two").exists()


def test_login_rejects_wrong_pin(monkeypatch, tmp_path):
    _patch_roots(monkeypatch, tmp_path)
    profile = profile_store.create_profile("Analyst", "4321", "Data Office")

    with pytest.raises(PermissionError):
        profile_store.login_profile(profile["id"], "1111")


def test_create_profile_requires_division(monkeypatch, tmp_path):
    _patch_roots(monkeypatch, tmp_path)

    with pytest.raises(ValueError):
        profile_store.create_profile("Analyst", "4321", "")