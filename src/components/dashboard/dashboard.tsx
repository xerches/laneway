"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatDistanceToNowStrict } from "date-fns";
import { AlertTriangle, CalendarCheck, CheckCircle2, Loader, Plus } from "lucide-react";
import { describeActivity } from "@/components/project/item-panel";
import { DueChip, RepeatBadge } from "@/components/project/pickers";
import { useApp } from "@/components/shell/app-context";
import { Dot, EmptyState, Pill } from "@/components/ui/bits";
import { Button } from "@/components/ui/button";
import { useToday } from "@/lib/client";
import { colorFg, colorVar } from "@/lib/colors";
import { addDaysTo, formatShort, parseDate, toDateString } from "@/lib/dates";
import type { DashboardActivity, DashboardItem } from "@/lib/types";
import { cn } from "@/lib/utils";

type Filter = "next" | "today" | "overdue" | "active" | "done" | { day: string };

const card = "rounded-xl border border-line bg-surface shadow-card";

function itemHref(item: { workspaceId: string; projectId: string; id: string }) {
  return `/w/${item.workspaceId}/p/${item.projectId}?item=${item.id}`;
}

/**
 * The home page answers two questions at a glance: what needs me today, and
 * what is at risk. Every number opens the list of items behind it.
 */
export function Dashboard({
  workspaceId,
  items,
  activity,
}: {
  workspaceId: string | null;
  items: DashboardItem[];
  activity: DashboardActivity[];
}) {
  const { user, workspaces, projects, openNewProject } = useApp();
  const today = useToday();
  const [filter, setFilter] = useState<Filter>("next");

  const scopeProjects = workspaceId
    ? projects.filter((p) => p.workspaceId === workspaceId)
    : projects;
  const workspace = workspaces.find((w) => w.id === workspaceId);

  const stats = useMemo(() => {
    if (!today) return null;
    const weekAgo = addDaysTo(today, -7);
    const open = items.filter((i) => !i.completedAt);
    return {
      open,
      dueToday: open.filter((i) => i.dueDate === today),
      overdue: open.filter((i) => i.dueDate && i.dueDate < today),
      active: open.filter((i) => i.statusCategory === "active"),
      done: items.filter(
        (i) => i.completedAt && toDateString(new Date(i.completedAt)) > weekAgo,
      ),
    };
  }, [items, today]);

  if (!today || !stats) return <DashboardSkeleton />;

  const byDue = (a: DashboardItem, b: DashboardItem) =>
    (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") ||
    a.createdAt.localeCompare(b.createdAt);

  let listTitle = "Up next";
  let list: DashboardItem[] = [...stats.open].sort(byDue);
  if (filter === "today") {
    listTitle = "Due today";
    list = stats.dueToday;
  } else if (filter === "overdue") {
    listTitle = "Overdue";
    list = [...stats.overdue].sort(byDue);
  } else if (filter === "active") {
    listTitle = "In progress";
    list = [...stats.active].sort(byDue);
  } else if (filter === "done") {
    listTitle = "Done in the last 7 days";
    list = [...stats.done].sort((a, b) =>
      (b.completedAt ?? "").localeCompare(a.completedAt ?? ""),
    );
  } else if (typeof filter === "object") {
    listTitle = `Due ${formatShort(filter.day)}`;
    list = stats.open.filter((i) => i.dueDate === filter.day);
  }

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const firstName = user.name.split(" ")[0] || user.name;

  return (
    <div className="thin-scroll h-full overflow-y-auto">
      <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-5 md:px-8 md:py-7">
        <header className="flex flex-col gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              {workspace ? workspace.name : `${greeting}, ${firstName}`}
            </h1>
            <p className="text-[13px] text-muted">
              {formatShort(today)}
              {workspace ? "" : " · everything across your workspaces"}
            </p>
          </div>
          <nav className="flex flex-wrap gap-1.5" aria-label="Workspace">
            <ScopeTab href="/" active={!workspaceId} label="All" />
            {workspaces.map((ws) => (
              <ScopeTab
                key={ws.id}
                href={`/w/${ws.id}`}
                active={ws.id === workspaceId}
                label={ws.name}
                color={ws.color}
              />
            ))}
          </nav>
        </header>

        {scopeProjects.length === 0 ? (
          <EmptyState
            title={workspace ? `Nothing in ${workspace.name} yet` : "No projects yet"}
            body="A project is a board for one thing you're working on. It takes under a minute to make one."
            action={
              <Button variant="primary" onClick={() => openNewProject(workspaceId ?? undefined)}>
                <Plus size={15} /> New project
              </Button>
            }
          />
        ) : (
          <>
            <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="At a glance">
              <Counter
                label="Due today"
                value={stats.dueToday.length}
                hint="Open the list"
                icon={<CalendarCheck size={16} />}
                tone={stats.dueToday.length ? "accent" : "quiet"}
                active={filter === "today"}
                onClick={() => setFilter(filter === "today" ? "next" : "today")}
              />
              <Counter
                label="Overdue"
                value={stats.overdue.length}
                hint={stats.overdue.length ? "Needs a new date or a push" : "Nothing is late"}
                icon={<AlertTriangle size={16} />}
                tone={stats.overdue.length ? "danger" : "quiet"}
                active={filter === "overdue"}
                onClick={() => setFilter(filter === "overdue" ? "next" : "overdue")}
              />
              <Counter
                label="In progress"
                value={stats.active.length}
                hint="Started, not finished"
                icon={<Loader size={16} />}
                tone="quiet"
                active={filter === "active"}
                onClick={() => setFilter(filter === "active" ? "next" : "active")}
              />
              <Counter
                label="Done this week"
                value={stats.done.length}
                hint="Finished in the last 7 days"
                icon={<CheckCircle2 size={16} />}
                tone={stats.done.length ? "good" : "quiet"}
                active={filter === "done"}
                onClick={() => setFilter(filter === "done" ? "next" : "done")}
              />
            </section>

            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
              <div className="flex min-w-0 flex-col gap-5">
                <section className={card} aria-label={listTitle}>
                  <div className="flex h-11 items-center justify-between border-b border-line px-4">
                    <h2 className="text-sm font-semibold">
                      {listTitle}
                      <span className="ml-2 font-normal text-faint tabular-nums">
                        {list.length}
                      </span>
                    </h2>
                    {filter !== "next" ? (
                      <button
                        onClick={() => setFilter("next")}
                        className="text-xs text-muted hover:text-ink"
                      >
                        Show everything
                      </button>
                    ) : null}
                  </div>
                  <WorkList items={list} today={today} showWorkspace={!workspaceId} />
                </section>

                <section className={card} aria-label="Next 14 days">
                  <div className="flex h-11 items-center border-b border-line px-4">
                    <h2 className="text-sm font-semibold">Next 14 days</h2>
                  </div>
                  <TwoWeeks
                    items={stats.open}
                    today={today}
                    selected={typeof filter === "object" ? filter.day : null}
                    onSelect={(day) =>
                      setFilter(
                        typeof filter === "object" && filter.day === day ? "next" : { day },
                      )
                    }
                  />
                </section>
              </div>

              <div className="flex min-w-0 flex-col gap-5">
                <section className={card} aria-label="Projects at a glance">
                  <div className="flex h-11 items-center justify-between border-b border-line px-4">
                    <h2 className="text-sm font-semibold">Projects at a glance</h2>
                    <button
                      onClick={() => openNewProject(workspaceId ?? undefined)}
                      className="flex items-center gap-1 text-xs text-muted hover:text-ink"
                    >
                      <Plus size={13} /> New
                    </button>
                  </div>
                  <ul className="flex flex-col divide-y divide-line">
                    {scopeProjects.map((p) => (
                      <ProjectRow
                        key={p.id}
                        project={p}
                        items={items.filter((i) => i.projectId === p.id)}
                        today={today}
                      />
                    ))}
                  </ul>
                </section>

                <section className={card} aria-label="Recent activity">
                  <div className="flex h-11 items-center border-b border-line px-4">
                    <h2 className="text-sm font-semibold">Recent activity</h2>
                  </div>
                  <ActivityList entries={activity} today={today} />
                </section>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ScopeTab({
  href,
  label,
  active,
  color,
}: {
  href: string;
  label: string;
  active: boolean;
  color?: string;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-8 items-center gap-2 rounded-full border px-3 text-[13px] font-medium transition-colors",
        active
          ? "border-transparent bg-ink text-surface"
          : "border-line bg-surface text-muted hover:text-ink",
      )}
    >
      {color ? (
        <span
          style={{ background: colorVar(color), color: colorFg(color) }}
          className="flex h-4 w-4 items-center justify-center rounded text-[10px] font-bold"
        >
          {label.slice(0, 1).toUpperCase()}
        </span>
      ) : null}
      {label}
    </Link>
  );
}

const tones = {
  accent: "text-accent",
  danger: "text-danger",
  good: "text-[var(--c-green)]",
  quiet: "text-ink",
};

function Counter({
  label,
  value,
  hint,
  icon,
  tone,
  active,
  onClick,
}: {
  label: string;
  value: number;
  hint: string;
  icon: React.ReactNode;
  tone: keyof typeof tones;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        card,
        "flex flex-col items-start gap-1 p-4 text-left transition-[border-color,box-shadow] hover:border-line-strong",
        active && "border-accent ring-2 ring-[var(--ring)]",
      )}
    >
      <span className="flex w-full items-center justify-between text-[13px] font-medium text-muted">
        {label}
        <span className={cn(tone === "quiet" ? "text-faint" : tones[tone])}>{icon}</span>
      </span>
      <span className={cn("text-3xl leading-none font-semibold tabular-nums", tones[tone])}>
        {value}
      </span>
      <span className="text-xs text-faint">{hint}</span>
    </button>
  );
}

function WorkList({
  items,
  today,
  showWorkspace,
}: {
  items: DashboardItem[];
  today: string;
  showWorkspace: boolean;
}) {
  const { workspaces } = useApp();
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, 10);

  if (items.length === 0) {
    return <p className="px-4 py-8 text-center text-[13px] text-muted">Nothing here. Nice.</p>;
  }

  return (
    <>
      <ul className="flex flex-col divide-y divide-line">
        {shown.map((item) => {
          const ws = workspaces.find((w) => w.id === item.workspaceId);
          return (
            <li key={item.id}>
              <Link
                href={itemHref(item)}
                className="flex min-h-11 items-center gap-3 px-4 py-2 hover:bg-surface-2/60"
              >
                <Pill color={item.statusColor} className="h-5 w-24 shrink-0 justify-center px-2 text-[11px] max-sm:w-20">
                  {item.statusName}
                </Pill>
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block truncate text-[13px] font-medium",
                      item.completedAt && "text-muted line-through",
                    )}
                  >
                    {item.title}
                  </span>
                  <span className="flex items-center gap-1.5 truncate text-xs text-faint">
                    <Dot color={item.projectColor} className="h-2 w-2" />
                    {item.projectName}
                    {showWorkspace && ws ? ` · ${ws.name}` : ""}
                  </span>
                </span>
                {item.recurrence ? <RepeatBadge recurrence={item.recurrence} /> : null}
                {item.dueDate ? (
                  <DueChip date={item.dueDate} today={today} done={Boolean(item.completedAt)} />
                ) : (
                  <span className="text-xs text-faint">No date</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
      {items.length > shown.length ? (
        <button
          onClick={() => setAll(true)}
          className="h-10 w-full border-t border-line text-xs font-medium text-muted hover:text-ink"
        >
          Show all {items.length}
        </button>
      ) : null}
    </>
  );
}

function TwoWeeks({
  items,
  today,
  selected,
  onSelect,
}: {
  items: DashboardItem[];
  today: string;
  selected: string | null;
  onSelect: (day: string) => void;
}) {
  const days = Array.from({ length: 14 }, (_, i) => addDaysTo(today, i));
  return (
    <div className="thin-scroll overflow-x-auto p-3">
      <div className="grid min-w-[560px] grid-cols-[repeat(14,minmax(0,1fr))] gap-1">
        {days.map((day) => {
          const due = items.filter((i) => i.dueDate === day);
          const date = parseDate(day);
          const weekend = date.getDay() === 0 || date.getDay() === 6;
          return (
            <button
              key={day}
              onClick={() => onSelect(day)}
              aria-pressed={selected === day}
              aria-label={`${formatShort(day)}: ${due.length} due`}
              className={cn(
                "flex h-[72px] flex-col items-center gap-1 rounded-lg border px-0.5 py-1.5 transition-colors",
                selected === day
                  ? "border-accent bg-accent/8"
                  : "border-transparent hover:bg-surface-2",
                weekend && selected !== day && "bg-surface-2/50",
              )}
            >
              <span className="text-[10px] font-medium text-faint uppercase">
                {date.toLocaleDateString(undefined, { weekday: "short" }).slice(0, 2)}
              </span>
              <span
                className={cn(
                  "flex h-5 min-w-5 items-center justify-center rounded-full text-xs tabular-nums",
                  day === today ? "bg-accent px-1 font-semibold text-accent-fg" : "text-ink",
                )}
              >
                {date.getDate()}
              </span>
              <span className="flex h-3 flex-wrap items-center justify-center gap-0.5">
                {due.slice(0, 4).map((i) => (
                  <Dot key={i.id} color={i.projectColor} className="h-1.5 w-1.5" />
                ))}
                {due.length > 4 ? (
                  <span className="text-[9px] leading-none text-faint">+{due.length - 4}</span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ProjectRow({
  project,
  items,
  today,
}: {
  project: { id: string; workspaceId: string; name: string; color: string };
  items: DashboardItem[];
  today: string;
}) {
  const open = items.filter((i) => !i.completedAt);
  const todo = open.filter((i) => i.statusCategory !== "active").length;
  const active = open.length - todo;
  const done = items.length - open.length;
  const overdue = open.filter((i) => i.dueDate && i.dueDate < today).length;
  const soon = open.filter(
    (i) =>
      i.statusCategory === "todo" &&
      i.dueDate &&
      i.dueDate >= today &&
      i.dueDate <= addDaysTo(today, 2),
  ).length;
  const total = Math.max(1, items.length);

  const health =
    overdue > 0
      ? { label: "Late", color: "red" }
      : soon > 0
        ? { label: "At risk", color: "amber" }
        : { label: "On track", color: "green" };

  return (
    <li>
      <Link
        href={`/w/${project.workspaceId}/p/${project.id}`}
        className="flex flex-col gap-2 px-4 py-3 hover:bg-surface-2/60"
      >
        <span className="flex items-center gap-2">
          <Dot color={project.color} />
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{project.name}</span>
          {items.length > 0 ? (
            <Pill color={health.color} soft className="h-5 px-2 text-[11px]">
              {health.label}
            </Pill>
          ) : null}
        </span>
        <span
          className="flex h-1.5 overflow-hidden rounded-full bg-surface-2"
          role="img"
          aria-label={`${done} done, ${active} in progress, ${todo} not started`}
        >
          <span style={{ width: `${(done / total) * 100}%`, background: "var(--c-green)" }} />
          <span style={{ width: `${(active / total) * 100}%`, background: "var(--c-blue)" }} />
        </span>
        <span className="text-xs text-faint">
          {items.length === 0
            ? "No items yet"
            : `${open.length} open${overdue ? ` · ${overdue} overdue` : ""}${soon && !overdue ? ` · ${soon} due soon, not started` : ""}`}
        </span>
      </Link>
    </li>
  );
}

function ActivityList({ entries, today }: { entries: DashboardActivity[]; today: string }) {
  const rows = entries
    .map((entry) => {
      const text =
        entry.type === "comment"
          ? `commented: “${entry.body.slice(0, 80)}${entry.body.length > 80 ? "…" : ""}”`
          : describeActivity(entry, today);
      return text ? { entry, text } : null;
    })
    .filter((row): row is { entry: DashboardActivity; text: string } => row !== null);

  if (rows.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-[13px] text-muted">
        Changes and comments will show up here.
      </p>
    );
  }
  return (
    <ul className="flex flex-col divide-y divide-line">
      {rows.map(({ entry, text }) => (
        <li key={entry.id}>
          <Link
            href={`/w/${entry.workspaceId}/p/${entry.projectId}?item=${entry.itemId}`}
            className="block px-4 py-2.5 hover:bg-surface-2/60"
          >
            <p className="truncate text-[13px] font-medium">{entry.itemTitle}</p>
            <p className="line-clamp-2 text-xs text-muted">
              {entry.userId ? `${entry.userName ?? "Someone"} ` : ""}
              {text}
            </p>
            <p className="mt-0.5 text-[11px] text-faint">
              {entry.projectName} ·{" "}
              {formatDistanceToNowStrict(new Date(entry.createdAt), { addSuffix: true })}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-5 md:px-8 md:py-7">
      <div className="skeleton h-7 w-64" />
      <div className="skeleton h-8 w-80" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-[104px] rounded-xl" />
        ))}
      </div>
      <div className="skeleton h-72 rounded-xl" />
    </div>
  );
}
