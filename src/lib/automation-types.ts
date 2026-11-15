import { z } from "zod";
import { PRIORITIES, type Priority } from "./types";

/**
 * The shapes of automation rules, shared by the rule editor, the server
 * actions that save rules, and the engine that runs them.
 */

const id = z.string().regex(/^[a-z0-9]{10,32}$/);
const priority = z.enum(["none", "low", "medium", "high", "urgent"]);
const category = z.enum(["todo", "active", "done"]);
const statusName = z.string().trim().min(1).max(60);

// ------------------------------------------------------------------ triggers

export const triggerSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("item_created") }),
  z.object({
    type: z.literal("status_changed"),
    /** A status name, or empty for any status. */
    toStatus: statusName.nullish(),
    /** Or any status in this category, e.g. any "done" status. */
    toCategory: category.nullish(),
  }),
  z.object({ type: z.literal("priority_changed"), to: priority.nullish() }),
  z.object({ type: z.literal("label_added"), labelId: id.nullish() }),
  z.object({
    type: z.literal("due_date"),
    /** 0 on the due date, 2 two days before, -1 the day after (overdue). */
    daysBefore: z.number().int().min(-30).max(30),
    hour: z.number().int().min(0).max(23).default(8),
  }),
  z.object({
    type: z.literal("schedule"),
    freq: z.enum(["daily", "weekly"]),
    /** 0 Sunday to 6 Saturday, for weekly rules. */
    weekday: z.number().int().min(0).max(6).nullish(),
    hour: z.number().int().min(0).max(23).default(8),
  }),
]);

export type Trigger = z.infer<typeof triggerSchema>;
export type TriggerType = Trigger["type"];

/** Triggers that the daily job runs, not a change someone makes. */
export const TIMED_TRIGGERS: TriggerType[] = ["due_date", "schedule"];

// ---------------------------------------------------------------- conditions

export const conditionSchema = z.discriminatedUnion("field", [
  z.object({ field: z.literal("status"), op: z.enum(["is", "is_not"]), value: statusName }),
  z.object({ field: z.literal("category"), op: z.enum(["is", "is_not"]), value: category }),
  z.object({ field: z.literal("priority"), op: z.enum(["is", "is_not"]), value: priority }),
  z.object({ field: z.literal("label"), op: z.enum(["has", "has_not"]), value: id }),
  z.object({ field: z.literal("assignee"), op: z.enum(["is_set", "is_empty"]) }),
  z.object({ field: z.literal("due"), op: z.enum(["is_set", "is_empty", "overdue"]) }),
  z.object({
    field: z.literal("title"),
    op: z.enum(["contains"]),
    value: z.string().trim().min(1).max(100),
  }),
]);

export type Condition = z.infer<typeof conditionSchema>;

// ------------------------------------------------------------------- actions

export const actionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("set_status"),
    /** A status name; falls back to the first status in `category`. */
    status: statusName.nullish(),
    category: category.nullish(),
  }),
  z.object({ type: z.literal("set_priority"), value: priority }),
  z.object({ type: z.literal("add_label"), labelId: id }),
  z.object({ type: z.literal("remove_label"), labelId: id }),
  z.object({
    type: z.literal("assign"),
    /** A member's id, "creator" for whoever made the item, or null to unassign. */
    to: z.string().max(64).nullable(),
  }),
  z.object({ type: z.literal("comment"), body: z.string().trim().min(1).max(2000) }),
  z.object({ type: z.literal("create_subtask"), title: z.string().trim().min(1).max(300) }),
  z.object({ type: z.literal("notify"), message: z.string().trim().min(1).max(300) }),
  z.object({ type: z.literal("move_project"), projectId: id }),
  z.object({
    type: z.literal("set_due"),
    /** Due this many days from the day the rule runs. */
    days: z.number().int().min(0).max(365),
  }),
]);

export type Action = z.infer<typeof actionSchema>;
export type ActionType = Action["type"];

export const ruleInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  projectId: id.nullable(),
  enabled: z.boolean(),
  trigger: triggerSchema,
  conditions: z.array(conditionSchema).max(10),
  actions: z.array(actionSchema).min(1).max(10),
});

export type RuleInput = z.infer<typeof ruleInputSchema>;

