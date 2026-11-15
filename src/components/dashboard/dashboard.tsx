"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { formatDistanceToNowStrict } from "date-fns";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AlertTriangle,
  CalendarCheck,
  Check,
  CheckCircle2,
  ChevronDown,
  Columns2,
  GripVertical,
  LayoutDashboard,
  Loader,
  Plus,
  RotateCcw,
  Square,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { resetDashboard, saveDashboard } from "@/actions";
import { describeActivity } from "@/components/project/item-panel";
import { DueChip, RepeatBadge } from "@/components/project/pickers";
import { useApp } from "@/components/shell/app-context";
import { Dot, EmptyState, Pill } from "@/components/ui/bits";
import { Button } from "@/components/ui/button";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/overlays";
import { clientId, useToday } from "@/lib/client";
import { colorFg, colorVar } from "@/lib/colors";
import { addDaysTo, formatShort, parseDate, toDateString } from "@/lib/dates";
import {
  PRIORITIES,
  type DashboardActivity,
  type DashboardItem,
  type DashboardProjectCount,
  type LabelLite,
  type ProjectLite,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  WIDGETS,
  defaultWidgets,
  widgetMeta,
  type DashboardWidget,
  type WidgetType,
} from "@/lib/widgets";
import { BarList, ColumnChart, Legend, LineChart, type LineSeries } from "./charts";

type Filter = "next" | "today" | "overdue" | "active" | "done" | { day: string };

const card = "rounded-xl border border-line bg-surface shadow-card";

/** How many weeks the weekly charts cover. Matches DASHBOARD_WEEKS in data.ts. */
const WEEKS = 8;

function itemHref(item: { workspaceId: string; projectId: string; id: string }) {
  return `/w/${item.workspaceId}/p/${item.projectId}?item=${item.id}`;
}

type Stats = {
  open: DashboardItem[];
  dueToday: DashboardItem[];
  overdue: DashboardItem[];
  active: DashboardItem[];
  done: DashboardItem[];
};

