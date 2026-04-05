from __future__ import annotations

from pydantic import BaseModel, Field


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


class StatusFact(BaseModel):
    label: str
    value: str


class SecurityNotice(BaseModel):
    severity: str
    message: str
    fix: str | None = None


class ChannelStatus(BaseModel):
    name: str
    enabled: str
    state: str
    detail: str


class StatusResponse(BaseModel):
    status: CliResult
    gateway: CliResult
    summaries: list[StatusSummary]
    facts: list[StatusFact] = Field(default_factory=list)
    security_summary: str | None = None
    security_notices: list[SecurityNotice] = Field(default_factory=list)
    channels: list[ChannelStatus] = Field(default_factory=list)


class SourceDocument(BaseModel):
    title: str
    source: str
    exists: bool
    raw_content: str = ""


class BacklogEntry(BaseModel):
    id: str
    date: str | None = None
    title: str
    requested_by: str | None = None
    owner: str | None = None
    status: str = "todo"
    priority: str = "medium"
    scope: list[str] = Field(default_factory=list)
    notes: str | None = None


class MetricCard(BaseModel):
    label: str
    value: str
    tone: str = "neutral"
    detail: str | None = None


class EntryGroup(BaseModel):
    label: str
    detail: str | None = None
    count: int
    entries: list[BacklogEntry] = Field(default_factory=list)


class BacklogResponse(BaseModel):
    document: SourceDocument
    metrics: list[MetricCard] = Field(default_factory=list)
    priority_queue: list[BacklogEntry] = Field(default_factory=list)
    owner_groups: list[EntryGroup] = Field(default_factory=list)
    status_groups: list[EntryGroup] = Field(default_factory=list)
    recent_entries: list[BacklogEntry] = Field(default_factory=list)


class RulebookSection(BaseModel):
    id: str
    title: str
    category: str
    summary: str
    bullets: list[str] = Field(default_factory=list)


class RulebookResponse(BaseModel):
    document: SourceDocument
    highlights: list[str] = Field(default_factory=list)
    sections: list[RulebookSection] = Field(default_factory=list)


class DashboardResponse(BaseModel):
    refreshed_at: str
    agents: list[AgentSummary]
    openclaw: StatusResponse
    backlog: BacklogResponse
    rulebook: RulebookResponse
