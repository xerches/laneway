"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import {
  CalendarDays,
  CalendarRange,
  Check,
  CircleDot,
  Flag,
  Mail,
  MoreHorizontal,
  Plus,
  Repeat,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { Dialog as D } from "radix-ui";
import * as actions from "@/actions";
import { Avatar, Pill } from "@/components/ui/bits";
import { Button } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/overlays";
import { clientId } from "@/lib/client";
import { describeRecurrence, formatDue, formatShort, relativeDays } from "@/lib/dates";
import type { ActivityEntry, ItemDetail, ItemLite } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  AssigneePicker,
  DatePicker,
  PriorityIcon,
  priorityMeta,
  PriorityPicker,
  RecurrencePicker,
  StatusPicker,
} from "./pickers";
import { useProject } from "./store";

/** The side panel: every detail of one item, and its whole story. */
export function ItemPanel({ itemId, onClose }: { itemId: string; onClose: () => void }) {
  return (
    <D.Root open onOpenChange={(open) => !open && onClose()}>
      <D.Portal>
        <D.Overlay className="animate-fade fixed inset-0 z-30 bg-black/25" />
        <D.Content
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="animate-slide fixed inset-y-0 right-0 z-40 flex w-[min(540px,100vw)] flex-col border-l border-line bg-surface shadow-pop outline-none"
        >
          <PanelBody key={itemId} itemId={itemId} onClose={onClose} />
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

function PanelBody({ itemId, onClose }: { itemId: string; onClose: () => void }) {
  const store = useProject();
  const { project, statuses, members, today, version, userId } = store;

  const [detail, setDetail] = useState<ItemDetail | null>(null);
  const [missing, setMissing] = useState(false);
  // Shown straight away, until the server's copy comes back.
  const [pendingSubtasks, setPendingSubtasks] = useState<ItemLite[] | null>(null);
  const [pendingComments, setPendingComments] = useState<ActivityEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    actions.loadItemDetail(itemId).then((loaded) => {
      if (cancelled) return;
      if (!loaded) {
        setMissing(true);
        return;
      }
      setDetail(loaded);
      setPendingSubtasks(null);
      setPendingComments([]);
    });
    return () => {
      cancelled = true;
    };
  }, [itemId, version]);

  const item = store.items.find((i) => i.id === itemId) ?? detail?.item ?? null;

  if (!item) {
    return (
      <div className="flex h-full flex-col">
        <PanelHeader label="" onClose={onClose} />
        <div className="flex-1 p-5">
          {missing ? (
            <p className="text-muted">This item no longer exists.</p>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="skeleton h-7 w-3/4" />
              <div className="skeleton h-24" />
            </div>
          )}
        </div>
      </div>
    );
  }

  const status = statuses.find((s) => s.id === item.statusId);
  const assignee = members.find((m) => m.id === item.assigneeId);
  const priority = priorityMeta(item.priority);
  const done = Boolean(item.completedAt);
  const subtasks = pendingSubtasks ?? detail?.subtasks ?? [];
  const feed = [...(detail?.activity ?? []), ...pendingComments];
  const doneStatus = statuses.find((s) => s.category === "done");
  const todoStatus = statuses.find((s) => s.category === "todo") ?? statuses[0];
  const me = members.find((m) => m.id === userId);

  function addSubtask(title: string) {
    const id = clientId();
    const optimistic: ItemLite = {
      ...item!,
      id,
      number: 0,
      title,
      parentId: itemId,
      statusId: todoStatus.id,
      completedAt: null,
      recurrence: null,
      commentCount: 0,
      subtaskTotal: 0,
      subtaskDone: 0,
    };
    setPendingSubtasks([...subtasks, optimistic]);
    void store.run(() =>
      actions.createItem({ id, projectId: project.id, title, parentId: itemId }),
    );
  }

  function toggleSubtask(sub: ItemLite) {
    const finishing = !sub.completedAt;
    const target = finishing ? doneStatus : todoStatus;
    if (!target) return;
    setPendingSubtasks(
      subtasks.map((s) =>
        s.id === sub.id
          ? {
              ...s,
              statusId: target.id,
              completedAt: finishing ? new Date().toISOString() : null,
            }
          : s,
      ),
    );
    void store.run(() =>
      actions.updateItem({ itemId: sub.id, patch: { statusId: target.id }, today }),
    );
  }

  function removeSubtask(sub: ItemLite) {
    setPendingSubtasks(subtasks.filter((s) => s.id !== sub.id));
    void store.run(() => actions.deleteItem({ itemId: sub.id }));
  }

  function comment(body: string) {
    setPendingComments((prev) => [
      ...prev,
      {
        id: clientId(),
        itemId,
        userId,
        userName: me?.name ?? "You",
        type: "comment",
        body,
        data: null,
        createdAt: new Date().toISOString(),
      },
    ]);
    void store.run(() => actions.addComment({ itemId, body }));
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHeader
        label={item.number > 0 ? `${project.key}-${item.number}` : "New item"}
        onClose={onClose}
        badge={
          item.source === "email" ? (
            <Pill color="blue" soft className="h-5 gap-1 px-2 text-[11px]">
              <Mail size={11} className="mr-1 inline" />
              From email
            </Pill>
          ) : null
        }
        menu={
          <Menu>
            <MenuTrigger
              aria-label="Item options"
              className="rounded-md p-1.5 text-faint hover:bg-surface-2 hover:text-ink"
            >
              <MoreHorizontal size={16} />
            </MenuTrigger>
            <MenuContent align="end">
              <MenuItem
                danger
                onSelect={() => {
                  store.removeItem(itemId);
                  onClose();
                }}
              >
                <Trash2 size={14} /> Delete item
              </MenuItem>
            </MenuContent>
          </Menu>
        }
      />

      <div className="thin-scroll min-h-0 flex-1 overflow-y-auto">
        <div className="px-5 pt-1 pb-4">
          <D.Title asChild>
            <TitleField
              value={item.title}
              done={done}
              onSave={(title) => store.changeItem(itemId, { title })}
            />
          </D.Title>

          <dl className="mt-4 grid grid-cols-[104px_1fr] items-center gap-x-3 gap-y-1.5 text-[13px]">
            <Field icon={<CircleDot size={14} />} label="Status">
              <StatusPicker
                statuses={statuses}
                value={item.statusId}
                onChange={(statusId) => store.changeItem(itemId, { statusId })}
                trigger={
                  <button className="rounded-full" aria-label={`Status: ${status?.name}`}>
                    {status ? <Pill color={status.color}>{status.name}</Pill> : "None"}
                  </button>
                }
              />
            </Field>

            <Field icon={<Flag size={14} />} label="Priority">
              <PriorityPicker
                value={item.priority}
                onChange={(value) => store.changeItem(itemId, { priority: value })}
                trigger={
                  <button className={valueButton}>
                    <PriorityIcon value={item.priority} />
                    <span className={cn(item.priority === "none" && "text-faint")}>
                      {priority.label}
                    </span>
                  </button>
                }
              />
            </Field>

            <Field icon={<UserRound size={14} />} label="Owner">
              <AssigneePicker
                members={members}
                value={item.assigneeId}
                onChange={(assigneeId) => store.changeItem(itemId, { assigneeId })}
                trigger={
                  <button className={valueButton}>
                    {assignee ? (
                      <>
                        <Avatar name={assignee.name} id={assignee.id} size={20} />
                        {assignee.name}
                      </>
                    ) : (
                      <span className="text-faint">No owner</span>
                    )}
                  </button>
                }
              />
            </Field>

            <Field icon={<CalendarDays size={14} />} label="Due date">
              <DatePicker
                value={item.dueDate}
                today={today}
                onChange={(dueDate) => store.changeItem(itemId, { dueDate })}
                trigger={
                  <button className={valueButton}>
                    {item.dueDate ? (
                      <span
                        className={cn(
                          !done && item.dueDate < today && "font-medium text-danger",
                        )}
                      >
                        {formatShort(item.dueDate)}
                        <span className="ml-1.5 text-faint">
                          {relativeDays(item.dueDate, today)}
                        </span>
                      </span>
                    ) : (
                      <span className="text-faint">No due date</span>
                    )}
                  </button>
                }
              />
            </Field>

            <Field icon={<CalendarRange size={14} />} label="Start date">
              <DatePicker
                label="Start date"
                value={item.startDate}
                today={today}
                onChange={(startDate) => store.changeItem(itemId, { startDate })}
                trigger={
                  <button className={valueButton}>
                    {item.startDate ? (
                      formatShort(item.startDate)
                    ) : (
                      <span className="text-faint">No start date</span>
                    )}
                  </button>
                }
              />
            </Field>

            <Field icon={<Repeat size={14} />} label="Repeat">
              <RecurrencePicker
                value={item.recurrence}
                onChange={(recurrence) => store.changeItem(itemId, { recurrence })}
                trigger={
                  <button className={valueButton}>
                    {item.recurrence ? (
                      describeRecurrence(item.recurrence)
                    ) : (
                      <span className="text-faint">Doesn&apos;t repeat</span>
                    )}
                  </button>
                }
              />
            </Field>
          </dl>

          <DescriptionField
            key={detail ? "loaded" : "loading"}
            initial={detail?.description ?? ""}
            disabled={!detail}
            onSave={(description) => store.changeItem(itemId, { description })}
          />

          <section className="mt-5">
            <h3 className="flex items-center gap-2 text-xs font-semibold text-muted uppercase tracking-wide">
              Subtasks
              {subtasks.length > 0 ? (
                <span className="font-normal text-faint normal-case tabular-nums">
                  {subtasks.filter((s) => s.completedAt).length} of {subtasks.length} done
                </span>
              ) : null}
            </h3>
            <ul className="mt-1.5 flex flex-col">
              {subtasks.map((sub) => (
                <li key={sub.id} className="group flex h-8 items-center gap-2.5">
                  <button
                    role="checkbox"
                    aria-checked={Boolean(sub.completedAt)}
                    aria-label={sub.title}
                    onClick={() => toggleSubtask(sub)}
                    className={cn(
                      "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded border transition-colors",
                      sub.completedAt
                        ? "border-transparent bg-[var(--c-green)] text-white"
                        : "border-line-strong hover:border-accent",
                    )}
                  >
                    {sub.completedAt ? <Check size={12} strokeWidth={3} /> : null}
                  </button>
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-[13px]",
                      sub.completedAt && "text-faint line-through",
                    )}
                  >
                    {sub.title}
                  </span>
                  <button
                    aria-label={`Delete subtask ${sub.title}`}
                    onClick={() => removeSubtask(sub)}
                    className="rounded p-1 text-faint opacity-0 group-hover:opacity-100 hover:bg-surface-2 hover:text-danger focus-visible:opacity-100 max-md:opacity-100"
                  >
                    <X size={13} />
                  </button>
                </li>
              ))}
            </ul>
            <SubtaskInput onAdd={addSubtask} />
          </section>

          <section className="mt-6">
            <h3 className="text-xs font-semibold text-muted uppercase tracking-wide">
              Activity
            </h3>
            <ol className="mt-2 flex flex-col gap-3">
              {feed.map((entry) => (
                <FeedEntry key={entry.id} entry={entry} today={today} />
              ))}
              {!detail ? <li className="skeleton h-10" /> : null}
            </ol>
          </section>
        </div>
      </div>

      <CommentBox onSend={comment} />
    </div>
  );
}

