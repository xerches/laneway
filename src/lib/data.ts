import "server-only";
import { and, asc, desc, eq, gte, ilike, inArray, isNull, or, sql } from "drizzle-orm";
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
} from "@/db/schema";
import type {
  ActivityEntry,
  DashboardActivity,
  DashboardItem,
  ItemDetail,
  ItemLite,
  Member,
  NotificationEntry,
  Priority,
  ProjectFull,
  ProjectLite,
  StatusCategory,
  StatusLite,
  WorkspaceLite,
} from "./types";

/**
 * Every read goes through this file and takes the signed-in user's id, so a
 * person can only ever load data from workspaces they belong to.
 */

const itemColumns = {
  id: item.id,
  projectId: item.projectId,
  workspaceId: item.workspaceId,
  number: item.number,
  title: item.title,
  statusId: item.statusId,
  priority: item.priority,
  assigneeId: item.assigneeId,
  startDate: item.startDate,
  dueDate: item.dueDate,
  position: item.position,
  parentId: item.parentId,
  recurrence: item.recurrence,
  source: item.source,
  completedAt: item.completedAt,
  createdAt: item.createdAt,
  // Written with the table name spelled out: Drizzle drops the "item." prefix
  // on single-table queries, which would point these at the inner row.
  commentCount: sql<number>`(select count(*) from activity a where a.item_id = "item"."id" and a.type = 'comment')::int`,
  subtaskTotal: sql<number>`(select count(*) from item s where s.parent_id = "item"."id")::int`,
  subtaskDone: sql<number>`(select count(*) from item s where s.parent_id = "item"."id" and s.completed_at is not null)::int`,
};

type ItemRow = {
  id: string;
  projectId: string;
  workspaceId: string;
  number: number;
  title: string;
  statusId: string;
  priority: string;
  assigneeId: string | null;
  startDate: string | null;
  dueDate: string | null;
  position: number;
  parentId: string | null;
  recurrence: ItemLite["recurrence"];
  source: string;
  completedAt: Date | null;
  createdAt: Date;
  commentCount: number;
  subtaskTotal: number;
  subtaskDone: number;
};

export function toItemLite(row: ItemRow): ItemLite {
  return {
    ...row,
    priority: row.priority as Priority,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function getWorkspaces(userId: string): Promise<WorkspaceLite[]> {
  return db
    .select({
      id: workspace.id,
      name: workspace.name,
      kind: workspace.kind,
      color: workspace.color,
    })
    .from(workspaceMember)
    .innerJoin(workspace, eq(workspace.id, workspaceMember.workspaceId))
    .where(eq(workspaceMember.userId, userId))
    .orderBy(asc(workspace.position), asc(workspace.createdAt));
}

export async function getWorkspaceIds(userId: string): Promise<string[]> {
  const rows = await db
    .select({ id: workspaceMember.workspaceId })
    .from(workspaceMember)
    .where(eq(workspaceMember.userId, userId));
  return rows.map((r) => r.id);
}

/** The member's role in a workspace, or null if they are not in it. */
export async function getRole(
  userId: string,
  workspaceId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ role: workspaceMember.role })
    .from(workspaceMember)
    .where(
      and(
        eq(workspaceMember.userId, userId),
        eq(workspaceMember.workspaceId, workspaceId),
      ),
    );
  return row?.role ?? null;
}

export async function getProjects(userId: string): Promise<ProjectLite[]> {
  return db
    .select({
      id: project.id,
      workspaceId: project.workspaceId,
      name: project.name,
      color: project.color,
      key: project.key,
    })
    .from(project)
    .innerJoin(
      workspaceMember,
      and(
        eq(workspaceMember.workspaceId, project.workspaceId),
        eq(workspaceMember.userId, userId),
      ),
    )
    .where(isNull(project.archivedAt))
    .orderBy(asc(project.position), asc(project.createdAt));
}

export async function getUnreadCount(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(notification)
    .where(and(eq(notification.userId, userId), isNull(notification.readAt)));
  return row?.n ?? 0;
}

export async function getMembers(workspaceId: string): Promise<Member[]> {
  return db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(workspaceMember)
    .innerJoin(user, eq(user.id, workspaceMember.userId))
    .where(eq(workspaceMember.workspaceId, workspaceId))
    .orderBy(asc(user.name));
}

/** A project the user may open, or null. */
export async function getProject(
  userId: string,
  projectId: string,
): Promise<ProjectFull | null> {
  const [row] = await db
    .select({
      id: project.id,
      workspaceId: project.workspaceId,
      name: project.name,
      color: project.color,
      key: project.key,
      description: project.description,
      inboundToken: project.inboundToken,
    })
    .from(project)
    .innerJoin(
      workspaceMember,
      and(
        eq(workspaceMember.workspaceId, project.workspaceId),
        eq(workspaceMember.userId, userId),
      ),
    )
    .where(eq(project.id, projectId));
  return row ?? null;
}

export async function getStatuses(projectId: string): Promise<StatusLite[]> {
  const rows = await db
    .select()
    .from(status)
    .where(eq(status.projectId, projectId))
    .orderBy(asc(status.position));
  return rows.map((r) => ({ ...r, category: r.category as StatusCategory }));
}

export async function getProjectItems(projectId: string): Promise<ItemLite[]> {
  const rows = await db
    .select(itemColumns)
    .from(item)
    .where(and(eq(item.projectId, projectId), isNull(item.parentId)))
    .orderBy(asc(item.position), asc(item.createdAt));
  return rows.map(toItemLite);
}

export async function getProjectBoard(userId: string, projectId: string) {
  const proj = await getProject(userId, projectId);
  if (!proj) return null;
  const [statuses, items, members] = await Promise.all([
    getStatuses(projectId),
    getProjectItems(projectId),
    getMembers(proj.workspaceId),
  ]);
  return { project: proj, statuses, items, members };
}

