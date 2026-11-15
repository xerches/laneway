"use client";

import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { format, parseISO, startOfWeek } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { colorFg, colorVar } from "@/lib/colors";
import { addDaysTo, daysBetween, formatShort, toDateString } from "@/lib/dates";
import type { ItemLite } from "@/lib/types";
import { cn } from "@/lib/utils";
import { LabelChips } from "./labels";
import { useProject } from "./store";

type Zoom = "weeks" | "months";

const ZOOMS: Record<Zoom, { dayWidth: number; days: number; step: number; label: string }> = {
  weeks: { dayWidth: 36, days: 7 * 8, step: 14, label: "Weeks" },
  months: { dayWidth: 12, days: 7 * 30, step: 56, label: "Months" },
};

const ROW = 38;
const SIDE = 240;

type Span = { start: string; end: string };
type Mode = "move" | "start" | "end";

/** Where an item sits on the timeline: its start to its due date. */
function spanOf(item: ItemLite): Span | null {
  const start = item.startDate ?? item.dueDate;
  const end = item.dueDate ?? item.startDate;
  if (!start || !end) return null;
  return start <= end ? { start, end } : { start: end, end: start };
}

function mondayOf(value: string): string {
  return toDateString(startOfWeek(parseISO(value), { weekStartsOn: 1 }));
}

/**
 * A Gantt chart of every item with dates. Drag a bar to move it, or drag
 * either end to change its start or due date.
 */
