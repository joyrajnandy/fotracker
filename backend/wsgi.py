"""WSGI entry point for PythonAnywhere (wraps FastAPI ASGI app via a2wsgi)."""
import os
import sys

_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if _BASE_DIR not in sys.path:
    sys.path.insert(0, _BASE_DIR)
os.chdir(_BASE_DIR)
os.environ.setdefault("DISABLE_BACKGROUND_FEEDER", "true")

from a2wsgi import ASGIMiddleware
from main import app

application = ASGIMiddleware(app)