function toActivityEntry(row: {
  id: string;
  itemId: string;
  userId: string | null;
  userName: string | null;
  type: string;
  body: string;
  data: Record<string, string | null> | null;
  createdAt: Date;
}): ActivityEntry {
  return { ...row, createdAt: row.createdAt.toISOString() };
}

export async function getItemDetail(
  userId: string,
  itemId: string,
): Promise<ItemDetail | null> {
  const [row] = await db
    .select({ ...itemColumns, description: item.description })
    .from(item)
    .innerJoin(
      workspaceMember,
      and(
        eq(workspaceMember.workspaceId, item.workspaceId),
        eq(workspaceMember.userId, userId),
      ),
    )
    .where(eq(item.id, itemId));
  if (!row) return null;

  const [subtasks, feed] = await Promise.all([
    db
      .select(itemColumns)
      .from(item)
      .where(eq(item.parentId, itemId))
      .orderBy(asc(item.position), asc(item.createdAt)),
    db
      .select({
        id: activity.id,
        itemId: activity.itemId,
        userId: activity.userId,
        userName: user.name,
        type: activity.type,
        body: activity.body,
        data: activity.data,
        createdAt: activity.createdAt,
      })
      .from(activity)
      .leftJoin(user, eq(user.id, activity.userId))
      .where(eq(activity.itemId, itemId))
      .orderBy(asc(activity.createdAt)),
  ]);

  const { description, ...rest } = row;
  return {
    item: toItemLite(rest),
    description,
    subtasks: subtasks.map(toItemLite),
    activity: feed.map(toActivityEntry),
  };
}

/**
 * Everything the home dashboard needs: open items, items finished in the
 * last two weeks, and the latest activity. Pass a workspace id to narrow it.
 */
export async function getDashboard(userId: string, workspaceId: string | null) {
  const mine = await getWorkspaceIds(userId);
  const scope = workspaceId ? mine.filter((id) => id === workspaceId) : mine;
  if (scope.length === 0) {
    return { items: [] as DashboardItem[], activity: [] as DashboardActivity[] };
  }

  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  const [rows, feed] = await Promise.all([
    db
      .select({
        ...itemColumns,
        projectName: project.name,
        projectColor: project.color,
        projectKey: project.key,
        statusName: status.name,
        statusColor: status.color,
        statusCategory: status.category,
      })
      .from(item)
      .innerJoin(project, eq(project.id, item.projectId))
      .innerJoin(status, eq(status.id, item.statusId))
      .where(
        and(
          inArray(item.workspaceId, scope),
          isNull(item.parentId),
          isNull(project.archivedAt),
          or(isNull(item.completedAt), gte(item.completedAt, since)),
        ),
      )
      .orderBy(asc(item.dueDate), asc(item.createdAt))
      .limit(2000),
    db
      .select({
        id: activity.id,
        itemId: activity.itemId,
        userId: activity.userId,
        userName: user.name,
        type: activity.type,
        body: activity.body,
        data: activity.data,
        createdAt: activity.createdAt,
        itemTitle: item.title,
        projectId: activity.projectId,
        workspaceId: activity.workspaceId,
        projectName: project.name,
      })
      .from(activity)
      .innerJoin(item, eq(item.id, activity.itemId))
      .innerJoin(project, eq(project.id, activity.projectId))
      .leftJoin(user, eq(user.id, activity.userId))
      .where(and(inArray(activity.workspaceId, scope), isNull(project.archivedAt)))
      .orderBy(desc(activity.createdAt))
      .limit(12),
  ]);

  const items: DashboardItem[] = rows.map((r) => {
    const { projectName, projectColor, projectKey, statusName, statusColor, statusCategory, ...rest } = r;
    return {
      ...toItemLite(rest),
      projectName,
      projectColor,
      projectKey,
      statusName,
      statusColor,
      statusCategory: statusCategory as StatusCategory,
    };
  });

  const recent: DashboardActivity[] = feed.map((f) => ({
    ...toActivityEntry(f),
    itemTitle: f.itemTitle,
    projectId: f.projectId,
    workspaceId: f.workspaceId,
    projectName: f.projectName,
  }));

  return { items, activity: recent };
}

export async function getNotifications(userId: string): Promise<NotificationEntry[]> {
  const rows = await db
    .select()
    .from(notification)
    .where(eq(notification.userId, userId))
    .orderBy(desc(notification.createdAt))
    .limit(100);
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    title: r.title,
    body: r.body,
    readAt: r.readAt ? r.readAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    workspaceId: r.workspaceId,
    projectId: r.projectId,
    itemId: r.itemId,
  }));
}

export type SearchHit = {
  id: string;
  title: string;
  number: number;
  projectId: string;
  workspaceId: string;
  projectName: string;
  projectKey: string;
  projectColor: string;
};

export async function searchItems(userId: string, query: string): Promise<SearchHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const mine = await getWorkspaceIds(userId);
  if (mine.length === 0) return [];
  const pattern = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
  return db
    .select({
      id: item.id,
      title: item.title,
      number: item.number,
      projectId: item.projectId,
      workspaceId: item.workspaceId,
      projectName: project.name,
      projectKey: project.key,
      projectColor: project.color,
    })
    .from(item)
    .innerJoin(project, eq(project.id, item.projectId))
    .where(
      and(
        inArray(item.workspaceId, mine),
        isNull(item.parentId),
        isNull(project.archivedAt),
        ilike(item.title, pattern),
      ),
    )
    .orderBy(desc(item.updatedAt))
    .limit(12);
}
