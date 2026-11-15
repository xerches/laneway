"use server";

import { randomBytes } from "node:crypto";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { COLORS } from "@/lib/colors";
import { isSafeLink, normalizeLink } from "@/lib/links";
import { getItemDetail, getPage, getRuleRuns, getWorkspaces, searchItems } from "@/lib/data";
import { fireAutomations, testRule as runRuleTest, type AutomationEvent } from "@/lib/automations";
import { ruleInputSchema, type RuleInput } from "@/lib/automation-types";
import { todayString } from "@/lib/dates";
import * as m from "@/lib/mutations";
import { newToken } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { TEMPLATES } from "@/lib/templates";
import { MAX_WIDGETS, WIDGETS } from "@/lib/widgets";
import type { ActionResult, ItemDetail, PageFull } from "@/lib/types";
import type { RunEntry } from "@/lib/automation-types";
import type { SearchHit } from "@/lib/data";

/**
 * Server actions: the only way the browser changes data. Each one re-reads
 * the session, validates its input, and refreshes the page data afterwards.
 */

const id = z.string().regex(/^[a-z0-9]{10,32}$/);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const color = z.enum(COLORS);
const name = z.string().trim().min(1).max(120);
const priority = z.enum(["none", "low", "medium", "high", "urgent"]);
const category = z.enum(["todo", "active", "done"]);
const recurrence = z.object({
  freq: z.enum(["daily", "weekly", "monthly", "yearly"]),
  interval: z.number().int().min(1).max(365),
});

async function run<T extends object>(
  work: () => Promise<T | void>,
): Promise<ActionResult<T>> {
  try {
    const result = await work();
    refresh();
    return { ok: true, ...((result ?? {}) as T) };
  } catch (error) {
    if (error instanceof m.MutationError) return { ok: false, error: error.message };
    if (error instanceof z.ZodError) {
      return { ok: false, error: "That didn't look right. Please check and try again." };
    }
    throw error;
  }
}

// ---------------------------------------------------------------- workspaces

const welcomeInput = z.object({
  names: z.tuple([name, name, name]),
  sample: z.boolean(),
  today: day,
});

/** First-run setup: three workspaces, and optionally a sample project. */
export async function setUpWorkspaces(input: z.infer<typeof welcomeInput>) {
  const user = await requireUser();
  const data = welcomeInput.parse(input);

  const existing = await getWorkspaces(user.id);
  if (existing.length === 0) {
    const presets = [
      { kind: "personal", color: "teal" },
      { kind: "work", color: "blue" },
      { kind: "business", color: "violet" },
    ];
    const ids: string[] = [];
    for (const [index, preset] of presets.entries()) {
      ids.push(
        await m.createWorkspace(user.id, {
          name: data.names[index],
          kind: preset.kind,
          color: preset.color,
          position: index,
        }),
      );
    }
    if (data.sample) {
      await m.createProject(user.id, {
        workspaceId: ids[0],
        name: "Home and chores",
        template: "chores",
        today: data.today,
      });
    }
  }
  redirect("/");
}

export async function createWorkspace(input: { name: string; color: string }) {
  const user = await requireUser();
  return run(async () => {
    const data = z.object({ name, color }).parse(input);
    const existing = await getWorkspaces(user.id);
    const workspaceId = await m.createWorkspace(user.id, {
      ...data,
      kind: "personal",
      position: existing.length,
    });
    return { workspaceId };
  });
}

export async function updateWorkspace(input: {
  workspaceId: string;
  name?: string;
  color?: string;
}) {
  const user = await requireUser();
  return run(async () => {
    const data = z
      .object({ workspaceId: id, name: name.optional(), color: color.optional() })
      .parse(input);
    const { workspaceId, ...patch } = data;
    await m.updateWorkspace(user.id, workspaceId, patch);
  });
}

// ------------------------------------------------------------------ projects

