from __future__ import annotations

import asyncio
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Protocol

try:
    from .parsers import (
        build_status_summaries,
        parse_backlog,
        parse_channels,
        parse_rulebook,
        parse_security_notices,
        parse_status_facts,
    )
    from .schemas import AgentSummary, BacklogResponse, CliResult, DashboardResponse, RulebookResponse, SourceDocument, StatusResponse
except ImportError:  # pragma: no cover - fallback for direct module execution
    from parsers import (
        build_status_summaries,
        parse_backlog,
        parse_channels,
        parse_rulebook,
        parse_security_notices,
        parse_status_facts,
    )
    from schemas import AgentSummary, BacklogResponse, CliResult, DashboardResponse, RulebookResponse, SourceDocument, StatusResponse

ROOT = Path(__file__).resolve().parents[1]
FRONTEND_DIST = ROOT / "frontend" / "dist"
AGENT_WORKSPACE = ROOT.parent
SHARED_WORKSPACE = AGENT_WORKSPACE.parent / "workspace"
OPENCLAW_BIN = Path("/home/ubuntu/.npm-global/bin/openclaw")


class DashboardDataSource(Protocol):
    async def get_agents(self) -> list[AgentSummary]: ...

    async def get_status(self) -> StatusResponse: ...

    def get_backlog(self) -> BacklogResponse: ...

    def get_rulebook(self) -> RulebookResponse: ...


class OpenClawWorkspaceDataSource:
    def read_text(self, path: Path) -> str:
        return path.read_text(encoding="utf-8") if path.exists() else ""

    async def run_cli(self, *command: str, timeout: int = 20) -> CliResult:
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

    async def get_agents(self) -> list[AgentSummary]:
        agents_result, sessions_result = await asyncio.gather(
            self.run_cli(str(OPENCLAW_BIN), "agents", "list", "--json"),
            self.run_cli(str(OPENCLAW_BIN), "sessions", "--all-agents", "--json", timeout=30),
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

    async def get_status(self) -> StatusResponse:
        status_result, gateway_result = await asyncio.gather(
            self.run_cli(str(OPENCLAW_BIN), "status", timeout=30),
            self.run_cli(str(OPENCLAW_BIN), "gateway", "status", timeout=20),
        )
        facts = parse_status_facts(status_result.stdout)
        security_summary, security_notices = parse_security_notices(status_result.stdout)
        channels = parse_channels(status_result.stdout)
        return StatusResponse(
            status=status_result,
            gateway=gateway_result,
            summaries=build_status_summaries(facts, security_summary, gateway_result.stdout),
            facts=facts,
            security_summary=security_summary,
            security_notices=security_notices,
            channels=channels,
        )

    def get_document(self, title: str, path: Path) -> SourceDocument:
        return SourceDocument(title=title, source=str(path), exists=path.exists(), raw_content=self.read_text(path))

    def get_backlog(self) -> BacklogResponse:
        return parse_backlog(self.get_document("Shared backlog", SHARED_WORKSPACE / "shared-backlog.md"))

    def get_rulebook(self) -> RulebookResponse:
        return parse_rulebook(self.get_document("Shared rulebook", SHARED_WORKSPACE / "shared-rulebook.md"))


class DashboardService:
    def __init__(self, data_source: DashboardDataSource | None = None):
        self.data_source = data_source or OpenClawWorkspaceDataSource()

    async def get_dashboard(self) -> DashboardResponse:
        agents, openclaw = await asyncio.gather(self.data_source.get_agents(), self.data_source.get_status())
        return DashboardResponse(
            refreshed_at=datetime.now(UTC).isoformat(),
            agents=agents,
            openclaw=openclaw,
            backlog=self.data_source.get_backlog(),
            rulebook=self.data_source.get_rulebook(),
        )
