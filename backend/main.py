from pathlib import Path
import json
import subprocess
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse

ROOT = Path(__file__).resolve().parents[1]
WORKSPACE = ROOT.parent

app = FastAPI(title="Akbar's personal dashboard")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8") if path.exists() else ""


@app.get("/api/agents")
def agents():
    try:
        out = subprocess.run(["openclaw", "sessions", "list"], cwd=str(WORKSPACE), capture_output=True, text=True, timeout=10)
        return {"source": "openclaw sessions list", "ok": out.returncode == 0, "output": out.stdout.strip() or out.stderr.strip()}
    except Exception as e:
        return {"source": "openclaw sessions list", "ok": False, "error": str(e)}


@app.get("/api/status")
def status():
    try:
        out = subprocess.run(["openclaw", "status"], cwd=str(WORKSPACE), capture_output=True, text=True, timeout=15)
        return {"source": "openclaw status", "ok": out.returncode == 0, "output": out.stdout.strip() or out.stderr.strip()}
    except Exception as e:
        return {"source": "openclaw status", "ok": False, "error": str(e)}


@app.get("/api/backlog")
def backlog():
    path = WORKSPACE / "shared-backlog.md"
    return {"source": str(path), "ok": path.exists(), "content": read_text(path)}


@app.get("/api/rulebook")
def rulebook():
    path = WORKSPACE / "shared-rulebook.md"
    return {"source": str(path), "ok": path.exists(), "content": read_text(path)}


@app.get("/")
def index():
    return HTMLResponse((ROOT / "frontend" / "dist" / "index.html").read_text(encoding="utf-8"))