export function TimelineView({ onOpen }: { onOpen: (id: string) => void }) {
  const { visibleItems, statuses, labels, today, changeItem, project } = useProject();
  const [zoom, setZoom] = useState<Zoom>("weeks");
  const [from, setFrom] = useState(() => addDaysTo(mondayOf(today), -7));
  const [preview, setPreview] = useState<{ id: string; span: Span } | null>(null);
  const drag = useRef<{
    id: string;
    mode: Mode;
    x: number;
    span: Span;
    moved: boolean;
  } | null>(null);

  const { dayWidth, days, step } = ZOOMS[zoom];
  const width = days * dayWidth;
  const to = addDaysTo(from, days - 1);
  const statusById = useMemo(() => new Map(statuses.map((s) => [s.id, s])), [statuses]);

  const { scheduled, unscheduled } = useMemo(() => {
    const withSpan: { item: ItemLite; span: Span }[] = [];
    const without: ItemLite[] = [];
    for (const item of visibleItems) {
      const span = spanOf(item);
      if (span) withSpan.push({ item, span });
      else without.push(item);
    }
    withSpan.sort(
      (a, b) =>
        a.span.start.localeCompare(b.span.start) ||
        a.span.end.localeCompare(b.span.end) ||
        a.item.number - b.item.number,
    );
    return { scheduled: withSpan, unscheduled: without };
  }, [visibleItems]);

  const dayList = useMemo(
    () => Array.from({ length: days }, (_, i) => addDaysTo(from, i)),
    [from, days],
  );

  const months = useMemo(() => {
    const out: { key: string; label: string; left: number; width: number }[] = [];
    for (const [index, day] of dayList.entries()) {
      const key = day.slice(0, 7);
      const last = out[out.length - 1];
      if (last && last.key === key) last.width += dayWidth;
      else out.push({ key, label: format(parseISO(day), "MMMM yyyy"), left: index * dayWidth, width: dayWidth });
    }
    return out;
  }, [dayList, dayWidth]);

  function begin(event: ReactPointerEvent, item: ItemLite, span: Span, mode: Mode) {
    if (event.button !== 0) return;
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    drag.current = { id: item.id, mode, x: event.clientX, span, moved: false };
  }

  function move(event: ReactPointerEvent) {
    const d = drag.current;
    if (!d) return;
    const delta = Math.round((event.clientX - d.x) / dayWidth);
    if (delta !== 0) d.moved = true;
    if (!d.moved) return;
    let next: Span;
    if (d.mode === "move") {
      next = { start: addDaysTo(d.span.start, delta), end: addDaysTo(d.span.end, delta) };
    } else if (d.mode === "start") {
      const start = addDaysTo(d.span.start, delta);
      next = { start: start > d.span.end ? d.span.end : start, end: d.span.end };
    } else {
      const end = addDaysTo(d.span.end, delta);
      next = { start: d.span.start, end: end < d.span.start ? d.span.start : end };
    }
    setPreview({ id: d.id, span: next });
  }

  function end(item: ItemLite) {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (!d.moved) {
      setPreview(null);
      onOpen(item.id);
      return;
    }
    const next = preview?.id === item.id ? preview.span : null;
    setPreview(null);
    if (!next) return;
    if (next.start === d.span.start && next.end === d.span.end) return;

    // Keep a one-date item a one-date item when it is only moved.
    if (d.mode === "move" && !item.startDate) {
      changeItem(item.id, { dueDate: next.end });
    } else if (d.mode === "move" && !item.dueDate) {
      changeItem(item.id, { startDate: next.start });
    } else {
      changeItem(item.id, { startDate: next.start, dueDate: next.end });
    }
  }

  const todayLeft = daysBetween(from, today) * dayWidth;
  const showToday = today >= from && today <= to;

  return (
    <div className="flex h-full min-h-0 flex-col px-4 pb-4 md:px-6">
      <div className="flex shrink-0 flex-wrap items-center gap-2 pb-2">
        <Button size="sm" variant="ghost" aria-label="Earlier" onClick={() => setFrom(addDaysTo(from, -step))}>
          <ChevronLeft size={15} />
        </Button>
        <Button size="sm" onClick={() => setFrom(addDaysTo(mondayOf(today), zoom === "weeks" ? -7 : -28))}>
          Today
        </Button>
        <Button size="sm" variant="ghost" aria-label="Later" onClick={() => setFrom(addDaysTo(from, step))}>
          <ChevronRight size={15} />
        </Button>
        <span className="text-[13px] text-muted">
          {formatShort(from)} to {formatShort(to)}
        </span>
        <span className="flex-1" />
        <div className="flex rounded-md border border-line p-0.5" role="radiogroup" aria-label="Zoom">
          {(Object.keys(ZOOMS) as Zoom[]).map((z) => (
            <button
              key={z}
              role="radio"
              aria-checked={zoom === z}
              onClick={() => {
                setZoom(z);
                setFrom(addDaysTo(mondayOf(today), z === "weeks" ? -7 : -28));
              }}
              className={cn(
                "h-6 rounded px-2 text-xs font-medium",
                zoom === z ? "bg-surface-2 text-ink" : "text-muted hover:text-ink",
              )}
            >
              {ZOOMS[z].label}
            </button>
          ))}
        </div>
      </div>

      <div className="thin-scroll min-h-0 flex-1 overflow-auto rounded-lg border border-line bg-surface">
        <div style={{ width: SIDE + width }} className="relative">
          {/* Header */}
          <div className="sticky top-0 z-20 flex border-b border-line bg-surface">
            <div
              style={{ width: SIDE }}
              className="sticky left-0 z-10 flex shrink-0 items-end border-r border-line bg-surface px-3 pb-1.5 text-xs font-semibold text-muted"
            >
              {scheduled.length} with dates
            </div>
            <div style={{ width }} className="relative h-12 shrink-0">
              {months.map((m) => (
                <div
                  key={m.key}
                  style={{ left: m.left, width: m.width }}
                  className="absolute top-0 h-6 truncate border-l border-line px-1.5 pt-1 text-[11px] font-semibold text-muted"
                >
                  {m.width > 60 ? m.label : ""}
                </div>
              ))}
              {dayList.map((day, i) => {
                const date = parseISO(day);
                const weekday = date.getDay();
                const isMonday = weekday === 1;
                const show = zoom === "weeks" || isMonday;
                return (
                  <div
                    key={day}
                    style={{ left: i * dayWidth, width: dayWidth }}
                    className={cn(
                      "absolute top-6 flex h-6 items-center justify-center text-[11px] tabular-nums",
                      day === today ? "font-semibold text-accent" : "text-faint",
                      zoom === "months" && "justify-start pl-0.5",
                    )}
                  >
                    {show ? (zoom === "weeks" ? `${format(date, "EEEEE")}${format(date, "d")}` : format(date, "d")) : ""}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Rows */}
          <div className="relative">
            {/* Weekend shading and the today line, behind the bars */}
            <div
              aria-hidden
              style={{ left: SIDE, width, height: Math.max(scheduled.length, 1) * ROW }}
              className="pointer-events-none absolute top-0"
            >
              {dayList.map((day, i) => {
                const weekday = parseISO(day).getDay();
                if (weekday !== 0 && weekday !== 6) return null;
                return (
                  <div
                    key={day}
                    style={{ left: i * dayWidth, width: dayWidth }}
                    className="absolute inset-y-0 bg-surface-2/60"
                  />
                );
              })}
              {showToday ? (
                <div
                  style={{ left: todayLeft + dayWidth / 2 }}
                  className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-accent/70"
                />
              ) : null}
            </div>

            {scheduled.length === 0 ? (
              <div className="flex" style={{ height: ROW * 2 }}>
                <div
                  style={{ width: SIDE }}
                  className="sticky left-0 flex shrink-0 items-center border-r border-line bg-surface px-3 text-[13px] text-faint"
                >
                  Nothing has dates yet.
                </div>
              </div>
            ) : null}

            {scheduled.map(({ item, span: saved }) => {
              const span = preview?.id === item.id ? preview.span : saved;
              const status = statusById.get(item.statusId);
              const color = status?.color ?? project.color;
              const left = daysBetween(from, span.start) * dayWidth;
              const barWidth = (daysBetween(span.start, span.end) + 1) * dayWidth;
              const done = Boolean(item.completedAt);
              const outside = span.end < from || span.start > to;
              const label = item.title;
              return (
                <div key={item.id} className="group flex border-b border-line/60" style={{ height: ROW }}>
                  <button
                    onClick={() => onOpen(item.id)}
                    style={{ width: SIDE }}
                    className="sticky left-0 z-10 flex shrink-0 items-center gap-2 border-r border-line bg-surface px-3 text-left hover:bg-surface-2"
                  >
                    <span className="text-[11px] text-faint tabular-nums">
                      {item.number > 0 ? `${project.key}-${item.number}` : ""}
                    </span>
                    <span className={cn("min-w-0 flex-1 truncate text-[13px]", done && "text-muted line-through")}>
                      {label}
                    </span>
                    <LabelChips ids={item.labelIds} labels={labels} max={1} className="shrink-0 flex-nowrap max-sm:hidden" />
                  </button>
                  <div style={{ width }} className="relative shrink-0 overflow-hidden">
                    {outside ? (
                      <span
                        className={cn(
                          "absolute top-1/2 -translate-y-1/2 text-[11px] text-faint",
                          span.end < from ? "left-1" : "right-1",
                        )}
                      >
                        {span.end < from ? "← " : ""}
                        {formatShort(span.end < from ? span.end : span.start)}
                        {span.start > to ? " →" : ""}
                      </span>
                    ) : (
                      <div
                        role="button"
                        aria-roledescription="timeline bar"
                        tabIndex={0}
                        aria-label={`${label}: ${formatShort(span.start)} to ${formatShort(span.end)}`}
                        title={`${label}\n${formatShort(span.start)} → ${formatShort(span.end)}`}
                        onPointerDown={(e) => begin(e, item, saved, "move")}
                        onPointerMove={move}
                        onPointerUp={() => end(item)}
                        onPointerCancel={() => {
                          drag.current = null;
                          setPreview(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") onOpen(item.id);
                          const delta = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
                          if (!delta) return;
                          e.preventDefault();
                          const patch: { startDate?: string; dueDate?: string } = {};
                          if (item.startDate) patch.startDate = addDaysTo(item.startDate, delta);
                          if (item.dueDate) patch.dueDate = addDaysTo(item.dueDate, delta);
                          changeItem(item.id, patch);
                        }}
                        style={{
                          left,
                          width: Math.max(barWidth, dayWidth),
                          background: colorVar(color),
                          color: colorFg(color),
                        }}
                        className={cn(
                          "absolute top-1.5 bottom-1.5 flex cursor-grab touch-none items-center rounded-md shadow-card select-none active:cursor-grabbing",
                          done && "opacity-50",
                          preview?.id === item.id && "ring-2 ring-[var(--ring)]",
                        )}
                      >
                        <span
                          aria-hidden
                          onPointerDown={(e) => begin(e, item, saved, "start")}
                          className="absolute inset-y-0 left-0 w-2 cursor-ew-resize rounded-l-md hover:bg-black/15"
                        />
                        <span className="pointer-events-none truncate px-2.5 text-xs font-medium">
                          {barWidth > 70 ? label : ""}
                        </span>
                        <span
                          aria-hidden
                          onPointerDown={(e) => begin(e, item, saved, "end")}
                          className="absolute inset-y-0 right-0 w-2 cursor-ew-resize rounded-r-md hover:bg-black/15"
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {unscheduled.length > 0 ? (
        <details className="mt-3 shrink-0 rounded-lg border border-line bg-surface">
          <summary className="cursor-pointer px-3 py-2 text-[13px] font-medium text-muted">
            No dates yet ({unscheduled.length})
          </summary>
          <ul className="thin-scroll max-h-40 overflow-y-auto border-t border-line py-1">
            {unscheduled.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => onOpen(item.id)}
                  className="flex h-8 w-full items-center gap-2 px-3 text-left text-[13px] hover:bg-surface-2"
                >
                  <span className="text-[11px] text-faint tabular-nums">
                    {item.number > 0 ? `${project.key}-${item.number}` : ""}
                  </span>
                  <span className="truncate">{item.title}</span>
                </button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
