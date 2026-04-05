from pathlib import Path

from fastapi.testclient import TestClient

import main
from parsers import parse_backlog, parse_rulebook, parse_security_notices, parse_status_facts
from schemas import (
    AgentSummary,
    BacklogResponse,
    CliResult,
    DashboardResponse,
    RulebookResponse,
    RulebookSection,
    SourceDocument,
    StatusFact,
    StatusResponse,
    StatusSummary,
)


class FakeDataSource:
    async def get_agents(self):
        return [
            AgentSummary(
                id="david",
                name="David",
                identity="🛠️ David",
                workspace="/tmp/workspace",
                model="openai-codex/gpt-5.4-mini",
                bindings=1,
                status="configured",
            )
        ]

    async def get_status(self):
        return StatusResponse(
            status=CliResult(command=["openclaw", "status"], ok=True, stdout="ok", stderr=""),
            gateway=CliResult(command=["openclaw", "gateway", "status"], ok=True, stdout="ok", stderr=""),
            summaries=[StatusSummary(title="Gateway", summary="running", severity="success")],
            facts=[StatusFact(label="Agents", value="3 total")],
        )

    def get_backlog(self):
        return BacklogResponse(document=SourceDocument(title="Shared backlog", source="/tmp/backlog.md", exists=True, raw_content="# sample"))

    def get_rulebook(self):
        return RulebookResponse(
            document=SourceDocument(title="Shared rulebook", source="/tmp/rulebook.md", exists=True, raw_content="# sample"),
            sections=[RulebookSection(id="1", title="Shared baseline and propagation", category="Shared context", summary="Keep shared context aligned.", bullets=["Load shared files at startup."])],
        )


def test_dashboard_endpoint_with_stubbed_sources():
    original_service = main.service
    main.service = main.DashboardService(FakeDataSource())
    try:
        client = TestClient(main.app)
        response = client.get("/api/dashboard")
    finally:
        main.service = original_service

    assert response.status_code == 200
    payload = response.json()
    assert payload["agents"][0]["id"] == "david"
    assert payload["openclaw"]["summaries"][0]["severity"] == "success"
    assert payload["backlog"]["document"]["raw_content"] == "# sample"
    assert payload["rulebook"]["sections"][0]["category"] == "Shared context"


def test_parse_backlog_builds_summary_groups():
    document = SourceDocument(
        title="Shared backlog",
        source="/tmp/backlog.md",
        exists=True,
        raw_content="""## Todo

### BL-20260404-01
- Date: 2026-04-04
- Title: Harden SSH
- Requested by: David
- Owner: Chloe
- Status: todo
- Priority: high
- Scope:
  - tighten SSH auth
  - verify access

### BL-20260404-02
- Date: 2026-04-05
- Title: Polish dashboard
- Requested by: Akbar
- Owner: David
- Status: in-progress
- Priority: medium
- Scope:
  - improve layout
  - summarize data

## In Progress

### BL-20260404-03
- Date: 2026-04-05
- Title: Verify update flow
- Requested by: Akbar
- Owner: Chloe
- Status: in-progress
- Priority: high
- Scope:
  - test a real update
  - verify the end-to-end flow

## Blocked

### BL-20260404-04
- Date: 2026-04-05
- Title: Provider backup review
- Requested by: David
- Owner: Chloe
- Status: blocked
- Priority: low
- Scope:
  - confirm snapshot posture

## Archive
""",
    )

    backlog = parse_backlog(document)

    assert backlog.metrics[0].value == "4"
    assert backlog.metrics[1].value == "2"
    assert backlog.priority_queue[0].title == "Provider backup review"
    assert backlog.owner_groups[0].label in {"Chloe", "David"}
    assert [group.label for group in backlog.status_groups] == ["Todo", "In Progress", "Blocked", "Done"]
    assert backlog.kanban_columns[0].count == 1
    assert backlog.kanban_columns[1].count == 2
    assert backlog.kanban_columns[1].entries[0].title == "Verify update flow"
    assert any(entry.title == "Polish dashboard" for entry in backlog.kanban_columns[1].entries)


def test_parse_rulebook_extracts_sections_and_highlights():
    document = SourceDocument(
        title="Shared rulebook",
        source="/tmp/rulebook.md",
        exists=True,
        raw_content="""# Shared Rulebook

## 1) Shared baseline and propagation
- Every agent must load the shared rulebook.
- Durable rules live here.

## 2) Model and reasoning policy
- Use the cheaper model by default.
- Use the stronger model for hard tasks.
""",
    )

    rulebook = parse_rulebook(document)

    assert len(rulebook.sections) == 2
    assert rulebook.sections[0].category == "Shared context"
    assert "must load" in rulebook.highlights[0].lower()


def test_parse_status_helpers_extract_facts_and_security_summary():
    output = """OpenClaw status

Overview
│ Agents               │ 3 configured │
│ Tasks                │ 4 active · 8 issues │

Security audit
Summary: 0 critical · 2 warn · 1 info
  WARN Reverse proxy headers are not trusted
    Fix: Configure trusted proxies.

Channels
│ Telegram │ ON │ OK │ healthy │
"""

    facts = parse_status_facts(output)
    security_summary, notices = parse_security_notices(output)

    assert facts[0].label == "Agents"
    assert facts[1].value == "4 active · 8 issues"
    assert security_summary == "0 critical · 2 warn · 1 info"
    assert notices[0].fix == "Configure trusted proxies."
