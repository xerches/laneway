"use client";

import { useState, type ReactNode } from "react";
import { Check, Flag, Repeat, UserRound, X } from "lucide-react";
import { Avatar, Pill } from "@/components/ui/bits";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/overlays";
import { colorVar } from "@/lib/colors";
import { addDaysTo, describeRecurrence, formatDue, formatShort } from "@/lib/dates";
import {
  PRIORITIES,
  type Member,
  type Priority,
  type Recurrence,
  type StatusLite,
} from "@/lib/types";
import { cn } from "@/lib/utils";

const row =
  "flex h-8 w-full cursor-pointer items-center gap-2 rounded-md px-2 text-left text-[13px] hover:bg-surface-2";

/** Wraps any trigger in a popover whose content closes itself after a pick. */
function Picker({
  trigger,
  children,
  className,
  align,
}: {
  trigger: ReactNode;
  children: (close: () => void) => ReactNode;
  className?: string;
  align?: "start" | "center" | "end";
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align={align}
        className={cn("w-52", className)}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {open ? children(() => setOpen(false)) : null}
      </PopoverContent>
    </Popover>
  );
}

export function StatusPicker({
  statuses,
  value,
  onChange,
  trigger,
}: {
  statuses: StatusLite[];
  value: string;
  onChange: (statusId: string) => void;
  trigger: ReactNode;
}) {
  return (
    <Picker trigger={trigger}>
      {(close) => (
        <div className="flex flex-col gap-1" role="listbox" aria-label="Status">
          {statuses.map((s) => (
            <button
              key={s.id}
              role="option"
              aria-selected={s.id === value}
              onClick={() => {
                if (s.id !== value) onChange(s.id);
                close();
              }}
              style={{ background: colorVar(s.color), color: `var(--c-${s.color}-fg)` }}
              className="flex h-8 items-center justify-center gap-1.5 rounded-md px-2 text-[13px] font-medium transition-[filter] hover:brightness-110"
            >
              {s.id === value ? <Check size={13} strokeWidth={3} /> : null}
              <span className="truncate">{s.name}</span>
            </button>
          ))}
        </div>
      )}
    </Picker>
  );
}

export function priorityMeta(value: Priority) {
  return PRIORITIES.find((p) => p.value === value) ?? PRIORITIES[PRIORITIES.length - 1];
}

export function PriorityIcon({ value, size = 14 }: { value: Priority; size?: number }) {
  const meta = priorityMeta(value);
  return (
    <Flag
      size={size}
      style={{ color: value === "none" ? "var(--text-faint)" : colorVar(meta.color) }}
      fill={value === "none" ? "none" : "currentColor"}
      aria-label={meta.label}
    />
  );
}

export function PriorityPicker({
  value,
  onChange,
  trigger,
}: {
  value: Priority;
  onChange: (priority: Priority) => void;
  trigger: ReactNode;
}) {
  return (
    <Picker trigger={trigger} className="w-44">
      {(close) => (
        <div role="listbox" aria-label="Priority">
          {PRIORITIES.map((p) => (
            <button
              key={p.value}
              role="option"
              aria-selected={p.value === value}
              className={row}
              onClick={() => {
                if (p.value !== value) onChange(p.value);
                close();
              }}
            >
              <PriorityIcon value={p.value} />
              <span className="flex-1">{p.label}</span>
              {p.value === value ? <Check size={14} className="text-accent" /> : null}
            </button>
          ))}
        </div>
      )}
    </Picker>
  );
}

export function AssigneePicker({
  members,
  value,
  onChange,
  trigger,
}: {
  members: Member[];
  value: string | null;
  onChange: (userId: string | null) => void;
  trigger: ReactNode;
}) {
  return (
    <Picker trigger={trigger} className="w-56">
      {(close) => (
        <div role="listbox" aria-label="Owner">
          {members.map((m) => (
            <button
              key={m.id}
              role="option"
              aria-selected={m.id === value}
              className={row}
              onClick={() => {
                if (m.id !== value) onChange(m.id);
                close();
              }}
            >
              <Avatar name={m.name} id={m.id} size={20} />
              <span className="flex-1 truncate">{m.name}</span>
              {m.id === value ? <Check size={14} className="text-accent" /> : null}
            </button>
          ))}
          <button
            role="option"
            aria-selected={value === null}
            className={cn(row, "text-muted")}
            onClick={() => {
              if (value !== null) onChange(null);
              close();
            }}
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full border border-dashed border-line-strong">
              <UserRound size={11} />
            </span>
            <span className="flex-1">No owner</span>
            {value === null ? <Check size={14} className="text-accent" /> : null}
          </button>
        </div>
      )}
    </Picker>
  );
}

