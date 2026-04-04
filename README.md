# Akbar’s personal dashboard

Future-proof MVP for Akbar’s local OpenClaw dashboard.

## Stack
- Frontend: React + TypeScript + Vite
- Backend: FastAPI

## MVP features
- Available agents
- OpenClaw status
- Shared backlog
- Shared rulebook

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
- `GET /api/dashboard`
- `GET /api/agents`
- `GET /api/status`
- `GET /api/backlog`
- `GET /api/rulebook`

## Notes
- Shared documents are read from `/home/ubuntu/.openclaw/workspace/`.
- Agent/session data is read from OpenClaw CLI commands so the UI stays aligned with the real runtime.
- The backend is structured so future auth or alternate data providers can be added without rewriting the frontend.
