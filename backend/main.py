from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

try:
    from .schemas import AgentSummary, BacklogResponse, DashboardResponse, RulebookResponse, StatusResponse
    from .services import DashboardService, FRONTEND_DIST
except ImportError:  # pragma: no cover - fallback for uvicorn main:app from backend/
    from schemas import AgentSummary, BacklogResponse, DashboardResponse, RulebookResponse, StatusResponse
    from services import DashboardService, FRONTEND_DIST

app = FastAPI(title="Akbar's personal dashboard", version="0.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

service = DashboardService()


@app.get("/api/agents", response_model=list[AgentSummary])
async def agents() -> list[AgentSummary]:
    return await service.data_source.get_agents()


@app.get("/api/status", response_model=StatusResponse)
async def status() -> StatusResponse:
    return await service.data_source.get_status()


@app.get("/api/backlog", response_model=BacklogResponse)
def backlog() -> BacklogResponse:
    return service.data_source.get_backlog()


@app.get("/api/rulebook", response_model=RulebookResponse)
def rulebook() -> RulebookResponse:
    return service.data_source.get_rulebook()


@app.get("/api/dashboard", response_model=DashboardResponse)
async def dashboard() -> DashboardResponse:
    return await service.get_dashboard()


assets_dir = FRONTEND_DIST / "assets"
if assets_dir.exists():
    app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")


@app.get("/{full_path:path}")
def spa(full_path: str = ""):
    candidate = FRONTEND_DIST / full_path
    if full_path and candidate.exists() and candidate.is_file():
        return FileResponse(candidate)

    index_path = FRONTEND_DIST / "index.html"
    if not index_path.exists():
        raise HTTPException(status_code=404, detail="Frontend build not found. Run the frontend build first.")
    return FileResponse(index_path)
