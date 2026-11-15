import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, asc, desc, eq, ilike, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  activity,
  apiToken,
  item,
  itemLabel,
  itemLink,
  label,
  project,
  status,
  user,
  workspace,
  workspaceMember,
} from "@/db/schema";
import { fireAutomations, type AutomationEvent } from "./automations";
import { addDaysTo, todayString } from "./dates";
import * as m from "./mutations";
import type { Priority } from "./types";

/**
 * The shared core of the REST API (/api/v1) and the MCP endpoint (/api/mcp).
 * Every call starts from a token, which belongs to one person and may be
 * limited to some of their workspaces. Writes go through the same mutations
 * as the app, so permissions, activity and automations all apply.
 */

export class ApiError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export type ApiCaller = {
  userId: string;
  name: string;
  /** The token's own name, so the activity can say "Alex via Luna". */
  tokenName: string;
  /** Workspaces this token may touch: the person's own, narrowed by the token. */
  workspaceIds: string[];
};

// ------------------------------------------------------------------- tokens

const TOKEN_PREFIX = "lw_";

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** Makes a new token. Returns the token itself, which is never stored. */
export function newToken() {
  const token = TOKEN_PREFIX + randomBytes(24).toString("base64url");
  return { token, hash: hashToken(token), prefix: token.slice(0, 10) };
}

/** Reads `Authorization: Bearer lw_…` and works out who is calling. */
export async function authenticate(request: Request): Promise<ApiCaller> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token.startsWith(TOKEN_PREFIX) || token.length > 200) {
    throw new ApiError("Send a Laneway API token as `Authorization: Bearer lw_…`.", 401);
  }
  const [row] = await db
    .select({
      id: apiToken.id,
      userId: apiToken.userId,
      scope: apiToken.workspaceIds,
      lastUsedAt: apiToken.lastUsedAt,
      tokenName: apiToken.name,
      name: user.name,
    })
    .from(apiToken)
    .innerJoin(user, eq(user.id, apiToken.userId))
    .where(eq(apiToken.tokenHash, hashToken(token)));
  if (!row) throw new ApiError("That token isn't valid. It may have been revoked.", 401);

  const memberships = await db
    .select({ id: workspaceMember.workspaceId })
    .from(workspaceMember)
    .where(eq(workspaceMember.userId, row.userId));
  const mine = memberships.map((w) => w.id);
  const workspaceIds = row.scope ? mine.filter((id) => row.scope!.includes(id)) : mine;

  // Note when it was last used, at most once a minute.
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 60_000) {
    await db.update(apiToken).set({ lastUsedAt: new Date() }).where(eq(apiToken.id, row.id));
  }
  return { userId: row.userId, name: row.name, tokenName: row.tokenName, workspaceIds };
}

// --------------------------------------------------------------------- reads

export function appUrl(request?: Request) {
  const configured = (process.env.LANEWAY_URLS ?? process.env.BETTER_AUTH_URL ?? "")
    .split(",")[0]
    ?.trim()
    .replace(/\/$/, "");
  if (configured) return configured;
  if (request) return new URL(request.url).origin;
  return "";
}

export async function listWorkspaces(caller: ApiCaller) {
  if (caller.workspaceIds.length === 0) return [];
  return db
    .select({ id: workspace.id, name: workspace.name, kind: workspace.kind })
    .from(workspace)
    .where(inArray(workspace.id, caller.workspaceIds))
    .orderBy(asc(workspace.position), asc(workspace.createdAt));
}

function allowed(caller: ApiCaller, workspaceId: string) {
  if (!caller.workspaceIds.includes(workspaceId)) {
    throw new ApiError("Not found, or this token can't see it.", 404);
  }
}

