from flask import Flask
from .config import Config
from .api import register_blueprints

def create_app(config_object=Config):
    app = Flask(__name__)
    app.config.from_object(config_object)
    register_blueprints(app)
    return app