export type RuleLite = RuleInput & {
  id: string;
  workspaceId: string;
  createdBy: string | null;
  createdAt: string;
  lastRun: { outcome: string; createdAt: string } | null;
  runCount: number;
};

export type RunEntry = {
  id: string;
  ruleId: string;
  itemId: string | null;
  itemTitle: string | null;
  outcome: "done" | "skipped" | "failed";
  message: string;
  createdAt: string;
};

// ---------------------------------------------------------------- describing

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const CATEGORY_NAMES = { todo: "not started", active: "in progress", done: "done" } as const;

function priorityName(p: Priority | null | undefined) {
  return PRIORITIES.find((x) => x.value === p)?.label.toLowerCase() ?? "any priority";
}

function hourName(hour: number) {
  const h = hour % 12 || 12;
  return `${h} ${hour < 12 ? "AM" : "PM"}`;
}

type Names = { label: (id: string) => string; project: (id: string) => string; person: (id: string) => string };

export function describeTrigger(t: Trigger, names: Names): string {
  switch (t.type) {
    case "item_created":
      return "When an item is created";
    case "status_changed":
      if (t.toStatus) return `When an item moves to ${t.toStatus}`;
      if (t.toCategory) return `When an item becomes ${CATEGORY_NAMES[t.toCategory]}`;
      return "When an item's status changes";
    case "priority_changed":
      return t.to ? `When priority changes to ${priorityName(t.to)}` : "When priority changes";
    case "label_added":
      return t.labelId ? `When the label ${names.label(t.labelId)} is added` : "When a label is added";
    case "due_date": {
      const at = ` (at ${hourName(t.hour)})`;
      if (t.daysBefore === 0) return `On an item's due date${at}`;
      if (t.daysBefore > 0)
        return `${t.daysBefore} day${t.daysBefore === 1 ? "" : "s"} before an item is due${at}`;
      const n = -t.daysBefore;
      return `${n} day${n === 1 ? "" : "s"} after an item was due${at}`;
    }
    case "schedule":
      return t.freq === "daily"
        ? `Every day at ${hourName(t.hour)}, for each open item`
        : `Every ${WEEKDAYS[t.weekday ?? 1]} at ${hourName(t.hour)}, for each open item`;
  }
}

export function describeCondition(c: Condition, names: Names): string {
  switch (c.field) {
    case "status":
      return `status ${c.op === "is" ? "is" : "is not"} ${c.value}`;
    case "category":
      return `it ${c.op === "is" ? "is" : "is not"} ${CATEGORY_NAMES[c.value]}`;
    case "priority":
      return `priority ${c.op === "is" ? "is" : "is not"} ${priorityName(c.value)}`;
    case "label":
      return `it ${c.op === "has" ? "has" : "doesn't have"} the label ${names.label(c.value)}`;
    case "assignee":
      return c.op === "is_set" ? "it has an owner" : "nobody owns it";
    case "due":
      return c.op === "is_set" ? "it has a due date" : c.op === "is_empty" ? "it has no due date" : "it's overdue";
    case "title":
      return `the title contains "${c.value}"`;
  }
}

export function describeAction(a: Action, names: Names): string {
  switch (a.type) {
    case "set_status":
      return a.status
        ? `move it to ${a.status}`
        : `mark it ${CATEGORY_NAMES[a.category ?? "done"]}`;
    case "set_priority":
      return `set priority to ${priorityName(a.value)}`;
    case "add_label":
      return `add the label ${names.label(a.labelId)}`;
    case "remove_label":
      return `remove the label ${names.label(a.labelId)}`;
    case "assign":
      return a.to === null
        ? "unassign it"
        : a.to === "creator"
          ? "assign it to whoever created it"
          : `assign it to ${names.person(a.to)}`;
    case "comment":
      return `comment "${a.body.length > 40 ? `${a.body.slice(0, 40)}…` : a.body}"`;
    case "create_subtask":
      return `add the subtask "${a.title}"`;
    case "notify":
      return "send a notification";
    case "move_project":
      return `move it to ${names.project(a.projectId)}`;
    case "set_due":
      return a.days === 0 ? "make it due today" : `make it due in ${a.days} day${a.days === 1 ? "" : "s"}`;
  }
}
