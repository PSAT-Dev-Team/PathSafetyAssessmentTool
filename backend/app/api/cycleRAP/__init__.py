from flask import Blueprint

bp = Blueprint("cyclerap", __name__)
from . import routes  # noqa
