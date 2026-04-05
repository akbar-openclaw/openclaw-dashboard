from __future__ import annotations

import re
from collections import Counter, defaultdict

try:
    from .schemas import (
        BacklogEntry,
        BacklogResponse,
        ChannelStatus,
        EntryGroup,
        KanbanColumn,
        MetricCard,
        RulebookResponse,
        RulebookSection,
        SecurityNotice,
        SourceDocument,
        StatusFact,
        StatusSummary,
    )
except ImportError:  # pragma: no cover - fallback for direct module execution
    from schemas import (
        BacklogEntry,
        BacklogResponse,
        ChannelStatus,
        EntryGroup,
        KanbanColumn,
        MetricCard,
        RulebookResponse,
        RulebookSection,
        SecurityNotice,
        SourceDocument,
        StatusFact,
        StatusSummary,
    )

BACKLOG_ENTRY_RE = re.compile(r"^###\s+(BL-\d{8}-\d{2})")
RULEBOOK_SECTION_RE = re.compile(r"^##\s+(\d+)\)\s+(.*)$")
PRIORITY_ORDER = {"high": 0, "medium": 1, "low": 2}
STATUS_ORDER = {"blocked": 0, "in-progress": 1, "todo": 2, "done": 3}
KANBAN_STATUS_ORDER = ["todo", "in-progress", "blocked", "done"]
SECTION_CATEGORY_LABELS = {
    "Shared baseline and propagation": "Shared context",
    "Workspace operating defaults": "Operating model",
    "Shared records and learning hygiene": "Records & learning",
    "Task triage and execution path": "Execution flow",
    "Model and reasoning policy": "Model policy",
    "Reporting, completion, and context handling": "Reporting",
    "Reflection automation": "Reflection",
    "Toolchain defaults and special-case rules": "Tooling",
    "David and deployment rules": "Delivery",
}


def normalize_status(value: str | None, fallback: str | None = "todo") -> str | None:
    normalized = re.sub(r"[\s_]+", "-", (value or "").strip().lower())
    aliases = {
        "to-do": "todo",
        "todo": "todo",
        "queued": "todo",
        "in-progress": "in-progress",
        "inprogress": "in-progress",
        "active": "in-progress",
        "blocked": "blocked",
        "done": "done",
        "complete": "done",
        "completed": "done",
    }
    resolved = aliases.get(normalized, normalized)
    if resolved in KANBAN_STATUS_ORDER:
        return resolved
    return fallback


def normalize_priority(value: str | None) -> str:
    normalized = (value or "").strip().lower()
    return normalized if normalized in PRIORITY_ORDER else "medium"


def date_sort_value(value: str | None) -> int:
    digits = re.sub(r"\D", "", value or "")
    return int(digits) if digits else 0


def sort_backlog_entries(entries: list[BacklogEntry]) -> list[BacklogEntry]:
    return sorted(
        entries,
        key=lambda entry: (
            PRIORITY_ORDER.get(entry.priority, 99),
            -date_sort_value(entry.date),
            entry.title.lower(),
        ),
    )


def describe_kanban_column(status: str, entries: list[BacklogEntry]) -> str:
    count = len(entries)
    high_priority = sum(1 for entry in entries if entry.priority == "high")
    owners = len({entry.owner or "Unassigned" for entry in entries})

    if count == 0:
        if status == "todo":
            return "Nothing queued right now."
        if status == "in-progress":
            return "No active work yet."
        if status == "blocked":
            return "No blockers tracked."
        return "Nothing finished but still visible."

    parts: list[str] = []
    if high_priority:
        parts.append(f"{high_priority} high-priority")
    if owners:
        parts.append(f"{owners} owner{'s' if owners != 1 else ''}")

    status_hint = {
        "todo": "ready to start",
        "in-progress": "actively moving",
        "blocked": "waiting on an unblocker",
        "done": "ready to archive when appropriate",
    }.get(status, "tracked")

    prefix = " · ".join(parts)
    return f"{prefix} · {status_hint}" if prefix else status_hint


def compact_text(value: str, max_length: int = 140) -> str:
    text = re.sub(r"\s+", " ", value.strip())
    text = text.replace("`", "")
    if len(text) <= max_length:
        return text
    short = text[: max_length - 1].rsplit(" ", 1)[0].strip()
    return f"{short}…"


def count_by_tone(values: list[str]) -> tuple[int, int, int]:
    critical_or_blocked = sum(1 for value in values if value in {"blocked", "high"})
    medium = sum(1 for value in values if value == "medium")
    quiet = max(len(values) - critical_or_blocked - medium, 0)
    return critical_or_blocked, medium, quiet


