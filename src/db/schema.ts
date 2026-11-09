import {
  pgTable,
  text,
  timestamp,
  integer,
  doublePrecision,
  date,
  jsonb,
  index,
  primaryKey,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

export * from "./auth-schema";

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).defaultNow().notNull();

/**
 * A workspace keeps one area of life apart from the others
 * (Personal, Day job, Alimi). Nothing crosses between workspaces.
 */
export const workspace = pgTable("workspace", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  // personal | work | business
  kind: text("kind").notNull().default("personal"),
  color: text("color").notNull().default("violet"),
  position: integer("position").notNull().default(0),
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
});

/** Who can see a workspace. One row today; a team later. */
export const workspaceMember = pgTable(
  "workspace_member",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // owner | admin | member
    role: text("role").notNull().default("owner"),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.userId] }),
    index("workspace_member_user_idx").on(t.userId),
  ],
);

export const project = pgTable(
  "project",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    color: text("color").notNull().default("blue"),
    // Short prefix for item numbers, e.g. HOME-12
    key: text("key").notNull(),
    // Last item number handed out in this project
    itemSeq: integer("item_seq").notNull().default(0),
    // Secret used by the email-to-item webhook
    inboundToken: text("inbound_token").notNull(),
    position: integer("position").notNull().default(0),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("project_workspace_idx").on(t.workspaceId),
    uniqueIndex("project_inbound_token_idx").on(t.inboundToken),
  ],
);

/** Each project owns its statuses, which are also the board columns. */
export const status = pgTable(
  "status",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull().default("gray"),
    // todo | active | done
    category: text("category").notNull().default("todo"),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("status_project_idx").on(t.projectId)],
);

export type Recurrence = {
  freq: "daily" | "weekly" | "monthly" | "yearly";
  interval: number;
};

export const item = pgTable(
  "item",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    statusId: text("status_id")
      .notNull()
      .references(() => status.id, { onDelete: "restrict" }),
    // none | low | medium | high | urgent
    priority: text("priority").notNull().default("none"),
    assigneeId: text("assignee_id").references(() => user.id, {
      onDelete: "set null",
    }),
    startDate: date("start_date", { mode: "string" }),
    dueDate: date("due_date", { mode: "string" }),
    // Order inside a board column
    position: doublePrecision("position").notNull().default(0),
    parentId: text("parent_id").references((): AnyPgColumn => item.id, {
      onDelete: "cascade",
    }),
    recurrence: jsonb("recurrence").$type<Recurrence>(),
    // manual | email | recurring | template
    source: text("source").notNull().default("manual"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("item_project_idx").on(t.projectId),
    index("item_workspace_idx").on(t.workspaceId),
    index("item_assignee_idx").on(t.assigneeId),
    index("item_due_idx").on(t.dueDate),
    index("item_parent_idx").on(t.parentId),
  ],
);

/** Comments and every change to an item live in one feed. */
export const activity = pgTable(
  "activity",
  {
    id: text("id").primaryKey(),
    itemId: text("item_id")
      .notNull()
      .references(() => item.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    // null when the system did it (email intake, recurring copy)
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    // created | comment | status | priority | assignee | due | start | title | recurrence | email
    type: text("type").notNull(),
    body: text("body").notNull().default(""),
    data: jsonb("data").$type<Record<string, string | null>>(),
    createdAt: createdAt(),
  },
  (t) => [
    index("activity_item_idx").on(t.itemId),
    index("activity_workspace_idx").on(t.workspaceId, t.createdAt),
  ],
);

export const notification = pgTable(
  "notification",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    projectId: text("project_id").references(() => project.id, {
      onDelete: "cascade",
    }),
    itemId: text("item_id").references(() => item.id, { onDelete: "cascade" }),
    // assigned | mention | comment | email | recurring
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("notification_user_idx").on(t.userId, t.readAt)],
);
