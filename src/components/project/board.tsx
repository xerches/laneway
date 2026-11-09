"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowLeft,
  ArrowRight,
  ListChecks,
  Mail,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Trash2,
} from "lucide-react";
import { Avatar } from "@/components/ui/bits";
import { ColorSwatches } from "@/components/ui/color-swatches";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/overlays";
import { colorFg, colorVar } from "@/lib/colors";
import type { ItemLite, StatusCategory, StatusLite } from "@/lib/types";
import { cn } from "@/lib/utils";
import { DueChip, PriorityIcon, RepeatBadge } from "./pickers";
import { useProject } from "./store";

type Columns = Record<string, string[]>;

function buildColumns(statuses: StatusLite[], items: ItemLite[]): Columns {
  const columns: Columns = {};
  for (const s of statuses) columns[s.id] = [];
  const sorted = [...items].sort(
    (a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt),
  );
  for (const item of sorted) columns[item.statusId]?.push(item.id);
  return columns;
}

function findColumn(columns: Columns, id: string): string | null {
  if (id in columns) return id;
  for (const [statusId, ids] of Object.entries(columns)) {
    if (ids.includes(id)) return statusId;
  }
  return null;
}

export function Board({ onOpen }: { onOpen: (id: string) => void }) {
  const { statuses, items, changeItem, addStatus } = useProject();
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const saved = useMemo(() => buildColumns(statuses, items), [statuses, items]);

  // While a card is being dragged, `drag` holds the live arrangement.
  const [drag, setDrag] = useState<{ activeId: string; columns: Columns } | null>(null);
  const columns = drag?.columns ?? saved;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Work out which column the pointer is in first, then the nearest card
  // inside it. This keeps tall, empty columns easy to drop into.
  const collision = useCallback<CollisionDetection>(
    (args) => {
      const pointerHits = pointerWithin(args);
      const hits = pointerHits.length ? pointerHits : rectIntersection(args);
      const column = hits.find((hit) => String(hit.id) in columns);
      if (!column) return hits.slice(0, 1);
      const ids = columns[String(column.id)].filter((id) => id !== String(args.active.id));
      if (ids.length === 0) return [column];
      const cards = closestCenter({
        ...args,
        droppableContainers: args.droppableContainers.filter((c) =>
          ids.includes(String(c.id)),
        ),
      });
      return cards.length ? [cards[0]] : [column];
    },
    [columns],
  );

  function onDragStart(event: DragStartEvent) {
    setDrag({ activeId: String(event.active.id), columns: saved });
  }

  function onDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    setDrag((current) => {
      if (!current) return current;
      const from = findColumn(current.columns, activeId);
      const to = findColumn(current.columns, overId);
      if (!from || !to || from === to) return current;
      const fromIds = current.columns[from].filter((id) => id !== activeId);
      const toIds = [...current.columns[to]];
      const overIndex = toIds.indexOf(overId);
      toIds.splice(overIndex >= 0 ? overIndex : toIds.length, 0, activeId);
      return {
        ...current,
        columns: { ...current.columns, [from]: fromIds, [to]: toIds },
      };
    });
  }

  function onDragEnd(event: DragEndEvent) {
    const current = drag;
    setDrag(null);
    const { active, over } = event;
    if (!current || !over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    const column = findColumn(current.columns, activeId);
    if (!column) return;

    let ids = current.columns[column];
    const from = ids.indexOf(activeId);
    const to = ids.indexOf(overId);
    if (to >= 0 && from !== to) ids = arrayMove(ids, from, to);

    const index = ids.indexOf(activeId);
    const before = byId.get(ids[index - 1])?.position;
    const after = byId.get(ids[index + 1])?.position;
    const position =
      before !== undefined && after !== undefined
        ? (before + after) / 2
        : before !== undefined
          ? before + 1
          : after !== undefined
            ? after - 1
            : 1;

    const item = byId.get(activeId);
    if (!item) return;
    if (item.statusId === column && saved[column].join() === ids.join()) return;
    changeItem(activeId, {
      position,
      ...(item.statusId !== column ? { statusId: column } : {}),
    });
  }

  const active = drag ? byId.get(drag.activeId) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDrag(null)}
    >
      <div className="thin-scroll flex h-full gap-3 overflow-x-auto px-4 pt-1 pb-4 md:px-6">
        {statuses.map((status, index) => (
          <Column
            key={status.id}
            status={status}
            index={index}
            count={statuses.length}
            items={(columns[status.id] ?? [])
              .map((id) => byId.get(id))
              .filter((i): i is ItemLite => Boolean(i))}
            landing={
              drag !== null &&
              byId.get(drag.activeId)?.statusId !== status.id &&
              (columns[status.id] ?? []).includes(drag.activeId)
            }
            onOpen={onOpen}
          />
        ))}
        <AddColumn onAdd={addStatus} />
      </div>
      <DragOverlay dropAnimation={null}>
        {active ? <CardBody item={active} dragging /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function Column({
  status,
  items,
  index,
  count,
  landing,
  onOpen,
}: {
  status: StatusLite;
  items: ItemLite[];
  index: number;
  count: number;
  /** A card from another column is about to be dropped here. */
  landing: boolean;
  onOpen: (id: string) => void;
}) {
  const { addItem } = useProject();
  const { setNodeRef } = useDroppable({ id: status.id });
  const [adding, setAdding] = useState(false);

  return (
    <section
      ref={setNodeRef}
      aria-label={status.name}
      className={cn(
        "flex h-full w-[280px] shrink-0 flex-col rounded-xl bg-surface-2/70 transition-colors",
        landing && "bg-accent/8 ring-2 ring-[var(--ring)]",
      )}
    >
      <ColumnHeader
        status={status}
        total={items.length}
        index={index}
        count={count}
        onAdd={() => setAdding(true)}
      />
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <div className="thin-scroll flex min-h-16 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
          {items.map((item) => (
            <SortableCard key={item.id} item={item} onOpen={onOpen} />
          ))}
          {adding ? (
            <QuickAdd
              onAdd={(title) => addItem({ title, statusId: status.id })}
              onClose={() => setAdding(false)}
            />
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-[13px] text-faint hover:bg-surface hover:text-ink"
            >
              <Plus size={14} />
              Add item
            </button>
          )}
        </div>
      </SortableContext>
    </section>
  );
}

const CATEGORY_LABELS: { value: StatusCategory; label: string }[] = [
  { value: "todo", label: "Not started" },
  { value: "active", label: "In progress" },
  { value: "done", label: "Done" },
];

function ColumnHeader({
  status,
  total,
  index,
  count,
  onAdd,
}: {
  status: StatusLite;
  total: number;
  index: number;
  count: number;
  onAdd: () => void;
}) {
  const { changeStatus, removeStatus, moveStatus } = useProject();
  const [renaming, setRenaming] = useState(false);

  return (
    <header className="flex h-11 shrink-0 items-center gap-2 px-2.5">
      {renaming ? (
        <input
          autoFocus
          defaultValue={status.name}
          maxLength={40}
          aria-label="Status name"
          className="h-7 min-w-0 flex-1 rounded-md border border-accent bg-surface px-2 text-[13px] font-medium outline-none"
          onBlur={(e) => {
            const next = e.target.value.trim();
            if (next && next !== status.name) changeStatus(status.id, { name: next });
            setRenaming(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") setRenaming(false);
          }}
        />
      ) : (
        <button
          onClick={() => setRenaming(true)}
          title="Rename"
          style={{ background: colorVar(status.color), color: colorFg(status.color) }}
          className="inline-flex h-6 max-w-[170px] items-center rounded-full px-2.5 text-xs font-semibold"
        >
          <span className="truncate">{status.name}</span>
        </button>
      )}
      <span className="text-xs text-faint tabular-nums">{total}</span>
      <span className="flex-1" />
      <Menu>
        <MenuTrigger
          aria-label={`${status.name} options`}
          className="rounded p-1 text-faint hover:bg-surface hover:text-ink"
        >
          <MoreHorizontal size={15} />
        </MenuTrigger>
        <MenuContent align="end" className="w-56">
          <MenuItem onSelect={() => setRenaming(true)}>Rename</MenuItem>
          <MenuSeparator />
          <MenuLabel>Color</MenuLabel>
          <div className="px-2 pb-2">
            <ColorSwatches
              value={status.color}
              onChange={(color) => changeStatus(status.id, { color })}
            />
          </div>
          <MenuSeparator />
          <MenuLabel>Items here count as</MenuLabel>
          {CATEGORY_LABELS.map((c) => (
            <MenuItem
              key={c.value}
              onSelect={() => changeStatus(status.id, { category: c.value })}
            >
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  status.category === c.value ? "bg-accent" : "bg-line-strong",
                )}
              />
              {c.label}
            </MenuItem>
          ))}
          <MenuSeparator />
          <MenuItem disabled={index === 0} onSelect={() => moveStatus(status.id, -1)}>
            <ArrowLeft size={14} /> Move left
          </MenuItem>
          <MenuItem disabled={index === count - 1} onSelect={() => moveStatus(status.id, 1)}>
            <ArrowRight size={14} /> Move right
          </MenuItem>
          <MenuSeparator />
          <MenuItem danger disabled={count <= 1} onSelect={() => removeStatus(status.id)}>
            <Trash2 size={14} /> Delete status
          </MenuItem>
        </MenuContent>
      </Menu>
      <button
        aria-label={`Add item to ${status.name}`}
        onClick={onAdd}
        className="rounded p-1 text-faint hover:bg-surface hover:text-ink"
      >
        <Plus size={15} />
      </button>
    </header>
  );
}