export async function listProjects(caller: ApiCaller, workspaceId?: string | null) {
  if (workspaceId) allowed(caller, workspaceId);
  const scope = workspaceId ? [workspaceId] : caller.workspaceIds;
  if (scope.length === 0) return [];
  const [projects, counts] = await Promise.all([
    db
      .select({
        id: project.id,
        workspaceId: project.workspaceId,
        name: project.name,
        key: project.key,
        description: project.description,
      })
      .from(project)
      .where(and(inArray(project.workspaceId, scope), isNull(project.archivedAt)))
      .orderBy(asc(project.position), asc(project.createdAt)),
    db
      .select({
        projectId: item.projectId,
        total: sql<number>`count(*)::int`,
        done: sql<number>`count(${item.completedAt})::int`,
      })
      .from(item)
      .where(and(inArray(item.workspaceId, scope), isNull(item.parentId)))
      .groupBy(item.projectId),
  ]);
  return projects.map((p) => {
    const c = counts.find((x) => x.projectId === p.id);
    const total = c?.total ?? 0;
    const done = c?.done ?? 0;
    return { ...p, items: total, done, progress: total ? Math.round((done / total) * 100) : 0 };
  });
}

/** A project by id or key ("WEDD"), with its statuses and its workspace's labels. */
export async function getProject(caller: ApiCaller, ref: string) {
  const proj = await findProject(caller, ref);
  const [statuses, labels] = await Promise.all([
    db
      .select({ name: status.name, category: status.category })
      .from(status)
      .where(eq(status.projectId, proj.id))
      .orderBy(asc(status.position)),
    db
      .select({ name: label.name, color: label.color })
      .from(label)
      .where(eq(label.workspaceId, proj.workspaceId))
      .orderBy(asc(label.position)),
  ]);
  return { ...proj, statuses, labels };
}

async function findProject(caller: ApiCaller, ref: string) {
  if (caller.workspaceIds.length === 0) throw new ApiError("Not found, or this token can't see it.", 404);
  const rows = await db
    .select({
      id: project.id,
      workspaceId: project.workspaceId,
      name: project.name,
      key: project.key,
      description: project.description,
    })
    .from(project)
    .where(
      and(
        inArray(project.workspaceId, caller.workspaceIds),
        isNull(project.archivedAt),
        or(eq(project.id, ref), sql`upper(${project.key}) = upper(${ref})`, sql`lower(${project.name}) = lower(${ref})`),
      ),
    )
    .limit(2);
  if (rows.length === 0) throw new ApiError(`No project "${ref}" that this token can see.`, 404);
  if (rows.length > 1) throw new ApiError(`More than one project matches "${ref}". Use its id.`, 409);
  return rows[0];
}

const itemSelect = {
  id: item.id,
  number: item.number,
  title: item.title,
  description: item.description,
  priority: item.priority,
  startDate: item.startDate,
  dueDate: item.dueDate,
  completedAt: item.completedAt,
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
  parentId: item.parentId,
  workspaceId: item.workspaceId,
  projectId: item.projectId,
  projectKey: project.key,
  projectName: project.name,
  workspaceName: workspace.name,
  status: status.name,
  statusCategory: status.category,
  assignee: user.name,
  labels: sql<string[]>`coalesce((select array_agg(l.name order by l.position) from item_label il join label l on l.id = il.label_id where il.item_id = ${item.id}), '{}')`,
};

type ItemRow = {
  id: string;
  number: number;
  title: string;
  description: string;
  priority: string;
  startDate: string | null;
  dueDate: string | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  parentId: string | null;
  workspaceId: string;
  projectId: string;
  projectKey: string;
  projectName: string;
  workspaceName: string;
  status: string;
  statusCategory: string;
  assignee: string | null;
  labels: string[];
};

function itemQuery() {
  return db
    .select(itemSelect)
    .from(item)
    .innerJoin(project, eq(project.id, item.projectId))
    .innerJoin(workspace, eq(workspace.id, item.workspaceId))
    .innerJoin(status, eq(status.id, item.statusId))
    .leftJoin(user, eq(user.id, item.assigneeId));
}

