import "server-only";
import { and, asc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  activity,
  item,
  notification,
  project,
  status,
  user,
  workspace,
  workspaceMember,
  type Recurrence,
} from "@/db/schema";
import {
  addDaysTo,
  daysBetween,
  describeRecurrence,
  formatShort,
  nextOccurrence,
} from "./dates";
import { newId } from "./id";
import { getTemplate } from "./templates";
import type { Priority } from "./types";
import { projectKey } from "./utils";

/**
 * Writes. Callers (server actions, the email webhook) have already worked out
 * who is acting; these functions check that the actor may touch the data.
 */

export class MutationError extends Error {}

async function requireRole(userId: string, workspaceId: string) {
  const [row] = await db
    .select({ role: workspaceMember.role })
    .from(workspaceMember)
    .where(
      and(
        eq(workspaceMember.userId, userId),
        eq(workspaceMember.workspaceId, workspaceId),
      ),
    );
  if (!row) throw new MutationError("You don't have access to that workspace.");
  return row.role;
}

/** Work can only be given to someone who can see the workspace. */
async function requireMember(userId: string, workspaceId: string) {
  const rows = await db
    .select({ role: workspaceMember.role })
    .from(workspaceMember)
    .where(
      and(
        eq(workspaceMember.userId, userId),
        eq(workspaceMember.workspaceId, workspaceId),
      ),
    );
  if (rows.length === 0) throw new MutationError("That person isn't in this workspace.");
}

async function loadProject(projectId: string) {
  const [row] = await db.select().from(project).where(eq(project.id, projectId));
  if (!row) throw new MutationError("That project no longer exists.");
  return row;
}

async function loadItem(itemId: string) {
  const [row] = await db.select().from(item).where(eq(item.id, itemId));
  if (!row) throw new MutationError("That item no longer exists.");
  return row;
}

// ---------------------------------------------------------------- workspaces

export async function createWorkspace(
  userId: string,
  input: { name: string; kind: string; color: string; position: number },
) {
  const id = newId();
  await db.transaction(async (tx) => {
    await tx.insert(workspace).values({ id, ...input, createdBy: userId });
    await tx
      .insert(workspaceMember)
      .values({ workspaceId: id, userId, role: "owner" });
  });
  return id;
}

export async function updateWorkspace(
  userId: string,
  workspaceId: string,
  patch: { name?: string; color?: string },
) {
  await requireRole(userId, workspaceId);
  await db.update(workspace).set(patch).where(eq(workspace.id, workspaceId));
}

// ------------------------------------------------------------------ projects

export async function createProject(
  userId: string,
  input: {
    workspaceId: string;
    name: string;
    color?: string;
    template: string;
    today: string;
  },
) {
  await requireRole(userId, input.workspaceId);
  const template = getTemplate(input.template);
  const projectId = newId();

  await db.transaction(async (tx) => {
    const [{ next }] = await tx
      .select({ next: sql<number>`coalesce(max(${project.position}), -1) + 1` })
      .from(project)
      .where(eq(project.workspaceId, input.workspaceId));

    await tx.insert(project).values({
      id: projectId,
      workspaceId: input.workspaceId,
      name: input.name,
      color: input.color ?? template.color,
      key: projectKey(input.name),
      itemSeq: template.items.length,
      inboundToken: newId(28),
      position: next,
      createdBy: userId,
    });

    const statusIds = template.statuses.map(() => newId());
    await tx.insert(status).values(
      template.statuses.map((s, index) => ({
        id: statusIds[index],
        projectId,
        name: s.name,
        color: s.color,
        category: s.category,
        position: index,
      })),
    );

    if (template.items.length > 0) {
      const rows = template.items.map((t, index) => ({
        id: newId(),
        projectId,
        workspaceId: input.workspaceId,
        number: index + 1,
        title: t.title,
        statusId: statusIds[t.status],
        priority: t.priority ?? "none",
        assigneeId: userId,
        dueDate: t.dueIn === undefined ? null : addDaysTo(input.today, t.dueIn),
        position: index + 1,
        recurrence: t.recurrence ?? null,
        source: "template",
        createdBy: userId,
      }));
      await tx.insert(item).values(rows);
      await tx.insert(activity).values(
        rows.map((r) => ({
          id: newId(),
          itemId: r.id,
          projectId,
          workspaceId: input.workspaceId,
          userId,
          type: "created",
        })),
      );
    }
  });

  return projectId;
}

