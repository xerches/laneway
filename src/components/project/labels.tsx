"use client";

import { useState, type ReactNode } from "react";
import { Check, Plus, Tag, Trash2 } from "lucide-react";
import { ColorSwatches } from "@/components/ui/color-swatches";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/overlays";
import { colorSoft, colorVar } from "@/lib/colors";
import type { LabelLite } from "@/lib/types";
import { cn } from "@/lib/utils";

/** A small, soft-colored label chip. */
export function LabelChip({ label, className }: { label: LabelLite; className?: string }) {
  return (
    <span
      style={{
        background: colorSoft(label.color),
        color: `color-mix(in oklab, ${colorVar(label.color)} 72%, var(--text))`,
      }}
      className={cn(
        "inline-flex h-5 max-w-[140px] items-center gap-1 rounded-full px-2 text-[11px] font-medium whitespace-nowrap",
        className,
      )}
    >
      <span
        aria-hidden
        style={{ background: colorVar(label.color) }}
        className="h-1.5 w-1.5 shrink-0 rounded-full"
      />
      <span className="truncate">{label.name}</span>
    </span>
  );
}

/** The labels on an item, in workspace order. Shows "+2" past `max`. */
export function LabelChips({
  ids,
  labels,
  max = 3,
  className,
}: {
  ids: string[];
  labels: LabelLite[];
  max?: number;
  className?: string;
}) {
  if (ids.length === 0) return null;
  const chosen = labels.filter((l) => ids.includes(l.id));
  if (chosen.length === 0) return null;
  const shown = chosen.slice(0, max);
  const rest = chosen.length - shown.length;
  return (
    <span className={cn("flex min-w-0 flex-wrap items-center gap-1", className)}>
      {shown.map((l) => (
        <LabelChip key={l.id} label={l} />
      ))}
      {rest > 0 ? (
        <span className="text-[11px] text-faint tabular-nums" title={chosen.slice(max).map((l) => l.name).join(", ")}>
          +{rest}
        </span>
      ) : null}
    </span>
  );
}

/**
 * Pick any number of labels. Typing a name that doesn't exist offers to
 * create it, so labels never need setting up in advance.
 */
export function LabelPicker({
  labels,
  value,
  onChange,
  onCreate,
  trigger,
}: {
  labels: LabelLite[];
  value: string[];
  onChange: (ids: string[]) => void;
  onCreate: (name: string) => string;
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = q ? labels.filter((l) => l.name.toLowerCase().includes(q)) : labels;
  const exact = labels.some((l) => l.name.toLowerCase() === q);

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  }

  function create() {
    const name = query.trim().slice(0, 40);
    if (!name) return;
    const id = onCreate(name);
    onChange([...value, id]);
    setQuery("");
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        className="w-60"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          value={query}
          maxLength={40}
          placeholder="Find or create a label"
          aria-label="Find or create a label"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (shown.length === 1 && q) toggle(shown[0].id);
              else if (!exact) create();
            }
          }}
          className="mb-1 h-8 w-full rounded-md border border-line bg-bg px-2 text-[13px] outline-none focus:border-accent"
        />
        <div className="thin-scroll flex max-h-64 flex-col overflow-y-auto" role="listbox" aria-label="Labels" aria-multiselectable>
          {shown.map((l) => {
            const on = value.includes(l.id);
            return (
              <button
                key={l.id}
                role="option"
                aria-selected={on}
                onClick={() => toggle(l.id)}
                className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] hover:bg-surface-2"
              >
                <span
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                    on ? "border-transparent bg-accent text-accent-fg" : "border-line-strong",
                  )}
                >
                  {on ? <Check size={11} strokeWidth={3} /> : null}
                </span>
                <span
                  aria-hidden
                  style={{ background: colorVar(l.color) }}
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                />
                <span className="truncate">{l.name}</span>
              </button>
            );
          })}
          {q && !exact ? (
            <button
              onClick={create}
              className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] text-accent hover:bg-surface-2"
            >
              <Plus size={14} />
              <span className="truncate">Create “{query.trim()}”</span>
            </button>
          ) : null}
          {!q && labels.length === 0 ? (
            <p className="px-2 py-2 text-[13px] text-faint">
              No labels yet. Type a name to make one.
            </p>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Rename, recolor and delete the labels of a workspace. */
export function LabelManager({
  labels,
  onAdd,
  onChange,
  onRemove,
}: {
  labels: LabelLite[];
  onAdd: (name: string) => void;
  onChange: (id: string, patch: { name?: string; color?: string }) => void;
  onRemove: (id: string) => void;
}) {
  const [draft, setDraft] = useState("");
  return (
    <div className="flex flex-col gap-3 text-[13px]">
      <p className="text-muted">
        Labels are shared by every project in this workspace. Deleting one takes it
        off every item.
      </p>
      <ul className="flex flex-col gap-1">
        {labels.map((l) => (
          <LabelRow key={l.id} label={l} onChange={onChange} onRemove={onRemove} />
        ))}
        {labels.length === 0 ? <li className="text-faint">No labels yet.</li> : null}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const name = draft.trim();
          if (name) onAdd(name.slice(0, 40));
          setDraft("");
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={40}
          placeholder="New label"
          aria-label="New label name"
          className="h-8 min-w-0 flex-1 rounded-md border border-line bg-bg px-2 outline-none focus:border-accent"
        />
        <button
          type="submit"
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 font-medium hover:bg-surface-2"
        >
          <Tag size={13} /> Add
        </button>
      </form>
    </div>
  );
}

function LabelRow({
  label,
  onChange,
  onRemove,
}: {
  label: LabelLite;
  onChange: (id: string, patch: { name?: string; color?: string }) => void;
  onRemove: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <li className="group flex h-9 items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            aria-label={`Color of ${label.name}`}
            style={{ background: colorVar(label.color) }}
            className="h-5 w-5 shrink-0 rounded-full ring-offset-2 ring-offset-surface hover:ring-2 hover:ring-line-strong"
          />
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2">
          <ColorSwatches
            value={label.color}
            onChange={(color) => {
              onChange(label.id, { color });
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
      <input
        defaultValue={label.name}
        maxLength={40}
        aria-label="Label name"
        onBlur={(e) => {
          const name = e.target.value.trim();
          if (name && name !== label.name) onChange(label.id, { name });
          else e.target.value = label.name;
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        className="h-8 min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 outline-none hover:border-line focus:border-accent"
      />
      <button
        aria-label={`Delete label ${label.name}`}
        onClick={() => onRemove(label.id)}
        className="rounded p-1.5 text-faint opacity-0 group-hover:opacity-100 hover:bg-surface-2 hover:text-danger focus-visible:opacity-100 max-md:opacity-100"
      >
        <Trash2 size={14} />
      </button>
    </li>
  );
}
