"use client";

import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNowStrict } from "date-fns";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  CircleSlash,
  FlaskConical,
  History,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import {
  createRule,
  deleteRule,
  loadRuleRuns,
  searchAllItems,
  setRuleEnabled,
  testRule,
  updateRule,
} from "@/actions";
import { Dot, EmptyState } from "@/components/ui/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/overlays";
import {
  describeAction,
  describeCondition,
  describeTrigger,
  ruleInputSchema,
  type Action,
  type Condition,
  type RuleInput,
  type RuleLite,
  type RunEntry,
  type Trigger,
} from "@/lib/automation-types";
import { clientId, useToday } from "@/lib/client";
import type { SearchHit } from "@/lib/data";
import { PRIORITIES, type LabelLite, type Member, type ProjectLite, type WorkspaceLite } from "@/lib/types";
import { cn } from "@/lib/utils";

type StatusOption = { name: string; category: string };

type Ctx = {
  projects: ProjectLite[];
  labels: LabelLite[];
  members: Member[];
  statuses: StatusOption[];
};

function namesFrom(ctx: Ctx) {
  return {
    label: (id: string) => ctx.labels.find((l) => l.id === id)?.name ?? "(deleted label)",
    project: (id: string) => ctx.projects.find((p) => p.id === id)?.name ?? "(deleted project)",
    person: (id: string) => ctx.members.find((m) => m.id === id)?.name ?? "someone",
  };
}

const select =
  "h-8 min-w-0 rounded-md border border-line bg-surface px-2 text-[13px] text-ink outline-none focus:border-accent";

/** Ready-made rules to start from. */
function presets(ctx: Ctx): { title: string; rule: RuleInput }[] {
  const blocked = ctx.statuses.find((s) => s.name.trim().toLowerCase() === "blocked");
  const list: { title: string; rule: RuleInput }[] = [];
  if (blocked) {
    list.push({
      title: "Blocked items jump the queue",
      rule: {
        name: "Blocked items jump the queue",
        projectId: null,
        enabled: true,
        trigger: { type: "status_changed", toStatus: blocked.name, toCategory: null },
        conditions: [],
        actions: [
          { type: "set_priority", value: "urgent" },
          { type: "notify", message: "This is blocked. What would unblock it?" },
        ],
      },
    });
  }
  list.push(
    {
      title: "Remind me the day before it's due",
      rule: {
        name: "Due tomorrow reminder",
        projectId: null,
        enabled: true,
        trigger: { type: "due_date", daysBefore: 1, hour: 8 },
        conditions: [],
        actions: [{ type: "notify", message: "Due tomorrow." }],
      },
    },
    {
      title: "Flag items the day after they're late",
      rule: {
        name: "Flag late items",
        projectId: null,
        enabled: true,
        trigger: { type: "due_date", daysBefore: -1, hour: 8 },
        conditions: [],
        actions: [
          { type: "set_priority", value: "high" },
          { type: "comment", body: "This went past its due date. Pick a new date or let it go." },
        ],
      },
    },
    {
      title: "Monday sweep of overdue items",
      rule: {
        name: "Monday overdue sweep",
        projectId: null,
        enabled: true,
        trigger: { type: "schedule", freq: "weekly", weekday: 1, hour: 8 },
        conditions: [{ field: "due", op: "overdue" }],
        actions: [{ type: "notify", message: "Still overdue at the start of the week." }],
      },
    },
    {
      title: "New items without a date get one",
      rule: {
        name: "Give new items a date",
        projectId: null,
        enabled: true,
        trigger: { type: "item_created" },
        conditions: [{ field: "due", op: "is_empty" }],
        actions: [{ type: "set_due", days: 7 }],
      },
    },
  );
  return list;
}

function blankRule(): RuleInput {
  return {
    name: "",
    projectId: null,
    enabled: true,
    trigger: { type: "item_created" },
    conditions: [],
    actions: [{ type: "set_priority", value: "high" }],
  };
}

/**
 * The automations page for a workspace: a list of Jira-style rules, each
 * "when this happens, if this is true, do that", with an editor and a run log.
 */