function serialize(row: ItemRow, base: string) {
  return {
    id: row.id,
    key: `${row.projectKey}-${row.number}`,
    title: row.title,
    description: row.description,
    status: row.status,
    statusCategory: row.statusCategory,
    done: Boolean(row.completedAt),
    priority: row.priority,
    labels: row.labels,
    startDate: row.startDate,
    dueDate: row.dueDate,
    assignee: row.assignee,
    project: { id: row.projectId, key: row.projectKey, name: row.projectName },
    workspace: { id: row.workspaceId, name: row.workspaceName },
    parentId: row.parentId,
    url: `${base}/w/${row.workspaceId}/p/${row.projectId}?item=${row.parentId ?? row.id}`,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

export type ApiItem = ReturnType<typeof serialize>;

const KEY = /^([A-Za-z][A-Za-z0-9]{0,9})-(\d{1,7})$/;

/** Finds an item by id or by key ("ALI-12") among the caller's workspaces. */
async function findItemRow(caller: ApiCaller, ref: string): Promise<ItemRow> {
  if (caller.workspaceIds.length === 0) throw new ApiError("Not found, or this token can't see it.", 404);
  const key = ref.trim().match(KEY);
  const where = key
    ? and(sql`upper(${project.key}) = ${key[1].toUpperCase()}`, eq(item.number, Number(key[2])))
    : eq(item.id, ref.trim());
  const rows = await itemQuery()
    .where(and(where, inArray(item.workspaceId, caller.workspaceIds)))
    .limit(2);
  if (rows.length === 0) throw new ApiError(`No item "${ref}" that this token can see.`, 404);
  if (rows.length > 1) throw new ApiError(`More than one item matches "${ref}". Use its id.`, 409);
  return rows[0];
}

export async function getItem(caller: ApiCaller, ref: string, base: string) {
  const row = await findItemRow(caller, ref);
  const [subtasks, comments, links] = await Promise.all([
    itemQuery().where(eq(item.parentId, row.id)).orderBy(asc(item.position)),
    db
      .select({
        body: activity.body,
        author: user.name,
        createdAt: activity.createdAt,
        via: sql<string | null>`${activity.data}->>'via'`,
        by: sql<string | null>`${activity.data}->>'by'`,
      })
      .from(activity)
      .leftJoin(user, eq(user.id, activity.userId))
      .where(and(eq(activity.itemId, row.id), eq(activity.type, "comment")))
      .orderBy(desc(activity.createdAt))
      .limit(20),
    db
      .select({ url: itemLink.url, title: itemLink.title })
      .from(itemLink)
      .where(eq(itemLink.itemId, row.id))
      .orderBy(asc(itemLink.createdAt)),
  ]);
  return {
    ...serialize(row, base),
    subtasks: subtasks.map((s) => ({ key: `${s.projectKey}-${s.number}`, id: s.id, title: s.title, done: Boolean(s.completedAt) })),
    links,
    comments: comments.map((c) => ({
      author: c.via ? `Automation “${c.via}”` : (c.by ?? c.author ?? "Someone"),
      body: c.body,
      createdAt: c.createdAt.toISOString(),
    })),
  };
}

export type ItemFilter = {
  workspace?: string | null;
  project?: string | null;
  query?: string | null;
  status?: string | null;
  label?: string | null;
  open?: boolean | null;
  dueBefore?: string | null;
  limit?: number | null;
};

export async function findItems(caller: ApiCaller, filter: ItemFilter, base: string) {
  if (caller.workspaceIds.length === 0) return [];
  const conds = [inArray(item.workspaceId, caller.workspaceIds), isNull(project.archivedAt), isNull(item.parentId)];
  if (filter.workspace) {
    allowed(caller, filter.workspace);
    conds.push(eq(item.workspaceId, filter.workspace));
  }
  if (filter.project) {
    const proj = await findProject(caller, filter.project);
    conds.push(eq(item.projectId, proj.id));
  }
  if (filter.query) {
    const pattern = `%${filter.query.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    conds.push(or(ilike(item.title, pattern), ilike(item.description, pattern))!);
  }
  if (filter.status) {
    const s = filter.status.trim().toLowerCase();
    if (s === "todo" || s === "active" || s === "done") conds.push(eq(status.category, s));
    else conds.push(sql`lower(${status.name}) = ${s}`);
  }
  if (filter.label) {
    conds.push(
      sql`exists (select 1 from item_label il join label l on l.id = il.label_id where il.item_id = ${item.id} and lower(l.name) = ${filter.label.trim().toLowerCase()})`,
    );
  }
  if (filter.open) conds.push(isNull(item.completedAt));
  if (filter.dueBefore) conds.push(isNotNull(item.dueDate), lte(item.dueDate, filter.dueBefore));
  const limit = Math.min(200, Math.max(1, filter.limit ?? 50));
  const rows = await itemQuery()
    .where(and(...conds))
    .orderBy(sql`${item.dueDate} asc nulls last`, desc(item.updatedAt))
    .limit(limit);
  return rows.map((r) => serialize(r, base));
}

/** What needs attention: overdue, due in the next `days` days, and in progress. */
export async function agenda(caller: ApiCaller, days: number, base: string) {
  const today = todayString();
  const until = addDaysTo(today, Math.min(60, Math.max(0, days)));
  if (caller.workspaceIds.length === 0) return { today, overdue: [], dueSoon: [], inProgress: [] };
  const rows = await itemQuery()
    .where(
      and(
        inArray(item.workspaceId, caller.workspaceIds),
        isNull(project.archivedAt),
        isNull(item.completedAt),
        or(and(isNotNull(item.dueDate), lte(item.dueDate, until)), eq(status.category, "active")),
      ),
    )
    .orderBy(sql`${item.dueDate} asc nulls last`)
    .limit(200);
  const all = rows.map((r) => serialize(r, base));
  return {
    today,
    overdue: all.filter((i) => i.dueDate && i.dueDate < today),
    dueSoon: all.filter((i) => i.dueDate && i.dueDate >= today && i.dueDate <= until),
    inProgress: all.filter((i) => i.statusCategory === "active" && !(i.dueDate && i.dueDate <= until)),
  };
}

// -------------------------------------------------------------------- writes

const PRIORITIES = ["none", "low", "medium", "high", "urgent"];

function checkPriority(p: string | undefined | null): Priority | undefined {
  if (p === undefined || p === null) return undefined;
  const v = p.toLowerCase();
  if (!PRIORITIES.includes(v)) throw new ApiError(`Priority must be one of ${PRIORITIES.join(", ")}.`);
  return v as Priority;
}

function checkDate(d: string | undefined | null, field: string) {
  if (d === undefined) return undefined;
  if (d === null || d === "") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new ApiError(`${field} must look like 2026-11-30.`);
  return d;
}

async function statusIdFor(projectId: string, name: string) {
  const rows = await db.select().from(status).where(eq(status.projectId, projectId)).orderBy(asc(status.position));
  const v = name.trim().toLowerCase();
  const hit =
    rows.find((s) => s.name.trim().toLowerCase() === v) ??
    (["todo", "active", "done"].includes(v) ? rows.find((s) => s.category === v) : undefined);
  if (!hit) {
    throw new ApiError(`No status "${name}" in this project. It has: ${rows.map((s) => s.name).join(", ")}.`);
  }
  return hit.id;
}

async function labelIdsFor(workspaceId: string, names: string[]) {
  if (names.length === 0) return [];
  const rows = await db.select({ id: label.id, name: label.name }).from(label).where(eq(label.workspaceId, workspaceId));
  return names.map((n) => {
    const hit = rows.find((l) => l.name.trim().toLowerCase() === n.trim().toLowerCase());
    if (!hit) throw new ApiError(`No label "${n}" in this workspace. It has: ${rows.map((l) => l.name).join(", ") || "none"}.`);
    return hit.id;
  });
}

function actorFor(caller: ApiCaller): m.Actor {
  const by = `${caller.name} via ${caller.tokenName}`;
  return { id: caller.userId, name: by, by };
}

/** Runs a mutation and turns its "you can't do that" errors into API errors. */
async function write<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof m.MutationError) throw new ApiError(error.message, 400);
    throw error;
  }
}

export type NewItemInput = {
  project: string;
  title: string;
  description?: string;
  status?: string;
  priority?: string;
  startDate?: string | null;
  dueDate?: string | null;
  labels?: string[];
  parent?: string;
};

export async function createItem(caller: ApiCaller, input: NewItemInput, base: string) {
  const title = (input.title ?? "").trim();
  if (!title || title.length > 300) throw new ApiError("title is required (up to 300 characters).");
  const proj = await findProject(caller, input.project);
  const parent = input.parent ? await findItemRow(caller, input.parent) : null;
  if (parent && parent.projectId !== proj.id) throw new ApiError("The parent item is in another project.");
  const { id } = await write(async () =>
    m.insertItem(caller.userId, {
      projectId: proj.id,
      title,
      description: (input.description ?? "").slice(0, 20_000),
      statusId: input.status ? await statusIdFor(proj.id, input.status) : null,
      priority: checkPriority(input.priority),
      startDate: checkDate(input.startDate, "startDate") ?? null,
      dueDate: checkDate(input.dueDate, "dueDate") ?? null,
      labelIds: await labelIdsFor(proj.workspaceId, input.labels ?? []),
      parentId: parent?.id ?? null,
      source: "api",
      by: actorFor(caller).by,
    }),
  );
  await fireAutomations([{ type: "item_created", itemId: id }], todayString());
  return getItem(caller, id, base);
}

export type ItemPatchInput = {
  title?: string;
  description?: string;
  status?: string;
  priority?: string;
  startDate?: string | null;
  dueDate?: string | null;
  /** Replaces all labels. */
  labels?: string[];
  addLabels?: string[];
  removeLabels?: string[];
};

export async function updateItem(caller: ApiCaller, ref: string, input: ItemPatchInput, base: string) {
  const row = await findItemRow(caller, ref);
  const today = todayString();
  const patch: m.ItemPatch = {};
  if (input.title !== undefined) {
    const t = input.title.trim();
    if (!t || t.length > 300) throw new ApiError("title must be 1 to 300 characters.");
    patch.title = t;
  }
  if (input.description !== undefined) patch.description = String(input.description).slice(0, 20_000);
  if (input.status !== undefined) patch.statusId = await statusIdFor(row.projectId, input.status);
  if (input.priority !== undefined) patch.priority = checkPriority(input.priority);
  if (input.startDate !== undefined) patch.startDate = checkDate(input.startDate, "startDate");
  if (input.dueDate !== undefined) patch.dueDate = checkDate(input.dueDate, "dueDate");

  const events: AutomationEvent[] = [];
  const result = await write(() => m.patchItem(actorFor(caller), row.id, patch, today));
  if (result.changed.includes("statusId")) events.push({ type: "status_changed", itemId: row.id });
  if (result.changed.includes("priority")) events.push({ type: "priority_changed", itemId: row.id });
  if (result.spawnedId) events.push({ type: "item_created", itemId: result.spawnedId });

  if (input.labels || input.addLabels || input.removeLabels) {
    const current = (
      await db.select({ id: itemLabel.labelId }).from(itemLabel).where(eq(itemLabel.itemId, row.id))
    ).map((l) => l.id);
    const add = await labelIdsFor(row.workspaceId, input.addLabels ?? []);
    const remove = await labelIdsFor(row.workspaceId, input.removeLabels ?? []);
    const base0 = input.labels ? await labelIdsFor(row.workspaceId, input.labels) : current;
    const next = [...new Set([...base0, ...add])].filter((id) => !remove.includes(id));
    const { added } = await write(() => m.setItemLabels(actorFor(caller), row.id, next));
    if (added.length) events.push({ type: "label_added", itemId: row.id, labelIds: added });
  }
  if (events.length) await fireAutomations(events, today);
  return getItem(caller, row.id, base);
}

export async function addComment(caller: ApiCaller, ref: string, body: string, base: string) {
  const text = (body ?? "").trim();
  if (!text || text.length > 10_000) throw new ApiError("body is required (up to 10,000 characters).");
  const row = await findItemRow(caller, ref);
  await write(() => m.addComment(actorFor(caller), row.id, text));
  return getItem(caller, row.id, base);
}
