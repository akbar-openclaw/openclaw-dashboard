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

type StatusFact = {
  label: string;
  value: string;
};

type SecurityNotice = {
  severity: string;
  message: string;
  fix?: string | null;
};

type ChannelStatus = {
  name: string;
  enabled: string;
  state: string;
  detail: string;
};

type StatusResponse = {
  status: CliResult;
  gateway: CliResult;
  summaries: StatusSummary[];
  facts: StatusFact[];
  security_summary?: string | null;
  security_notices: SecurityNotice[];
  channels: ChannelStatus[];
};

type SourceDocument = {
  title: string;
  source: string;
  exists: boolean;
  raw_content: string;
};

type BacklogEntry = {
  id: string;
  date?: string | null;
  title: string;
  requested_by?: string | null;
  owner?: string | null;
  status: string;
  priority: string;
  scope: string[];
  notes?: string | null;
};

type MetricCard = {
  label: string;
  value: string;
  tone: string;
  detail?: string | null;
};

type EntryGroup = {
  label: string;
  detail?: string | null;
  count: number;
  entries: BacklogEntry[];
};

type BacklogResponse = {
  document: SourceDocument;
  metrics: MetricCard[];
  priority_queue: BacklogEntry[];
  owner_groups: EntryGroup[];
  status_groups: EntryGroup[];
  recent_entries: BacklogEntry[];
};

type RulebookSection = {
  id: string;
  title: string;
  category: string;
  summary: string;
  bullets: string[];
};

type RulebookResponse = {
  document: SourceDocument;
  highlights: string[];
  sections: RulebookSection[];
};

type DashboardResponse = {
  refreshed_at: string;
  agents: AgentSummary[];
  openclaw: StatusResponse;
  backlog: BacklogResponse;
  rulebook: RulebookResponse;
};