export function AutomationsView({
  workspace,
  rules,
  focusProjectId,
  ...ctx
}: {
  workspace: WorkspaceLite;
  rules: RuleLite[];
  focusProjectId: string | null;
} & Ctx) {
  const [editing, setEditing] = useState<{ id: string | null; rule: RuleInput } | null>(null);
  const [logFor, setLogFor] = useState<RuleLite | null>(null);
  const [testFor, setTestFor] = useState<RuleLite | null>(null);
  const [scope, setScope] = useState<string>(focusProjectId ?? "all");
  const [, startTransition] = useTransition();
  const router = useRouter();
  const names = namesFrom(ctx);

  const shown =
    scope === "all" ? rules : rules.filter((r) => r.projectId === null || r.projectId === scope);

  function toggle(rule: RuleLite, enabled: boolean) {
    startTransition(async () => {
      const result = await setRuleEnabled({ ruleId: rule.id, enabled });
      if (!result.ok) toast.error(result.error);
    });
  }

  function remove(rule: RuleLite) {
    startTransition(async () => {
      const result = await deleteRule({ ruleId: rule.id });
      if (!result.ok) toast.error(result.error);
      else toast.success(`Deleted “${rule.name}”.`);
    });
  }

  const newRule = (rule: RuleInput) =>
    setEditing({
      id: null,
      rule: { ...rule, projectId: scope === "all" ? rule.projectId : scope },
    });

  return (
    <div className="thin-scroll h-full overflow-y-auto">
      <div className="mx-auto flex max-w-4xl flex-col gap-5 px-4 py-5 md:px-8 md:py-7">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
              <Zap size={18} className="text-accent" /> Automations
            </h1>
            <p className="text-[13px] text-muted">
              Rules for {workspace.name}: when something happens, if it matches, Laneway does
              the rest.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              aria-label="Show rules for"
              value={scope}
              onChange={(e) => {
                setScope(e.target.value);
                router.replace(
                  e.target.value === "all"
                    ? `/w/${workspace.id}/automations`
                    : `/w/${workspace.id}/automations?project=${e.target.value}`,
                  { scroll: false },
                );
              }}
              className={select}
            >
              <option value="all">All projects</option>
              {ctx.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <NewRuleMenu ctx={ctx} onPick={newRule} />
          </div>
        </header>

        {shown.length === 0 ? (
          <EmptyState
            title="No rules yet"
            body="A rule does a chore for you: flag late items, remind you before a due date, or tidy up when something is done."
            action={<NewRuleMenu ctx={ctx} onPick={newRule} primary />}
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {shown.map((rule) => (
              <RuleCard
                key={rule.id}
                rule={rule}
                names={names}
                projects={ctx.projects}
                onToggle={(on) => toggle(rule, on)}
                onEdit={() =>
                  setEditing({
                    id: rule.id,
                    rule: {
                      name: rule.name,
                      projectId: rule.projectId,
                      enabled: rule.enabled,
                      trigger: rule.trigger,
                      conditions: rule.conditions,
                      actions: rule.actions,
                    },
                  })
                }
                onDuplicate={() =>
                  setEditing({
                    id: null,
                    rule: {
                      name: `${rule.name} (copy)`,
                      projectId: rule.projectId,
                      enabled: false,
                      trigger: rule.trigger,
                      conditions: rule.conditions,
                      actions: rule.actions,
                    },
                  })
                }
                onLog={() => setLogFor(rule)}
                onTest={() => setTestFor(rule)}
                onDelete={() => remove(rule)}
              />
            ))}
          </ul>
        )}

        <p className="text-xs text-faint">
          Changes a rule makes don&apos;t set off other rules, so rules can&apos;t loop. Due-date
          and scheduled rules are checked every 15 minutes and act once per item per day.
        </p>
      </div>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        {editing ? (
          <RuleEditor
            key={editing.id ?? "new"}
            workspaceId={workspace.id}
            ruleId={editing.id}
            initial={editing.rule}
            ctx={ctx}
            onDone={() => setEditing(null)}
          />
        ) : null}
      </Dialog>

      <Dialog open={logFor !== null} onOpenChange={(open) => !open && setLogFor(null)}>
        {logFor ? <RunLog rule={logFor} workspaceId={workspace.id} /> : null}
      </Dialog>

      <Dialog open={testFor !== null} onOpenChange={(open) => !open && setTestFor(null)}>
        {testFor ? (
          <TestRule rule={testFor} workspaceId={workspace.id} onDone={() => setTestFor(null)} />
        ) : null}
      </Dialog>
    </div>
  );
}

function NewRuleMenu({
  ctx,
  onPick,
  primary,
}: {
  ctx: Ctx;
  onPick: (rule: RuleInput) => void;
  primary?: boolean;
}) {
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button variant="primary" size={primary ? "md" : "sm"}>
          <Plus size={14} /> New rule
        </Button>
      </MenuTrigger>
      <MenuContent align="end" className="w-72">
        <MenuItem onSelect={() => onPick(blankRule())}>
          <Pencil size={14} className="text-muted" /> Start from scratch
        </MenuItem>
        <MenuSeparator />
        <MenuLabel>Start from an example</MenuLabel>
        {presets(ctx).map((p) => (
          <MenuItem key={p.title} onSelect={() => onPick(p.rule)}>
            <Zap size={14} className="text-muted" /> {p.title}
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  );
}

function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-5 w-9 shrink-0 rounded-full transition-colors",
        checked ? "bg-accent" : "bg-line-strong",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-card transition-transform",
          checked && "translate-x-4",
        )}
      />
    </button>
  );
}

const OUTCOME = {
  done: { icon: CheckCircle2, className: "text-[var(--c-green)]", label: "Done" },
  skipped: { icon: CircleSlash, className: "text-faint", label: "Skipped" },
  failed: { icon: AlertCircle, className: "text-danger", label: "Failed" },
} as const;

