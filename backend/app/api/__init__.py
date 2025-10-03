from .projects import bp as projects_bp
from .health import bp as health_bp
from .cycleRAP import bp as cyclerap_bp

def register_blueprints(app):
    app.register_blueprint(projects_bp, url_prefix="/api/project")
    app.register_blueprint(health_bp, url_prefix="/api")
    app.register_blueprint(cyclerap_bp, url_prefix="/api/cyclerap")