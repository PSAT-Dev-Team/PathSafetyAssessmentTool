from __future__ import annotations

from flask import jsonify, request

from . import bp
from app.services import profile_store
from app.services import telemetry_store


def _invalidate_project_context() -> None:
    from app.api.projects import routes as project_routes

    project_routes.invalidate_ctx()


def _record_profile_event(event_type: str, profile: dict) -> None:
    try:
        telemetry_store.record_event(
            event_type,
            profile["id"],
            profile["division"],
        )
    except Exception as exc:
        print(f"[Telemetry] Failed to record '{event_type}': {exc}", flush=True)


@bp.get("")
def list_profiles():
    return jsonify(profile_store.get_overview())


@bp.post("")
def create_profile():
    data = request.get_json(silent=True) or {}
    try:
        profile = profile_store.create_profile(data.get("name"), data.get("pin"), data.get("division"))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    _record_profile_event("profile_created", profile)

    return jsonify({"profile": profile, "overview": profile_store.get_overview()}), 201


@bp.post("/login")
def login_profile():
    data = request.get_json(silent=True) or {}
    try:
        profile = profile_store.login_profile(str(data.get("profile_id") or ""), str(data.get("pin") or ""))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 404
    except PermissionError as exc:
        return jsonify({"error": str(exc)}), 401

    _record_profile_event("profile_login", profile)

    _invalidate_project_context()
    return jsonify({"active_profile": profile, "overview": profile_store.get_overview()})


@bp.post("/logout")
def logout_profile():
    profile_store.logout_profile()
    _invalidate_project_context()
    return jsonify({"ok": True, "overview": profile_store.get_overview()})


@bp.post("/migrate-legacy-projects")
def migrate_legacy_projects():
    data = request.get_json(silent=True) or {}
    profile_id = str(data.get("profile_id") or profile_store.get_active_profile_id() or "")
    if not profile_id:
        return jsonify({"error": "A profile must be active before moving legacy projects"}), 400

    raw_project_names = data.get("project_names")
    if raw_project_names is not None and not isinstance(raw_project_names, list):
        return jsonify({"error": "project_names must be an array"}), 400

    try:
        result = profile_store.move_legacy_projects_to_profile(profile_id, raw_project_names)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 404

    _invalidate_project_context()
    return jsonify({**result, "overview": profile_store.get_overview()})