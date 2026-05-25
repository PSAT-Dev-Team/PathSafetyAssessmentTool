from __future__ import annotations

import datetime as dt
import hashlib
import hmac
import json
import re
import secrets
import shutil
import threading
import unicodedata
from pathlib import Path

from app.services.cycleRAP_VA import get_full_path

_STATE_LOCK = threading.RLock()
_ACTIVE_PROFILE_ID: str | None = None
_PIN_RE = re.compile(r"^\d{4,12}$")
_LEGACY_DIVISION = "Unassigned"


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _profiles_root() -> Path:
    return _repo_root() / "profiles"


def _registry_path() -> Path:
    return _profiles_root() / "profiles.json"


def _legacy_projects_root() -> Path:
    config_path = Path(get_full_path("config.json"))
    destination_folder = "../data"
    if config_path.exists():
        try:
            with open(config_path, "r", encoding="utf-8") as handle:
                config = json.load(handle)
            destination_folder = str(config.get("destination_folder") or destination_folder)
        except Exception:
            destination_folder = "../data"
    return Path(get_full_path(destination_folder)).resolve()


def _default_state() -> dict:
    return {"version": 1, "profiles": []}


def _clean_division(division: str | None, *, allow_default: bool = False) -> str:
    clean_division = " ".join(str(division or "").split())
    if clean_division:
        return clean_division
    if allow_default:
        return _LEGACY_DIVISION
    raise ValueError("Division is required")


def _ensure_root() -> None:
    _profiles_root().mkdir(parents=True, exist_ok=True)


def _load_state() -> dict:
    _ensure_root()
    registry_path = _registry_path()
    if not registry_path.exists():
        state = _default_state()
        _save_state(state)
        return state

    with open(registry_path, "r", encoding="utf-8") as handle:
        state = json.load(handle)

    if not isinstance(state, dict):
        raise ValueError("Profile registry is invalid")

    state.setdefault("version", 1)
    state.setdefault("profiles", [])
    for profile in state.get("profiles", []):
        profile["division"] = _clean_division(profile.get("division"), allow_default=True)
        profile.setdefault("last_active_at", None)
    return state


def _save_state(state: dict) -> None:
    _ensure_root()
    registry_path = _registry_path()
    temp_path = registry_path.with_suffix(".tmp")
    with open(temp_path, "w", encoding="utf-8") as handle:
        json.dump(state, handle, indent=2)
    temp_path.replace(registry_path)


def _slugify(name: str) -> str:
    normalized = unicodedata.normalize("NFKD", name)
    ascii_name = normalized.encode("ascii", "ignore").decode("ascii")
    cleaned = re.sub(r"[^a-zA-Z0-9]+", "-", ascii_name).strip("-").lower()
    return cleaned or "profile"


def _make_unique_slug(name: str, profiles: list[dict]) -> str:
    base = _slugify(name)
    existing = {str(profile.get("slug") or "") for profile in profiles}
    candidate = base
    index = 2
    while candidate in existing:
        candidate = f"{base}-{index}"
        index += 1
    return candidate


def _hash_pin(pin: str, salt_hex: str | None = None) -> tuple[str, str]:
    salt = bytes.fromhex(salt_hex) if salt_hex else secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", pin.encode("utf-8"), salt, 200_000)
    return digest.hex(), salt.hex()


def _verify_pin(profile: dict, pin: str) -> bool:
    expected = str(profile.get("pin_hash") or "")
    salt_hex = str(profile.get("pin_salt") or "")
    if not expected or not salt_hex:
        return False
    actual, _ = _hash_pin(pin, salt_hex)
    return hmac.compare_digest(expected, actual)


def _project_root_for_slug(slug: str) -> Path:
    return _profiles_root() / slug / "projects"


def _ensure_profile_project_root(profile: dict) -> Path:
    project_root = _project_root_for_slug(str(profile.get("slug") or ""))
    project_root.mkdir(parents=True, exist_ok=True)
    return project_root


def _count_projects(profile: dict) -> int:
    project_root = _project_root_for_slug(str(profile.get("slug") or ""))
    if not project_root.exists():
        return 0
    return sum(1 for child in project_root.iterdir() if child.is_dir())


def _serialize_profile(profile: dict) -> dict:
    return {
        "id": str(profile.get("id") or ""),
        "name": str(profile.get("name") or ""),
        "slug": str(profile.get("slug") or ""),
        "division": _clean_division(profile.get("division"), allow_default=True),
        "created_at": str(profile.get("created_at") or ""),
        "last_active_at": str(profile.get("last_active_at") or "") or None,
        "project_count": _count_projects(profile),
        "has_pin": True,
    }


def _find_profile(state: dict, profile_id: str) -> dict | None:
    for profile in state.get("profiles", []):
        if str(profile.get("id") or "") == profile_id:
            return profile
    return None


def _require_profile(state: dict, profile_id: str) -> dict:
    profile = _find_profile(state, profile_id)
    if profile is None:
        raise ValueError("Profile not found")
    return profile