function SortableCard({ item, onOpen }: { item: ItemLite; onOpen: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("shrink-0 touch-manipulation", isDragging && "opacity-40")}
      {...attributes}
      {...listeners}
      role="button"
      aria-label={`Open ${item.title}`}
      onClick={() => onOpen(item.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen(item.id);
        else listeners?.onKeyDown?.(e);
      }}
    >
      <CardBody item={item} />
    </div>
  );
}

export function CardBody({ item, dragging }: { item: ItemLite; dragging?: boolean }) {
  const { project, members, today } = useProject();
  const assignee = members.find((m) => m.id === item.assigneeId);
  const done = Boolean(item.completedAt);
  return (
    <article
      className={cn(
        "rounded-lg border border-line bg-surface p-2.5 shadow-card transition-shadow hover:border-line-strong",
        dragging && "rotate-2 cursor-grabbing shadow-pop",
      )}
    >
      <p className={cn("text-[13px] leading-snug font-medium break-words", done && "text-muted line-through")}>
        {item.title}
      </p>
      <div className="mt-2 flex items-center gap-2.5">
        {item.number > 0 ? (
          <span className="text-[11px] text-faint tabular-nums">
            {project.key}-{item.number}
          </span>
        ) : null}
        {item.priority !== "none" ? <PriorityIcon value={item.priority} size={12} /> : null}
        {item.source === "email" ? (
          <Mail size={12} className="text-faint" aria-label="Arrived by email" />
        ) : null}
        {item.recurrence ? <RepeatBadge recurrence={item.recurrence} /> : null}
        {item.subtaskTotal > 0 ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-muted tabular-nums">
            <ListChecks size={12} />
            {item.subtaskDone}/{item.subtaskTotal}
          </span>
        ) : null}
        {item.commentCount > 0 ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-muted tabular-nums">
            <MessageSquare size={12} />
            {item.commentCount}
          </span>
        ) : null}
        <span className="flex-1" />
        {item.dueDate ? <DueChip date={item.dueDate} today={today} done={done} /> : null}
        {assignee ? <Avatar name={assignee.name} id={assignee.id} size={20} /> : null}
      </div>
    </article>
  );
}

