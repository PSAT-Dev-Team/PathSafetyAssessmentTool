from flask import Flask
from flask_cors import CORS
from .config import Config
from .api import register_blueprints

def create_app(config_object=Config):
    app = Flask(__name__)
    app.config.from_object(config_object)

    # Enable CORS for all routes
    CORS(app, resources={r"/api/*": {"origins": "*"}})

    register_blueprints(app)

    return app