def parse_backlog(document: SourceDocument) -> BacklogResponse:
    if not document.exists or not document.raw_content:
        return BacklogResponse(document=document)

    entries: list[BacklogEntry] = []
    current: dict[str, object] | None = None
    current_section_status: str | None = None
    collecting_scope = False

    for raw_line in document.raw_content.splitlines():
        line = raw_line.rstrip()
        stripped = line.strip()

        if stripped == "## Archive":
            break

        if stripped.startswith("## "):
            heading = stripped[3:].strip()
            current_section_status = normalize_status(heading, fallback=None)
            if current is None:
                collecting_scope = False
            continue

        match = BACKLOG_ENTRY_RE.match(stripped)
        if match:
            if current:
                entries.append(BacklogEntry(**current))
            current = {
                "id": match.group(1),
                "title": match.group(1),
                "status": current_section_status or "todo",
                "priority": "medium",
                "scope": [],
            }
            collecting_scope = False
            continue

        if current is None:
            continue

        if stripped.startswith("- Date:"):
            current["date"] = stripped.split(":", 1)[1].strip()
            collecting_scope = False
        elif stripped.startswith("- Title:"):
            current["title"] = stripped.split(":", 1)[1].strip()
            collecting_scope = False
        elif stripped.startswith("- Requested by:"):
            current["requested_by"] = stripped.split(":", 1)[1].strip()
            collecting_scope = False
        elif stripped.startswith("- Owner:"):
            current["owner"] = stripped.split(":", 1)[1].strip()
            collecting_scope = False
        elif stripped.startswith("- Status:"):
            current["status"] = normalize_status(stripped.split(":", 1)[1].strip()) or "todo"
            collecting_scope = False
        elif stripped.startswith("- Priority:"):
            current["priority"] = normalize_priority(stripped.split(":", 1)[1].strip())
            collecting_scope = False
        elif stripped.startswith("- Scope:"):
            collecting_scope = True
        elif stripped.startswith("- Notes"):
            current["notes"] = stripped.split(":", 1)[1].strip()
            collecting_scope = False
        elif collecting_scope and stripped.startswith("- "):
            current.setdefault("scope", []).append(stripped[2:].strip())
        elif collecting_scope and stripped.startswith("  - "):
            current.setdefault("scope", []).append(stripped[4:].strip())
        elif not stripped:
            collecting_scope = False

    if current:
        entries.append(BacklogEntry(**current))

    entries.sort(key=lambda entry: (date_sort_value(entry.date), entry.id), reverse=True)
    total = len(entries)
    high_priority = [entry for entry in entries if entry.priority == "high"]
    blocked = [entry for entry in entries if entry.status == "blocked"]
    in_progress = [entry for entry in entries if entry.status == "in-progress"]
    owners = sorted({entry.owner or "Unassigned" for entry in entries})

    metrics = [
        MetricCard(label="Tracked items", value=str(total), tone="neutral", detail="Visible items in the shared backlog before archive."),
        MetricCard(label="High priority", value=str(len(high_priority)), tone="danger" if high_priority else "positive", detail="Needs attention first."),
        MetricCard(label="In Progress", value=str(len(in_progress)), tone="neutral" if in_progress else "positive", detail="Actively moving right now."),
        MetricCard(label="Blocked", value=str(len(blocked)), tone="danger" if blocked else "positive", detail="Waiting on an unblocker."),
        MetricCard(label="Owners", value=str(len(owners)), tone="neutral", detail="People currently carrying visible backlog work."),
    ]

    priority_queue = sorted(
        [entry for entry in entries if entry.status != "done"],
        key=lambda entry: (
            STATUS_ORDER.get(entry.status, 99),
            PRIORITY_ORDER.get(entry.priority, 99),
            -date_sort_value(entry.date),
        ),
    )[:6]

    owner_groups: list[EntryGroup] = []
    entries_by_owner: dict[str, list[BacklogEntry]] = defaultdict(list)
    for entry in entries:
        entries_by_owner[entry.owner or "Unassigned"].append(entry)
    for owner, owner_entries in sorted(
        entries_by_owner.items(), key=lambda item: (-len(item[1]), item[0].lower())
    ):
        owner_high = sum(1 for entry in owner_entries if entry.priority == "high")
        owner_groups.append(
            EntryGroup(
                label=owner,
                detail=f"{owner_high} high-priority item{'s' if owner_high != 1 else ''}" if owner_high else "No high-priority items",
                count=len(owner_entries),
                entries=sorted(
                    owner_entries,
                    key=lambda entry: (
                        PRIORITY_ORDER.get(entry.priority, 99),
                        STATUS_ORDER.get(entry.status, 99),
                        entry.title.lower(),
                    ),
                )[:4],
            )
        )

    status_groups: list[EntryGroup] = []
    kanban_columns: list[KanbanColumn] = []
    entries_by_status: dict[str, list[BacklogEntry]] = defaultdict(list)
    for entry in entries:
        entries_by_status[normalize_status(entry.status) or "todo"].append(entry)

    for status in KANBAN_STATUS_ORDER:
        status_entries = sort_backlog_entries(entries_by_status.get(status, []))
        high_count = sum(1 for entry in status_entries if entry.priority == "high")

        status_groups.append(
            EntryGroup(
                label=status.replace("-", " ").title(),
                detail=f"{high_count} high-priority" if status_entries else "No items",
                count=len(status_entries),
                entries=status_entries[:4],
            )
        )

        kanban_columns.append(
            KanbanColumn(
                key=status,
                label=status.replace("-", " ").title(),
                detail=describe_kanban_column(status, status_entries),
                count=len(status_entries),
                high_priority_count=high_count,
                entries=status_entries,
            )
        )

    return BacklogResponse(
        document=document,
        metrics=metrics,
        priority_queue=priority_queue,
        owner_groups=owner_groups,
        status_groups=status_groups,
        kanban_columns=kanban_columns,
        recent_entries=entries[:4],
    )


