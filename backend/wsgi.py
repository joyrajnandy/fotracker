"""WSGI entry point for PythonAnywhere (wraps FastAPI ASGI app via a2wsgi)."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("DISABLE_BACKGROUND_FEEDER", "true")

from a2wsgi import ASGIMiddleware
from main import app

application = ASGIMiddleware(app)
