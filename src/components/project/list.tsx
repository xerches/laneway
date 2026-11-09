"use client";

import { useState } from "react";
import { ChevronDown, ListChecks, Mail, Maximize2, MessageSquare, Plus, UserRound } from "lucide-react";
import { Avatar } from "@/components/ui/bits";
import { colorFg, colorSoft, colorVar } from "@/lib/colors";
import type { ItemLite, StatusLite } from "@/lib/types";
import { cn } from "@/lib/utils";
import { QuickAdd } from "./board";
import {
  AssigneePicker,
  DatePicker,
  DueChip,
  PriorityPicker,
  priorityMeta,
  RepeatBadge,
  StatusPicker,
} from "./pickers";
import { useProject } from "./store";

// Narrower columns on a phone, so the status sits next to the title.
const GRID =
  "grid grid-cols-[minmax(200px,1fr)_108px_104px_56px_112px] sm:grid-cols-[minmax(260px,1fr)_150px_120px_72px_130px]";
const cell = "flex h-10 items-center border-b border-line";

/** A spreadsheet-style table, grouped by status. Every cell edits in place. */
export function ListView({ onOpen }: { onOpen: (id: string) => void }) {
  const { statuses, items } = useProject();
  return (
    <div className="thin-scroll h-full overflow-auto px-4 pb-10 md:px-6">
      <div className="flex min-w-[600px] flex-col gap-6 pt-1 sm:min-w-[780px]">
        {statuses.map((status) => (
          <Group
            key={status.id}
            status={status}
            items={items
              .filter((i) => i.statusId === status.id)
              .sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt))}
            onOpen={onOpen}
          />
        ))}
      </div>
    </div>
  );
}