const valueButton =
  "flex h-8 min-w-0 items-center gap-2 rounded-md px-2 -ml-2 text-left hover:bg-surface-2";

function PanelHeader({
  label,
  badge,
  menu,
  onClose,
}: {
  label: string;
  badge?: ReactNode;
  menu?: ReactNode;
  onClose: () => void;
}) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 px-3 pl-5">
      <span className="text-xs text-faint tabular-nums">{label}</span>
      {badge}
      <span className="flex-1" />
      {menu}
      <button
        onClick={onClose}
        aria-label="Close"
        className="rounded-md p-1.5 text-faint hover:bg-surface-2 hover:text-ink"
      >
        <X size={16} />
      </button>
    </header>
  );
}

function Field({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <>
      <dt className="flex items-center gap-2 text-muted">
        <span className="text-faint">{icon}</span>
        {label}
      </dt>
      <dd className="flex min-w-0 items-center">{children}</dd>
    </>
  );
}

function autoGrow(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

function TitleField({
  value,
  done,
  onSave,
  ...rest
}: {
  value: string;
  done: boolean;
  onSave: (title: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => autoGrow(ref.current), [value]);
  return (
    <textarea
      {...rest}
      ref={ref}
      key={value}
      defaultValue={value}
      rows={1}
      maxLength={300}
      aria-label="Title"
      className={cn(
        "-mx-2 w-[calc(100%+16px)] resize-none rounded-md border border-transparent bg-transparent px-2 py-1 text-lg leading-snug font-semibold outline-none hover:bg-surface-2 focus:border-accent focus:bg-surface",
        done && "text-muted line-through",
      )}
      onInput={(e) => autoGrow(e.currentTarget)}
      onBlur={(e) => {
        const next = e.target.value.trim();
        if (next && next !== value) onSave(next);
        else e.target.value = value;
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
    />
  );
}

function DescriptionField({
  initial,
  disabled,
  onSave,
}: {
  initial: string;
  disabled: boolean;
  onSave: (description: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const saved = useRef(initial);
  useEffect(() => autoGrow(ref.current), []);
  return (
    <textarea
      ref={ref}
      defaultValue={initial}
      disabled={disabled}
      rows={2}
      maxLength={20000}
      placeholder="Add a description…"
      aria-label="Description"
      className="-mx-2 mt-4 min-h-16 w-[calc(100%+16px)] resize-none rounded-md border border-transparent bg-transparent px-2 py-1.5 text-[13px] leading-relaxed outline-none placeholder:text-faint hover:bg-surface-2 focus:border-accent focus:bg-surface"
      onInput={(e) => autoGrow(e.currentTarget)}
      onBlur={(e) => {
        if (e.target.value !== saved.current) {
          saved.current = e.target.value;
          onSave(e.target.value);
        }
      }}
    />
  );
}

function SubtaskInput({ onAdd }: { onAdd: (title: string) => void }) {
  return (
    <div className="mt-0.5 flex h-8 items-center gap-2.5 text-faint">
      <Plus size={16} className="ml-px shrink-0" />
      <input
        placeholder="Add a subtask"
        maxLength={300}
        aria-label="Add a subtask"
        className="h-7 min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-faint"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            const title = e.currentTarget.value.trim();
            if (title) {
              onAdd(title);
              e.currentTarget.value = "";
            }
          }
        }}
      />
    </div>
  );
}

function ago(iso: string): string {
  const then = new Date(iso);
  if (Date.now() - then.getTime() < 45_000) return "just now";
  return formatDistanceToNowStrict(then, { addSuffix: true });
}

export function describeActivity(entry: ActivityEntry, today: string): string | null {
  const d = entry.data ?? {};
  const date = (value: string | null | undefined) => (value ? formatDue(value, today) : "");
  switch (entry.type) {
    case "created":
      if (entry.userId) return "created this";
      if (d.recurring) return `Created as the next ${d.recurring.toLowerCase()} copy`;
      return null;
    case "email":
      return d.from ? `Arrived by email from ${d.from}` : "Arrived by email";
    case "status":
      return d.from ? `moved this from ${d.from} to ${d.to}` : `moved this to ${d.to}`;
    case "priority":
      return d.to === "none" ? "removed the priority" : `set priority to ${d.to}`;
    case "assignee":
      return d.to ? `assigned this to ${d.to}` : "removed the owner";
    case "due":
      return d.to ? `set the due date to ${date(d.to)}` : "removed the due date";
    case "start":
      return d.to ? `set the start date to ${date(d.to)}` : "removed the start date";
    case "title":
      return `renamed this from “${d.from}”`;
    case "recurrence":
      return d.to ? `set this to repeat ${d.to.toLowerCase()}` : "stopped this repeating";
    default:
      return null;
  }
}

function FeedEntry({ entry, today }: { entry: ActivityEntry; today: string }) {
  if (entry.type === "comment") {
    const name = entry.userName ?? "Someone";
    return (
      <li className="flex gap-2.5">
        <Avatar name={name} id={entry.userId ?? name} size={24} className="mt-0.5" />
        <div className="min-w-0 flex-1 rounded-lg bg-surface-2 px-3 py-2">
          <p className="text-xs">
            <span className="font-semibold">{name}</span>
            <span className="ml-2 text-faint">{ago(entry.createdAt)}</span>
          </p>
          <p className="mt-0.5 text-[13px] leading-relaxed break-words whitespace-pre-wrap">
            {entry.body}
          </p>
        </div>
      </li>
    );
  }
  const text = describeActivity(entry, today);
  if (!text) return null;
  return (
    <li className="flex items-baseline gap-2.5 pl-[7px] text-xs text-muted">
      <span className="h-2.5 w-2.5 shrink-0 translate-y-px rounded-full border-2 border-line-strong" />
      <p className="min-w-0 break-words">
        {entry.userId ? (
          <span className="font-medium text-ink">{entry.userName ?? "Someone"} </span>
        ) : null}
        {text}
        <span className="ml-2 text-faint">{ago(entry.createdAt)}</span>
      </p>
    </li>
  );
}

function CommentBox({ onSend }: { onSend: (body: string) => void }) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  function send() {
    const body = value.trim();
    if (!body) return;
    onSend(body);
    setValue("");
    requestAnimationFrame(() => autoGrow(ref.current));
  }

  return (
    <div className="shrink-0 border-t border-line p-3">
      <div className="flex items-end gap-2 rounded-lg border border-line bg-surface px-3 py-2 focus-within:border-accent">
        <textarea
          ref={ref}
          value={value}
          rows={1}
          maxLength={10000}
          placeholder="Write a comment…"
          aria-label="Write a comment"
          className="max-h-40 min-h-6 flex-1 resize-none bg-transparent text-[13px] leading-relaxed outline-none placeholder:text-faint"
          onChange={(e) => {
            setValue(e.target.value);
            autoGrow(e.currentTarget);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              send();
            }
          }}
        />
        <Button size="sm" variant="primary" disabled={!value.trim()} onClick={send}>
          Send
        </Button>
      </div>
      <p className="mt-1 px-1 text-[11px] text-faint">Ctrl or ⌘ + Enter to send</p>
    </div>
  );
}
