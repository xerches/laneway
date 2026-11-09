"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { COLORS } from "@/lib/colors";
import { getItemDetail, getWorkspaces, searchItems } from "@/lib/data";
import * as m from "@/lib/mutations";
import { requireUser } from "@/lib/session";
import { TEMPLATES } from "@/lib/templates";
import type { ActionResult, ItemDetail } from "@/lib/types";
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
    return m.patchItem(user, data.itemId, data.patch, data.today);
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
