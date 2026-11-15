"use client";

import { useState } from "react";
import { Check, ListFilter, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/overlays";
import { colorVar } from "@/lib/colors";
import { PRIORITIES, type Priority } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PriorityIcon } from "./pickers";
import { EMPTY_FILTER, filterCount, useProject } from "./store";

const option =
  "flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] hover:bg-surface-2";

function Box({ on }: { on: boolean }) {
  return (
    <span
      className={cn(
        "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
        on ? "border-transparent bg-accent text-accent-fg" : "border-line-strong",
      )}
    >
      {on ? <Check size={11} strokeWidth={3} /> : null}
    </span>
  );
}

/** Narrows every view of the project by label, priority and done-ness. */
export function FilterButton() {
  const { filter, setFilter, labels } = useProject();
  const [open, setOpen] = useState(false);
  const count = filterCount(filter);

  function toggleLabel(id: string) {
    const has = filter.labelIds.includes(id);
    setFilter({
      ...filter,
      labelIds: has ? filter.labelIds.filter((l) => l !== id) : [...filter.labelIds, id],
    });
  }

  function togglePriority(value: Priority) {
    const has = filter.priorities.includes(value);
    setFilter({
      ...filter,
      priorities: has
        ? filter.priorities.filter((p) => p !== value)
        : [...filter.priorities, value],
    });
  }

  return (
    <span className="flex items-center gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            className={cn(
              "flex h-7 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium",
              count ? "bg-accent/10 text-accent" : "text-muted hover:bg-surface-2 hover:text-ink",
            )}
          >
            <ListFilter size={14} />
            Filter
            {count ? <span className="tabular-nums">{count}</span> : null}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-60">
          <button
            className={option}
            onClick={() => setFilter({ ...filter, hideDone: !filter.hideDone })}
          >
            <Box on={filter.hideDone} />
            Hide done items
          </button>

          <p className="mt-1.5 px-2 pb-1 text-[11px] font-semibold tracking-wide text-faint uppercase">
            Labels
          </p>
          {labels.length === 0 ? (
            <p className="px-2 pb-1 text-[13px] text-faint">No labels yet.</p>
          ) : (
            <div className="thin-scroll max-h-48 overflow-y-auto">
              {labels.map((l) => (
                <button key={l.id} className={option} onClick={() => toggleLabel(l.id)}>
                  <Box on={filter.labelIds.includes(l.id)} />
                  <span
                    aria-hidden
                    style={{ background: colorVar(l.color) }}
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                  />
                  <span className="truncate">{l.name}</span>
                </button>
              ))}
            </div>
          )}

          <p className="mt-1.5 px-2 pb-1 text-[11px] font-semibold tracking-wide text-faint uppercase">
            Priority
          </p>
          {PRIORITIES.map((p) => (
            <button key={p.value} className={option} onClick={() => togglePriority(p.value)}>
              <Box on={filter.priorities.includes(p.value)} />
              <PriorityIcon value={p.value} />
              {p.label}
            </button>
          ))}
        </PopoverContent>
      </Popover>
      {count ? (
        <button
          aria-label="Clear filters"
          title="Clear filters"
          onClick={() => setFilter(EMPTY_FILTER)}
          className="rounded p-1 text-faint hover:bg-surface-2 hover:text-ink"
        >
          <X size={13} />
        </button>
      ) : null}
    </span>
  );
}
