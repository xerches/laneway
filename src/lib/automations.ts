import "server-only";
import { and, asc, desc, eq, inArray, isNull, notInArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  automationRule,
  automationRun,
  item,
  label,
  notification,
  project,
  status,
  user,
} from "@/db/schema";
import {
  actionSchema,
  conditionSchema,
  describeAction,
  describeCondition,
  triggerSchema,
  type Action,
  type Condition,
  type Trigger,
} from "./automation-types";
import { addDaysTo, todayString } from "./dates";
import { newId } from "./id";
import * as m from "./mutations";

/**
 * The automation engine. A rule runs when its trigger fires: right after
 * someone changes an item (fireAutomations), or from the timed job
 * (runTimedAutomations) for due dates and schedules.
 *
 * Changes an automation makes never trigger other automations, so rules
 * can't loop.
 */

export type AutomationEvent =
  | { type: "item_created"; itemId: string }
  | { type: "status_changed"; itemId: string }
  | { type: "priority_changed"; itemId: string }
  | { type: "label_added"; itemId: string; labelIds: string[] };

type RuleRow = typeof automationRule.$inferSelect;

type Snapshot = {
  id: string;
  title: string;
  projectId: string;
  workspaceId: string;
  parentId: string | null;
  priority: string;
  assigneeId: string | null;
  createdBy: string | null;
  dueDate: string | null;
  completedAt: Date | null;
  statusName: string;
  statusCategory: string;
  labelIds: string[];
};

/** Keep the run log short: this many entries per rule. */
const KEEP_RUNS = 100;
/** A schedule rule touches at most this many items per run. */
const MAX_ITEMS_PER_RUN = 300;

async function loadSnapshots(ids: string[]): Promise<Snapshot[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select({
      id: item.id,
      title: item.title,
      projectId: item.projectId,
      workspaceId: item.workspaceId,
      parentId: item.parentId,
      priority: item.priority,
      assigneeId: item.assigneeId,
      createdBy: item.createdBy,
      dueDate: item.dueDate,
      completedAt: item.completedAt,
      statusName: status.name,
      statusCategory: status.category,
      labelIds: sql<string[]>`coalesce((select array_agg(il.label_id) from item_label il where il.item_id = ${item.id}), '{}')`,
    })
    .from(item)
    .innerJoin(status, eq(status.id, item.statusId))
    .where(inArray(item.id, ids));
  return rows;
}

async function loadSnapshot(id: string) {
  const [snap] = await loadSnapshots([id]);
  return snap ?? null;
}