export function QuickAdd({
  onAdd,
  onClose,
  placeholder = "What needs doing?",
  className,
}: {
  onAdd: (title: string) => void;
  onClose: () => void;
  placeholder?: string;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <input
      ref={ref}
      autoFocus
      placeholder={placeholder}
      maxLength={300}
      aria-label="New item title"
      className={cn(
        "h-9 w-full shrink-0 rounded-lg border border-accent bg-surface px-2.5 text-[13px] outline-none placeholder:text-faint",
        className,
      )}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          const title = e.currentTarget.value.trim();
          if (title) {
            onAdd(title);
            e.currentTarget.value = "";
          }
        }
        if (e.key === "Escape") onClose();
      }}
      onBlur={(e) => {
        const title = e.currentTarget.value.trim();
        if (title) onAdd(title);
        onClose();
      }}
    />
  );
}

function AddColumn({ onAdd }: { onAdd: (name: string) => void }) {
  const [adding, setAdding] = useState(false);
  return (
    <div className="w-[240px] shrink-0">
      {adding ? (
        <QuickAdd
          placeholder="Status name"
          onAdd={(name) => {
            onAdd(name.slice(0, 40));
            setAdding(false);
          }}
          onClose={() => setAdding(false)}
        />
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="flex h-11 w-full items-center gap-1.5 rounded-xl border border-dashed border-line-strong px-3 text-[13px] text-faint hover:bg-surface-2 hover:text-ink"
        >
          <Plus size={14} />
          Add status
        </button>
      )}
    </div>
  );
}