def describe_rulebook_section(title: str, bullets: list[str]) -> str:
    normalized = title.lower()
    if "baseline" in normalized or "propagation" in normalized:
        return "Keep every agent on the same shared context and move durable rules into shared files immediately."
    if "operating defaults" in normalized:
        return "Main chat coordinates, specialists execute, and safe standing preferences become workspace defaults."
    if "learning hygiene" in normalized or "records" in normalized:
        return "Treat the backlog and learnings as shared operating data, not private notes."
    if "triage" in normalized or "execution path" in normalized:
        return "Classify work first, then decide whether to answer directly or delegate execution."
    if "model" in normalized or "reasoning" in normalized:
        return "Match model cost and thinking depth to task difficulty instead of using one setting for everything."
    if "reporting" in normalized or "context handling" in normalized:
        return "Report the finished state plainly, keep context resumable, and avoid needless handoffs."
    if "reflection" in normalized:
        return "Nightly reflection is quiet by default and escalates only when findings matter."
    if "toolchain" in normalized:
        return "Prefer the standard toolchain paths first and follow the workspace-specific edge-case rules."
    if "deployment" in normalized or "david" in normalized:
        return "Delivery includes the final live verification, not just code changes or a successful command."
    return compact_text(bullets[0] if bullets else title, max_length=120)


def pick_rulebook_bullets(bullets: list[str]) -> list[str]:
    cleaned = [compact_text(bullet, max_length=132) for bullet in bullets if bullet.strip()]
    if len(cleaned) <= 3:
        return cleaned

    scored: list[tuple[int, int, str]] = []
    for index, bullet in enumerate(cleaned):
        score = 0
        lowered = bullet.lower()
        for token, value in {
            "must": 3,
            "do not": 3,
            "always": 3,
            "only": 2,
            "verify": 2,
            "use": 1,
            "report": 1,
            "reload": 1,
        }.items():
            if token in lowered:
                score += value
        scored.append((-score, index, bullet))
    winners = sorted(scored)[:3]
    return [bullet for _, _, bullet in sorted(winners, key=lambda item: item[1])]


