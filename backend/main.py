"""Render.com / production entrypoint.

Render expects `uvicorn main:app` from the Root Directory. This module just
re-exports the FastAPI `app` from `server.py` so we keep one source of truth.

Local supervisor still uses `server:app` — both work.
"""
from server import app  # noqa: F401

__all__ = ["app"]
