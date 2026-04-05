from __future__ import annotations

import asyncio
import json
import subprocess
from pathlib import Path
from typing import Iterable

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parents[1]
FRONTEND_DIST = ROOT / "frontend" / "dist"
AGENT_WORKSPACE = ROOT.parent
SHARED_WORKSPACE = AGENT_WORKSPACE.parent / "workspace"
OPENCLAW_BIN = Path("/home/ubuntu/.npm-global/bin/openclaw")


class CliResult(BaseModel):
    command: list[str]
    ok: bool
    exit_code: int | None = None
    stdout: str = ""
    stderr: str = ""


class AgentSummary(BaseModel):
    id: str
    name: str | None = None
    identity: str | None = None
    workspace: str | None = None
    model: str | None = None
    bindings: int | None = None
    status: str = "configured"
    latest_session_key: str | None = None
    latest_session_age_ms: int | None = None
    latest_session_model: str | None = None


class StatusSummary(BaseModel):
    title: str
    summary: str
    severity: str = "info"


class StatusResponse(BaseModel):
    status: CliResult
    gateway: CliResult
    summaries: list[StatusSummary]


class DocumentResponse(BaseModel):
    title: str
    source: str
    exists: bool
    content: str


class DashboardResponse(BaseModel):
    agents: list[AgentSummary]
    openclaw: StatusResponse
    backlog: DocumentResponse
    rulebook: DocumentResponse


app = FastAPI(title="Akbar's personal dashboard", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8") if path.exists() else ""


async def run_cli(*command: str, timeout: int = 20) -> CliResult:
    try:
        process = await asyncio.create_subprocess_exec(
            *command,
            cwd=str(AGENT_WORKSPACE),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=timeout)
        return CliResult(
            command=list(command),
            ok=process.returncode == 0,
            exit_code=process.returncode,
            stdout=stdout.decode("utf-8", errors="replace").strip(),
            stderr=stderr.decode("utf-8", errors="replace").strip(),
        )
    except TimeoutError:
        return CliResult(command=list(command), ok=False, stdout="", stderr=f"Command timed out after {timeout}s")
    except FileNotFoundError as exc:
        return CliResult(command=list(command), ok=False, stdout="", stderr=str(exc))


async def get_agent_summaries() -> list[AgentSummary]:
    agents_result, sessions_result = await asyncio.gather(
        run_cli(str(OPENCLAW_BIN), "agents", "list", "--json"),
        run_cli(str(OPENCLAW_BIN), "sessions", "--all-agents", "--json", timeout=30),
    )

    agents_payload = []
    if agents_result.ok and agents_result.stdout:
        try:
            agents_payload = json.loads(agents_result.stdout)
        except json.JSONDecodeError:
            agents_payload = []

    sessions_by_agent: dict[str, dict] = {}
    if sessions_result.ok and sessions_result.stdout:
        try:
            sessions_payload = json.loads(sessions_result.stdout)
            for session in sessions_payload.get("sessions", []):
                agent_id = session.get("agentId")
                if not agent_id:
                    continue
                current = sessions_by_agent.get(agent_id)
                if current is None or session.get("updatedAt", 0) > current.get("updatedAt", 0):
                    sessions_by_agent[agent_id] = session
        except json.JSONDecodeError:
            pass

    summaries: list[AgentSummary] = []
    for agent in agents_payload:
        agent_id = agent.get("id") or agent.get("agentId") or "unknown"
        latest_session = sessions_by_agent.get(agent_id, {})
        summaries.append(
            AgentSummary(
                id=agent_id,
                name=agent.get("name"),
                identity=(
                    " ".join(
                        [
                            (agent.get("identityEmoji") or "").strip(),
                            (agent.get("identityName") or "").strip(),
                        ]
                    ).strip()
                    or agent.get("identityLabel")
                    or agent.get("identity")
                    or agent.get("title")
                ),
                workspace=agent.get("workspace") or agent.get("workspacePath"),
                model=agent.get("model") or agent.get("modelName"),
                bindings=agent.get("bindings") if agent.get("bindings") is not None else agent.get("bindingCount"),
                status="default" if agent.get("isDefault") or agent.get("default") else "configured",
                latest_session_key=latest_session.get("key"),
                latest_session_age_ms=latest_session.get("ageMs"),
                latest_session_model=latest_session.get("model"),
            )
        )
    return summaries


def build_status_summaries(status: CliResult, gateway: CliResult) -> list[StatusSummary]:
    summaries: list[StatusSummary] = []
    if gateway.ok:
        gateway_line = next((line for line in gateway.stdout.splitlines() if line.startswith("Gateway:")), None)
        runtime_line = next((line for line in gateway.stdout.splitlines() if line.startswith("Runtime:")), None)
        if gateway_line:
            summaries.append(StatusSummary(title="Gateway", summary=gateway_line.replace("Gateway:", "").strip(), severity="success"))
        if runtime_line:
            summaries.append(StatusSummary(title="Runtime", summary=runtime_line.replace("Runtime:", "").strip(), severity="success"))
    if status.ok:
        for line in status.stdout.splitlines():
            stripped = line.strip()
            if stripped.startswith("│ Gateway"):
                summaries.append(StatusSummary(title="Status", summary="Gateway reachable via openclaw status", severity="success"))
                break
    if not summaries:
        summaries.append(StatusSummary(title="Status", summary="OpenClaw status commands did not return a usable summary.", severity="warning"))
    return summaries


async def get_openclaw_status() -> StatusResponse:
    status_result, gateway_result = await asyncio.gather(
        run_cli(str(OPENCLAW_BIN), "status", timeout=30),
        run_cli(str(OPENCLAW_BIN), "gateway", "status", timeout=20),
    )
    return StatusResponse(
        status=status_result,
        gateway=gateway_result,
        summaries=build_status_summaries(status_result, gateway_result),
    )


def get_document(title: str, path: Path) -> DocumentResponse:
    return DocumentResponse(
        title=title,
        source=str(path),
        exists=path.exists(),
        content=read_text(path),
    )


@app.get("/api/agents", response_model=list[AgentSummary])
async def agents() -> list[AgentSummary]:
    return await get_agent_summaries()


@app.get("/api/status", response_model=StatusResponse)
async def status() -> StatusResponse:
    return await get_openclaw_status()


@app.get("/api/backlog", response_model=DocumentResponse)
def backlog() -> DocumentResponse:
    return get_document("Shared backlog", SHARED_WORKSPACE / "shared-backlog.md")


@app.get("/api/rulebook", response_model=DocumentResponse)
def rulebook() -> DocumentResponse:
    return get_document("Shared rulebook", SHARED_WORKSPACE / "shared-rulebook.md")


@app.get("/api/dashboard", response_model=DashboardResponse)
async def dashboard() -> DashboardResponse:
    agents, openclaw = await asyncio.gather(get_agent_summaries(), get_openclaw_status())
    return DashboardResponse(
        agents=agents,
        openclaw=openclaw,
        backlog=get_document("Shared backlog", SHARED_WORKSPACE / "shared-backlog.md"),
        rulebook=get_document("Shared rulebook", SHARED_WORKSPACE / "shared-rulebook.md"),
    )


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