export async function createProject(input: {
  workspaceId: string;
  name: string;
  color?: string;
  template: string;
  today: string;
}) {
  const user = await requireUser();
  return run(async () => {
    const data = z
      .object({
        workspaceId: id,
        name,
        color: color.optional(),
        template: z.enum(TEMPLATES.map((t) => t.id) as [string, ...string[]]),
        today: day,
      })
      .parse(input);
    const projectId = await m.createProject(user.id, data);
    return { projectId, workspaceId: data.workspaceId };
  });
}

export async function updateProject(input: {
  projectId: string;
  name?: string;
  color?: string;
  description?: string;
}) {
  const user = await requireUser();
  return run(async () => {
    const data = z
      .object({
        projectId: id,
        name: name.optional(),
        color: color.optional(),
        description: z.string().max(2000).optional(),
      })
      .parse(input);
    const { projectId, ...patch } = data;
    await m.updateProject(user.id, projectId, patch);
  });
}

export async function deleteProject(input: { projectId: string }) {
  const user = await requireUser();
  const data = z.object({ projectId: id }).parse(input);
  const workspaceId = await m.deleteProject(user.id, data.projectId);
  redirect(`/w/${workspaceId}`);
}

// ------------------------------------------------------------------ statuses

export async function createStatus(input: {
  id: string;
  projectId: string;
  name: string;
  color: string;
  category: string;
}) {
  const user = await requireUser();
  return run(async () => {
    const data = z.object({ id, projectId: id, name, color, category }).parse(input);
    await m.createStatus(user.id, data);
  });
}

export async function updateStatus(input: {
  statusId: string;
  name?: string;
  color?: string;
  category?: string;
}) {
  const user = await requireUser();
  return run(async () => {
    const data = z
      .object({
        statusId: id,
        name: name.optional(),
        color: color.optional(),
        category: category.optional(),
      })
      .parse(input);
    const { statusId, ...patch } = data;
    await m.updateStatus(user.id, statusId, patch);
  });
}

export async function reorderStatuses(input: { projectId: string; ids: string[] }) {
  const user = await requireUser();
  return run(async () => {
    const data = z.object({ projectId: id, ids: z.array(id).max(50) }).parse(input);
    await m.reorderStatuses(user.id, data.projectId, data.ids);
  });
}

export async function deleteStatus(input: { statusId: string; moveToId: string | null }) {
  const user = await requireUser();
  return run(async () => {
    const data = z.object({ statusId: id, moveToId: id.nullable() }).parse(input);
    await m.deleteStatus(user.id, data.statusId, data.moveToId);
  });
}

// --------------------------------------------------------------------- items

const newItem = z.object({
  id,
  projectId: id,
  title: z.string().trim().min(1).max(300),
  statusId: id.nullish(),
  priority: priority.optional(),
  assigneeId: z.string().max(64).nullish(),
  startDate: day.nullish(),
  dueDate: day.nullish(),
  parentId: id.nullish(),
});

export async function createItem(input: z.input<typeof newItem>) {
  const user = await requireUser();
  return run(async () => {
    const data = newItem.parse(input);
    await m.insertItem(user.id, data);
    await fireAutomations([{ type: "item_created", itemId: data.id }], todayString());
    return { itemId: data.id };
  });
}

const itemPatch = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  description: z.string().max(20_000).optional(),
  statusId: id.optional(),
  priority: priority.optional(),
  assigneeId: z.string().max(64).nullable().optional(),
  startDate: day.nullable().optional(),
  dueDate: day.nullable().optional(),
  recurrence: recurrence.nullable().optional(),
  position: z.number().finite().optional(),
});

export async function updateItem(input: {
  itemId: string;
  patch: z.input<typeof itemPatch>;
  today: string;
}) {
  const user = await requireUser();
  return run(async () => {
    const data = z.object({ itemId: id, patch: itemPatch, today: day }).parse(input);
    const result = await m.patchItem(user, data.itemId, data.patch, data.today);
    const events: AutomationEvent[] = [];
    if (result.changed.includes("statusId")) events.push({ type: "status_changed", itemId: data.itemId });
    if (result.changed.includes("priority")) events.push({ type: "priority_changed", itemId: data.itemId });
    if (result.spawnedId) events.push({ type: "item_created", itemId: result.spawnedId });
    if (events.length) await fireAutomations(events, data.today);
    return { spawnedId: result.spawnedId };
  });
}