export function DatePicker({
  value,
  today,
  onChange,
  trigger,
  label = "Due date",
}: {
  value: string | null;
  today: string;
  onChange: (date: string | null) => void;
  trigger: ReactNode;
  label?: string;
}) {
  const shortcuts = [
    { label: "Today", date: today },
    { label: "Tomorrow", date: addDaysTo(today, 1) },
    { label: "In a week", date: addDaysTo(today, 7) },
  ];
  return (
    <Picker trigger={trigger} className="w-56">
      {(close) => (
        <div className="flex flex-col gap-1">
          <label className="flex flex-col gap-1 px-1 pt-1 text-[11px] font-medium text-faint uppercase tracking-wide">
            {label}
            <Input
              type="date"
              value={value ?? ""}
              autoFocus
              className="h-8 px-2 text-[13px] normal-case"
              onChange={(e) => {
                const next = e.target.value;
                if (/^\d{4}-\d{2}-\d{2}$/.test(next)) onChange(next);
                else if (next === "") onChange(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") close();
              }}
            />
          </label>
          {shortcuts.map((s) => (
            <button
              key={s.label}
              className={row}
              onClick={() => {
                onChange(s.date);
                close();
              }}
            >
              <span className="flex-1">{s.label}</span>
              <span className="text-xs text-faint">{formatShort(s.date)}</span>
            </button>
          ))}
          {value ? (
            <button
              className={cn(row, "text-muted")}
              onClick={() => {
                onChange(null);
                close();
              }}
            >
              <X size={14} />
              Clear date
            </button>
          ) : null}
          <PopoverClose className="sr-only">Close</PopoverClose>
        </div>
      )}
    </Picker>
  );
}

const REPEAT_OPTIONS: { label: string; value: Recurrence | null }[] = [
  { label: "Doesn't repeat", value: null },
  { label: "Daily", value: { freq: "daily", interval: 1 } },
  { label: "Weekly", value: { freq: "weekly", interval: 1 } },
  { label: "Every 2 weeks", value: { freq: "weekly", interval: 2 } },
  { label: "Monthly", value: { freq: "monthly", interval: 1 } },
  { label: "Every 3 months", value: { freq: "monthly", interval: 3 } },
  { label: "Yearly", value: { freq: "yearly", interval: 1 } },
];

export function RecurrencePicker({
  value,
  onChange,
  trigger,
}: {
  value: Recurrence | null;
  onChange: (recurrence: Recurrence | null) => void;
  trigger: ReactNode;
}) {
  const current = value ? describeRecurrence(value) : null;
  return (
    <Picker trigger={trigger} className="w-60">
      {(close) => (
        <div>
          <div role="listbox" aria-label="Repeat">
            {REPEAT_OPTIONS.map((option) => {
              const selected =
                (option.value ? describeRecurrence(option.value) : null) === current;
              return (
                <button
                  key={option.label}
                  role="option"
                  aria-selected={selected}
                  className={row}
                  onClick={() => {
                    if (!selected) onChange(option.value);
                    close();
                  }}
                >
                  <span className="flex-1">{option.label}</span>
                  {selected ? <Check size={14} className="text-accent" /> : null}
                </button>
              );
            })}
          </div>
          <CustomRepeat
            value={value}
            onApply={(next) => {
              onChange(next);
              close();
            }}
          />
          <p className="px-2 pt-1.5 pb-1 text-xs text-faint">
            The next copy appears when you finish this one.
          </p>
        </div>
      )}
    </Picker>
  );
}

function CustomRepeat({
  value,
  onApply,
}: {
  value: Recurrence | null;
  onApply: (recurrence: Recurrence) => void;
}) {
  const [interval, setInterval] = useState(String(value?.interval ?? 2));
  const [freq, setFreq] = useState<Recurrence["freq"]>(value?.freq ?? "weekly");
  const n = Number.parseInt(interval, 10);
  const valid = Number.isInteger(n) && n >= 1 && n <= 365;
  return (
    <form
      className="mt-1 flex items-center gap-1.5 border-t border-line px-2 pt-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onApply({ freq, interval: n });
      }}
    >
      <span className="text-[13px] text-muted">Every</span>
      <Input
        value={interval}
        onChange={(e) => setInterval(e.target.value)}
        inputMode="numeric"
        aria-label="Repeat interval"
        className="h-7 w-11 px-1.5 text-center text-[13px]"
      />
      <select
        value={freq}
        onChange={(e) => setFreq(e.target.value as Recurrence["freq"])}
        aria-label="Repeat unit"
        className="h-7 flex-1 rounded-md border border-line bg-surface px-1 text-[13px]"
      >
        <option value="daily">days</option>
        <option value="weekly">weeks</option>
        <option value="monthly">months</option>
        <option value="yearly">years</option>
      </select>
      <button
        type="submit"
        disabled={!valid}
        className="h-7 rounded-md bg-accent px-2 text-xs font-medium text-accent-fg disabled:opacity-50"
      >
        Set
      </button>
    </form>
  );
}

/** Small read-only chips shared by the board, list and calendar. */
export function DueChip({
  date,
  today,
  done,
  className,
}: {
  date: string;
  today: string;
  done?: boolean;
  className?: string;
}) {
  const overdue = !done && date < today;
  const isToday = !done && date === today;
  return (
    <span
      className={cn(
        "inline-flex items-center text-xs whitespace-nowrap",
        overdue ? "font-medium text-danger" : isToday ? "font-medium text-accent" : "text-muted",
        className,
      )}
    >
      {formatDue(date, today)}
    </span>
  );
}

export function RepeatBadge({ recurrence }: { recurrence: Recurrence }) {
  return (
    <span
      className="inline-flex items-center text-faint"
      title={`Repeats: ${describeRecurrence(recurrence).toLowerCase()}`}
    >
      <Repeat size={12} aria-label={`Repeats ${describeRecurrence(recurrence).toLowerCase()}`} />
    </span>
  );
}

export function StatusPill({ status }: { status: StatusLite | undefined }) {
  if (!status) return null;
  return <Pill color={status.color}>{status.name}</Pill>;
}
