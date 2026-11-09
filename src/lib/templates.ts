import type { Priority, Recurrence, StatusCategory } from "./types";

export type TemplateId = "blank" | "chores" | "client" | "sprint" | "content";

type TemplateStatus = { name: string; color: string; category: StatusCategory };

type TemplateItem = {
  title: string;
  /** Index into the template's statuses. */
  status: number;
  priority?: Priority;
  /** Due this many days from today. */
  dueIn?: number;
  recurrence?: Recurrence;
};

export type Template = {
  id: TemplateId;
  name: string;
  description: string;
  color: string;
  statuses: TemplateStatus[];
  items: TemplateItem[];
};

export const TEMPLATES: Template[] = [
  {
    id: "blank",
    name: "Blank",
    description: "Three columns and nothing else.",
    color: "blue",
    statuses: [
      { name: "To do", color: "gray", category: "todo" },
      { name: "In progress", color: "blue", category: "active" },
      { name: "Done", color: "green", category: "done" },
    ],
    items: [],
  },
  {
    id: "chores",
    name: "Home and chores",
    description: "Recurring chores, bills and errands.",
    color: "teal",
    statuses: [
      { name: "To do", color: "gray", category: "todo" },
      { name: "Doing", color: "amber", category: "active" },
      { name: "Done", color: "green", category: "done" },
    ],
    items: [
      { title: "Take out the trash", status: 0, dueIn: 2, recurrence: { freq: "weekly", interval: 1 } },
      { title: "Grocery run", status: 0, dueIn: 3, recurrence: { freq: "weekly", interval: 1 } },
      { title: "Clean the bathroom", status: 0, dueIn: 5, recurrence: { freq: "weekly", interval: 2 } },
      { title: "Pay rent", status: 0, priority: "high", dueIn: 10, recurrence: { freq: "monthly", interval: 1 } },
      { title: "Renew car registration", status: 0, priority: "medium", dueIn: 21 },
    ],
  },
  {
    id: "client",
    name: "Client work",
    description: "Track a client project from kickoff to invoice.",
    color: "violet",
    statuses: [
      { name: "Backlog", color: "gray", category: "todo" },
      { name: "In progress", color: "blue", category: "active" },
      { name: "Waiting on client", color: "orange", category: "active" },
      { name: "In review", color: "violet", category: "active" },
      { name: "Done", color: "green", category: "done" },
    ],
    items: [
      { title: "Kickoff call", status: 0, priority: "high", dueIn: 2 },
      { title: "Send proposal and scope", status: 0, priority: "high", dueIn: 4 },
      { title: "Collect brand assets and logins", status: 0, dueIn: 6 },
      { title: "First draft", status: 0, dueIn: 14 },
      { title: "Send invoice", status: 0, dueIn: 30, recurrence: { freq: "monthly", interval: 1 } },
    ],
  },
  {
    id: "sprint",
    name: "Sprint",
    description: "Backlog to done, for software work.",
    color: "indigo",
    statuses: [
      { name: "Backlog", color: "gray", category: "todo" },
      { name: "To do", color: "indigo", category: "todo" },
      { name: "In progress", color: "blue", category: "active" },
      { name: "In review", color: "violet", category: "active" },
      { name: "Done", color: "green", category: "done" },
    ],
    items: [
      { title: "Set the sprint goal", status: 1, priority: "high", dueIn: 1 },
      { title: "Groom the backlog", status: 1, dueIn: 2, recurrence: { freq: "weekly", interval: 2 } },
      { title: "Sprint review and retro", status: 0, dueIn: 14, recurrence: { freq: "weekly", interval: 2 } },
    ],
  },
  {
    id: "content",
    name: "Content calendar",
    description: "Plan posts from idea to published.",
    color: "pink",
    statuses: [
      { name: "Idea", color: "gray", category: "todo" },
      { name: "Drafting", color: "amber", category: "active" },
      { name: "Editing", color: "violet", category: "active" },
      { name: "Scheduled", color: "blue", category: "active" },
      { name: "Published", color: "green", category: "done" },
    ],
    items: [
      { title: "Weekly newsletter", status: 0, dueIn: 4, recurrence: { freq: "weekly", interval: 1 } },
      { title: "Blog post: lessons from this month", status: 0, dueIn: 9 },
      { title: "Batch next week's social posts", status: 0, dueIn: 6, recurrence: { freq: "weekly", interval: 1 } },
    ],
  },
];

export function getTemplate(id: string): Template {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];
}
