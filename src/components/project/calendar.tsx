"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  addDays,
  addMonths,
  addWeeks,
  endOfMonth,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ChevronLeft, ChevronRight, Plus, Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { colorVar } from "@/lib/colors";
import { parseDate, toDateString } from "@/lib/dates";
import type { ItemLite, StatusLite } from "@/lib/types";
import { cn } from "@/lib/utils";
import { QuickAdd } from "./board";
import { useProject } from "./store";

type Mode = "month" | "week";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Items laid out on the days they are due. Drag one to reschedule it. */
export function CalendarView({ onOpen }: { onOpen: (id: string) => void }) {
  const { items, statuses, today, changeItem, addItem } = useProject();
  const [mode, setMode] = useState<Mode>("month");
  const [cursor, setCursor] = useState(today);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [addingOn, setAddingOn] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const days = useMemo(() => {
    const anchor = parseDate(cursor);
    const from =
      mode === "month"
        ? startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 })
        : startOfWeek(anchor, { weekStartsOn: 1 });
    const to =
      mode === "month"
        ? endOfWeek(endOfMonth(anchor), { weekStartsOn: 1 })
        : endOfWeek(anchor, { weekStartsOn: 1 });
    const out: string[] = [];
    for (let d = from; d <= to; d = addDays(d, 1)) out.push(toDateString(d));
    return out;
  }, [cursor, mode]);

  const byDay = useMemo(() => {
    const map = new Map<string, ItemLite[]>();
    for (const item of items) {
      if (!item.dueDate) continue;
      const list = map.get(item.dueDate) ?? [];
      list.push(item);
      map.set(item.dueDate, list);
    }
    return map;
  }, [items]);

  const statusById = useMemo(() => new Map(statuses.map((s) => [s.id, s])), [statuses]);
  const undated = items.filter((i) => !i.dueDate && !i.completedAt).length;

  function shift(direction: -1 | 1) {
    const anchor = parseDate(cursor);
    setCursor(
      toDateString(
        mode === "month" ? addMonths(anchor, direction) : addWeeks(anchor, direction),
      ),
    );
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const day = event.over ? String(event.over.id) : null;
    const item = items.find((i) => i.id === String(event.active.id));
    if (!day || !item || item.dueDate === day) return;
    changeItem(item.id, { dueDate: day });
  }

  const month = cursor.slice(0, 7);
  const title =
    mode === "month"
      ? format(parseDate(cursor), "MMMM yyyy")
      : `${format(parseDate(days[0]), "MMM d")} to ${format(parseDate(days[6]), "MMM d, yyyy")}`;
  const active = activeId ? items.find((i) => i.id === activeId) : null;

  return (
    <div className="flex h-full flex-col px-4 pb-4 md:px-6">
      <div className="flex shrink-0 flex-wrap items-center gap-2 pb-3">
        <h2 className="min-w-40 text-base font-semibold">{title}</h2>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" aria-label="Previous" onClick={() => shift(-1)}>
            <ChevronLeft size={16} />
          </Button>
          <Button size="sm" onClick={() => setCursor(today)}>
            Today
          </Button>
          <Button size="icon" variant="ghost" aria-label="Next" onClick={() => shift(1)}>
            <ChevronRight size={16} />
          </Button>
        </div>
        <span className="flex-1" />
        {undated > 0 ? (
          <span className="text-xs text-faint">
            {undated} open {undated === 1 ? "item has" : "items have"} no due date
          </span>
        ) : null}
        <div className="flex rounded-md border border-line bg-surface p-0.5">
          {(["month", "week"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className={cn(
                "h-6 rounded px-2.5 text-xs font-medium capitalize",
                mode === m ? "bg-surface-2 text-ink" : "text-muted hover:text-ink",
              )}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <DndContext
        sensors={sensors}
        onDragStart={(e) => setActiveId(String(e.active.id))}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div className="thin-scroll min-h-0 flex-1 overflow-auto rounded-lg border border-line bg-surface shadow-card">
          <div className="flex h-full min-w-[720px] flex-col">
            <div className="grid shrink-0 grid-cols-7 border-b border-line">
              {WEEKDAYS.map((d) => (
                <div key={d} className="px-2 py-1.5 text-xs font-medium text-faint">
                  {d}
                </div>
              ))}
            </div>
            <div
              className="grid flex-1 grid-cols-7"
              style={{ gridAutoRows: mode === "month" ? "minmax(112px, 1fr)" : "minmax(320px, 1fr)" }}
            >
              {days.map((day) => (
                <DayCell
                  key={day}
                  day={day}
                  today={today}
                  muted={mode === "month" && day.slice(0, 7) !== month}
                  items={byDay.get(day) ?? []}
                  statusById={statusById}
                  adding={addingOn === day}
                  onStartAdd={() => setAddingOn(day)}
                  onStopAdd={() => setAddingOn(null)}
                  onAdd={(text) => addItem({ title: text, dueDate: day })}
                  onOpen={onOpen}
                />
              ))}
            </div>
          </div>
        </div>
        <DragOverlay dropAnimation={null}>
          {active ? (
            <Chip item={active} status={statusById.get(active.statusId)} overlay />
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function DayCell({
  day,
  today,
  muted,
  items,
  statusById,
  adding,
  onStartAdd,
  onStopAdd,
  onAdd,
  onOpen,
}: {
  day: string;
  today: string;
  muted: boolean;
  items: ItemLite[];
  statusById: Map<string, StatusLite>;
  adding: boolean;
  onStartAdd: () => void;
  onStopAdd: () => void;
  onAdd: (title: string) => void;
  onOpen: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: day });
  const isToday = day === today;
  const dayNumber = Number(day.slice(8));

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "group/day flex min-w-0 flex-col gap-1 border-r border-b border-line p-1.5 [&:nth-child(7n)]:border-r-0",
        muted && "bg-surface-2/40",
        isOver && "bg-accent/8",
      )}
    >
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs tabular-nums",
            isToday
              ? "bg-accent font-semibold text-accent-fg"
              : muted
                ? "text-faint"
                : "text-muted",
          )}
        >
          {dayNumber === 1 ? format(parseDate(day), "MMM d") : dayNumber}
        </span>
        <button
          onClick={onStartAdd}
          aria-label={`Add item due ${day}`}
          className="rounded p-0.5 text-faint opacity-0 group-hover/day:opacity-100 hover:bg-surface-2 hover:text-ink focus-visible:opacity-100"
        >
          <Plus size={13} />
        </button>
      </div>
      <div className="thin-scroll flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
        {items.map((item) => (
          <DraggableChip
            key={item.id}
            item={item}
            status={statusById.get(item.statusId)}
            onOpen={onOpen}
          />
        ))}
        {adding ? (
          <QuickAdd
            className="h-7 rounded-md px-1.5 text-xs"
            placeholder="New item"
            onAdd={onAdd}
            onClose={onStopAdd}
          />
        ) : null}
      </div>
    </div>
  );
}