function formatAge(ageMs?: number | null): string {
  if (ageMs == null) return 'unknown';
  const minutes = Math.floor(ageMs / 60000);
  if (minutes < 1) return '<1 min';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function toDisplayTime(value?: string): string {
  if (!value) return 'unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function titleCase(value: string): string {
  return value
    .replace(/-/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(' ');
}

function toneClass(value: string): string {
  const lowered = value.toLowerCase();
  if (['high', 'critical', 'blocked', 'danger', 'warn', 'warning'].some((tag) => lowered.includes(tag))) return 'danger';
  if (['success', 'ok', 'positive', 'done'].some((tag) => lowered.includes(tag))) return 'positive';
  return 'neutral';
}

function statusClass(value: string): string {
  const lowered = value.toLowerCase();
  if (lowered.includes('blocked') || lowered.includes('warning') || lowered.includes('warn')) return 'warning';
  if (lowered.includes('done') || lowered.includes('success') || lowered.includes('ok') || lowered.includes('default')) return 'success';
  if (lowered.includes('in-progress')) return 'info';
  return 'muted';
}

function DashboardMetric({ label, value, detail, tone = 'neutral' }: MetricCard) {
  return (
    <article className={`metricCard ${toneClass(tone)}`}>
      <p className="metricLabel">{label}</p>
      <p className="metricValue">{value}</p>
      {detail ? <p className="metricDetail">{detail}</p> : null}
    </article>
  );
}

function Card({
  title,
  subtitle,
  children,
  action,
  className,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`card ${className || ''}`}>
      <header className="cardHeader">
        <div>
          <h2>{title}</h2>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

function EntryPill({ label }: { label: string }) {
  return <span className={`pill ${statusClass(label)}`}>{titleCase(label)}</span>;
}

function BacklogEntryRow({ entry }: { entry: BacklogEntry }) {
  return (
    <li className="entryRow">
      <div className="entryTop">
        <div>
          <strong>{entry.title}</strong>
          <p className="muted lineMeta">{entry.id}</p>
        </div>
        <div className="entryBadges">
          <EntryPill label={entry.priority} />
          <EntryPill label={entry.status} />
        </div>
      </div>
      <p className="muted lineMeta">
        Owner: {entry.owner || 'Unassigned'} · Requested by: {entry.requested_by || 'Unknown'} · {entry.date || 'No date'}
      </p>
      {entry.scope.length > 0 ? (
        <ul className="scopeList">
          {entry.scope.slice(0, 2).map((scope, index) => (
            <li key={`${entry.id}-scope-${index}`}>{scope}</li>
          ))}
        </ul>
      ) : null}
    </li>
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

  const topMetrics: MetricCard[] = React.useMemo(() => {
    if (!data) return [];

    const defaultAgents = data.agents.filter((agent) => agent.status === 'default').length;
    const activeSessions = data.agents.filter((agent) => !!agent.latest_session_key).length;
    const securityTone = data.openclaw.security_notices.length > 0 ? 'warning' : 'positive';

    return [
      { label: 'Configured agents', value: String(data.agents.length), tone: 'neutral', detail: `${defaultAgents} default` },
      { label: 'Agents with sessions', value: String(activeSessions), tone: activeSessions > 0 ? 'positive' : 'neutral', detail: 'Latest activity visible' },
      { label: 'Security notices', value: String(data.openclaw.security_notices.length), tone: securityTone, detail: data.openclaw.security_summary || 'No audit summary parsed' },
      ...data.backlog.metrics.slice(0, 2),
    ];
  }, [data]);

  return (
    <main>
      <header className="hero">
        <div>
          <p className="eyebrow">OpenClaw Workspace</p>
          <h1>Akbar’s Personal Dashboard</h1>
          <p className="heroSubtitle">Operational view with live runtime health, backlog intelligence, and rulebook digest.</p>
          <p className="muted">Last refreshed: {data ? toDisplayTime(data.refreshed_at) : 'loading...'}</p>
        </div>
        <button onClick={() => void load()} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>

      {error ? <p className="error">Failed to load dashboard: {error}</p> : null}

      {topMetrics.length > 0 ? <section className="metricsStrip">{topMetrics.map((metric) => <DashboardMetric key={metric.label} {...metric} />)}</section> : null}

      <section className="grid twoCols">
        <Card title="Live Agents" subtitle="Configured agents with model, binding, and latest session signal.">
          {!data ? (
            <p className="muted">Loading agents...</p>
          ) : (
            <ul className="list">
              {data.agents.map((agent) => (
                <li key={agent.id} className="agentRow">
                  <div className="entryTop">
                    <div>
                      <strong>{agent.name || agent.id}</strong>
                      <p>{agent.identity || 'No identity metadata'}</p>
                    </div>
                    <EntryPill label={agent.status} />
                  </div>
                  <p className="muted lineMeta">Model: {agent.model || 'unknown'} · Bindings: {agent.bindings ?? 0}</p>
                  <p className="muted lineMeta">
                    Latest session: {agent.latest_session_key || 'none'} · {formatAge(agent.latest_session_age_ms)}
                    {agent.latest_session_model ? ` · ${agent.latest_session_model}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="OpenClaw Runtime" subtitle="Gateway/runtime summary, security notices, and channel health.">
          {!data ? (
            <p className="muted">Loading runtime status...</p>
          ) : (
            <>
              <ul className="list compact">
                {data.openclaw.summaries.map((summary, index) => (
                  <li key={`${summary.title}-${index}`}>
                    <div className="entryTop">
                      <strong>{summary.title}</strong>
                      <EntryPill label={summary.severity} />
                    </div>
                    <p>{summary.summary}</p>
                  </li>
                ))}
              </ul>

              {data.openclaw.facts.length > 0 ? (
                <div className="factGrid">
                  {data.openclaw.facts.slice(0, 8).map((fact) => (
                    <div key={fact.label} className="factCell">
                      <p className="factLabel">{fact.label}</p>
                      <p>{fact.value}</p>
                    </div>
                  ))}
                </div>
              ) : null}

              {data.openclaw.security_notices.length > 0 ? (
                <div className="noticePanel">
                  <p className="noticeTitle">Security notices</p>
                  <ul>
                    {data.openclaw.security_notices.slice(0, 3).map((notice, index) => (
                      <li key={`${notice.message}-${index}`}>
                        <strong>{titleCase(notice.severity)}:</strong> {notice.message}
                        {notice.fix ? <p className="muted">Fix: {notice.fix}</p> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {data.openclaw.channels.length > 0 ? (
                <div className="channelRow">
                  {data.openclaw.channels.map((channel) => (
                    <span key={channel.name} className={`pill ${statusClass(channel.state)}`}>
                      {channel.name}: {channel.state}
                    </span>
                  ))}
                </div>
              ) : null}

              <details>
                <summary>Raw OpenClaw diagnostics</summary>
                <pre>{data.openclaw.status.stdout || data.openclaw.status.stderr || 'No output'}</pre>
                <pre>{data.openclaw.gateway.stdout || data.openclaw.gateway.stderr || 'No output'}</pre>
              </details>
            </>
          )}
        </Card>
      </section>

      <section className="grid singleCol">
        <Card
          title="Backlog Intelligence"
          subtitle="Priority-first queue and grouped ownership view from shared backlog."
          action={data ? <span className="sourceText">Source: {data.backlog.document.source}</span> : null}
        >
          {!data ? (
            <p className="muted">Loading backlog summary...</p>
          ) : (
            <>
              <div className="metricsStrip compactStrip">
                {data.backlog.metrics.map((metric) => (
                  <DashboardMetric key={`backlog-${metric.label}`} {...metric} />
                ))}
              </div>

              <div className="splitCols">
                <div>
                  <h3>Priority Queue</h3>
                  <ul className="list">
                    {data.backlog.priority_queue.map((entry) => (
                      <BacklogEntryRow key={entry.id} entry={entry} />
                    ))}
                  </ul>
                </div>

                <div>
                  <h3>Grouped by owner</h3>
                  <ul className="list compact">
                    {data.backlog.owner_groups.map((group) => (
                      <li key={group.label}>
                        <div className="entryTop">
                          <strong>{group.label}</strong>
                          <EntryPill label={`${group.count} items`} />
                        </div>
                        {group.detail ? <p className="muted lineMeta">{group.detail}</p> : null}
                        <ul className="scopeList">
                          {group.entries.slice(0, 3).map((entry) => (
                            <li key={`${group.label}-${entry.id}`}>{entry.title}</li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>

                  <h3>Status breakdown</h3>
                  <div className="channelRow">
                    {data.backlog.status_groups.map((group) => (
                      <span key={group.label} className={`pill ${statusClass(group.label)}`}>
                        {group.label}: {group.count}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </Card>
      </section>

      <section className="grid singleCol">
        <Card
          title="Rulebook Digest"
          subtitle="Condensed guidance grouped by policy section and surfaced as operator-ready bullets."
          action={data ? <span className="sourceText">Source: {data.rulebook.document.source}</span> : null}
        >
          {!data ? (
            <p className="muted">Loading rulebook summary...</p>
          ) : (
            <>
              <div className="highlightPanel">
                <p className="noticeTitle">Key highlights</p>
                <ul className="scopeList">
                  {data.rulebook.highlights.slice(0, 6).map((highlight, index) => (
                    <li key={`highlight-${index}`}>{highlight}</li>
                  ))}
                </ul>
              </div>

              <div className="rulebookGrid">
                {data.rulebook.sections.map((section) => (
                  <article key={section.id} className="ruleSection">
                    <div className="entryTop">
                      <h3>
                        {section.id}) {section.title}
                      </h3>
                      <EntryPill label={section.category} />
                    </div>
                    <p>{section.summary}</p>
                    <ul className="scopeList">
                      {section.bullets.map((bullet, index) => (
                        <li key={`${section.id}-bullet-${index}`}>{bullet}</li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>
            </>
          )}
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