export async function deleteItem(input: { itemId: string }) {
  const user = await requireUser();
  return run(async () => {
    const data = z.object({ itemId: id }).parse(input);
    await m.removeItem(user.id, data.itemId);
  });
}

export async function addComment(input: { itemId: string; body: string }) {
  const user = await requireUser();
  return run(async () => {
    const data = z
      .object({ itemId: id, body: z.string().trim().min(1).max(10_000) })
      .parse(input);
    const commentId = await m.addComment(user, data.itemId, data.body);
    return { commentId };
  });
}

// -------------------------------------------------------------------- labels

const labelName = z.string().trim().min(1).max(40);

export async function createLabel(input: {
  id: string;
  workspaceId: string;
  name: string;
  color: string;
}) {
  const user = await requireUser();
  return run(async () => {
    const data = z.object({ id, workspaceId: id, name: labelName, color }).parse(input);
    await m.createLabel(user.id, data);
    return { labelId: data.id };
  });
}

export async function updateLabel(input: { labelId: string; name?: string; color?: string }) {
  const user = await requireUser();
  return run(async () => {
    const data = z
      .object({ labelId: id, name: labelName.optional(), color: color.optional() })
      .parse(input);
    const { labelId, ...patch } = data;
    await m.updateLabel(user.id, labelId, patch);
  });
}

export async function deleteLabel(input: { labelId: string }) {
  const user = await requireUser();
  return run(async () => {
    const data = z.object({ labelId: id }).parse(input);
    await m.deleteLabel(user.id, data.labelId);
  });
}

export async function setItemLabels(input: { itemId: string; labelIds: string[] }) {
  const user = await requireUser();
  return run(async () => {
    const data = z.object({ itemId: id, labelIds: z.array(id).max(30) }).parse(input);
    const { added } = await m.setItemLabels(user, data.itemId, data.labelIds);
    if (added.length) {
      await fireAutomations(
        [{ type: "label_added", itemId: data.itemId, labelIds: added }],
        todayString(),
      );
    }
  });
}

// --------------------------------------------------------------------- links

const link = z
  .string()
  .trim()
  .min(1)
  .max(2000)
  .transform(normalizeLink)
  .refine(isSafeLink, "Links must start with https://, http://, obsidian:// or mailto:");

export async function addItemLink(input: {
  id: string;
  itemId: string;
  url: string;
  title?: string;
}) {
  const user = await requireUser();
  return run(async () => {
    const parsed = z
      .object({ id, itemId: id, url: z.string(), title: z.string().trim().max(200).optional() })
      .parse(input);
    const url = link.safeParse(parsed.url);
    if (!url.success) {
      throw new m.MutationError(
        "That link can't be saved. Use a web address, an obsidian:// link or a mailto: address.",
      );
    }
    await m.addItemLink(user, parsed.itemId, {
      id: parsed.id,
      url: url.data,
      title: parsed.title ?? "",
    });
  });
}

export async function removeItemLink(input: { linkId: string }) {
  const user = await requireUser();
  return run(async () => {
    const data = z.object({ linkId: id }).parse(input);
    await m.removeItemLink(user, data.linkId);
  });
}

// --------------------------------------------------------------------- pages

const pageTitle = z.string().trim().max(200);
const pageBody = z.string().max(200_000);

export async function createPage(input: {
  id: string;
  projectId: string;
  title: string;
  body: string;
}) {
  const user = await requireUser();
  return run(async () => {
    const data = z
      .object({ id, projectId: id, title: pageTitle, body: pageBody })
      .parse(input);
    await m.createPage(user, data);
    return { pageId: data.id };
  });
}

export async function updatePage(input: { pageId: string; title?: string; body?: string }) {
  const user = await requireUser();
  return run(async () => {
    const data = z
      .object({ pageId: id, title: pageTitle.optional(), body: pageBody.optional() })
      .parse(input);
    const { pageId, ...patch } = data;
    await m.updatePage(user, pageId, patch);
  });
}