function parseRule(rule: RuleRow) {
  const trigger = triggerSchema.safeParse(rule.trigger);
  const conditions = rule.conditions.map((c) => conditionSchema.safeParse(c));
  const actions = rule.actions.map((a) => actionSchema.safeParse(a));
  if (!trigger.success || conditions.some((c) => !c.success) || actions.some((a) => !a.success)) {
    return null;
  }
  return {
    trigger: trigger.data,
    conditions: conditions.map((c) => c.data as Condition),
    actions: actions.map((a) => a.data as Action),
  };
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

function triggerMatches(trigger: Trigger, event: AutomationEvent, snap: Snapshot) {
  if (trigger.type !== event.type) return false;
  switch (trigger.type) {
    case "status_changed":
      if (trigger.toStatus && !same(trigger.toStatus, snap.statusName)) return false;
      if (trigger.toCategory && trigger.toCategory !== snap.statusCategory) return false;
      return true;
    case "priority_changed":
      return !trigger.to || trigger.to === snap.priority;
    case "label_added":
      return (
        !trigger.labelId ||
        (event.type === "label_added" && event.labelIds.includes(trigger.labelId))
      );
    default:
      return true;
  }
}

function conditionHolds(c: Condition, snap: Snapshot, today: string) {
  switch (c.field) {
    case "status":
      return same(c.value, snap.statusName) === (c.op === "is");
    case "category":
      return (c.value === snap.statusCategory) === (c.op === "is");
    case "priority":
      return (c.value === snap.priority) === (c.op === "is");
    case "label":
      return snap.labelIds.includes(c.value) === (c.op === "has");
    case "assignee":
      return Boolean(snap.assigneeId) === (c.op === "is_set");
    case "due":
      if (c.op === "overdue") return Boolean(snap.dueDate && snap.dueDate < today && !snap.completedAt);
      return Boolean(snap.dueDate) === (c.op === "is_set");
    case "title":
      return snap.title.toLowerCase().includes(c.value.toLowerCase());
  }
}

/** Names for the run log ("added the label Waiting"). */
async function namesFor(workspaceId: string) {
  const [labels, projects] = await Promise.all([
    db.select({ id: label.id, name: label.name }).from(label).where(eq(label.workspaceId, workspaceId)),
    db.select({ id: project.id, name: project.name }).from(project).where(eq(project.workspaceId, workspaceId)),
  ]);
  return {
    label: (id: string) => labels.find((l) => l.id === id)?.name ?? "(deleted label)",
    project: (id: string) => projects.find((p) => p.id === id)?.name ?? "(deleted project)",
    person: () => "a member",
  };
}

async function runAction(
  action: Action,
  snap: Snapshot,
  actor: m.Actor,
  ruleCreator: string,
  today: string,
) {
  switch (action.type) {
    case "set_status": {
      const statuses = await db
        .select()
        .from(status)
        .where(eq(status.projectId, snap.projectId))
        .orderBy(asc(status.position));
      const target =
        (action.status && statuses.find((s) => same(s.name, action.status!))) ||
        (action.category && statuses.find((s) => s.category === action.category)) ||
        null;
      if (!target) {
        throw new m.MutationError(
          `This project has no status called ${action.status ?? action.category}.`,
        );
      }
      await m.patchItem(actor, snap.id, { statusId: target.id }, today);
      return;
    }
    case "set_priority":
      await m.patchItem(actor, snap.id, { priority: action.value }, today);
      return;
    case "set_due":
      await m.patchItem(actor, snap.id, { dueDate: addDaysTo(today, action.days) }, today);
      return;
    case "assign": {
      const to = action.to === "creator" ? snap.createdBy : action.to;
      await m.patchItem(actor, snap.id, { assigneeId: to }, today);
      return;
    }
    case "add_label":
    case "remove_label": {
      const current = (await loadSnapshot(snap.id))?.labelIds ?? snap.labelIds;
      const next =
        action.type === "add_label"
          ? [...new Set([...current, action.labelId])]
          : current.filter((id) => id !== action.labelId);
      await m.setItemLabels(actor, snap.id, next);
      return;
    }
    case "comment":
      await m.addComment(actor, snap.id, action.body);
      return;
    case "create_subtask":
      if (snap.parentId) throw new m.MutationError("Subtasks can't have subtasks.");
      await m.insertItem(actor.id, {
        projectId: snap.projectId,
        parentId: snap.id,
        title: action.title,
      });
      return;
    case "notify":
      await db.insert(notification).values({
        id: newId(),
        userId: snap.assigneeId ?? ruleCreator,
        workspaceId: snap.workspaceId,
        projectId: snap.projectId,
        itemId: snap.id,
        type: "automation",
        title: snap.title,
        body: action.message,
      });
      return;
    case "move_project":
      await m.moveItemToProject(actor, snap.id, action.projectId);
      return;
  }
}

async function logRun(
  rule: RuleRow,
  snap: Snapshot | null,
  outcome: "done" | "skipped" | "failed",
  message: string,
) {
  await db.insert(automationRun).values({
    id: newId(),
    ruleId: rule.id,
    workspaceId: rule.workspaceId,
    itemId: snap?.id ?? null,
    itemTitle: snap?.title ?? null,
    outcome,
    message: message.slice(0, 1000),
  });
}

/** Removes all but the newest KEEP_RUNS log entries of a rule. */
async function pruneRuns(ruleId: string) {
  const keep = db
    .select({ id: automationRun.id })
    .from(automationRun)
    .where(eq(automationRun.ruleId, ruleId))
    .orderBy(desc(automationRun.createdAt))
    .limit(KEEP_RUNS);
  await db
    .delete(automationRun)
    .where(and(eq(automationRun.ruleId, ruleId), notInArray(automationRun.id, keep)));
}

/**
 * Runs one rule against one item. Returns what happened, so timed rules can
 * write their own log line.
 */
async function applyRule(
  rule: RuleRow,
  parsed: NonNullable<ReturnType<typeof parseRule>>,
  snap: Snapshot,
  today: string,
): Promise<{ outcome: "done" | "skipped" | "failed"; message: string }> {
  const failed = parsed.conditions.find((c) => !conditionHolds(c, snap, today));
  if (failed) {
    const names = await namesFor(rule.workspaceId);
    return { outcome: "skipped", message: `Skipped: not true that ${describeCondition(failed, names)}.` };
  }
  if (!rule.createdBy) {
    return { outcome: "failed", message: "The person who made this rule no longer exists." };
  }
  const [creator] = await db
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(eq(user.id, rule.createdBy));
  if (!creator) return { outcome: "failed", message: "The person who made this rule no longer exists." };

  const actor: m.Actor = { id: creator.id, name: `Automation “${rule.name}”`, via: rule.name };
  const names = await namesFor(rule.workspaceId);
  const done: string[] = [];
  for (const action of parsed.actions) {
    try {
      // A move changes the project; later actions need the fresh item.
      const current = (await loadSnapshot(snap.id)) ?? snap;
      await runAction(action, current, actor, creator.id, today);
      done.push(describeAction(action, names));
    } catch (error) {
      const reason =
        error instanceof m.MutationError ? error.message : "Something went wrong.";
      if (!(error instanceof m.MutationError)) console.error("automation action failed", error);
      const before = done.length ? `Did: ${done.join("; ")}. ` : "";
      return {
        outcome: "failed",
        message: `${before}Couldn't ${describeAction(action, names)}: ${reason}`,
      };
    }
  }
  return { outcome: "done", message: capitalize(done.join("; ")) + "." };
}

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function rulesFor(workspaceId: string, projectId: string, types: string[]) {
  return db
    .select()
    .from(automationRule)
    .where(
      and(
        eq(automationRule.workspaceId, workspaceId),
        eq(automationRule.enabled, true),
        or(isNull(automationRule.projectId), eq(automationRule.projectId, projectId)),
        inArray(sql<string>`${automationRule.trigger}->>'type'`, types),
      ),
    )
    .orderBy(asc(automationRule.position), asc(automationRule.createdAt));
}

/**
 * Runs the rules a change triggers. Call it after the change is saved.
 * Never throws: a broken rule is logged, and the person's change stands.
 */
export async function fireAutomations(events: AutomationEvent[], today: string) {
  for (const event of events) {
    try {
      const snap = await loadSnapshot(event.itemId);
      if (!snap) continue;
      const rules = await rulesFor(snap.workspaceId, snap.projectId, [event.type]);
      for (const rule of rules) {
        const parsed = parseRule(rule);
        if (!parsed) {
          await logRun(rule, snap, "failed", "This rule is set up in a way Laneway can't read. Edit and save it again.");
          continue;
        }
        const fresh = (await loadSnapshot(snap.id)) ?? snap;
        if (!triggerMatches(parsed.trigger, event, fresh)) continue;
        const result = await applyRule(rule, parsed, fresh, today);
        await logRun(rule, fresh, result.outcome, result.message);
        await pruneRuns(rule.id);
      }
    } catch (error) {
      console.error("automations failed", error);
    }
  }
}

/** Runs a rule right now for one item, from the rule editor's "Test" button. */
export async function testRule(ruleId: string, itemId: string, today: string) {
  const [rule] = await db.select().from(automationRule).where(eq(automationRule.id, ruleId));
  const snap = await loadSnapshot(itemId);
  if (!rule || !snap || snap.workspaceId !== rule.workspaceId) {
    throw new m.MutationError("That item isn't in this rule's workspace.");
  }
  if (rule.projectId && rule.projectId !== snap.projectId) {
    throw new m.MutationError("That item isn't in this rule's project.");
  }
  const parsed = parseRule(rule);
  if (!parsed) throw new m.MutationError("This rule can't be read. Edit and save it again.");
  const result = await applyRule(rule, parsed, snap, today);
  await logRun(rule, snap, result.outcome, `Test run. ${result.message}`);
  await pruneRuns(rule.id);
  return result;
}

/**
 * The timed job: due-date and schedule rules. Safe to call as often as you
 * like (every 15 minutes is plenty): each rule acts at most once per item per
 * due date, and a schedule rule at most once per day.
 */
export async function runTimedAutomations(now = new Date()) {
  const today = todayString();
  const hour = now.getHours();
  const weekday = now.getDay();
  const rules = await db
    .select()
    .from(automationRule)
    .where(
      and(
        eq(automationRule.enabled, true),
        inArray(sql<string>`${automationRule.trigger}->>'type'`, ["due_date", "schedule"]),
      ),
    );

  let ran = 0;
  for (const rule of rules) {
    try {
      const parsed = parseRule(rule);
      if (!parsed) continue;
      const t = parsed.trigger;
      if (t.type !== "due_date" && t.type !== "schedule") continue;
      if (hour < t.hour) continue;

      const scope = and(
        eq(item.workspaceId, rule.workspaceId),
        rule.projectId ? eq(item.projectId, rule.projectId) : undefined,
        isNull(item.completedAt),
        sql`exists (select 1 from project p where p.id = ${item.projectId} and p.archived_at is null)`,
      );

      if (t.type === "due_date") {
        const target = addDaysTo(today, t.daysBefore);
        const due = await db
          .select({ id: item.id })
          .from(item)
          .where(and(scope, eq(item.dueDate, target)))
          .limit(MAX_ITEMS_PER_RUN);
        for (const snap of await loadSnapshots(due.map((d) => d.id))) {
          const claimed = await claim(rule, snap, `${snap.id}:${target}`);
          if (!claimed) continue;
          const result = await applyRule(rule, parsed, snap, today);
          await finish(claimed, result);
          ran += 1;
        }
      } else {
        if (t.freq === "weekly" && (t.weekday ?? 1) !== weekday) continue;
        const claimed = await claim(rule, null, `schedule:${today}`);
        if (!claimed) continue;
        const open = await db
          .select({ id: item.id })
          .from(item)
          .where(and(scope, isNull(item.parentId)))
          .orderBy(asc(item.createdAt))
          .limit(MAX_ITEMS_PER_RUN);
        let acted = 0;
        let failed = 0;
        for (const snap of await loadSnapshots(open.map((o) => o.id))) {
          if (!parsed.conditions.every((c) => conditionHolds(c, snap, today))) continue;
          const result = await applyRule(rule, parsed, snap, today);
          if (result.outcome === "failed") failed += 1;
          else acted += 1;
          if (result.outcome !== "skipped") await logRun(rule, snap, result.outcome, result.message);
        }
        await finish(claimed, {
          outcome: failed ? "failed" : "done",
          message: `Scheduled run: acted on ${acted} item${acted === 1 ? "" : "s"}${failed ? `, ${failed} failed` : ""}.`,
        });
        ran += 1;
      }
      await pruneRuns(rule.id);
    } catch (error) {
      console.error("timed automation failed", rule.id, error);
    }
  }
  return { rules: rules.length, ran };
}

/**
 * Writes the log line first, so two copies of the job can't both act on the
 * same item: the second insert hits the unique (rule, dedupe key) index.
 */
async function claim(rule: RuleRow, snap: Snapshot | null, dedupeKey: string) {
  const [row] = await db
    .insert(automationRun)
    .values({
      id: newId(),
      ruleId: rule.id,
      workspaceId: rule.workspaceId,
      itemId: snap?.id ?? null,
      itemTitle: snap?.title ?? null,
      outcome: "skipped",
      message: "Running…",
      dedupeKey,
    })
    .onConflictDoNothing()
    .returning({ id: automationRun.id });
  return row?.id ?? null;
}

async function finish(runId: string, result: { outcome: string; message: string }) {
  await db
    .update(automationRun)
    .set({ outcome: result.outcome, message: result.message.slice(0, 1000) })
    .where(eq(automationRun.id, runId));
}
