from pathlib import Path

from fastapi.testclient import TestClient

import main


def test_dashboard_endpoint_with_stubbed_sources(monkeypatch):
    async def fake_agents():
        return [
            main.AgentSummary(
                id="david",
                name="David",
                identity="🛠️ David",
                workspace="/tmp/workspace",
                model="openai-codex/gpt-5.4-mini",
                bindings=1,
                status="configured",
            )
        ]

    async def fake_status():
        return main.StatusResponse(
            status=main.CliResult(command=["openclaw", "status"], ok=True, stdout="ok", stderr=""),
            gateway=main.CliResult(command=["openclaw", "gateway", "status"], ok=True, stdout="ok", stderr=""),
            summaries=[main.StatusSummary(title="Gateway", summary="running", severity="success")],
        )

    monkeypatch.setattr(main, "get_agent_summaries", fake_agents)
    monkeypatch.setattr(main, "get_openclaw_status", fake_status)
    monkeypatch.setattr(main, "get_document", lambda title, path: main.DocumentResponse(title=title, source=str(path), exists=True, content="# sample"))

    client = TestClient(main.app)
    response = client.get("/api/dashboard")

    assert response.status_code == 200
    payload = response.json()
    assert payload["agents"][0]["id"] == "david"
    assert payload["openclaw"]["summaries"][0]["severity"] == "success"
    assert payload["backlog"]["content"] == "# sample"


def test_document_helper_reads_expected_file(tmp_path: Path):
    file_path = tmp_path / "sample.md"
    file_path.write_text("hello", encoding="utf-8")

    doc = main.get_document("Sample", file_path)

    assert doc.exists is True
    assert doc.content == "hello"
    assert doc.source == str(file_path)
