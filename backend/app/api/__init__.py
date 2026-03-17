from .projects import bp as projects_bp
from .health import bp as health_bp
from .cycleRAP import bp as cyclerap_bp


def register_blueprints(app):
    app.register_blueprint(projects_bp, url_prefix="/api/projects")
    app.register_blueprint(health_bp, url_prefix="/api")

    # shapefiles blueprint is optional in some setups (e.g., missing folder in
    # source tree). Import lazily and register only if available to avoid
    # crashing the whole app on import-time ModuleNotFoundError.
    try:
        from .shapefiles import bp as shapefiles_bp
    except Exception:
        app.logger.warning("Optional blueprint 'shapefiles' not available; skipping")
    else:
        app.register_blueprint(shapefiles_bp, url_prefix="/api/shapefiles")
