# Akbar’s personal dashboard

Polished, future-proof personal operations dashboard for Akbar’s local OpenClaw runtime.

## Stack
- Frontend: React + TypeScript + Vite
- Backend: FastAPI

## Dashboard views
- **Live Agents**: configured OpenClaw agents, model/binding details, latest session recency.
- **OpenClaw Runtime**: gateway/runtime summaries, parsed status facts, security notices, channel health, raw diagnostics drawer.
- **Backlog Intelligence**: summarized shared backlog with metric cards, priority queue, grouped owner/status panels.
- **Rulebook Digest**: grouped policy sections with concise summaries and key bullets (instead of raw markdown dumps).

## Run locally

### Backend
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

If `venv`/`pip` is missing on the host:
```bash
sudo apt-get update
sudo apt-get install -y python3-venv python3-pip
```

### Frontend
```bash
cd frontend
npm install
npm run build
```

Then open the backend on `http://127.0.0.1:8000/` after the frontend has been built.

## API
- `GET /api/dashboard` — aggregated payload for the full UI
- `GET /api/agents` — live agent/session summary
- `GET /api/status` — OpenClaw command output + parsed runtime/security/channel summaries
- `GET /api/backlog` — parsed backlog summary model (metrics, queue, grouped sections)
- `PATCH /api/backlog/{entry_id}` — update only the backlog item `Status:` field and return the refreshed backlog summary
- `GET /api/rulebook` — parsed rulebook digest model (highlights + grouped sections)

## Backend architecture
- `backend/services.py`: data-source abstraction (`DashboardDataSource`) and orchestration (`DashboardService`)
- `backend/parsers.py`: markdown/CLI parsers for backlog, rulebook, and status summarization
- `backend/schemas.py`: typed API response models
- `backend/main.py`: FastAPI routing + static frontend serving

This split keeps the app ready for auth layers and alternate data providers without rewriting the frontend.

## Notes
- Shared documents are read from `/home/ubuntu/.openclaw/workspace/`.
- Agent/session data is read from OpenClaw CLI commands so the UI stays aligned with the real runtime.
- The backend is structured so future auth or alternate data providers can be added without rewriting the frontend.
- The frontend now normalizes API payloads and renders safe fallbacks so schema drift or partial backend responses do not hard-crash the page.