function RuleCard({
  rule,
  names,
  projects,
  onToggle,
  onEdit,
  onDuplicate,
  onLog,
  onTest,
  onDelete,
}: {
  rule: RuleLite;
  names: ReturnType<typeof namesFrom>;
  projects: ProjectLite[];
  onToggle: (on: boolean) => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onLog: () => void;
  onTest: () => void;
  onDelete: () => void;
}) {
  const project = projects.find((p) => p.id === rule.projectId);
  const last = rule.lastRun
    ? OUTCOME[rule.lastRun.outcome as keyof typeof OUTCOME] ?? OUTCOME.done
    : null;

  return (
    <li
      className={cn(
        "rounded-xl border border-line bg-surface p-4 shadow-card transition-opacity",
        !rule.enabled && "opacity-70",
      )}
    >
      <div className="flex items-start gap-3">
        <Switch
          checked={rule.enabled}
          onChange={onToggle}
          label={rule.enabled ? `Turn off ${rule.name}` : `Turn on ${rule.name}`}
        />
        <div className="min-w-0 flex-1">
          <button onClick={onEdit} className="text-left text-sm font-semibold hover:underline">
            {rule.name}
          </button>
          <span className="ml-2 inline-flex items-center gap-1.5 text-xs text-muted">
            {project ? (
              <>
                <Dot color={project.color} className="h-2 w-2" /> {project.name}
              </>
            ) : (
              "All projects"
            )}
          </span>
          <RuleSentence rule={rule} names={names} />
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-faint">
            {last && rule.lastRun ? (
              <button onClick={onLog} className="flex items-center gap-1 hover:text-ink">
                <last.icon size={13} className={last.className} />
                {last.label}{" "}
                {/* Relative time differs between the server render and now. */}
                <span suppressHydrationWarning>
                  {formatDistanceToNowStrict(new Date(rule.lastRun.createdAt), { addSuffix: true })}
                </span>
              </button>
            ) : (
              <span>Hasn&apos;t run yet</span>
            )}
            {rule.runCount ? (
              <button onClick={onLog} className="hover:text-ink">
                {rule.runCount} in the log
              </button>
            ) : null}
          </p>
        </div>
        <Menu>
          <MenuTrigger
            aria-label={`${rule.name} options`}
            className="rounded-md p-1.5 text-faint hover:bg-surface-2 hover:text-ink"
          >
            <MoreHorizontal size={16} />
          </MenuTrigger>
          <MenuContent align="end">
            <MenuItem onSelect={onEdit}>
              <Pencil size={14} /> Edit
            </MenuItem>
            <MenuItem onSelect={onTest}>
              <FlaskConical size={14} /> Test on an item
            </MenuItem>
            <MenuItem onSelect={onLog}>
              <History size={14} /> Run log
            </MenuItem>
            <MenuItem onSelect={onDuplicate}>
              <Plus size={14} /> Duplicate
            </MenuItem>
            <MenuSeparator />
            <MenuItem danger onSelect={onDelete}>
              <Trash2 size={14} /> Delete
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>
    </li>
  );
}

function RuleSentence({
  rule,
  names,
}: {
  rule: Pick<RuleInput, "trigger" | "conditions" | "actions">;
  names: ReturnType<typeof namesFrom>;
}) {
  return (
    <div className="mt-2 flex flex-col gap-1 text-[13px]">
      <Clause tone="when">{describeTrigger(rule.trigger, names)}</Clause>
      {rule.conditions.length ? (
        <Clause tone="if">{rule.conditions.map((c) => describeCondition(c, names)).join(" and ")}</Clause>
      ) : null}
      <Clause tone="then">{rule.actions.map((a) => describeAction(a, names)).join(", then ")}</Clause>
    </div>
  );
}

function Clause({ tone, children }: { tone: "when" | "if" | "then"; children: ReactNode }) {
  return (
    <p className="flex items-baseline gap-2">
      <span
        className={cn(
          "w-10 shrink-0 text-[11px] font-semibold tracking-wide uppercase",
          tone === "when" ? "text-accent" : tone === "if" ? "text-[var(--c-amber)]" : "text-[var(--c-green)]",
        )}
      >
        {tone}
      </span>
      <span className="min-w-0 text-ink">{children}</span>
    </p>
  );
}

// ---------------------------------------------------------------- the editor

const TRIGGERS: { type: Trigger["type"]; label: string }[] = [
  { type: "item_created", label: "An item is created" },
  { type: "status_changed", label: "Its status changes" },
  { type: "priority_changed", label: "Its priority changes" },
  { type: "label_added", label: "A label is added" },
  { type: "due_date", label: "A due date comes up" },
  { type: "schedule", label: "On a schedule" },
];

const CONDITIONS: { field: Condition["field"]; label: string }[] = [
  { field: "status", label: "Status" },
  { field: "category", label: "Progress" },
  { field: "priority", label: "Priority" },
  { field: "label", label: "Label" },
  { field: "assignee", label: "Owner" },
  { field: "due", label: "Due date" },
  { field: "title", label: "Title" },
];

const ACTIONS: { type: Action["type"]; label: string }[] = [
  { type: "set_status", label: "Set the status" },
  { type: "set_priority", label: "Set the priority" },
  { type: "add_label", label: "Add a label" },
  { type: "remove_label", label: "Remove a label" },
  { type: "assign", label: "Assign it" },
  { type: "set_due", label: "Set the due date" },
  { type: "comment", label: "Add a comment" },
  { type: "create_subtask", label: "Create a subtask" },
  { type: "notify", label: "Notify the owner" },
  { type: "move_project", label: "Move to another project" },
];

