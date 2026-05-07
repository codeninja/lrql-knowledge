"""FastAPI server for the LRQL graph explorer.

Endpoints:
- POST /api/query        -> execute an LQL statement
- GET  /api/entities     -> list entities for the side browser
- GET  /api/summary      -> graph stats / vindex info
- GET  /api/search?q=    -> entity autocomplete
- GET  /                 -> serves the frontend
"""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import lrql_client, mock_vindex


ROOT = Path(__file__).resolve().parent.parent
FRONTEND_DIR = ROOT / "frontend"


app = FastAPI(title="LRQL Graph Explorer", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class QueryRequest(BaseModel):
    query: str


@app.post("/api/query")
def query(req: QueryRequest) -> dict:
    try:
        result = lrql_client.execute(req.query)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {
        "ok": result.get("kind") != "error",
        "backend": "larql" if lrql_client.have_real_backend() else "mock",
        "result": result,
    }


@app.get("/api/entities")
def entities(limit: int = 200) -> dict:
    return {"entities": mock_vindex.all_entities()[:limit]}


@app.get("/api/search")
def search(q: str = "", limit: int = 20) -> dict:
    return {"entities": mock_vindex.search(q, limit)}


@app.get("/api/summary")
def summary() -> dict:
    return {
        "backend": "larql" if lrql_client.have_real_backend() else "mock",
        **mock_vindex.graph_summary(),
    }


# Static frontend ------------------------------------------------------------

if FRONTEND_DIR.exists():
    app.mount("/css", StaticFiles(directory=FRONTEND_DIR / "css"), name="css")
    app.mount("/js", StaticFiles(directory=FRONTEND_DIR / "js"), name="js")
    if (FRONTEND_DIR / "assets").is_dir():
        app.mount("/assets", StaticFiles(directory=FRONTEND_DIR / "assets"), name="assets")

    @app.get("/")
    def index() -> FileResponse:
        return FileResponse(FRONTEND_DIR / "index.html")
