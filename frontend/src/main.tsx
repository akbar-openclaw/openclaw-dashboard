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

type KanbanColumn = {
  key: string;
  label: string;
  detail?: string | null;
  count: number;
  high_priority_count: number;
  entries: BacklogEntry[];
};

type BacklogResponse = {
  document: SourceDocument;
  metrics: MetricCard[];
  priority_queue: BacklogEntry[];
  owner_groups: EntryGroup[];
  status_groups: EntryGroup[];
  kanban_columns: KanbanColumn[];
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

type DashboardStatus = 'idle' | 'loading' | 'ready' | 'error';

type ErrorBoundaryProps = {
  children: React.ReactNode;
};

type ErrorBoundaryState = {
  error: Error | null;
};

const KANBAN_STATUS_ORDER = ['todo', 'in-progress', 'blocked', 'done'] as const;
type KanbanStatus = (typeof KANBAN_STATUS_ORDER)[number];

const PRIORITY_ORDER: Record<string, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

const STATUS_ORDER: Record<KanbanStatus, number> = {
  blocked: 0,
  'in-progress': 1,
  todo: 2,
  done: 3,
};

const EMPTY_SOURCE_DOCUMENT: SourceDocument = {
  title: 'Unavailable',
  source: 'Unavailable',
  exists: false,
  raw_content: '',
};

const EMPTY_CLI_RESULT: CliResult = {
  command: [],
  ok: false,
  exit_code: null,
  stdout: '',
  stderr: '',
};

const EMPTY_STATUS_RESPONSE: StatusResponse = {
  status: EMPTY_CLI_RESULT,
  gateway: EMPTY_CLI_RESULT,
  summaries: [],
  facts: [],
  security_summary: null,
  security_notices: [],
  channels: [],
};

const EMPTY_BACKLOG_RESPONSE: BacklogResponse = {
  document: {
    title: 'Shared backlog',
    source: 'Unavailable',
    exists: false,
    raw_content: '',
  },
  metrics: [],
  priority_queue: [],
  owner_groups: [],
  status_groups: [],
  kanban_columns: KANBAN_STATUS_ORDER.map((status) => ({
    key: status,
    label: titleCase(status),
    detail: emptyColumnDetail(status),
    count: 0,
    high_priority_count: 0,
    entries: [],
  })),
  recent_entries: [],
};

const EMPTY_RULEBOOK_RESPONSE: RulebookResponse = {
  document: {
    title: 'Shared rulebook',
    source: 'Unavailable',
    exists: false,
    raw_content: '',
  },
  highlights: [],
  sections: [],
};

const EMPTY_DASHBOARD: DashboardResponse = {
  refreshed_at: '',
  agents: [],
  openclaw: EMPTY_STATUS_RESPONSE,
  backlog: EMPTY_BACKLOG_RESPONSE,
  rulebook: EMPTY_RULEBOOK_RESPONSE,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asOptionalString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function compactText(value: string, maxLength = 140): string {
  const text = value.replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  const short = text.slice(0, maxLength - 1).trimEnd();
  return `${short}…`;
}

function titleCase(value: string): string {
  return value
    .replace(/[-_]/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(' ');
}

function normalizeBacklogStatus(value: unknown, fallback: KanbanStatus = 'todo'): KanbanStatus {
  const normalized = asString(value)
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-');

  const aliases: Record<string, KanbanStatus> = {
    todo: 'todo',
    'to-do': 'todo',
    queued: 'todo',
    'in-progress': 'in-progress',
    inprogress: 'in-progress',
    active: 'in-progress',
    blocked: 'blocked',
    done: 'done',
    complete: 'done',
    completed: 'done',
  };

  return aliases[normalized] ?? fallback;
}

function normalizePriority(value: unknown): string {
  const normalized = asString(value).trim().toLowerCase();
  return PRIORITY_ORDER[normalized] != null ? normalized : 'medium';
}

function dateSortValue(value?: string | null): number {
  const digits = (value ?? '').replace(/\D/g, '');
  return digits ? Number(digits) : 0;
}

function compareEntries(a: BacklogEntry, b: BacklogEntry): number {
  return (
    (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99) ||
    dateSortValue(b.date) - dateSortValue(a.date) ||
    a.title.localeCompare(b.title)
  );
}

function emptyColumnDetail(status: KanbanStatus): string {
  switch (status) {
    case 'todo':
      return 'Nothing queued right now.';
    case 'in-progress':
      return 'No active work yet.';
    case 'blocked':
      return 'No blockers tracked.';
    case 'done':
      return 'Nothing finished but still visible.';
  }
}

function describeKanbanColumn(status: KanbanStatus, entries: BacklogEntry[]): string {
  if (entries.length === 0) return emptyColumnDetail(status);

  const highPriority = entries.filter((entry) => entry.priority === 'high').length;
  const owners = new Set(entries.map((entry) => entry.owner || 'Unassigned')).size;
  const parts: string[] = [];

  if (highPriority > 0) parts.push(`${highPriority} high-priority`);
  if (owners > 0) parts.push(`${owners} owner${owners === 1 ? '' : 's'}`);

  const statusHint: Record<KanbanStatus, string> = {
    todo: 'ready to start',
    'in-progress': 'actively moving',
    blocked: 'waiting on an unblocker',
    done: 'ready to archive when appropriate',
  };

  return `${parts.join(' · ')}${parts.length > 0 ? ' · ' : ''}${statusHint[status]}`;
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
  if (lowered.includes('in-progress') || lowered.includes('info')) return 'info';
  return 'muted';
}

function laneClass(value: string): string {
  switch (value.toLowerCase()) {
    case 'in-progress':
      return 'laneInfo';
    case 'blocked':
      return 'laneWarning';
    case 'done':
      return 'laneSuccess';
    default:
      return 'laneNeutral';
  }
}

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

function normalizeAgent(value: unknown): AgentSummary {
  const record = asRecord(value);
  return {
    id: asString(record.id, 'unknown-agent'),
    name: asOptionalString(record.name),
    identity: asOptionalString(record.identity),
    workspace: asOptionalString(record.workspace),
    model: asOptionalString(record.model),
    bindings: asNumber(record.bindings),
    status: asString(record.status, 'configured'),
    latest_session_key: asOptionalString(record.latest_session_key),
    latest_session_age_ms: asNumber(record.latest_session_age_ms),
    latest_session_model: asOptionalString(record.latest_session_model),
  };
}

function normalizeCliResult(value: unknown): CliResult {
  const record = asRecord(value);
  return {
    command: asArray(record.command).map((item) => asString(item)).filter(Boolean),
    ok: asBoolean(record.ok),
    exit_code: asNumber(record.exit_code),
    stdout: asString(record.stdout),
    stderr: asString(record.stderr),
  };
}

function normalizeStatusSummary(value: unknown): StatusSummary {
  const record = asRecord(value);
  const severity = asString(record.severity, 'info');
  return {
    title: asString(record.title, 'Status'),
    summary: asString(record.summary, 'No summary available.'),
    severity: severity === 'success' || severity === 'warning' ? severity : 'info',
  };
}

function normalizeStatusFact(value: unknown): StatusFact {
  const record = asRecord(value);
  return {
    label: asString(record.label, 'Unknown'),
    value: asString(record.value, 'Unavailable'),
  };
}

function normalizeSecurityNotice(value: unknown): SecurityNotice {
  const record = asRecord(value);
  return {
    severity: asString(record.severity, 'info'),
    message: asString(record.message, 'No security detail available.'),
    fix: asOptionalString(record.fix),
  };
}

function normalizeChannel(value: unknown): ChannelStatus {
  const record = asRecord(value);
  return {
    name: asString(record.name, 'Unknown'),
    enabled: asString(record.enabled, 'unknown'),
    state: asString(record.state, 'unknown'),
    detail: asString(record.detail, ''),
  };
}

function normalizeStatusResponse(value: unknown): StatusResponse {
  const record = asRecord(value);
  const summaries = asArray(record.summaries).map(normalizeStatusSummary).filter((summary) => summary.summary.trim().length > 0);

  return {
    status: normalizeCliResult(record.status),
    gateway: normalizeCliResult(record.gateway),
    summaries:
      summaries.length > 0
        ? summaries
        : [
            {
              title: 'Status',
              summary: 'Dashboard is using safe fallbacks because runtime status data was missing or malformed.',
              severity: 'warning',
            },
          ],
    facts: asArray(record.facts).map(normalizeStatusFact),
    security_summary: asOptionalString(record.security_summary),
    security_notices: asArray(record.security_notices).map(normalizeSecurityNotice),
    channels: asArray(record.channels).map(normalizeChannel),
  };
}

function normalizeSourceDocument(value: unknown, fallbackTitle: string): SourceDocument {
  const record = asRecord(value);
  return {
    title: asString(record.title, fallbackTitle),
    source: asString(record.source, 'Unavailable'),
    exists: asBoolean(record.exists),
    raw_content: asString(record.raw_content),
  };
}

function normalizeBacklogEntry(value: unknown, fallbackStatus: KanbanStatus = 'todo'): BacklogEntry {
  const record = asRecord(value);
  return {
    id: asString(record.id, 'unknown-entry'),
    date: asOptionalString(record.date),
    title: asString(record.title, 'Untitled backlog item'),
    requested_by: asOptionalString(record.requested_by),
    owner: asOptionalString(record.owner),
    status: normalizeBacklogStatus(record.status, fallbackStatus),
    priority: normalizePriority(record.priority),
    scope: asArray(record.scope).map((item) => asString(item)).filter(Boolean),
    notes: asOptionalString(record.notes),
  };
}

function mergeEntry(base: BacklogEntry | undefined, next: BacklogEntry): BacklogEntry {
  if (!base) return next;
  return {
    ...base,
    ...next,
    title: next.title || base.title,
    date: next.date || base.date,
    requested_by: next.requested_by || base.requested_by,
    owner: next.owner || base.owner,
    priority: next.priority || base.priority,
    status: normalizeBacklogStatus(next.status || base.status),
    scope: next.scope.length > 0 ? next.scope : base.scope,
    notes: next.notes || base.notes,
  };
}

function collectBacklogEntries(value: unknown): BacklogEntry[] {
  const record = asRecord(value);
  const seen = new Map<string, BacklogEntry>();

  const pushEntries = (entries: unknown[], fallbackStatus?: KanbanStatus) => {
    entries.forEach((entry) => {
      const normalized = normalizeBacklogEntry(entry, fallbackStatus ?? 'todo');
      const merged = mergeEntry(seen.get(normalized.id), normalized);
      seen.set(normalized.id, merged);
    });
  };

  asArray(record.kanban_columns).forEach((column) => {
    const columnRecord = asRecord(column);
    pushEntries(asArray(columnRecord.entries), normalizeBacklogStatus(columnRecord.key, 'todo'));
  });
  pushEntries(asArray(record.priority_queue));
  pushEntries(asArray(record.recent_entries));
  asArray(record.owner_groups).forEach((group) => pushEntries(asArray(asRecord(group).entries)));
  asArray(record.status_groups).forEach((group) => {
    const groupRecord = asRecord(group);
    pushEntries(asArray(groupRecord.entries), normalizeBacklogStatus(groupRecord.label, 'todo'));
  });

  return Array.from(seen.values());
}

function buildKanbanColumns(entries: BacklogEntry[]): KanbanColumn[] {
  return KANBAN_STATUS_ORDER.map((status) => {
    const columnEntries = entries.filter((entry) => normalizeBacklogStatus(entry.status) === status).sort(compareEntries);
    const highPriorityCount = columnEntries.filter((entry) => entry.priority === 'high').length;

    return {
      key: status,
      label: titleCase(status),
      detail: describeKanbanColumn(status, columnEntries),
      count: columnEntries.length,
      high_priority_count: highPriorityCount,
      entries: columnEntries,
    };
  });
}

function buildStatusGroups(entries: BacklogEntry[]): EntryGroup[] {
  return KANBAN_STATUS_ORDER.map((status) => {
    const groupEntries = entries.filter((entry) => normalizeBacklogStatus(entry.status) === status).sort(compareEntries);
    const highCount = groupEntries.filter((entry) => entry.priority === 'high').length;
    return {
      label: titleCase(status),
      detail: groupEntries.length > 0 ? `${highCount} high-priority` : 'No items',
      count: groupEntries.length,
      entries: groupEntries.slice(0, 4),
    };
  });
}

function buildOwnerGroups(entries: BacklogEntry[]): EntryGroup[] {
  const byOwner = new Map<string, BacklogEntry[]>();

  entries.forEach((entry) => {
    const owner = entry.owner || 'Unassigned';
    const group = byOwner.get(owner) ?? [];
    group.push(entry);
    byOwner.set(owner, group);
  });

  return Array.from(byOwner.entries())
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .map(([owner, ownerEntries]) => {
      const sortedEntries = ownerEntries.sort(compareEntries);
      const highCount = ownerEntries.filter((entry) => entry.priority === 'high').length;
      return {
        label: owner,
        detail: highCount > 0 ? `${highCount} high-priority item${highCount === 1 ? '' : 's'}` : 'No high-priority items',
        count: ownerEntries.length,
        entries: sortedEntries.slice(0, 4),
      };
    });
}

function buildBacklogMetrics(entries: BacklogEntry[]): MetricCard[] {
  const highPriority = entries.filter((entry) => entry.priority === 'high').length;
  const inProgress = entries.filter((entry) => normalizeBacklogStatus(entry.status) === 'in-progress').length;
  const blocked = entries.filter((entry) => normalizeBacklogStatus(entry.status) === 'blocked').length;
  const owners = new Set(entries.map((entry) => entry.owner || 'Unassigned')).size;

  return [
    { label: 'Tracked items', value: String(entries.length), tone: 'neutral', detail: 'Visible items in the shared backlog before archive.' },
    { label: 'High priority', value: String(highPriority), tone: highPriority > 0 ? 'danger' : 'positive', detail: 'Needs attention first.' },
    { label: 'In Progress', value: String(inProgress), tone: inProgress > 0 ? 'neutral' : 'positive', detail: 'Actively moving right now.' },
    { label: 'Blocked', value: String(blocked), tone: blocked > 0 ? 'danger' : 'positive', detail: 'Waiting on an unblocker.' },
    { label: 'Owners', value: String(owners), tone: 'neutral', detail: 'People currently carrying visible backlog work.' },
  ];
}

function buildPriorityQueue(entries: BacklogEntry[]): BacklogEntry[] {
  return entries
    .filter((entry) => normalizeBacklogStatus(entry.status) !== 'done')
    .slice()
    .sort((a, b) => {
      const aStatus = normalizeBacklogStatus(a.status);
      const bStatus = normalizeBacklogStatus(b.status);
      return (
        (STATUS_ORDER[aStatus] ?? 99) - (STATUS_ORDER[bStatus] ?? 99) ||
        (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99) ||
        dateSortValue(b.date) - dateSortValue(a.date)
      );
    })
    .slice(0, 6);
}

function buildBacklogFromEntries(document: SourceDocument, entries: BacklogEntry[]): BacklogResponse {
  const normalizedEntries = entries
    .map((entry) => ({ ...entry, status: normalizeBacklogStatus(entry.status), priority: normalizePriority(entry.priority) }))
    .sort((a, b) => dateSortValue(b.date) - dateSortValue(a.date) || a.id.localeCompare(b.id));

  return {
    document,
    metrics: buildBacklogMetrics(normalizedEntries),
    priority_queue: buildPriorityQueue(normalizedEntries),
    owner_groups: buildOwnerGroups(normalizedEntries),
    status_groups: buildStatusGroups(normalizedEntries),
    kanban_columns: buildKanbanColumns(normalizedEntries),
    recent_entries: normalizedEntries.slice(0, 4),
  };
}

function normalizeMetricCard(value: unknown): MetricCard {
  const record = asRecord(value);
  return {
    label: asString(record.label, 'Metric'),
    value: asString(record.value, '0'),
    tone: asString(record.tone, 'neutral'),
    detail: asOptionalString(record.detail),
  };
}

function normalizeEntryGroup(value: unknown): EntryGroup {
  const record = asRecord(value);
  return {
    label: asString(record.label, 'Group'),
    detail: asOptionalString(record.detail),
    count: asNumber(record.count) ?? 0,
    entries: asArray(record.entries).map((entry) => normalizeBacklogEntry(entry)),
  };
}

function normalizeKanbanColumn(value: unknown): KanbanColumn {
  const record = asRecord(value);
  const key = normalizeBacklogStatus(record.key, 'todo');
  const entries = asArray(record.entries).map((entry) => normalizeBacklogEntry(entry, key)).sort(compareEntries);
  return {
    key,
    label: asString(record.label, titleCase(key)),
    detail: asOptionalString(record.detail) ?? describeKanbanColumn(key, entries),
    count: asNumber(record.count) ?? entries.length,
    high_priority_count: asNumber(record.high_priority_count) ?? entries.filter((entry) => entry.priority === 'high').length,
    entries,
  };
}

function normalizeBacklogResponse(value: unknown): BacklogResponse {
  const record = asRecord(value);
  const document = normalizeSourceDocument(record.document, 'Shared backlog');
  const collectedEntries = collectBacklogEntries(record);

  if (collectedEntries.length > 0) {
    return buildBacklogFromEntries(document, collectedEntries);
  }

  const rawColumns = asArray(record.kanban_columns).map(normalizeKanbanColumn);
  const columns = KANBAN_STATUS_ORDER.map((status) => rawColumns.find((column) => column.key === status) ?? {
    key: status,
    label: titleCase(status),
    detail: emptyColumnDetail(status),
    count: 0,
    high_priority_count: 0,
    entries: [],
  });

  return {
    document,
    metrics: asArray(record.metrics).map(normalizeMetricCard),
    priority_queue: asArray(record.priority_queue).map((entry) => normalizeBacklogEntry(entry)),
    owner_groups: asArray(record.owner_groups).map(normalizeEntryGroup),
    status_groups: asArray(record.status_groups).map(normalizeEntryGroup),
    kanban_columns: columns,
    recent_entries: asArray(record.recent_entries).map((entry) => normalizeBacklogEntry(entry)),
  };
}

function normalizeRulebookSection(value: unknown): RulebookSection {
  const record = asRecord(value);
  return {
    id: asString(record.id, '?'),
    title: asString(record.title, 'Untitled section'),
    category: asString(record.category, 'Operations'),
    summary: asString(record.summary, 'No summary available.'),
    bullets: asArray(record.bullets).map((item) => compactText(asString(item), 132)).filter(Boolean),
  };
}

function normalizeRulebookResponse(value: unknown): RulebookResponse {
  const record = asRecord(value);
  return {
    document: normalizeSourceDocument(record.document, 'Shared rulebook'),
    highlights: asArray(record.highlights).map((item) => compactText(asString(item), 132)).filter(Boolean),
    sections: asArray(record.sections).map(normalizeRulebookSection),
  };
}

function normalizeDashboardResponse(value: unknown): DashboardResponse {
  const record = asRecord(value);
  return {
    refreshed_at: asString(record.refreshed_at, new Date().toISOString()),
    agents: asArray(record.agents).map(normalizeAgent),
    openclaw: normalizeStatusResponse(record.openclaw),
    backlog: normalizeBacklogResponse(record.backlog),
    rulebook: normalizeRulebookResponse(record.rulebook),
  };
}

function extractApiError(value: unknown, fallback: string): string {
  const record = asRecord(value);
  const detail = record.detail;
  if (typeof detail === 'string' && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const message = detail
      .map((item) => {
        if (typeof item === 'string') return item;
        if (isRecord(item)) return asString(item.msg || item.message || item.detail);
        return '';
      })
      .filter(Boolean)
      .join('; ');
    if (message) return message;
  }
  return fallback;
}

function applyBacklogMove(dashboard: DashboardResponse, entryId: string, nextStatus: KanbanStatus): DashboardResponse {
  const entries = collectBacklogEntries(dashboard.backlog);
  let changed = false;
  const updatedEntries = entries.map((entry) => {
    if (entry.id !== entryId) return entry;
    changed = true;
    return { ...entry, status: nextStatus };
  });

  if (!changed) return dashboard;

  return {
    ...dashboard,
    refreshed_at: new Date().toISOString(),
    backlog: buildBacklogFromEntries(dashboard.backlog.document, updatedEntries),
  };
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

function KanbanEntryCard({
  entry,
  moving,
  onMove,
}: {
  entry: BacklogEntry;
  moving: boolean;
  onMove: (entryId: string, nextStatus: KanbanStatus) => void;
}) {
  return (
    <li className="kanbanEntry">
      <div className="entryTop">
        <div>
          <strong>{entry.title}</strong>
          <p className="muted lineMeta">{entry.id}</p>
        </div>
        <div className="entryBadges">
          <EntryPill label={entry.priority} />
        </div>
      </div>
      <p className="muted lineMeta">
        Owner: {entry.owner || 'Unassigned'} · Requested by: {entry.requested_by || 'Unknown'}
      </p>
      <p className="muted lineMeta">{entry.date || 'No date'}</p>
      {entry.scope.length > 0 ? (
        <ul className="scopeList compactScopeList">
          {entry.scope.slice(0, 2).map((scope, index) => (
            <li key={`${entry.id}-kanban-scope-${index}`}>{scope}</li>
          ))}
        </ul>
      ) : null}
      {entry.notes ? <p className="muted lineMeta">Note: {entry.notes}</p> : null}

      <div className="kanbanEntryFooter">
        <label className="statusControl">
          <span>Status</span>
          <select
            className="statusSelect"
            value={normalizeBacklogStatus(entry.status)}
            disabled={moving}
            onChange={(event) => onMove(entry.id, normalizeBacklogStatus(event.target.value))}
          >
            {KANBAN_STATUS_ORDER.map((status) => (
              <option key={`${entry.id}-${status}`} value={status}>
                {titleCase(status)}
              </option>
            ))}
          </select>
        </label>
        {moving ? <span className="muted lineMeta">Saving…</span> : null}
      </div>
    </li>
  );
}

function FatalFallback({ title, message }: { title: string; message: string }) {
  return (
    <main>
      <section className="card fatalCard">
        <header className="cardHeader">
          <div>
            <p className="eyebrow">Dashboard Recovery</p>
            <h1>{title}</h1>
            <p className="heroSubtitle">The app hit a hard error, but the fallback shell is still alive.</p>
          </div>
        </header>
        <p className="error">{message}</p>
        <button onClick={() => window.location.reload()}>Reload dashboard</button>
      </section>
    </main>
  );
}

class DashboardErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('Dashboard render failed:', error);
  }

  render() {
    if (this.state.error) {
      return <FatalFallback title="Dashboard crashed while rendering" message={this.state.error.message} />;
    }

    return this.props.children;
  }
}

function App() {
  const [data, setData] = React.useState<DashboardResponse>(EMPTY_DASHBOARD);
  const [status, setStatus] = React.useState<DashboardStatus>('loading');
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [pendingMoves, setPendingMoves] = React.useState<Record<string, boolean>>({});
  const dataRef = React.useRef<DashboardResponse>(EMPTY_DASHBOARD);

  React.useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const load = React.useCallback(async () => {
    setLoading(true);
    setStatus((current) => (dataRef.current.refreshed_at ? current : 'loading'));
    setError(null);

    try {
      const response = await fetch('/api/dashboard', {
        headers: {
          Accept: 'application/json',
        },
      });

      const rawPayload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(extractApiError(rawPayload, `Request failed with status ${response.status}`));
      }

      const payload = normalizeDashboardResponse(rawPayload);
      setData(payload);
      setStatus('ready');
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const moveEntry = React.useCallback(async (entryId: string, nextStatus: KanbanStatus) => {
    const previous = dataRef.current;
    setError(null);
    setPendingMoves((current) => ({ ...current, [entryId]: true }));
    setData((current) => applyBacklogMove(current, entryId, nextStatus));

    try {
      const response = await fetch(`/api/backlog/${encodeURIComponent(entryId)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ status: nextStatus }),
      });

      const rawPayload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(extractApiError(rawPayload, `Failed to move ${entryId}`));
      }

      const payload = asRecord(rawPayload);
      setData((current) => ({
        ...current,
        refreshed_at: new Date().toISOString(),
        backlog: normalizeBacklogResponse(payload.backlog),
      }));
    } catch (err) {
      setData(previous);
      setError(err instanceof Error ? err.message : `Failed to move ${entryId}`);
    } finally {
      setPendingMoves((current) => {
        const next = { ...current };
        delete next[entryId];
        return next;
      });
    }
  }, []);

  const topMetrics: MetricCard[] = React.useMemo(() => {
    if (loading && data.refreshed_at === '') return [];

    const defaultAgents = data.agents.filter((agent) => agent.status === 'default').length;
    const activeSessions = data.agents.filter((agent) => Boolean(agent.latest_session_key)).length;
    const securityTone = data.openclaw.security_notices.length > 0 ? 'warning' : 'positive';

    return [
      { label: 'Configured agents', value: String(data.agents.length), tone: 'neutral', detail: `${defaultAgents} default` },
      {
        label: 'Agents with sessions',
        value: String(activeSessions),
        tone: activeSessions > 0 ? 'positive' : 'neutral',
        detail: 'Latest activity visible',
      },
      {
        label: 'Security notices',
        value: String(data.openclaw.security_notices.length),
        tone: securityTone,
        detail: data.openclaw.security_summary || 'No audit summary parsed',
      },
      ...data.backlog.metrics.slice(0, 2),
    ];
  }, [data, status]);

  const showRuntimeFallback = data.openclaw.summaries.length === 0;

  return (
    <main>
      <header className="hero">
        <div>
          <p className="eyebrow">OpenClaw Workspace</p>
          <h1>Akbar’s Personal Dashboard</h1>
          <p className="heroSubtitle">
            Operational view with live runtime health, backlog intelligence, and rulebook digest.
          </p>
          <p className="muted">
            Last refreshed: {data.refreshed_at ? toDisplayTime(data.refreshed_at) : loading ? 'loading…' : 'not loaded yet'}
          </p>
        </div>
        <button onClick={() => void load()} disabled={loading || Object.keys(pendingMoves).length > 0}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>

      {error ? (
        <p className="error">
          {status === 'error' && data.refreshed_at === ''
            ? `Failed to load dashboard: ${error}`
            : `Latest refresh issue: ${error} — keeping the last usable dashboard on screen.`}
        </p>
      ) : null}

      {topMetrics.length > 0 ? (
        <section className="metricsStrip">
          {topMetrics.map((metric) => (
            <DashboardMetric key={metric.label} {...metric} />
          ))}
        </section>
      ) : null}

      <section className="grid twoCols">
        <Card title="Live Agents" subtitle="Configured agents with model, binding, and latest session signal.">
          {data.agents.length === 0 ? (
            <p className="muted">{loading ? 'Loading agents…' : 'No agent data returned.'}</p>
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
          {showRuntimeFallback ? (
            <p className="muted">{loading ? 'Loading runtime status…' : 'Runtime summaries are unavailable.'}</p>
          ) : (
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
          )}

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
        </Card>
      </section>

      <section className="grid singleCol">
        <Card
          title="Backlog Intelligence"
          subtitle="Kanban board grouped by shared backlog Status values, with queue and ownership summaries."
          action={<span className="sourceText">Source: {data.backlog.document.source}</span>}
        >
          <div className="metricsStrip compactStrip">
            {data.backlog.metrics.length > 0 ? (
              data.backlog.metrics.map((metric) => <DashboardMetric key={`backlog-${metric.label}`} {...metric} />)
            ) : (
              <DashboardMetric label="Tracked items" value="0" tone="neutral" detail="Backlog data not available yet." />
            )}
          </div>

          <div className="backlogHint">
            <p>
              This board follows each item’s <code>Status:</code> field in the shared backlog. Moving a card updates only that field,
              then re-renders the board immediately.
            </p>
          </div>

          <div className="kanbanBoard">
            {data.backlog.kanban_columns.map((column) => (
              <section key={column.key} className={`kanbanLane ${laneClass(column.key)}`}>
                <div className="kanbanLaneHeader">
                  <div>
                    <div className="kanbanLaneTitleRow">
                      <h3>{column.label}</h3>
                      <span className="kanbanLaneCount">{column.count}</span>
                    </div>
                    {column.detail ? <p className="muted lineMeta">{column.detail}</p> : null}
                  </div>
                  {column.high_priority_count > 0 ? <EntryPill label={`${column.high_priority_count} high`} /> : null}
                </div>

                {column.entries.length > 0 ? (
                  <ul className="kanbanList">
                    {column.entries.map((entry) => (
                      <KanbanEntryCard
                        key={`${column.key}-${entry.id}`}
                        entry={entry}
                        moving={Boolean(pendingMoves[entry.id])}
                        onMove={moveEntry}
                      />
                    ))}
                  </ul>
                ) : (
                  <div className="kanbanEmpty">No items in this lane.</div>
                )}
              </section>
            ))}
          </div>

          <div className="splitCols backlogSecondary">
            <div>
              <h3>Priority Queue</h3>
              {data.backlog.priority_queue.length > 0 ? (
                <ul className="list">
                  {data.backlog.priority_queue.map((entry) => (
                    <BacklogEntryRow key={entry.id} entry={entry} />
                  ))}
                </ul>
              ) : (
                <p className="muted">No queued work outside the done lane.</p>
              )}
            </div>

            <div>
              <h3>Owner Load</h3>
              {data.backlog.owner_groups.length > 0 ? (
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
              ) : (
                <p className="muted">No owner summary available yet.</p>
              )}
            </div>
          </div>
        </Card>
      </section>

      <section className="grid singleCol">
        <Card
          title="Rulebook Digest"
          subtitle="Condensed guidance grouped by policy section and surfaced as operator-ready bullets."
          action={<span className="sourceText">Source: {data.rulebook.document.source}</span>}
        >
          <div className="highlightPanel">
            <p className="noticeTitle">Key highlights</p>
            {data.rulebook.highlights.length > 0 ? (
              <ul className="scopeList">
                {data.rulebook.highlights.slice(0, 6).map((highlight, index) => (
                  <li key={`highlight-${index}`}>{highlight}</li>
                ))}
              </ul>
            ) : (
              <p className="muted">No highlight bullets available.</p>
            )}
          </div>

          {data.rulebook.sections.length > 0 ? (
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
                  {section.bullets.length > 0 ? (
                    <ul className="scopeList">
                      {section.bullets.map((bullet, index) => (
                        <li key={`${section.id}-bullet-${index}`}>{bullet}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="muted lineMeta">No rule bullets extracted.</p>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <p className="muted">Rulebook digest unavailable.</p>
          )}
        </Card>
      </section>
    </main>
  );
}

function renderBootFailure(message: string) {
  const container = document.createElement('div');
  document.body.innerHTML = '';
  document.body.appendChild(container);
  ReactDOM.createRoot(container).render(<FatalFallback title="Dashboard failed to start" message={message} />);
}

const rootElement = document.getElementById('root');

if (!rootElement) {
  renderBootFailure('The root element (#root) is missing from index.html.');
} else {
  try {
    ReactDOM.createRoot(rootElement).render(
      <React.StrictMode>
        <DashboardErrorBoundary>
          <App />
        </DashboardErrorBoundary>
      </React.StrictMode>,
    );
  } catch (error) {
    renderBootFailure(error instanceof Error ? error.message : 'Unknown startup error');
  }
}