function DraggableChip({
  item,
  status,
  onOpen,
}: {
  item: ItemLite;
  status: StatusLite | undefined;
  onOpen: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: item.id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      role="button"
      aria-label={`Open ${item.title}`}
      onClick={() => onOpen(item.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen(item.id);
      }}
      className={cn("shrink-0 touch-manipulation", isDragging && "opacity-40")}
    >
      <Chip item={item} status={status} />
    </div>
  );
}

function Chip({
  item,
  status,
  overlay,
}: {
  item: ItemLite;
  status: StatusLite | undefined;
  overlay?: boolean;
}) {
  const color = status?.color ?? "gray";
  const done = Boolean(item.completedAt);
  return (
    <div
      style={{
        background: `color-mix(in oklab, ${colorVar(color)} 16%, var(--surface))`,
        borderLeft: `3px solid ${colorVar(color)}`,
      }}
      className={cn(
        "flex h-6 items-center gap-1 rounded px-1.5 text-xs font-medium",
        overlay && "w-40 shadow-pop",
        done && "text-muted line-through opacity-70",
      )}
      title={`${item.title} · ${status?.name ?? ""}`}
    >
      <span className="truncate">{item.title}</span>
      {item.recurrence ? <Repeat size={10} className="shrink-0 text-faint" /> : null}
    </div>
  );
}