def list_profiles() -> list[dict]:
    with _STATE_LOCK:
        state = _load_state()
        profiles = [_serialize_profile(profile) for profile in state.get("profiles", [])]
    return sorted(profiles, key=lambda profile: profile["name"].lower())


def list_legacy_projects() -> list[str]:
    legacy_root = _legacy_projects_root()
    if not legacy_root.exists():
        return []
    return sorted(child.name for child in legacy_root.iterdir() if child.is_dir())


def create_profile(name: str, pin: str, division: str) -> dict:
    clean_name = str(name or "").strip()
    if not clean_name:
        raise ValueError("Profile name is required")
    if not _PIN_RE.fullmatch(str(pin or "")):
        raise ValueError("PIN must be 4 to 12 digits")
    clean_division = _clean_division(division)

    with _STATE_LOCK:
        state = _load_state()
        existing_names = {str(profile.get("name") or "").casefold() for profile in state.get("profiles", [])}
        if clean_name.casefold() in existing_names:
            raise ValueError("A profile with that name already exists")

        pin_hash, pin_salt = _hash_pin(pin)
        profile = {
            "id": secrets.token_hex(8),
            "name": clean_name,
            "slug": _make_unique_slug(clean_name, state.get("profiles", [])),
            "division": clean_division,
            "created_at": dt.datetime.now(dt.timezone.utc).isoformat(),
            "last_active_at": None,
            "pin_hash": pin_hash,
            "pin_salt": pin_salt,
        }
        state.setdefault("profiles", []).append(profile)
        _save_state(state)
        _ensure_profile_project_root(profile)
        return _serialize_profile(profile)


def get_active_profile_id() -> str | None:
    return _ACTIVE_PROFILE_ID


def get_active_profile() -> dict | None:
    profile_id = get_active_profile_id()
    if profile_id is None:
        return None
    with _STATE_LOCK:
        state = _load_state()
        profile = _find_profile(state, profile_id)
        if profile is None:
            return None
        return _serialize_profile(profile)


def login_profile(profile_id: str, pin: str) -> dict:
    global _ACTIVE_PROFILE_ID

    if not _PIN_RE.fullmatch(str(pin or "")):
        raise PermissionError("Invalid PIN")

    with _STATE_LOCK:
        state = _load_state()
        profile = _require_profile(state, str(profile_id or ""))
        if not _verify_pin(profile, pin):
            raise PermissionError("Invalid PIN")
        _ensure_profile_project_root(profile)
        profile["last_active_at"] = dt.datetime.now(dt.timezone.utc).isoformat()
        _save_state(state)
        _ACTIVE_PROFILE_ID = str(profile.get("id") or "")
        return _serialize_profile(profile)


def logout_profile() -> None:
    global _ACTIVE_PROFILE_ID
    _ACTIVE_PROFILE_ID = None


def get_profile_projects_root(profile_id: str) -> Path:
    with _STATE_LOCK:
        state = _load_state()
        profile = _require_profile(state, profile_id)
        return _ensure_profile_project_root(profile)


def touch_profile_activity(profile_id: str, when: dt.datetime | str | None = None) -> dict:
    with _STATE_LOCK:
        state = _load_state()
        profile = _require_profile(state, str(profile_id or ""))
        if when is None:
            timestamp = dt.datetime.now(dt.timezone.utc).isoformat()
        elif isinstance(when, dt.datetime):
            timestamp = when.astimezone(dt.timezone.utc).isoformat() if when.tzinfo else when.replace(tzinfo=dt.timezone.utc).isoformat()
        else:
            timestamp = str(when)
        profile["last_active_at"] = timestamp
        _save_state(state)
        return _serialize_profile(profile)


def get_legacy_projects_root() -> Path:
    return _legacy_projects_root()


def move_legacy_projects_to_profile(profile_id: str, project_names: list[str] | None = None) -> dict:
    with _STATE_LOCK:
        state = _load_state()
        profile = _require_profile(state, profile_id)
        destination_root = _ensure_profile_project_root(profile)
        legacy_root = _legacy_projects_root()

        requested_names = None
        if project_names is not None:
            requested_names = {str(name or "").strip() for name in project_names if str(name or "").strip()}

        moved: list[str] = []
        skipped: list[dict[str, str]] = []
        missing: list[str] = []

        if requested_names and not legacy_root.exists():
            return {"moved": moved, "skipped": skipped, "missing": sorted(requested_names)}
        if not legacy_root.exists():
            return {"moved": moved, "skipped": skipped, "missing": missing}

        available = {child.name: child for child in legacy_root.iterdir() if child.is_dir()}
        selected_names = sorted(requested_names) if requested_names is not None else sorted(available)

        for project_name in selected_names:
            source = available.get(project_name)
            if source is None:
                missing.append(project_name)
                continue
            destination = destination_root / project_name
            if destination.exists():
                skipped.append({"name": project_name, "reason": "already_exists"})
                continue
            shutil.move(str(source), str(destination))
            moved.append(project_name)

        return {"moved": moved, "skipped": skipped, "missing": missing}


def get_overview() -> dict:
    return {
        "profiles": list_profiles(),
        "active_profile": get_active_profile(),
        "legacy_projects": list_legacy_projects(),
    }