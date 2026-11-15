"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { format, parseISO, startOfWeek } from "date-fns";
import { AlertTriangle, ChevronLeft, ChevronRight, Loader } from "lucide-react";
import { DashboardSkeleton } from "@/components/dashboard/dashboard";
import { LabelChips } from "@/components/project/labels";
import { PriorityIcon } from "@/components/project/pickers";
import { useApp } from "@/components/shell/app-context";
import { Dot } from "@/components/ui/bits";
import { Button } from "@/components/ui/button";
import { useToday } from "@/lib/client";
import { colorVar } from "@/lib/colors";
import { addDaysTo, formatShort, toDateString } from "@/lib/dates";
import type { DashboardItem, LabelLite } from "@/lib/types";
import { cn } from "@/lib/utils";

const card = "rounded-xl border border-line bg-surface shadow-card";

function itemHref(item: { workspaceId: string; projectId: string; id: string }) {
  return `/w/${item.workspaceId}/p/${item.projectId}?item=${item.id}`;
}

function mondayOf(value: string): string {
  return toDateString(startOfWeek(parseISO(value), { weekStartsOn: 1 }));
}

/**
 * Everything that is yours this week, across every workspace: what is
 * overdue, what is due each day, and what you are in the middle of.
 */
export function MyWeek({
  items,
  labels,
  userId,
}: {
  items: DashboardItem[];
  labels: LabelLite[];
  userId: string;
}) {
  const today = useToday();
  const { workspaces } = useApp();
  const [offset, setOffset] = useState(0);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  const week = useMemo(() => {
    if (!today) return null;
    const monday = addDaysTo(mondayOf(today), offset * 7);
    const days = Array.from({ length: 7 }, (_, i) => addDaysTo(monday, i));
    const sunday = days[6];
    const mine = items.filter(
      (i) =>
        (i.assigneeId === userId || i.assigneeId === null) &&
        (!workspaceId || i.workspaceId === workspaceId),
    );
    const open = mine.filter((i) => !i.completedAt);
    const byDay = new Map(days.map((d) => [d, [] as DashboardItem[]]));
    for (const item of mine) {
      if (item.dueDate && byDay.has(item.dueDate)) byDay.get(item.dueDate)!.push(item);
    }
    for (const list of byDay.values()) {
      list.sort(
        (a, b) =>
          Number(Boolean(a.completedAt)) - Number(Boolean(b.completedAt)) ||
          rank(b.priority) - rank(a.priority),
      );
    }
    return {
      monday,
      sunday,
      days,
      byDay,
      overdue: offset === 0 ? open.filter((i) => i.dueDate && i.dueDate < today) : [],
      inProgress: open.filter(
        (i) => i.statusCategory === "active" && (!i.dueDate || i.dueDate > sunday),
      ),
      dueCount: open.filter((i) => i.dueDate && i.dueDate >= monday && i.dueDate <= sunday).length,
      doneCount: mine.filter(
        (i) =>
          i.completedAt &&
          toDateString(new Date(i.completedAt)) >= monday &&
          toDateString(new Date(i.completedAt)) <= sunday,
      ).length,
    };
  }, [items, today, offset, userId, workspaceId]);

  if (!today || !week) return <DashboardSkeleton />;

  return (
    <div className="thin-scroll h-full overflow-y-auto">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-5 md:px-8 md:py-7">
        <header className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold tracking-tight">My week</h1>
            <p className="text-[13px] text-muted">
              {formatShort(week.monday)} to {formatShort(week.sunday)} · {week.dueCount} due
              {week.doneCount ? ` · ${week.doneCount} done` : ""}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" aria-label="Previous week" onClick={() => setOffset(offset - 1)}>
              <ChevronLeft size={15} />
            </Button>
            <Button size="sm" onClick={() => setOffset(0)} disabled={offset === 0}>
              This week
            </Button>
            <Button size="sm" variant="ghost" aria-label="Next week" onClick={() => setOffset(offset + 1)}>
              <ChevronRight size={15} />
            </Button>
          </div>
        </header>

        <nav className="flex flex-wrap gap-1.5" aria-label="Workspace">
          <Scope active={!workspaceId} onClick={() => setWorkspaceId(null)} label="All" />
          {workspaces.map((ws) => (
            <Scope
              key={ws.id}
              active={workspaceId === ws.id}
              onClick={() => setWorkspaceId(ws.id)}
              label={ws.name}
              color={ws.color}
            />
          ))}
        </nav>

        {week.overdue.length > 0 || week.inProgress.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2">
            {week.overdue.length > 0 ? (
              <section className={card}>
                <h2 className="flex items-center gap-2 border-b border-line px-4 py-2.5 text-[13px] font-semibold text-danger">
                  <AlertTriangle size={14} /> Overdue ({week.overdue.length})
                </h2>
                <ItemList items={week.overdue} labels={labels} today={today} showDate />
              </section>
            ) : null}
            {week.inProgress.length > 0 ? (
              <section className={card}>
                <h2 className="flex items-center gap-2 border-b border-line px-4 py-2.5 text-[13px] font-semibold text-muted">
                  <Loader size={14} /> In progress, not due this week ({week.inProgress.length})
                </h2>
                <ItemList items={week.inProgress} labels={labels} today={today} showDate />
              </section>
            ) : null}
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          {week.days.map((day) => {
            const list = week.byDay.get(day) ?? [];
            const isToday = day === today;
            const past = day < today;
            return (
              <section
                key={day}
                className={cn(
                  card,
                  "flex min-h-40 flex-col",
                  isToday && "border-accent ring-2 ring-[var(--ring)]",
                  past && !isToday && "opacity-80",
                )}
              >
                <h2 className="flex items-baseline gap-1.5 border-b border-line px-3 py-2 whitespace-nowrap">
                  <span className={cn("text-[13px] font-semibold", isToday && "text-accent")}>
                    {format(parseISO(day), "EEE")}
                  </span>
                  <span className="text-xs text-faint">{format(parseISO(day), "MMM d")}</span>
                  <span className="flex-1" />
                  {list.length ? (
                    <span className="text-xs text-faint tabular-nums">{list.length}</span>
                  ) : null}
                </h2>
                {list.length ? (
                  <ItemList items={list} labels={labels} today={today} compact />
                ) : (
                  <p className="px-3 py-4 text-xs text-faint">Nothing due.</p>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function rank(priority: string): number {
  return { urgent: 4, high: 3, medium: 2, low: 1, none: 0 }[priority] ?? 0;
}

function Scope({
  active,
  onClick,
  label,
  color,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  color?: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex h-7 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium",
        active
          ? "border-transparent bg-ink text-bg"
          : "border-line bg-surface text-muted hover:text-ink",
      )}
    >
      {color ? (
        <span aria-hidden style={{ background: colorVar(color) }} className="h-2 w-2 rounded-full" />
      ) : null}
      {label}
    </button>
  );
}

function ItemList({
  items,
  labels,
  today,
  compact,
  showDate,
}: {
  items: DashboardItem[];
  labels: LabelLite[];
  today: string;
  compact?: boolean;
  showDate?: boolean;
}) {
  return (
    <ul className="flex flex-col divide-y divide-line">
      {items.map((item) => (
        <li key={item.id}>
          <Link
            href={itemHref(item)}
            className={cn("flex flex-col gap-1 hover:bg-surface-2/60", compact ? "px-3 py-2" : "px-4 py-2.5")}
          >
            <span className="flex items-start gap-1.5">
              {item.priority !== "none" ? (
                <span className="mt-0.5 shrink-0">
                  <PriorityIcon value={item.priority} size={12} />
                </span>
              ) : null}
              <span
                className={cn(
                  "min-w-0 flex-1 text-[13px] leading-snug font-medium break-words",
                  item.completedAt && "text-muted line-through",
                )}
              >
                {item.title}
              </span>
            </span>
            <span className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-faint">
              <Dot color={item.projectColor} className="h-2 w-2" />
              <span className="truncate">{item.projectName}</span>
              {showDate && item.dueDate ? (
                <span className={cn(item.dueDate < today && !item.completedAt && "text-danger")}>
                  · {formatShort(item.dueDate)}
                </span>
              ) : null}
            </span>
            <LabelChips ids={item.labelIds} labels={labels} max={compact ? 2 : 3} />
          </Link>
        </li>
      ))}
    </ul>
  );
}