export async function updateProject(
  userId: string,
  projectId: string,
  patch: { name?: string; color?: string; description?: string },
) {
  const proj = await loadProject(projectId);
  await requireRole(userId, proj.workspaceId);
  await db.update(project).set(patch).where(eq(project.id, projectId));
}

export async function deleteProject(userId: string, projectId: string) {
  const proj = await loadProject(projectId);
  await requireRole(userId, proj.workspaceId);
  // Items point at statuses with "restrict", so remove items first.
  await db.transaction(async (tx) => {
    await tx.delete(item).where(eq(item.projectId, projectId));
    await tx.delete(project).where(eq(project.id, projectId));
  });
  return proj.workspaceId;
}

// ------------------------------------------------------------------ statuses

export async function createStatus(
  userId: string,
  input: { id: string; projectId: string; name: string; color: string; category: string },
) {
  const proj = await loadProject(input.projectId);
  await requireRole(userId, proj.workspaceId);
  const [{ next }] = await db
    .select({ next: sql<number>`coalesce(max(${status.position}), -1) + 1` })
    .from(status)
    .where(eq(status.projectId, input.projectId));
  await db.insert(status).values({ ...input, position: next });
}

export async function updateStatus(
  userId: string,
  statusId: string,
  patch: { name?: string; color?: string; category?: string },
) {
  const [row] = await db.select().from(status).where(eq(status.id, statusId));
  if (!row) throw new MutationError("That status no longer exists.");
  const proj = await loadProject(row.projectId);
  await requireRole(userId, proj.workspaceId);

  await db.transaction(async (tx) => {
    await tx.update(status).set(patch).where(eq(status.id, statusId));
    // Keep "completed" in step when a column becomes (or stops being) a done column.
    if (patch.category && patch.category !== row.category) {
      if (patch.category === "done") {
        await tx
          .update(item)
          .set({ completedAt: new Date() })
          .where(and(eq(item.statusId, statusId), isNull(item.completedAt)));
      } else if (row.category === "done") {
        await tx.update(item).set({ completedAt: null }).where(eq(item.statusId, statusId));
      }
    }
  });
}

export async function reorderStatuses(userId: string, projectId: string, ids: string[]) {
  const proj = await loadProject(projectId);
  await requireRole(userId, proj.workspaceId);
  await db.transaction(async (tx) => {
    for (const [index, id] of ids.entries()) {
      await tx
        .update(status)
        .set({ position: index })
        .where(and(eq(status.id, id), eq(status.projectId, projectId)));
    }
  });
}

export async function deleteStatus(userId: string, statusId: string, moveToId: string | null) {
  const [row] = await db.select().from(status).where(eq(status.id, statusId));
  if (!row) return;
  const proj = await loadProject(row.projectId);
  await requireRole(userId, proj.workspaceId);

  const others = await db
    .select()
    .from(status)
    .where(and(eq(status.projectId, row.projectId), ne(status.id, statusId)))
    .orderBy(asc(status.position));
  if (others.length === 0) {
    throw new MutationError("A project needs at least one status.");
  }
  const target = others.find((s) => s.id === moveToId) ?? others[0];

  await db.transaction(async (tx) => {
    await tx
      .update(item)
      .set({
        statusId: target.id,
        completedAt: target.category === "done" ? new Date() : null,
      })
      .where(eq(item.statusId, statusId));
    await tx.delete(status).where(eq(status.id, statusId));
  });
}

// --------------------------------------------------------------------- items

