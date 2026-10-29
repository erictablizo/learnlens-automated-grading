# Entry point for cPanel "Setup Python App" (Phusion Passenger).
#
# Passenger only speaks WSGI and FastAPI is ASGI, so a2wsgi bridges the two.
# Locally keep using:  uvicorn app.main:app --reload
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
os.chdir(os.path.dirname(__file__))   # so .env and uploads/ resolve here

from a2wsgi import ASGIMiddleware  # noqa: E402
from app.main import app as asgi_app  # noqa: E402

application = ASGIMiddleware(asgi_app)
