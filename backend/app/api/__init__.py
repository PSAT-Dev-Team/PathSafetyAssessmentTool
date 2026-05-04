from .projects import bp as projects_bp
from .health import bp as health_bp
from .cycleRAP import bp as cyclerap_bp


def register_blueprints(app):
    app.register_blueprint(projects_bp, url_prefix="/api/projects")
    app.register_blueprint(health_bp, url_prefix="/api")
    app.register_blueprint(cyclerap_bp, url_prefix="/api/cyclerap")

    # shapefiles blueprint is optional in some setups (e.g., missing folder in
    # source tree). Import lazily and register only if available to avoid
    # crashing the whole app on import-time ModuleNotFoundError.
    try:
        from .gis_layers import bp as shapefiles_bp
    except Exception as e:
        app.logger.error(f"Failed to load optional blueprint 'gis_layers': {e}")
        import traceback
        app.logger.error(traceback.format_exc())
    else:
        app.register_blueprint(shapefiles_bp, url_prefix="/api/shapefiles")