const byDue = (a: DashboardItem, b: DashboardItem) =>
  (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") ||
  a.createdAt.localeCompare(b.createdAt);

/**
 * A dashboard is a grid of widgets the person picks and arranges: counters,
 * lists, project progress and charts. The home dashboard covers every
 * workspace; each workspace has its own. Layouts are saved per person.
 */
export function Dashboard({
  workspaceId,
  items,
  activity,
  projectCounts,
  labels,
  widgets: savedWidgets,
}: {
  workspaceId: string | null;
  items: DashboardItem[];
  activity: DashboardActivity[];
  projectCounts: DashboardProjectCount[];
  labels: LabelLite[];
  widgets: DashboardWidget[];
}) {
  const { user, workspaces, projects, openNewProject } = useApp();
  const today = useToday();
  const [filter, setFilter] = useState<Filter>("next");
  const [widgets, setWidgets] = useState(savedWidgets);
  const [editing, setEditing] = useState(false);
  const [, startTransition] = useTransition();

  const scopeProjects = workspaceId
    ? projects.filter((p) => p.workspaceId === workspaceId)
    : projects;
  const workspace = workspaces.find((w) => w.id === workspaceId);

  const stats = useMemo<Stats | null>(() => {
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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (!today || !stats) return <DashboardSkeleton />;

  function save(next: DashboardWidget[]) {
    setWidgets(next);
    startTransition(async () => {
      const result = await saveDashboard({ workspaceId, widgets: next });
      if (!result.ok) toast.error(result.error);
    });
  }

  function reset() {
    setWidgets(defaultWidgets());
    startTransition(async () => {
      const result = await resetDashboard({ workspaceId });
      if (!result.ok) toast.error(result.error);
    });
  }

  function addWidget(type: WidgetType) {
    const meta = widgetMeta(type);
    if (!meta) return;
    save([...widgets, { id: clientId(10), type, size: meta.size, projectId: null }]);
  }

  function updateWidget(id: string, change: Partial<DashboardWidget>) {
    save(widgets.map((w) => (w.id === id ? { ...w, ...change } : w)));
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = widgets.findIndex((w) => w.id === active.id);
    const to = widgets.findIndex((w) => w.id === over.id);
    if (from < 0 || to < 0) return;
    save(arrayMove(widgets, from, to));
  }

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const firstName = user.name.split(" ")[0] || user.name;

  const ctx: WidgetContext = {
    workspaceId,
    items,
    stats,
    today,
    filter,
    setFilter,
    activity,
    projectCounts,
    labels,
    scopeProjects,
    openNewProject: () => openNewProject(workspaceId ?? undefined),
  };

  const present = new Set(widgets.map((w) => w.type));

  return (
    <div className="thin-scroll h-full overflow-y-auto">
      <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-5 md:px-8 md:py-7">
        <header className="flex flex-col gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">
                {workspace ? workspace.name : `${greeting}, ${firstName}`}
              </h1>
              <p className="text-[13px] text-muted">
                {formatShort(today)}
                {workspace ? "" : " · everything across your workspaces"}
              </p>
            </div>
            {scopeProjects.length > 0 ? (
              editing ? (
                <div className="flex flex-wrap items-center gap-2">
                  <AddWidgetMenu present={present} onAdd={addWidget} />
                  <Button variant="ghost" size="sm" onClick={reset}>
                    <RotateCcw size={14} /> Reset
                  </Button>
                  <Button variant="primary" size="sm" onClick={() => setEditing(false)}>
                    <Check size={14} /> Done
                  </Button>
                </div>
              ) : (
                <Button size="sm" onClick={() => setEditing(true)}>
                  <LayoutDashboard size={14} /> Customize
                </Button>
              )
            ) : null}
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
        ) : widgets.length === 0 ? (
          <EmptyState
            title="This dashboard is empty"
            body="Add widgets for the lists and charts you want to see here."
            action={
              <div className="flex gap-2">
                <AddWidgetMenu present={present} onAdd={addWidget} primary />
                <Button onClick={reset}>Use the default</Button>
              </div>
            }
          />
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={widgets.map((w) => w.id)} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
                {widgets.map((w) => (
                  <WidgetFrame
                    key={w.id}
                    widget={w}
                    editing={editing}
                    ctx={ctx}
                    projects={scopeProjects}
                    onChange={(change) => updateWidget(w.id, change)}
                    onRemove={() => save(widgets.filter((x) => x.id !== w.id))}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
}

type WidgetContext = {
  workspaceId: string | null;
  items: DashboardItem[];
  stats: Stats;
  today: string;
  filter: Filter;
  setFilter: (filter: Filter) => void;
  activity: DashboardActivity[];
  projectCounts: DashboardProjectCount[];
  labels: LabelLite[];
  scopeProjects: ProjectLite[];
  openNewProject: () => void;
};

function AddWidgetMenu({
  present,
  onAdd,
  primary,
}: {
  present: Set<string>;
  onAdd: (type: WidgetType) => void;
  primary?: boolean;
}) {
  const groups = ["Overview", "Lists", "Charts"] as const;
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button variant={primary ? "primary" : "secondary"} size={primary ? "md" : "sm"}>
          <Plus size={14} /> Add widget
        </Button>
      </MenuTrigger>
      <MenuContent align="end" className="w-72">
        {groups.map((group, gi) => (
          <div key={group}>
            {gi > 0 ? <MenuSeparator /> : null}
            <MenuLabel>{group}</MenuLabel>
            {WIDGETS.filter((w) => w.group === group).map((w) => {
              // Lists and charts can be added again for another project.
              const taken = present.has(w.type) && !w.perProject;
              return (
                <MenuItem
                  key={w.type}
                  disabled={taken}
                  onSelect={() => onAdd(w.type)}
                  className="h-auto items-start py-1.5 data-[disabled]:opacity-50"
                >
                  <span className="flex flex-col">
                    <span className="font-medium">
                      {w.name}
                      {taken ? <span className="ml-1.5 font-normal text-faint">added</span> : null}
                    </span>
                    <span className="text-xs text-muted">{w.description}</span>
                  </span>
                </MenuItem>
              );
            })}
          </div>
        ))}
      </MenuContent>
    </Menu>
  );
}

function WidgetFrame({
  widget,
  editing,
  ctx,
  projects,
  onChange,
  onRemove,
}: {
  widget: DashboardWidget;
  editing: boolean;
  ctx: WidgetContext;
  projects: ProjectLite[];
  onChange: (change: Partial<DashboardWidget>) => void;
  onRemove: () => void;
}) {
  const meta = widgetMeta(widget.type);
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: widget.id, disabled: !editing });
  if (!meta) return null;

  const project = widget.projectId ? projects.find((p) => p.id === widget.projectId) : undefined;
  const view = renderWidget(widget.type as WidgetType, ctx, project);

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

  const controls = editing ? (
    <div className="flex items-center gap-0.5">
      {meta.perProject ? (
        <Menu>
          <MenuTrigger asChild>
            <Button variant="ghost" size="sm" className="max-w-40 px-2 text-xs">
              <span className="truncate">{project ? project.name : "All projects"}</span>
              <ChevronDown size={12} />
            </Button>
          </MenuTrigger>
          <MenuContent align="end" className="max-h-80 overflow-y-auto">
            <MenuItem onSelect={() => onChange({ projectId: null })}>
              All projects
              {!project ? <Check size={14} className="ml-auto" /> : null}
            </MenuItem>
            <MenuSeparator />
            {projects.map((p) => (
              <MenuItem key={p.id} onSelect={() => onChange({ projectId: p.id })}>
                <Dot color={p.color} />
                <span className="truncate">{p.name}</span>
                {project?.id === p.id ? <Check size={14} className="ml-auto" /> : null}
              </MenuItem>
            ))}
          </MenuContent>
        </Menu>
      ) : null}
      <Button
        variant="ghost"
        size="icon"
        aria-label={widget.size === "full" ? "Make narrow" : "Make wide"}
        title={widget.size === "full" ? "Make narrow" : "Make wide"}
        onClick={() => onChange({ size: widget.size === "full" ? "half" : "full" })}
        className="max-lg:hidden"
      >
        {widget.size === "full" ? <Columns2 size={14} /> : <Square size={14} />}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Remove ${meta.name}`}
        title="Remove"
        onClick={onRemove}
      >
        <X size={14} />
      </Button>
    </div>
  ) : null;

  const handle = editing ? (
    <button
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      aria-label={`Move ${meta.name}`}
      className="-ml-1.5 flex h-7 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded text-faint hover:bg-surface-2 hover:text-ink active:cursor-grabbing"
    >
      <GripVertical size={15} />
    </button>
  ) : null;

  const span = widget.size === "full" ? "lg:col-span-2" : "";

  // The counters are four cards of their own; in edit mode they get a frame.
  if (view.bare && !editing) {
    return (
      <div ref={setNodeRef} style={style} className={span}>
        {view.body}
      </div>
    );
  }

  return (
    <section
      ref={setNodeRef}
      style={style}
      aria-label={meta.name}
      className={cn(
        view.bare ? "rounded-xl border border-dashed border-line-strong p-3" : card,
        "flex min-w-0 flex-col",
        span,
        editing && "ring-accent/30 hover:ring-2",
        isDragging && "relative z-10 shadow-pop",
      )}
    >
      <div
        className={cn(
          "flex min-h-11 items-center gap-2",
          view.bare ? "mb-2" : "border-b border-line px-4",
        )}
      >
        {handle}
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">
          {view.title ?? meta.name}
          {view.count !== undefined ? (
            <span className="ml-2 font-normal text-faint tabular-nums">{view.count}</span>
          ) : null}
          {project && !editing ? (
            <span className="ml-2 text-xs font-normal text-muted">{project.name}</span>
          ) : null}
        </h2>
        {controls ?? view.action}
      </div>
      <div className={cn("min-w-0 flex-1", editing && "pointer-events-none select-none")}>
        {view.body}
      </div>
    </section>
  );
}

type WidgetView = {
  title?: string;
  count?: number;
  action?: ReactNode;
  body: ReactNode;
  bare?: boolean;
};

function renderWidget(
  type: WidgetType,
  ctx: WidgetContext,
  project: ProjectLite | undefined,
): WidgetView {
  const { stats, today, filter, setFilter } = ctx;
  const scoped = project ? ctx.items.filter((i) => i.projectId === project.id) : ctx.items;
  const open = scoped.filter((i) => !i.completedAt);
  const toggle = (f: Exclude<Filter, { day: string }>) => setFilter(filter === f ? "next" : f);

  switch (type) {
    case "counters":
      return {
        bare: true,
        body: (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="At a glance">
            <Counter
              label="Due today"
              value={stats.dueToday.length}
              hint="Open the list"
              icon={<CalendarCheck size={16} />}
              tone={stats.dueToday.length ? "accent" : "quiet"}
              active={filter === "today"}
              onClick={() => toggle("today")}
            />
            <Counter
              label="Overdue"
              value={stats.overdue.length}
              hint={stats.overdue.length ? "Needs a new date or a push" : "Nothing is late"}
              icon={<AlertTriangle size={16} />}
              tone={stats.overdue.length ? "danger" : "quiet"}
              active={filter === "overdue"}
              onClick={() => toggle("overdue")}
            />
            <Counter
              label="In progress"
              value={stats.active.length}
              hint="Started, not finished"
              icon={<Loader size={16} />}
              tone="quiet"
              active={filter === "active"}
              onClick={() => toggle("active")}
            />
            <Counter
              label="Done this week"
              value={stats.done.length}
              hint="Finished in the last 7 days"
              icon={<CheckCircle2 size={16} />}
              tone={stats.done.length ? "good" : "quiet"}
              active={filter === "done"}
              onClick={() => toggle("done")}
            />
          </div>
        ),
      };

    case "work-list": {
      let title = "Up next";
      let list: DashboardItem[] = [...stats.open].sort(byDue);
      if (filter === "today") {
        title = "Due today";
        list = stats.dueToday;
      } else if (filter === "overdue") {
        title = "Overdue";
        list = [...stats.overdue].sort(byDue);
      } else if (filter === "active") {
        title = "In progress";
        list = [...stats.active].sort(byDue);
      } else if (filter === "done") {
        title = "Done in the last 7 days";
        list = [...stats.done].sort((a, b) =>
          (b.completedAt ?? "").localeCompare(a.completedAt ?? ""),
        );
      } else if (typeof filter === "object") {
        title = `Due ${formatShort(filter.day)}`;
        list = stats.open.filter((i) => i.dueDate === filter.day);
      }
      return {
        title,
        count: list.length,
        action:
          filter !== "next" ? (
            <button
              onClick={() => setFilter("next")}
              className="text-xs text-muted hover:text-ink"
            >
              Show everything
            </button>
          ) : undefined,
        body: <WorkList items={list} today={today} showWorkspace={!ctx.workspaceId} />,
      };
    }

    case "due-soon": {
      const end = addDaysTo(today, 7);
      const list = open.filter((i) => i.dueDate && i.dueDate >= today && i.dueDate <= end).sort(byDue);
      return {
        count: list.length,
        body: (
          <WorkList
            items={list}
            today={today}
            showWorkspace={!ctx.workspaceId}
            empty="Nothing due in the next 7 days."
          />
        ),
      };
    }

    case "overdue": {
      const list = open.filter((i) => i.dueDate && i.dueDate < today).sort(byDue);
      return {
        count: list.length,
        body: (
          <WorkList
            items={list}
            today={today}
            showWorkspace={!ctx.workspaceId}
            empty="Nothing is late."
          />
        ),
      };
    }

    case "two-weeks":
      return {
        body: (
          <TwoWeeks
            items={stats.open}
            today={today}
            selected={typeof filter === "object" ? filter.day : null}
            onSelect={(day) =>
              setFilter(typeof filter === "object" && filter.day === day ? "next" : { day })
            }
          />
        ),
      };

    case "projects":
      return {
        action: (
          <button
            onClick={ctx.openNewProject}
            className="flex items-center gap-1 text-xs text-muted hover:text-ink"
          >
            <Plus size={13} /> New
          </button>
        ),
        body: (
          <ul className="flex flex-col divide-y divide-line">
            {ctx.scopeProjects.map((p) => (
              <ProjectRow
                key={p.id}
                project={p}
                items={ctx.items.filter((i) => i.projectId === p.id)}
                counts={ctx.projectCounts.find((c) => c.projectId === p.id)}
                today={today}
              />
            ))}
          </ul>
        ),
      };

    case "activity":
      return { body: <ActivityList entries={ctx.activity} today={today} /> };

    case "by-status": {
      const rank = { todo: 0, active: 1, done: 2 } as const;
      const groups = new Map<string, { label: string; color: string; value: number; sort: number[] }>();
      for (const i of open) {
        const key = i.statusName.trim().toLowerCase();
        const g = groups.get(key);
        if (g) g.value += 1;
        else
          groups.set(key, {
            label: i.statusName,
            color: i.statusColor,
            value: 1,
            sort: [rank[i.statusCategory], i.statusPosition],
          });
      }
      const data = [...groups.entries()]
        .sort(([, a], [, b]) => a.sort[0] - b.sort[0] || a.sort[1] - b.sort[1])
        .map(([key, g]) => ({ key, label: g.label, color: g.color, value: g.value }));
      return {
        count: open.length,
        body: <BarList data={data} empty="No open items." />,
      };
    }

    case "by-priority": {
      const data = PRIORITIES.map((p) => ({
        key: p.value,
        label: p.label,
        color: p.color,
        value: open.filter((i) => i.priority === p.value).length,
      }));
      return {
        count: open.length,
        body: <BarList data={data} empty="No open items." />,
      };
    }

    case "by-label": {
      const workspaceIds = new Set(
        project ? [project.workspaceId] : ctx.scopeProjects.map((p) => p.workspaceId),
      );
      const scopeLabels = ctx.labels.filter((l) => workspaceIds.has(l.workspaceId));
      const data = scopeLabels
        .map((l) => ({
          key: l.id,
          label: l.name,
          color: l.color,
          value: open.filter((i) => i.labelIds.includes(l.id)).length,
        }))
        .filter((d) => d.value > 0)
        .sort((a, b) => b.value - a.value);
      const none = open.filter((i) => i.labelIds.length === 0).length;
      if (none) data.push({ key: "none", label: "No label", color: "gray", value: none });
      return {
        count: open.length,
        body: (
          <BarList
            data={data}
            total={open.length}
            empty={scopeLabels.length ? "No open items." : "No labels yet. Add them from a project's menu."}
          />
        ),
      };
    }

    case "done-per-week": {
      const monday = startOfWeek(today);
      const weeks = Array.from({ length: WEEKS }, (_, i) => addDaysTo(monday, (i - WEEKS + 1) * 7));
      const doneDays = scoped
        .filter((i) => i.completedAt)
        .map((i) => toDateString(new Date(i.completedAt as string)));
      const data = weeks.map((start, i) => {
        const end = addDaysTo(start, 6);
        const last = i === weeks.length - 1;
        return {
          key: start,
          label: last ? "This wk" : monthDay(start),
          detail: last ? "This week" : `Week of ${monthDay(start)}`,
          value: doneDays.filter((d) => d >= start && d <= end).length,
        };
      });
      const total = data.reduce((n, d) => n + d.value, 0);
      return {
        count: total,
        body: <ColumnChart data={data} unit="done" />,
      };
    }

    case "burn-up": {
      const start = addDaysTo(today, -(WEEKS * 7 - 1));
      const days = Array.from({ length: WEEKS * 7 }, (_, i) => addDaysTo(start, i));
      const created = scoped.map((i) => toDateString(new Date(i.createdAt)));
      const done = scoped.map((i) => (i.completedAt ? toDateString(new Date(i.completedAt)) : null));
      const series: LineSeries[] = [
        {
          key: "scope",
          name: "In scope",
          color: "var(--c-teal)",
          dashed: true,
          values: days.map((d) => created.filter((c) => c <= d).length),
        },
        {
          key: "done",
          name: "Done",
          color: "var(--accent)",
          values: days.map((d) => done.filter((c) => c !== null && c <= d).length),
        },
      ];
      const remaining = open.length;
      return {
        title: "Burn-up",
        action: <span className="text-xs text-muted tabular-nums">{remaining} left</span>,
        body: (
          <>
            <Legend series={series} />
            <LineChart days={days} dayLabel={monthDay} series={series} />
          </>
        ),
      };
    }
  }
}

/** "Nov 9": short enough for a chart axis. */
function monthDay(day: string): string {
  return parseDate(day).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Monday of the week that holds `day`. */
function startOfWeek(day: string): string {
  const weekday = (parseDate(day).getDay() + 6) % 7;
  return addDaysTo(day, -weekday);
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
  empty = "Nothing here. Nice.",
}: {
  items: DashboardItem[];
  today: string;
  showWorkspace: boolean;
  empty?: string;
}) {
  const { workspaces } = useApp();
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, 10);

  if (items.length === 0) {
    return <p className="px-4 py-8 text-center text-[13px] text-muted">{empty}</p>;
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
  counts,
  today,
}: {
  project: { id: string; workspaceId: string; name: string; color: string };
  items: DashboardItem[];
  counts: DashboardProjectCount | undefined;
  today: string;
}) {
  const open = items.filter((i) => !i.completedAt);
  const active = open.filter((i) => i.statusCategory === "active").length;
  // Progress is all-time: everything ever finished against everything in the project.
  const totalCount = counts?.total ?? items.length;
  const done = counts?.done ?? items.length - open.length;
  const todo = Math.max(0, totalCount - done - active);
  const overdue = open.filter((i) => i.dueDate && i.dueDate < today).length;
  const soon = open.filter(
    (i) =>
      i.statusCategory === "todo" &&
      i.dueDate &&
      i.dueDate >= today &&
      i.dueDate <= addDaysTo(today, 2),
  ).length;
  const total = Math.max(1, totalCount);
  const percent = Math.round((done / total) * 100);

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
          {totalCount > 0 ? (
            <span className="text-xs text-muted tabular-nums">{percent}%</span>
          ) : null}
          {open.length > 0 ? (
            <Pill color={health.color} soft className="h-5 px-2 text-[11px]">
              {health.label}
            </Pill>
          ) : null}
        </span>
        <span
          className="flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-surface-2"
          role="img"
          aria-label={`${done} done, ${active} in progress, ${todo} not started`}
        >
          {done ? (
            <span style={{ width: `${(done / total) * 100}%`, background: "var(--c-green)" }} />
          ) : null}
          {active ? (
            <span style={{ width: `${(active / total) * 100}%`, background: "var(--c-blue)" }} />
          ) : null}
        </span>
        <span className="text-xs text-faint">
          {totalCount === 0
            ? "No items yet"
            : open.length === 0
            ? `All ${done} done`
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
