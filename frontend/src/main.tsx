import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles.css';

type AgentSummary = {
  id: string;
  name?: string | null;
  identity?: string | null;
  workspace?: string | null;
  model?: string | null;
  bindings?: number | null;
  status: string;
  latest_session_key?: string | null;
  latest_session_age_ms?: number | null;
  latest_session_model?: string | null;
};

type CliResult = {
  command: string[];
  ok: boolean;
  exit_code?: number | null;
  stdout: string;
  stderr: string;
};

type StatusSummary = {
  title: string;
  summary: string;
  severity: 'info' | 'success' | 'warning';
};

type StatusResponse = {
  status: CliResult;
  gateway: CliResult;
  summaries: StatusSummary[];
};

type DocumentResponse = {
  title: string;
  source: string;
  exists: boolean;
  content: string;
};

type DashboardResponse = {
  agents: AgentSummary[];
  openclaw: StatusResponse;
  backlog: DocumentResponse;
  rulebook: DocumentResponse;
};

function formatAge(ageMs?: number | null): string {
  if (ageMs == null) return 'unknown';
  const minutes = Math.floor(ageMs / 60000);
  if (minutes < 1) return '<1 min';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  return `${days} d`;
}

function Card({ title, children, subtitle }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="card">
      <header className="cardHeader">
        <h2>{title}</h2>
        {subtitle ? <p>{subtitle}</p> : null}
      </header>
      {children}
    </section>
  );
}

function App() {
  const [data, setData] = React.useState<DashboardResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/dashboard');
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }
      const payload = (await response.json()) as DashboardResponse;
      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  return (
    <main>
      <header className="hero">
        <div>
          <h1>Akbar’s personal dashboard</h1>
          <p>Simple now, extensible later.</p>
        </div>
        <button onClick={() => void load()} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>

      {error ? <p className="error">Failed to load dashboard: {error}</p> : null}

      <section className="grid">
        <Card title="Available agents" subtitle="Configured OpenClaw agents + latest sessions">
          {!data ? (
            <p className="muted">Loading…</p>
          ) : (
            <ul className="list">
              {data.agents.map((agent) => (
                <li key={agent.id}>
                  <div className="rowTop">
                    <strong>{agent.name || agent.id}</strong>
                    <span className={`pill ${agent.status === 'default' ? 'ok' : ''}`}>{agent.status}</span>
                  </div>
                  <p>{agent.identity || 'No identity metadata'}</p>
                  <p className="muted">Model: {agent.model || 'unknown'} • Bindings: {agent.bindings ?? 0}</p>
                  <p className="muted">
                    Latest session: {agent.latest_session_key || 'none'} • {formatAge(agent.latest_session_age_ms)} ago
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="OpenClaw status" subtitle="Gateway health + raw diagnostics">
          {!data ? (
            <p className="muted">Loading…</p>
          ) : (
            <>
              <ul className="list compact">
                {data.openclaw.summaries.map((summary, index) => (
                  <li key={`${summary.title}-${index}`}>
                    <div className="rowTop">
                      <strong>{summary.title}</strong>
                      <span className={`pill ${summary.severity === 'success' ? 'ok' : summary.severity === 'warning' ? 'warn' : ''}`}>
                        {summary.severity}
                      </span>
                    </div>
                    <p>{summary.summary}</p>
                  </li>
                ))}
              </ul>
              <details>
                <summary>openclaw status output</summary>
                <pre>{data.openclaw.status.stdout || data.openclaw.status.stderr || 'No output'}</pre>
              </details>
              <details>
                <summary>openclaw gateway status output</summary>
                <pre>{data.openclaw.gateway.stdout || data.openclaw.gateway.stderr || 'No output'}</pre>
              </details>
            </>
          )}
        </Card>

        <Card title="Shared backlog" subtitle={data?.backlog.source || '/home/ubuntu/.openclaw/workspace/shared-backlog.md'}>
          <pre>{data?.backlog.content || 'Loading…'}</pre>
        </Card>

        <Card title="Shared rulebook" subtitle={data?.rulebook.source || '/home/ubuntu/.openclaw/workspace/shared-rulebook.md'}>
          <pre>{data?.rulebook.content || 'Loading…'}</pre>
        </Card>
      </section>
    </main>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