export async function deletePage(input: { pageId: string }) {
  const user = await requireUser();
  return run(async () => {
    const data = z.object({ pageId: id }).parse(input);
    await m.deletePage(user, data.pageId);
  });
}

export async function loadPage(pageId: string): Promise<PageFull | null> {
  const user = await requireUser();
  if (!id.safeParse(pageId).success) return null;
  return getPage(user.id, pageId);
}

// ----------------------------------------------------------------- templates

const templateName = z.string().trim().min(1).max(80);

export async function savePageTemplate(input: {
  id: string;
  workspaceId: string;
  name: string;
  title: string;
  body: string;
}) {
  const user = await requireUser();
  return run(async () => {
    const data = z
      .object({ id, workspaceId: id, name: templateName, title: pageTitle, body: pageBody })
      .parse(input);
    await m.createTemplate(user, { ...data, kind: "page" });
  });
}

export async function saveItemTemplate(input: { id: string; itemId: string; name: string }) {
  const user = await requireUser();
  return run(async () => {
    const data = z.object({ id, itemId: id, name: templateName }).parse(input);
    await m.saveItemAsTemplate(user, data.itemId, { id: data.id, name: data.name });
  });
}

export async function deleteTemplate(input: { templateId: string }) {
  const user = await requireUser();
  return run(async () => {
    const data = z.object({ templateId: id }).parse(input);
    await m.deleteTemplate(user, data.templateId);
  });
}

export async function createItemFromTemplate(input: {
  id: string;
  projectId: string;
  templateId: string;
  statusId?: string | null;
  today: string;
}) {
  const user = await requireUser();
  return run(async () => {
    const data = z
      .object({ id, projectId: id, templateId: id, statusId: id.nullish(), today: day })
      .parse(input);
    await m.createItemFromTemplate(user, data);
    await fireAutomations([{ type: "item_created", itemId: data.id }], data.today);
    return { itemId: data.id };
  });
}

// ------------------------------------------------------------- notifications

export async function markNotificationRead(input: { notificationId: string | null }) {
  const user = await requireUser();
  return run(async () => {
    const data = z.object({ notificationId: id.nullable() }).parse(input);
    await m.markRead(user.id, data.notificationId);
  });
}

// --------------------------------------------------------------------- reads

/** Loads one item's description, subtasks and activity for the side panel. */
export async function loadItemDetail(itemId: string): Promise<ItemDetail | null> {
  const user = await requireUser();
  if (!id.safeParse(itemId).success) return null;
  return getItemDetail(user.id, itemId);
}

export async function searchAllItems(query: string): Promise<SearchHit[]> {
  const user = await requireUser();
  return searchItems(user.id, String(query).slice(0, 100));
}

// ---------------------------------------------------------------- dashboards

const widget = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,64}$/),
  type: z.enum(WIDGETS.map((w) => w.type) as [string, ...string[]]),
  size: z.enum(["half", "full"]),
  projectId: id.nullish(),
});

export async function saveDashboard(input: {
  workspaceId: string | null;
  widgets: { id: string; type: string; size: "half" | "full"; projectId?: string | null }[];
}) {
  const user = await requireUser();
  return run(async () => {
    const data = z
      .object({ workspaceId: id.nullable(), widgets: z.array(widget).max(MAX_WIDGETS) })
      .parse(input);
    const ids = new Set(data.widgets.map((w) => w.id));
    if (ids.size !== data.widgets.length) throw new m.MutationError("Two widgets share an id.");
    await m.saveDashboard(
      user,
      data.workspaceId,
      data.widgets.map((w) => ({ ...w, projectId: w.projectId ?? null })),
    );
  });
}

export async function resetDashboard(input: { workspaceId: string | null }) {
  const user = await requireUser();
  return run(async () => {
    const data = z.object({ workspaceId: id.nullable() }).parse(input);
    await m.resetDashboard(user, data.workspaceId);
  });
}

// --------------------------------------------------------------- automations