type NewItem = {
  id?: string;
  projectId: string;
  title: string;
  statusId?: string | null;
  priority?: Priority;
  assigneeId?: string | null;
  startDate?: string | null;
  dueDate?: string | null;
  parentId?: string | null;
  description?: string;
  recurrence?: Recurrence | null;
  source?: string;
};

/**
 * Inserts an item. `actorId` is null when the system creates it (email
 * intake, the next copy of a recurring item).
 */
export async function insertItem(actorId: string | null, input: NewItem) {
  const proj = await loadProject(input.projectId);
  if (actorId) await requireRole(actorId, proj.workspaceId);

  const statuses = await db
    .select()
    .from(status)
    .where(eq(status.projectId, proj.id))
    .orderBy(asc(status.position));
  const chosen =
    statuses.find((s) => s.id === input.statusId) ??
    statuses.find((s) => s.category === "todo") ??
    statuses[0];
  if (!chosen) throw new MutationError("This project has no statuses.");

  if (input.parentId) {
    const parent = await loadItem(input.parentId);
    if (parent.projectId !== proj.id) throw new MutationError("Wrong project.");
  }
  if (input.assigneeId) await requireMember(input.assigneeId, proj.workspaceId);

  const id = input.id ?? newId();
  await db.transaction(async (tx) => {
    const [{ number }] = await tx
      .update(project)
      .set({ itemSeq: sql`${project.itemSeq} + 1` })
      .where(eq(project.id, proj.id))
      .returning({ number: project.itemSeq });

    const [{ next }] = await tx
      .select({ next: sql<number>`coalesce(max(${item.position}), 0) + 1` })
      .from(item)
      .where(
        input.parentId
          ? eq(item.parentId, input.parentId)
          : and(eq(item.statusId, chosen.id), isNull(item.parentId)),
      );

    await tx.insert(item).values({
      id,
      projectId: proj.id,
      workspaceId: proj.workspaceId,
      number,
      title: input.title,
      description: input.description ?? "",
      statusId: chosen.id,
      priority: input.priority ?? "none",
      assigneeId: input.assigneeId ?? null,
      startDate: input.startDate ?? null,
      dueDate: input.dueDate ?? null,
      position: next,
      parentId: input.parentId ?? null,
      recurrence: input.recurrence ?? null,
      source: input.source ?? "manual",
      completedAt: chosen.category === "done" ? new Date() : null,
      createdBy: actorId,
    });

    await tx.insert(activity).values({
      id: newId(),
      itemId: id,
      projectId: proj.id,
      workspaceId: proj.workspaceId,
      userId: actorId,
      type: "created",
    });
  });

  return { id, project: proj };
}

export type ItemPatch = {
  title?: string;
  description?: string;
  statusId?: string;
  priority?: Priority;
  assigneeId?: string | null;
  startDate?: string | null;
  dueDate?: string | null;
  recurrence?: Recurrence | null;
  position?: number;
};

type ActivityRow = typeof activity.$inferInsert;