const CATEGORIES = [
  { value: "todo", label: "Not started" },
  { value: "active", label: "In progress" },
  { value: "done", label: "Done" },
] as const;

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const HOURS = Array.from({ length: 24 }, (_, h) => ({
  value: h,
  label: `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`,
}));

function defaultTrigger(type: Trigger["type"]): Trigger {
  switch (type) {
    case "item_created":
      return { type };
    case "status_changed":
      return { type, toStatus: null, toCategory: "done" };
    case "priority_changed":
      return { type, to: null };
    case "label_added":
      return { type, labelId: null };
    case "due_date":
      return { type, daysBefore: 1, hour: 8 };
    case "schedule":
      return { type, freq: "weekly", weekday: 1, hour: 8 };
  }
}

function defaultCondition(field: Condition["field"], ctx: Ctx): Condition | null {
  switch (field) {
    case "status":
      return ctx.statuses[0] ? { field, op: "is", value: ctx.statuses[0].name } : null;
    case "category":
      return { field, op: "is_not", value: "done" };
    case "priority":
      return { field, op: "is", value: "urgent" };
    case "label":
      return ctx.labels[0] ? { field, op: "has", value: ctx.labels[0].id } : null;
    case "assignee":
      return { field, op: "is_empty" };
    case "due":
      return { field, op: "is_set" };
    case "title":
      return { field, op: "contains", value: "" };
  }
}

function defaultAction(type: Action["type"], ctx: Ctx, projectId: string | null): Action | null {
  switch (type) {
    case "set_status":
      return { type, status: null, category: "done" };
    case "set_priority":
      return { type, value: "high" };
    case "add_label":
    case "remove_label":
      return ctx.labels[0] ? { type, labelId: ctx.labels[0].id } : null;
    case "assign":
      return { type, to: "creator" };
    case "set_due":
      return { type, days: 7 };
    case "comment":
      return { type, body: "" };
    case "create_subtask":
      return { type, title: "" };
    case "notify":
      return { type, message: "" };
    case "move_project": {
      const target = ctx.projects.find((p) => p.id !== projectId) ?? ctx.projects[0];
      return target ? { type, projectId: target.id } : null;
    }
  }
}