export async function createRule(input: { id: string; workspaceId: string; rule: RuleInput }) {
  const user = await requireUser();
  return run(async () => {
    const data = z.object({ id, workspaceId: id, rule: ruleInputSchema }).parse(input);
    await m.createRule(user, { id: data.id, workspaceId: data.workspaceId, ...data.rule });
    return { ruleId: data.id };
  });
}

export async function updateRule(input: { ruleId: string; rule: RuleInput }) {
  const user = await requireUser();
  return run(async () => {
    const data = z.object({ ruleId: id, rule: ruleInputSchema }).parse(input);
    await m.updateRule(user, data.ruleId, data.rule);
  });
}

export async function setRuleEnabled(input: { ruleId: string; enabled: boolean }) {
  const user = await requireUser();
  return run(async () => {
    const data = z.object({ ruleId: id, enabled: z.boolean() }).parse(input);
    await m.setRuleEnabled(user, data.ruleId, data.enabled);
  });
}

export async function deleteRule(input: { ruleId: string }) {
  const user = await requireUser();
  return run(async () => {
    const data = z.object({ ruleId: id }).parse(input);
    await m.deleteRule(user, data.ruleId);
  });
}

/** Runs a rule once on one item, whatever its trigger, to try it out. */
export async function testRule(input: { ruleId: string; itemId: string; today: string }) {
  const user = await requireUser();
  return run(async () => {
    const data = z.object({ ruleId: id, itemId: id, today: day }).parse(input);
    await m.requireRuleAccess(user, data.ruleId);
    const result = await runRuleTest(data.ruleId, data.itemId, data.today);
    return { outcome: result.outcome, message: result.message };
  });
}

export async function loadRuleRuns(input: { ruleId: string }): Promise<RunEntry[]> {
  const user = await requireUser();
  const data = z.object({ ruleId: id }).parse(input);
  await m.requireRuleAccess(user, data.ruleId);
  return getRuleRuns(data.ruleId);
}

// -------------------------------------------------------------- integrations

/** Makes an API token. The token is returned once and never stored. */
export async function createApiToken(input: { id: string; name: string; workspaceIds: string[] | null }) {
  const user = await requireUser();
  return run(async () => {
    const data = z
      .object({ id, name: z.string().trim().min(1).max(60), workspaceIds: z.array(id).max(50).nullable() })
      .parse(input);
    const made = newToken();
    await m.createApiToken(user, { ...data, hash: made.hash, prefix: made.prefix });
    return { token: made.token };
  });
}

export async function revokeApiToken(input: { tokenId: string }) {
  const user = await requireUser();
  return run(async () => {
    const data = z.object({ tokenId: id }).parse(input);
    await m.revokeApiToken(user, data.tokenId);
  });
}

const onMerge = z.enum(["done", "none"]);
const hookSecret = () => randomBytes(24).toString("hex");

/** Makes a GitHub webhook. Its secret is returned once, to paste into GitHub. */
export async function createGithubHook(input: { id: string; workspaceId: string; onMerge: "done" | "none" }) {
  const user = await requireUser();
  return run(async () => {
    const data = z.object({ id, workspaceId: id, onMerge }).parse(input);
    const secret = hookSecret();
    await m.createGithubHook(user, { ...data, secret });
    return { secret };
  });
}

export async function setGithubHookOnMerge(input: { hookId: string; onMerge: "done" | "none" }) {
  const user = await requireUser();
  return run(async () => {
    const data = z.object({ hookId: id, onMerge }).parse(input);
    await m.updateGithubHook(user, data.hookId, { onMerge: data.onMerge });
  });
}

/** Replaces a webhook's secret, for when the old one is lost or leaked. */
export async function newGithubHookSecret(input: { hookId: string }) {
  const user = await requireUser();
  return run(async () => {
    const data = z.object({ hookId: id }).parse(input);
    const secret = hookSecret();
    await m.updateGithubHook(user, data.hookId, { secret });
    return { secret };
  });
}

export async function deleteGithubHook(input: { hookId: string }) {
  const user = await requireUser();
  return run(async () => {
    const data = z.object({ hookId: id }).parse(input);
    await m.deleteGithubHook(user, data.hookId);
  });
}