/** Applies a change to an item and records what changed in its feed. */
export async function patchItem(
  actor: { id: string; name: string },
  itemId: string,
  patch: ItemPatch,
  today: string,
) {
  const current = await loadItem(itemId);
  await requireRole(actor.id, current.workspaceId);

  const set: Partial<typeof item.$inferInsert> = {};
  const feed: ActivityRow[] = [];
  const log = (type: string, data: Record<string, string | null>) =>
    feed.push({
      id: newId(),
      itemId,
      projectId: current.projectId,
      workspaceId: current.workspaceId,
      userId: actor.id,
      type,
      data,
    });

  let justCompleted = false;

  if (patch.title !== undefined && patch.title !== current.title) {
    set.title = patch.title;
    log("title", { from: current.title, to: patch.title });
  }
  if (patch.description !== undefined && patch.description !== current.description) {
    set.description = patch.description;
  }
  if (patch.position !== undefined) set.position = patch.position;

  if (patch.statusId !== undefined && patch.statusId !== current.statusId) {
    const statuses = await db
      .select()
      .from(status)
      .where(eq(status.projectId, current.projectId));
    const from = statuses.find((s) => s.id === current.statusId);
    const to = statuses.find((s) => s.id === patch.statusId);
    if (!to) throw new MutationError("That status belongs to another project.");
    set.statusId = to.id;
    if (to.category === "done" && !current.completedAt) {
      set.completedAt = new Date();
      justCompleted = true;
    } else if (to.category !== "done" && current.completedAt) {
      set.completedAt = null;
    }
    log("status", { from: from?.name ?? null, to: to.name });
  }

  if (patch.priority !== undefined && patch.priority !== current.priority) {
    set.priority = patch.priority;
    log("priority", { from: current.priority, to: patch.priority });
  }

  if (patch.assigneeId !== undefined && patch.assigneeId !== current.assigneeId) {
    const ids = [patch.assigneeId, current.assigneeId].filter(
      (v): v is string => Boolean(v),
    );
    const people = ids.length
      ? await db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, ids))
      : [];
    if (patch.assigneeId) await requireMember(patch.assigneeId, current.workspaceId);
    set.assigneeId = patch.assigneeId;
    log("assignee", {
      from: people.find((p) => p.id === current.assigneeId)?.name ?? null,
      to: people.find((p) => p.id === patch.assigneeId)?.name ?? null,
    });
  }

  if (patch.dueDate !== undefined && patch.dueDate !== current.dueDate) {
    set.dueDate = patch.dueDate;
    log("due", { from: current.dueDate, to: patch.dueDate });
  }
  if (patch.startDate !== undefined && patch.startDate !== current.startDate) {
    set.startDate = patch.startDate;
    log("start", { from: current.startDate, to: patch.startDate });
  }

  if (patch.recurrence !== undefined) {
    const before = current.recurrence ? describeRecurrence(current.recurrence) : null;
    const after = patch.recurrence ? describeRecurrence(patch.recurrence) : null;
    if (before !== after) {
      set.recurrence = patch.recurrence;
      log("recurrence", { from: before, to: after });
    }
  }

  if (Object.keys(set).length === 0) return { spawnedId: null as string | null };

  const merged = { ...current, ...set };
  let spawnedId: string | null = null;

  await db.transaction(async (tx) => {
    // A finished recurring item hands its schedule to the next copy.
    const spawn = justCompleted && merged.recurrence && !current.parentId;
    await tx
      .update(item)
      .set({ ...set, ...(spawn ? { recurrence: null } : {}), updatedAt: new Date() })
      .where(eq(item.id, itemId));
    if (feed.length) await tx.insert(activity).values(feed);

    if (spawn && merged.recurrence) {
      const rec = merged.recurrence;
      const due = nextOccurrence(merged.dueDate ?? null, rec, today);
      const start =
        merged.startDate && merged.dueDate
          ? addDaysTo(due, -Math.max(0, daysBetween(merged.startDate, merged.dueDate)))
          : null;

      const statuses = await tx
        .select()
        .from(status)
        .where(eq(status.projectId, current.projectId))
        .orderBy(asc(status.position));
      const first = statuses.find((s) => s.category === "todo") ?? statuses[0];

      const [{ number }] = await tx
        .update(project)
        .set({ itemSeq: sql`${project.itemSeq} + 1` })
        .where(eq(project.id, current.projectId))
        .returning({ number: project.itemSeq });
      const [{ next }] = await tx
        .select({ next: sql<number>`coalesce(max(${item.position}), 0) + 1` })
        .from(item)
        .where(and(eq(item.statusId, first.id), isNull(item.parentId)));

      spawnedId = newId();
      await tx.insert(item).values({
        id: spawnedId,
        projectId: current.projectId,
        workspaceId: current.workspaceId,
        number,
        title: merged.title,
        description: merged.description,
        statusId: first.id,
        priority: merged.priority,
        assigneeId: merged.assigneeId,
        startDate: start,
        dueDate: due,
        position: next,
        recurrence: rec,
        source: "recurring",
        createdBy: null,
      });
      await tx.insert(activity).values({
        id: newId(),
        itemId: spawnedId,
        projectId: current.projectId,
        workspaceId: current.workspaceId,
        userId: null,
        type: "created",
        data: { recurring: describeRecurrence(rec) },
      });
      await tx.insert(notification).values({
        id: newId(),
        userId: merged.assigneeId ?? actor.id,
        workspaceId: current.workspaceId,
        projectId: current.projectId,
        itemId: spawnedId,
        type: "recurring",
        title: merged.title,
        body: `Next one is due ${formatShort(due)} (${describeRecurrence(rec).toLowerCase()}).`,
      });
    }

    // Tell someone when another person hands them work.
    if (set.assigneeId && set.assigneeId !== actor.id) {
      await tx.insert(notification).values({
        id: newId(),
        userId: set.assigneeId,
        workspaceId: current.workspaceId,
        projectId: current.projectId,
        itemId,
        type: "assigned",
        title: merged.title,
        body: `${actor.name} assigned this to you.`,
      });
    }
  });

  return { spawnedId };
}

