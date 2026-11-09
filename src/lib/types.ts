import type { Recurrence } from "@/db/schema";

export type { Recurrence };

export type StatusCategory = "todo" | "active" | "done";
export type Priority = "none" | "low" | "medium" | "high" | "urgent";

export const PRIORITIES: { value: Priority; label: string; color: string }[] = [
  { value: "urgent", label: "Urgent", color: "red" },
  { value: "high", label: "High", color: "orange" },
  { value: "medium", label: "Medium", color: "amber" },
  { value: "low", label: "Low", color: "blue" },
  { value: "none", label: "No priority", color: "gray" },
];

export type WorkspaceLite = {
  id: string;
  name: string;
  kind: string;
  color: string;
};

export type ProjectLite = {
  id: string;
  workspaceId: string;
  name: string;
  color: string;
  key: string;
};

export type ProjectFull = ProjectLite & {
  description: string;
  inboundToken: string;
};

export type StatusLite = {
  id: string;
  projectId: string;
  name: string;
  color: string;
  category: StatusCategory;
  position: number;
};

export type Member = {
  id: string;
  name: string;
  email: string;
};

export type ItemLite = {
  id: string;
  projectId: string;
  workspaceId: string;
  number: number;
  title: string;
  statusId: string;
  priority: Priority;
  assigneeId: string | null;
  startDate: string | null;
  dueDate: string | null;
  position: number;
  parentId: string | null;
  recurrence: Recurrence | null;
  source: string;
  completedAt: string | null;
  createdAt: string;
  commentCount: number;
  subtaskTotal: number;
  subtaskDone: number;
};

export type ActivityEntry = {
  id: string;
  itemId: string;
  userId: string | null;
  userName: string | null;
  type: string;
  body: string;
  data: Record<string, string | null> | null;
  createdAt: string;
};

export type ItemDetail = {
  item: ItemLite;
  description: string;
  subtasks: ItemLite[];
  activity: ActivityEntry[];
};

/** An item with enough context to show it outside its project. */
export type DashboardItem = ItemLite & {
  projectName: string;
  projectColor: string;
  projectKey: string;
  statusName: string;
  statusColor: string;
  statusCategory: StatusCategory;
};

export type DashboardActivity = ActivityEntry & {
  itemTitle: string;
  projectId: string;
  workspaceId: string;
  projectName: string;
};

export type NotificationEntry = {
  id: string;
  type: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
  workspaceId: string;
  projectId: string | null;
  itemId: string | null;
};

export type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };
