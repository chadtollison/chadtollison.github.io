"""A small HTTP API:  pip install "scrubpii[server]"  then  scrubpii serve

POST /redact    {"text": "...", "mode": "label|mask|fake|token"}  -> {"text": "...", "key": {...}}
POST /find      {"text": "..."}                                   -> {"entities": [...]}
POST /restore   {"text": "...", "key": {...}}                     -> {"text": "..."}
GET  /health
Everything runs locally; nothing is sent anywhere.
"""
from __future__ import annotations

from typing import Dict, Optional

from fastapi import FastAPI
from pydantic import BaseModel

from . import MODES, __version__, _apply, find, restore

app = FastAPI(title="scrubpii", version=__version__,
              description="Find and redact personal data. Runs locally; nothing leaves this machine.")


class TextIn(BaseModel):
    text: str
    mode: str = "label"
    min_score: float = 0.5


class RestoreIn(BaseModel):
    text: str
    key: Dict[str, str]


@app.get("/health")
def health():
    return {"ok": True, "version": __version__}


@app.post("/find")
def find_route(body: TextIn):
    return {"entities": [e.as_dict() for e in find(body.text, body.min_score)]}


@app.post("/redact")
def redact_route(body: TextIn):
    if body.mode not in MODES:
        return {"error": f"mode must be one of {MODES}"}
    text, key = _apply(body.text, find(body.text, body.min_score), body.mode)
    return {"text": text, "key": key if body.mode == "token" else None}


@app.post("/restore")
def restore_route(body: RestoreIn):
    return {"text": restore(body.text, body.key)}


def run(host: str = "127.0.0.1", port: int = 8000):
    import uvicorn
    uvicorn.run(app, host=host, port=port)