export async function removeItem(userId: string, itemId: string) {
  const current = await loadItem(itemId);
  await requireRole(userId, current.workspaceId);
  await db.delete(item).where(eq(item.id, itemId));
}

export async function addComment(
  actor: { id: string; name: string },
  itemId: string,
  body: string,
) {
  const current = await loadItem(itemId);
  await requireRole(actor.id, current.workspaceId);
  const id = newId();
  await db.transaction(async (tx) => {
    await tx.insert(activity).values({
      id,
      itemId,
      projectId: current.projectId,
      workspaceId: current.workspaceId,
      userId: actor.id,
      type: "comment",
      body,
    });
    await tx.update(item).set({ updatedAt: new Date() }).where(eq(item.id, itemId));

    // Let the owner and the assignee know, unless they wrote it.
    const audience = new Set(
      [current.assigneeId, current.createdBy].filter(
        (v): v is string => Boolean(v) && v !== actor.id,
      ),
    );
    if (audience.size) {
      await tx.insert(notification).values(
        [...audience].map((userId) => ({
          id: newId(),
          userId,
          workspaceId: current.workspaceId,
          projectId: current.projectId,
          itemId,
          type: "comment",
          title: current.title,
          body: `${actor.name}: ${body.slice(0, 140)}`,
        })),
      );
    }
  });
  return id;
}

// ------------------------------------------------------------- notifications

export async function markRead(userId: string, notificationId: string | null) {
  await db
    .update(notification)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notification.userId, userId),
        isNull(notification.readAt),
        notificationId ? eq(notification.id, notificationId) : undefined,
      ),
    );
}

// -------------------------------------------------------------- email intake

/** Turns an incoming email into an item in the project that owns the token. */
export async function createItemFromEmail(
  token: string,
  email: { from: string; subject: string; text: string },
) {
  const [proj] = await db.select().from(project).where(eq(project.inboundToken, token));
  if (!proj || proj.archivedAt) return null;

  const title = email.subject.trim() || "(no subject)";
  const { id } = await insertItem(null, {
    projectId: proj.id,
    title: title.slice(0, 300),
    description: email.text.trim().slice(0, 20_000),
    source: "email",
  });

  const members = await db
    .select({ userId: workspaceMember.userId })
    .from(workspaceMember)
    .where(eq(workspaceMember.workspaceId, proj.workspaceId));

  await db.transaction(async (tx) => {
    await tx.insert(activity).values({
      id: newId(),
      itemId: id,
      projectId: proj.id,
      workspaceId: proj.workspaceId,
      userId: null,
      type: "email",
      data: { from: email.from || null },
    });
    if (members.length) {
      await tx.insert(notification).values(
        members.map((m) => ({
          id: newId(),
          userId: m.userId,
          workspaceId: proj.workspaceId,
          projectId: proj.id,
          itemId: id,
          type: "email",
          title,
          body: email.from ? `Arrived by email from ${email.from}.` : "Arrived by email.",
        })),
      );
    }
  });

  return { id, projectId: proj.id };
}