function RuleEditor({
  workspaceId,
  ruleId,
  initial,
  ctx,
  onDone,
}: {
  workspaceId: string;
  ruleId: string | null;
  initial: RuleInput;
  ctx: Ctx;
  onDone: () => void;
}) {
  const [rule, setRule] = useState<RuleInput>(initial);
  const [saving, startSaving] = useTransition();
  const names = namesFrom(ctx);
  const set = (patch: Partial<RuleInput>) => setRule((r) => ({ ...r, ...patch }));
  const timed = rule.trigger.type === "due_date" || rule.trigger.type === "schedule";

  const problem = useMemo(() => {
    if (!rule.name.trim()) return "Give the rule a name.";
    if (rule.actions.length === 0) return "Add at least one action.";
    const parsed = ruleInputSchema.safeParse(rule);
    if (!parsed.success) return "Fill in every field, such as comment text or a subtask title.";
    return null;
  }, [rule]);

  function save() {
    if (problem) return;
    startSaving(async () => {
      const result = ruleId
        ? await updateRule({ ruleId, rule })
        : await createRule({ id: clientId(), workspaceId, rule });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(ruleId ? "Rule saved." : "Rule created.");
      onDone();
    });
  }

  return (
    <DialogContent
      title={ruleId ? "Edit rule" : "New rule"}
      description="When this happens, if it matches, do these things."
      className="w-[min(680px,calc(100vw-24px))]"
    >
      <div className="flex flex-col gap-5">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px]">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            Name
            <Input
              value={rule.name}
              maxLength={120}
              autoFocus
              placeholder="For example: Flag late items"
              onChange={(e) => set({ name: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            Applies to
            <select
              value={rule.projectId ?? ""}
              onChange={(e) => set({ projectId: e.target.value || null })}
              className={cn(select, "h-9")}
            >
              <option value="">All projects</option>
              {ctx.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <Section tone="when" title="When">
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Trigger"
              value={rule.trigger.type}
              onChange={(e) => set({ trigger: defaultTrigger(e.target.value as Trigger["type"]) })}
              className={select}
            >
              {TRIGGERS.map((t) => (
                <option key={t.type} value={t.type}>
                  {t.label}
                </option>
              ))}
            </select>
            <TriggerFields trigger={rule.trigger} ctx={ctx} onChange={(trigger) => set({ trigger })} />
          </div>
        </Section>

        <Section tone="if" title="If (optional)">
          {rule.conditions.map((c, i) => (
            <Row
              key={i}
              onRemove={() => set({ conditions: rule.conditions.filter((_, j) => j !== i) })}
            >
              <ConditionFields
                condition={c}
                ctx={ctx}
                onChange={(next) =>
                  set({ conditions: rule.conditions.map((x, j) => (j === i ? next : x)) })
                }
              />
            </Row>
          ))}
          <AddMenu
            label={rule.conditions.length ? "And…" : "Add a condition"}
            options={CONDITIONS.map((c) => ({
              key: c.field,
              label: c.label,
              disabled: !defaultCondition(c.field, ctx),
            }))}
            onPick={(field) => {
              const next = defaultCondition(field as Condition["field"], ctx);
              if (next) set({ conditions: [...rule.conditions, next].slice(0, 10) });
            }}
          />
          {rule.trigger.type === "schedule" && rule.conditions.length === 0 ? (
            <p className="text-xs text-[var(--c-amber)]">
              Without a condition, a scheduled rule acts on every open item.
            </p>
          ) : null}
        </Section>

        <Section tone="then" title="Then">
          {rule.actions.map((a, i) => (
            <Row key={i} onRemove={() => set({ actions: rule.actions.filter((_, j) => j !== i) })}>
              <ActionFields
                action={a}
                ctx={ctx}
                onChange={(next) =>
                  set({ actions: rule.actions.map((x, j) => (j === i ? next : x)) })
                }
              />
            </Row>
          ))}
          <AddMenu
            label={rule.actions.length ? "Then also…" : "Add an action"}
            options={ACTIONS.map((a) => ({
              key: a.type,
              label: a.label,
              disabled: !defaultAction(a.type, ctx, rule.projectId),
            }))}
            onPick={(type) => {
              const next = defaultAction(type as Action["type"], ctx, rule.projectId);
              if (next) set({ actions: [...rule.actions, next].slice(0, 10) });
            }}
          />
        </Section>

        <div className="rounded-lg bg-surface-2 px-3 py-2">
          <p className="text-[11px] font-medium tracking-wide text-faint uppercase">In plain words</p>
          <RuleSentence rule={rule} names={names} />
          {timed ? (
            <p className="mt-1.5 text-xs text-muted">
              Runs on your Laneway&apos;s clock, once per item per day.
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-[13px]">
            <Switch
              checked={rule.enabled}
              onChange={(enabled) => set({ enabled })}
              label="Rule is on"
            />
            {rule.enabled ? "On" : "Off"}
          </label>
          <div className="flex items-center gap-2">
            {problem ? <span className="text-xs text-muted">{problem}</span> : null}
            <Button variant="ghost" onClick={onDone}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save} disabled={Boolean(problem) || saving}>
              {ruleId ? "Save rule" : "Create rule"}
            </Button>
          </div>
        </div>
      </div>
    </DialogContent>
  );
}

function Section({
  tone,
  title,
  children,
}: {
  tone: "when" | "if" | "then";
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3
        className={cn(
          "text-[11px] font-semibold tracking-wide uppercase",
          tone === "when" ? "text-accent" : tone === "if" ? "text-[var(--c-amber)]" : "text-[var(--c-green)]",
        )}
      >
        {title}
      </h3>
      {children}
    </section>
  );
}

function Row({ children, onRemove }: { children: ReactNode; onRemove: () => void }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-line px-2.5 py-2">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{children}</div>
      <button
        onClick={onRemove}
        aria-label="Remove"
        className="rounded-md p-1 text-faint hover:bg-surface-2 hover:text-ink"
      >
        <X size={14} />
      </button>
    </div>
  );
}

function AddMenu({
  label,
  options,
  onPick,
}: {
  label: string;
  options: { key: string; label: string; disabled?: boolean }[];
  onPick: (key: string) => void;
}) {
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button variant="ghost" size="sm" className="self-start">
          <Plus size={14} /> {label}
        </Button>
      </MenuTrigger>
      <MenuContent>
        {options.map((o) => (
          <MenuItem
            key={o.key}
            disabled={o.disabled}
            onSelect={() => onPick(o.key)}
            className="data-[disabled]:opacity-50"
          >
            {o.label}
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  );
}

/** "status:Blocked" or "category:done", so one select covers both. */
function StatusSelect({
  status,
  category,
  ctx,
  allowAny,
  onChange,
  label,
}: {
  status: string | null | undefined;
  category: string | null | undefined;
  ctx: Ctx;
  allowAny?: boolean;
  onChange: (value: { status: string | null; category: "todo" | "active" | "done" | null }) => void;
  label: string;
}) {
  const value = status ? `status:${status}` : category ? `category:${category}` : "";
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => {
        const [kind, rest] = [e.target.value.split(":")[0], e.target.value.slice(e.target.value.indexOf(":") + 1)];
        if (kind === "status") onChange({ status: rest, category: null });
        else if (kind === "category") onChange({ status: null, category: rest as "todo" | "active" | "done" });
        else onChange({ status: null, category: null });
      }}
      className={select}
    >
      {allowAny ? <option value="">any status</option> : null}
      <optgroup label="Any status that is">
        {CATEGORIES.map((c) => (
          <option key={c.value} value={`category:${c.value}`}>
            {c.label}
          </option>
        ))}
      </optgroup>
      <optgroup label="A status named">
        {ctx.statuses.map((s) => (
          <option key={s.name} value={`status:${s.name}`}>
            {s.name}
          </option>
        ))}
      </optgroup>
    </select>
  );
}

function PrioritySelect({
  value,
  onChange,
  allowAny,
  label,
}: {
  value: string | null | undefined;
  onChange: (value: (typeof PRIORITIES)[number]["value"] | null) => void;
  allowAny?: boolean;
  label: string;
}) {
  return (
    <select
      aria-label={label}
      value={value ?? ""}
      onChange={(e) => onChange((e.target.value || null) as (typeof PRIORITIES)[number]["value"] | null)}
      className={select}
    >
      {allowAny ? <option value="">any priority</option> : null}
      {PRIORITIES.map((p) => (
        <option key={p.value} value={p.value}>
          {p.label}
        </option>
      ))}
    </select>
  );
}

function LabelSelect({
  value,
  ctx,
  onChange,
  allowAny,
  label,
}: {
  value: string | null | undefined;
  ctx: Ctx;
  onChange: (value: string | null) => void;
  allowAny?: boolean;
  label: string;
}) {
  return (
    <select
      aria-label={label}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      className={select}
    >
      {allowAny ? <option value="">any label</option> : null}
      {ctx.labels.map((l) => (
        <option key={l.id} value={l.id}>
          {l.name}
        </option>
      ))}
    </select>
  );
}

function HourSelect({ value, onChange }: { value: number; onChange: (hour: number) => void }) {
  return (
    <select
      aria-label="Time of day"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className={select}
    >
      {HOURS.map((h) => (
        <option key={h.value} value={h.value}>
          at {h.label}
        </option>
      ))}
    </select>
  );
}

function TriggerFields({
  trigger,
  ctx,
  onChange,
}: {
  trigger: Trigger;
  ctx: Ctx;
  onChange: (trigger: Trigger) => void;
}) {
  switch (trigger.type) {
    case "item_created":
      return null;
    case "status_changed":
      return (
        <>
          <span className="text-[13px] text-muted">to</span>
          <StatusSelect
            label="New status"
            status={trigger.toStatus}
            category={trigger.toCategory}
            ctx={ctx}
            allowAny
            onChange={({ status, category }) =>
              onChange({ ...trigger, toStatus: status, toCategory: category })
            }
          />
        </>
      );
    case "priority_changed":
      return (
        <>
          <span className="text-[13px] text-muted">to</span>
          <PrioritySelect
            label="New priority"
            value={trigger.to}
            allowAny
            onChange={(to) => onChange({ ...trigger, to })}
          />
        </>
      );
    case "label_added":
      return (
        <LabelSelect
          label="Label"
          value={trigger.labelId}
          ctx={ctx}
          allowAny
          onChange={(labelId) => onChange({ ...trigger, labelId })}
        />
      );
    case "due_date": {
      const mode = trigger.daysBefore > 0 ? "before" : trigger.daysBefore < 0 ? "after" : "on";
      const n = Math.abs(trigger.daysBefore);
      return (
        <>
          {mode !== "on" ? (
            <input
              type="number"
              aria-label="Days"
              min={1}
              max={30}
              value={n}
              onChange={(e) => {
                const days = Math.min(30, Math.max(1, Number(e.target.value) || 1));
                onChange({ ...trigger, daysBefore: mode === "before" ? days : -days });
              }}
              className={cn(select, "w-16")}
            />
          ) : null}
          <select
            aria-label="When"
            value={mode}
            onChange={(e) => {
              const next = e.target.value;
              const days = Math.max(1, n);
              onChange({
                ...trigger,
                daysBefore: next === "on" ? 0 : next === "before" ? days : -days,
              });
            }}
            className={select}
          >
            <option value="before">{n === 1 ? "day" : "days"} before it&apos;s due</option>
            <option value="on">on the due date</option>
            <option value="after">{n === 1 ? "day" : "days"} after it was due</option>
          </select>
          <HourSelect value={trigger.hour} onChange={(hour) => onChange({ ...trigger, hour })} />
        </>
      );
    }
    case "schedule":
      return (
        <>
          <select
            aria-label="How often"
            value={trigger.freq === "daily" ? "daily" : String(trigger.weekday ?? 1)}
            onChange={(e) =>
              onChange(
                e.target.value === "daily"
                  ? { ...trigger, freq: "daily", weekday: null }
                  : { ...trigger, freq: "weekly", weekday: Number(e.target.value) },
              )
            }
            className={select}
          >
            <option value="daily">every day</option>
            {WEEKDAYS.map((d, i) => (
              <option key={d} value={i}>
                every {d}
              </option>
            ))}
          </select>
          <HourSelect value={trigger.hour} onChange={(hour) => onChange({ ...trigger, hour })} />
          <span className="text-[13px] text-muted">for each open item</span>
        </>
      );
  }
}

function ConditionFields({
  condition: c,
  ctx,
  onChange,
}: {
  condition: Condition;
  ctx: Ctx;
  onChange: (c: Condition) => void;
}) {
  const fieldLabel = CONDITIONS.find((x) => x.field === c.field)?.label ?? c.field;
  const head = <span className="text-[13px] font-medium">{fieldLabel}</span>;
  switch (c.field) {
    case "status":
      return (
        <>
          {head}
          <IsSelect value={c.op} onChange={(op) => onChange({ ...c, op })} />
          <select
            aria-label="Status"
            value={c.value}
            onChange={(e) => onChange({ ...c, value: e.target.value })}
            className={select}
          >
            {ctx.statuses.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
        </>
      );
    case "category":
      return (
        <>
          {head}
          <IsSelect value={c.op} onChange={(op) => onChange({ ...c, op })} />
          <select
            aria-label="Progress"
            value={c.value}
            onChange={(e) => onChange({ ...c, value: e.target.value as typeof c.value })}
            className={select}
          >
            {CATEGORIES.map((x) => (
              <option key={x.value} value={x.value}>
                {x.label.toLowerCase()}
              </option>
            ))}
          </select>
        </>
      );
    case "priority":
      return (
        <>
          {head}
          <IsSelect value={c.op} onChange={(op) => onChange({ ...c, op })} />
          <PrioritySelect
            label="Priority"
            value={c.value}
            onChange={(value) => value && onChange({ ...c, value })}
          />
        </>
      );
    case "label":
      return (
        <>
          {head}
          <select
            aria-label="Has or not"
            value={c.op}
            onChange={(e) => onChange({ ...c, op: e.target.value as typeof c.op })}
            className={select}
          >
            <option value="has">includes</option>
            <option value="has_not">doesn&apos;t include</option>
          </select>
          <LabelSelect
            label="Label"
            value={c.value}
            ctx={ctx}
            onChange={(value) => value && onChange({ ...c, value })}
          />
        </>
      );
    case "assignee":
      return (
        <>
          {head}
          <select
            aria-label="Owner"
            value={c.op}
            onChange={(e) => onChange({ ...c, op: e.target.value as typeof c.op })}
            className={select}
          >
            <option value="is_set">is set</option>
            <option value="is_empty">is nobody</option>
          </select>
        </>
      );
    case "due":
      return (
        <>
          {head}
          <select
            aria-label="Due date"
            value={c.op}
            onChange={(e) => onChange({ ...c, op: e.target.value as typeof c.op })}
            className={select}
          >
            <option value="is_set">is set</option>
            <option value="is_empty">is empty</option>
            <option value="overdue">has passed</option>
          </select>
        </>
      );
    case "title":
      return (
        <>
          {head}
          <span className="text-[13px] text-muted">contains</span>
          <Input
            aria-label="Title contains"
            value={c.value}
            maxLength={100}
            onChange={(e) => onChange({ ...c, value: e.target.value })}
            className="h-8 w-48"
          />
        </>
      );
  }
}

function IsSelect({
  value,
  onChange,
}: {
  value: "is" | "is_not";
  onChange: (op: "is" | "is_not") => void;
}) {
  return (
    <select
      aria-label="Is or is not"
      value={value}
      onChange={(e) => onChange(e.target.value as "is" | "is_not")}
      className={select}
    >
      <option value="is">is</option>
      <option value="is_not">is not</option>
    </select>
  );
}

function ActionFields({
  action: a,
  ctx,
  onChange,
}: {
  action: Action;
  ctx: Ctx;
  onChange: (a: Action) => void;
}) {
  const head = (
    <span className="text-[13px] font-medium">
      {ACTIONS.find((x) => x.type === a.type)?.label ?? a.type}
    </span>
  );
  switch (a.type) {
    case "set_status":
      return (
        <>
          {head}
          <span className="text-[13px] text-muted">to</span>
          <StatusSelect
            label="Status"
            status={a.status}
            category={a.category}
            ctx={ctx}
            onChange={({ status, category }) => onChange({ ...a, status, category })}
          />
        </>
      );
    case "set_priority":
      return (
        <>
          {head}
          <span className="text-[13px] text-muted">to</span>
          <PrioritySelect
            label="Priority"
            value={a.value}
            onChange={(value) => value && onChange({ ...a, value })}
          />
        </>
      );
    case "add_label":
    case "remove_label":
      return (
        <>
          {head}
          <LabelSelect
            label="Label"
            value={a.labelId}
            ctx={ctx}
            onChange={(labelId) => labelId && onChange({ ...a, labelId })}
          />
        </>
      );
    case "assign":
      return (
        <>
          {head}
          <span className="text-[13px] text-muted">to</span>
          <select
            aria-label="Assign to"
            value={a.to ?? ""}
            onChange={(e) => onChange({ ...a, to: e.target.value || null })}
            className={select}
          >
            <option value="creator">whoever created it</option>
            {ctx.members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
            <option value="">nobody (unassign)</option>
          </select>
        </>
      );
    case "set_due":
      return (
        <>
          {head}
          <span className="text-[13px] text-muted">to</span>
          <input
            type="number"
            aria-label="Days from now"
            min={0}
            max={365}
            value={a.days}
            onChange={(e) =>
              onChange({ ...a, days: Math.min(365, Math.max(0, Number(e.target.value) || 0)) })
            }
            className={cn(select, "w-16")}
          />
          <span className="text-[13px] text-muted">days from the day it runs</span>
        </>
      );
    case "comment":
      return (
        <>
          {head}
          <Input
            aria-label="Comment"
            value={a.body}
            maxLength={2000}
            placeholder="What should the comment say?"
            onChange={(e) => onChange({ ...a, body: e.target.value })}
            className="h-8 min-w-48 flex-1"
          />
        </>
      );
    case "create_subtask":
      return (
        <>
          {head}
          <Input
            aria-label="Subtask title"
            value={a.title}
            maxLength={300}
            placeholder="Subtask title"
            onChange={(e) => onChange({ ...a, title: e.target.value })}
            className="h-8 min-w-48 flex-1"
          />
        </>
      );
    case "notify":
      return (
        <>
          {head}
          <Input
            aria-label="Notification"
            value={a.message}
            maxLength={300}
            placeholder="What should the notification say?"
            onChange={(e) => onChange({ ...a, message: e.target.value })}
            className="h-8 min-w-48 flex-1"
          />
        </>
      );
    case "move_project":
      return (
        <>
          {head}
          <select
            aria-label="Project"
            value={a.projectId}
            onChange={(e) => onChange({ ...a, projectId: e.target.value })}
            className={select}
          >
            {ctx.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </>
      );
  }
}

// ------------------------------------------------------------ log and test

function RunLog({ rule, workspaceId }: { rule: RuleLite; workspaceId: string }) {
  const [runs, setRuns] = useState<RunEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadRuleRuns({ ruleId: rule.id }).then((r) => {
      if (!cancelled) setRuns(r);
    });
    return () => {
      cancelled = true;
    };
  }, [rule.id]);

  return (
    <DialogContent
      title={`Run log: ${rule.name}`}
      description="The latest 100 times this rule ran, newest first."
      className="w-[min(640px,calc(100vw-24px))]"
    >
      {runs === null ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-12 rounded-lg" />
          ))}
        </div>
      ) : runs.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-muted">
          This rule hasn&apos;t run yet. Use “Test on an item” to try it.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {runs.map((run) => {
            const o = OUTCOME[run.outcome] ?? OUTCOME.done;
            return (
              <li key={run.id} className="flex gap-2.5 py-2.5">
                <o.icon size={15} className={cn("mt-0.5 shrink-0", o.className)} aria-label={o.label} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px]">
                    {run.itemTitle ? (
                      run.itemId ? (
                        <ItemLink workspaceId={workspaceId} itemId={run.itemId} title={run.itemTitle} />
                      ) : (
                        <span className="font-medium">{run.itemTitle}</span>
                      )
                    ) : (
                      <span className="font-medium">{o.label}</span>
                    )}
                  </p>
                  <p className="text-xs text-muted">{run.message}</p>
                </div>
                <span className="shrink-0 text-[11px] text-faint">
                  {formatDistanceToNowStrict(new Date(run.createdAt), { addSuffix: true })}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </DialogContent>
  );
}

/** The run log stores an item id, not its project, so look it up on click. */
function ItemLink({ workspaceId, itemId, title }: { workspaceId: string; itemId: string; title: string }) {
  const router = useRouter();
  return (
    <button
      className="text-left font-medium hover:underline"
      onClick={async () => {
        const hits = await searchAllItems(title);
        const hit = hits.find((h) => h.id === itemId && h.workspaceId === workspaceId);
        if (hit) router.push(`/w/${hit.workspaceId}/p/${hit.projectId}?item=${hit.id}`);
        else toast.error("That item no longer exists.");
      }}
    >
      {title}
    </button>
  );
}

function TestRule({
  rule,
  workspaceId,
  onDone,
}: {
  rule: RuleLite;
  workspaceId: string;
  onDone: () => void;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [busy, startBusy] = useTransition();
  const [result, setResult] = useState<{ outcome: string; message: string } | null>(null);
  const today = useToday();

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const found = await searchAllItems(q);
      if (!cancelled) {
        setHits(
          found.filter(
            (h) => h.workspaceId === workspaceId && (!rule.projectId || h.projectId === rule.projectId),
          ),
        );
      }
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, workspaceId, rule.projectId]);

  function run(hit: SearchHit) {
    if (!today) return;
    startBusy(async () => {
      const res = await testRule({ ruleId: rule.id, itemId: hit.id, today });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setResult({ outcome: res.outcome, message: res.message });
    });
  }

  const o = result ? OUTCOME[result.outcome as keyof typeof OUTCOME] ?? OUTCOME.done : null;

  return (
    <DialogContent
      title={`Test: ${rule.name}`}
      description="Runs the rule's actions on one item now, whatever the trigger. Conditions still apply. This really changes the item."
    >
      {result && o ? (
        <div className="flex flex-col gap-4">
          <p className="flex items-start gap-2 text-[13px]">
            <o.icon size={16} className={cn("mt-0.5 shrink-0", o.className)} />
            {result.message}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setResult(null)}>
              Test another
            </Button>
            <Button variant="primary" onClick={onDone}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Input
            autoFocus
            value={query}
            placeholder="Search for an item by title…"
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search items"
          />
          <ul className="flex max-h-72 flex-col overflow-y-auto">
            {(query.trim().length >= 2 ? hits : []).map((hit) => (
              <li key={hit.id}>
                <button
                  disabled={busy}
                  onClick={() => run(hit)}
                  className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] hover:bg-surface-2 disabled:opacity-50"
                >
                  <Dot color={hit.projectColor} className="h-2 w-2" />
                  <span className="text-xs text-faint tabular-nums">
                    {hit.projectKey}-{hit.number}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{hit.title}</span>
                  <ArrowRight size={13} className="text-faint" />
                </button>
              </li>
            ))}
          </ul>
          {query.trim().length >= 2 && hits.length === 0 ? (
            <p className="py-3 text-center text-xs text-muted">No matching items in this rule&apos;s scope.</p>
          ) : null}
        </div>
      )}
    </DialogContent>
  );
}