function Group({
  status,
  items,
  onOpen,
}: {
  status: StatusLite;
  items: ItemLite[];
  onOpen: (id: string) => void;
}) {
  const { addItem } = useProject();
  const [open, setOpen] = useState(true);
  const [adding, setAdding] = useState(false);

  return (
    <section aria-label={status.name}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mb-1.5 flex items-center gap-2 text-sm font-semibold"
        style={{ color: `color-mix(in oklab, ${colorVar(status.color)} 75%, var(--text))` }}
      >
        <ChevronDown size={16} className={cn("transition-transform", !open && "-rotate-90")} />
        {status.name}
        <span className="text-xs font-normal text-faint tabular-nums">
          {items.length} {items.length === 1 ? "item" : "items"}
        </span>
      </button>

      {open ? (
        <div
          className="overflow-hidden rounded-lg border border-line bg-surface shadow-card"
          style={{ borderLeft: `4px solid ${colorVar(status.color)}` }}
        >
          <div className={cn(GRID, "text-xs font-medium text-faint")}>
            <div className={cn(cell, "h-8 px-3")}>Item</div>
            <div className={cn(cell, "h-8 justify-center border-l")}>Status</div>
            <div className={cn(cell, "h-8 justify-center border-l")}>Priority</div>
            <div className={cn(cell, "h-8 justify-center border-l")}>Owner</div>
            <div className={cn(cell, "h-8 justify-center border-l")}>Due</div>
          </div>

          {items.map((item) => (
            <Row key={item.id} item={item} onOpen={onOpen} />
          ))}

          <div className="flex h-10 items-center px-2">
            {adding ? (
              <QuickAdd
                className="h-8 border-transparent bg-transparent focus:border-accent"
                onAdd={(title) => addItem({ title, statusId: status.id })}
                onClose={() => setAdding(false)}
              />
            ) : (
              <button
                onClick={() => setAdding(true)}
                className="flex h-8 w-full items-center gap-1.5 rounded-md px-1.5 text-[13px] text-faint hover:text-ink"
              >
                <Plus size={14} />
                Add item
              </button>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Row({ item, onOpen }: { item: ItemLite; onOpen: (id: string) => void }) {
  const { statuses, members, today, changeItem } = useProject();
  const [editing, setEditing] = useState(false);
  const status = statuses.find((s) => s.id === item.statusId);
  const assignee = members.find((m) => m.id === item.assigneeId);
  const priority = priorityMeta(item.priority);
  const done = Boolean(item.completedAt);

  return (
    <div className={cn(GRID, "group hover:bg-surface-2/50")}>
      <div className={cn(cell, "min-w-0 gap-2 px-3")}>
        {editing ? (
          <input
            autoFocus
            defaultValue={item.title}
            maxLength={300}
            aria-label="Item title"
            className="h-7 min-w-0 flex-1 rounded border border-accent bg-surface px-1.5 text-[13px] outline-none"
            onBlur={(e) => {
              const next = e.target.value.trim();
              if (next && next !== item.title) changeItem(item.id, { title: next });
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") setEditing(false);
            }}
          />
        ) : (
          <button
            onClick={() => setEditing(true)}
            title="Click to rename"
            className={cn(
              "min-w-0 truncate rounded px-1.5 py-1 text-left text-[13px] hover:bg-surface-2",
              done && "text-muted line-through",
            )}
          >
            {item.title}
          </button>
        )}
        <span className="flex shrink-0 items-center gap-2 text-faint">
          {item.source === "email" ? <Mail size={12} aria-label="Arrived by email" /> : null}
          {item.recurrence ? <RepeatBadge recurrence={item.recurrence} /> : null}
          {item.subtaskTotal > 0 ? (
            <span className="inline-flex items-center gap-1 text-[11px] tabular-nums">
              <ListChecks size={12} />
              {item.subtaskDone}/{item.subtaskTotal}
            </span>
          ) : null}
          {item.commentCount > 0 ? (
            <span className="inline-flex items-center gap-1 text-[11px] tabular-nums">
              <MessageSquare size={12} />
              {item.commentCount}
            </span>
          ) : null}
        </span>
        <span className="flex-1" />
        <button
          onClick={() => onOpen(item.id)}
          aria-label={`Open ${item.title}`}
          className="flex shrink-0 items-center gap-1 rounded-md border border-line bg-surface px-1.5 py-1 text-[11px] text-muted opacity-0 group-hover:opacity-100 hover:text-ink focus-visible:opacity-100 max-md:opacity-100"
        >
          <Maximize2 size={11} />
          <span className="max-sm:hidden">Open</span>
        </button>
      </div>

      <div className={cn(cell, "border-l p-0")}>
        <StatusPicker
          statuses={statuses}
          value={item.statusId}
          onChange={(statusId) => changeItem(item.id, { statusId })}
          trigger={
            <button
              aria-label={`Status: ${status?.name ?? "none"}`}
              style={
                status
                  ? { background: colorVar(status.color), color: colorFg(status.color) }
                  : undefined
              }
              className="h-full w-full truncate px-2 text-center text-[13px] font-medium transition-[filter] hover:brightness-110"
            >
              {status?.name}
            </button>
          }
        />
      </div>

      <div className={cn(cell, "border-l p-0")}>
        <PriorityPicker
          value={item.priority}
          onChange={(value) => changeItem(item.id, { priority: value })}
          trigger={
            <button
              aria-label={`Priority: ${priority.label}`}
              style={
                item.priority === "none"
                  ? undefined
                  : {
                      background: colorSoft(priority.color),
                      color: `color-mix(in oklab, ${colorVar(priority.color)} 72%, var(--text))`,
                    }
              }
              className="h-full w-full px-2 text-center text-[13px] font-medium hover:bg-surface-2"
            >
              {item.priority === "none" ? <span className="text-faint">–</span> : priority.label}
            </button>
          }
        />
      </div>

      <div className={cn(cell, "justify-center border-l")}>
        <AssigneePicker
          members={members}
          value={item.assigneeId}
          onChange={(assigneeId) => changeItem(item.id, { assigneeId })}
          trigger={
            <button
              aria-label={`Owner: ${assignee?.name ?? "nobody"}`}
              className="flex h-7 w-7 items-center justify-center rounded-full hover:ring-2 hover:ring-line-strong"
            >
              {assignee ? (
                <Avatar name={assignee.name} id={assignee.id} size={24} />
              ) : (
                <span className="flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-line-strong text-faint">
                  <UserRound size={12} />
                </span>
              )}
            </button>
          }
        />
      </div>

      <div className={cn(cell, "border-l p-0")}>
        <DatePicker
          value={item.dueDate}
          today={today}
          onChange={(dueDate) => changeItem(item.id, { dueDate })}
          trigger={
            <button
              aria-label={`Due date: ${item.dueDate ?? "none"}`}
              className="flex h-full w-full items-center justify-center px-2 hover:bg-surface-2"
            >
              {item.dueDate ? (
                <DueChip date={item.dueDate} today={today} done={done} className="text-[13px]" />
              ) : (
                <span className="text-faint">–</span>
              )}
            </button>
          }
        />
      </div>
    </div>
  );
}