def parse_rulebook(document: SourceDocument) -> RulebookResponse:
    if not document.exists or not document.raw_content:
        return RulebookResponse(document=document)

    sections: list[RulebookSection] = []
    current_id: str | None = None
    current_title: str | None = None
    current_bullets: list[str] = []

    for raw_line in document.raw_content.splitlines():
        line = raw_line.rstrip()
        stripped = line.strip()
        match = RULEBOOK_SECTION_RE.match(stripped)
        if match:
            if current_id and current_title:
                sections.append(
                    RulebookSection(
                        id=current_id,
                        title=current_title,
                        category=SECTION_CATEGORY_LABELS.get(current_title, "Operations"),
                        summary=describe_rulebook_section(current_title, current_bullets),
                        bullets=pick_rulebook_bullets(current_bullets),
                    )
                )
            current_id = match.group(1)
            current_title = match.group(2)
            current_bullets = []
            continue

        if current_title and stripped.startswith("- "):
            current_bullets.append(stripped[2:].strip())

    if current_id and current_title:
        sections.append(
            RulebookSection(
                id=current_id,
                title=current_title,
                category=SECTION_CATEGORY_LABELS.get(current_title, "Operations"),
                summary=describe_rulebook_section(current_title, current_bullets),
                bullets=pick_rulebook_bullets(current_bullets),
            )
        )

    highlight_candidates: list[str] = []
    for section in sections:
        for bullet in section.bullets:
            lowered = bullet.lower()
            if any(token in lowered for token in ["must", "do not", "always", "only", "verify", "report"]):
                highlight_candidates.append(bullet)

    return RulebookResponse(document=document, highlights=highlight_candidates[:6], sections=sections)


def parse_status_facts(output: str) -> list[StatusFact]:
    facts: list[StatusFact] = []
    for line in output.splitlines():
        if not line.startswith("│"):
            continue
        parts = line.split("│")
        if len(parts) < 4:
            continue
        label = parts[1].strip()
        value = parts[2].strip()
        if not value or label == "Item":
            continue
        if label:
            facts.append(StatusFact(label=label, value=value))
        elif facts:
            facts[-1].value = compact_text(f"{facts[-1].value} {value}", max_length=220)
    return facts


def parse_security_notices(output: str) -> tuple[str | None, list[SecurityNotice]]:
    security_summary: str | None = None
    notices: list[SecurityNotice] = []
    lines = output.splitlines()
    in_security = False
    current: SecurityNotice | None = None

    for raw_line in lines:
        line = raw_line.rstrip()
        stripped = line.strip()

        if stripped == "Security audit":
            in_security = True
            current = None
            continue
        if in_security and stripped == "Channels":
            break
        if not in_security:
            continue

        if stripped.startswith("Summary:"):
            security_summary = stripped.replace("Summary:", "", 1).strip()
            continue

        notice_match = re.match(r"^(CRITICAL|WARN|INFO)\s+(.*)$", stripped)
        if notice_match:
            current = SecurityNotice(severity=notice_match.group(1).lower(), message=notice_match.group(2).strip())
            notices.append(current)
            continue

        if current and stripped.startswith("Fix:"):
            current.fix = stripped.replace("Fix:", "", 1).strip()

    return security_summary, notices


def parse_channels(output: str) -> list[ChannelStatus]:
    channels: list[ChannelStatus] = []
    for line in output.splitlines():
        if not line.startswith("│"):
            continue
        parts = [part.strip() for part in line.split("│")]
        if len(parts) < 6:
            continue
        name, enabled, state, detail = parts[1], parts[2], parts[3], parts[4]
        if name in {"", "Channel"}:
            continue
        channels.append(ChannelStatus(name=name, enabled=enabled, state=state, detail=detail))
    return channels


def build_status_summaries(facts: list[StatusFact], security_summary: str | None, gateway_output: str) -> list[StatusSummary]:
    facts_map = {fact.label: fact.value for fact in facts}
    summaries: list[StatusSummary] = []

    gateway_line = next((line for line in gateway_output.splitlines() if line.startswith("Gateway:")), None)
    runtime_line = next((line for line in gateway_output.splitlines() if line.startswith("Runtime:")), None)
    if gateway_line:
        summaries.append(StatusSummary(title="Gateway", summary=gateway_line.replace("Gateway:", "", 1).strip(), severity="success"))
    if runtime_line:
        summaries.append(StatusSummary(title="Runtime", summary=runtime_line.replace("Runtime:", "", 1).strip(), severity="success"))

    if agents_value := facts_map.get("Agents"):
        summaries.append(StatusSummary(title="Agents", summary=compact_text(agents_value, max_length=120), severity="info"))
    if tasks_value := facts_map.get("Tasks"):
        severity = "warning" if re.search(r"\b[1-9]\d* issues\b", tasks_value) else "success"
        summaries.append(StatusSummary(title="Tasks", summary=compact_text(tasks_value, max_length=120), severity=severity))
    if security_summary:
        severity = "warning" if any(token in security_summary for token in ["critical", "warn"]) and not security_summary.startswith("0 critical · 0 warn") else "success"
        summaries.append(StatusSummary(title="Security", summary=security_summary, severity=severity))

    return summaries[:5] or [
        StatusSummary(title="Status", summary="OpenClaw status commands did not return a usable summary.", severity="warning")
    ]
