import type { DashboardWidget } from "@/db/schema";

export type { DashboardWidget };

export type WidgetType =
  | "counters"
  | "work-list"
  | "two-weeks"
  | "projects"
  | "activity"
  | "by-status"
  | "by-priority"
  | "by-label"
  | "due-soon"
  | "overdue"
  | "done-per-week"
  | "burn-up";

export type WidgetSize = DashboardWidget["size"];

type WidgetMeta = {
  type: WidgetType;
  name: string;
  description: string;
  size: WidgetSize;
  /** Charts can be narrowed to one project. */
  perProject: boolean;
  group: "Lists" | "Charts" | "Overview";
};

/** Every widget a dashboard can hold, in the order the "Add widget" menu shows. */
export const WIDGETS: WidgetMeta[] = [
  { type: "counters", name: "At a glance", description: "Due today, overdue, in progress and done this week", size: "full", perProject: false, group: "Overview" },
  { type: "projects", name: "Project progress", description: "A progress bar and health for every project", size: "half", perProject: false, group: "Overview" },
  { type: "activity", name: "Recent activity", description: "The latest changes and comments", size: "half", perProject: false, group: "Overview" },
  { type: "work-list", name: "Up next", description: "Open items by due date; the counters filter it", size: "half", perProject: false, group: "Lists" },
  { type: "due-soon", name: "Due soon", description: "Open items due in the next 7 days", size: "half", perProject: true, group: "Lists" },
  { type: "overdue", name: "Overdue", description: "Open items past their due date", size: "half", perProject: true, group: "Lists" },
  { type: "two-weeks", name: "Next 14 days", description: "What's due on each of the next 14 days", size: "half", perProject: false, group: "Lists" },
  { type: "by-status", name: "Items by status", description: "Open items in each status", size: "half", perProject: true, group: "Charts" },
  { type: "by-priority", name: "Items by priority", description: "Open items at each priority", size: "half", perProject: true, group: "Charts" },
  { type: "by-label", name: "Items by label", description: "Open items with each label", size: "half", perProject: true, group: "Charts" },
  { type: "done-per-week", name: "Done per week", description: "Items finished in each of the last 8 weeks", size: "half", perProject: true, group: "Charts" },
  { type: "burn-up", name: "Burn-up", description: "Work in scope against work done, over 8 weeks", size: "half", perProject: true, group: "Charts" },
];

export function widgetMeta(type: string): WidgetMeta | undefined {
  return WIDGETS.find((w) => w.type === type);
}

const DEFAULT_TYPES: [WidgetType, WidgetSize][] = [
  ["counters", "full"],
  ["work-list", "half"],
  ["projects", "half"],
  ["two-weeks", "half"],
  ["activity", "half"],
  ["by-status", "half"],
  ["done-per-week", "half"],
];

/** The layout a dashboard starts with until someone customizes it. */
export function defaultWidgets(): DashboardWidget[] {
  return DEFAULT_TYPES.map(([type, size]) => ({ id: type, type, size, projectId: null }));
}

export const MAX_WIDGETS = 30;

/** Drops unknown widget types and fixes bad sizes, so stored layouts never break the page. */
export function cleanWidgets(widgets: unknown): DashboardWidget[] | null {
  if (!Array.isArray(widgets)) return null;
  const seen = new Set<string>();
  const out: DashboardWidget[] = [];
  for (const raw of widgets.slice(0, MAX_WIDGETS)) {
    if (!raw || typeof raw !== "object") continue;
    const w = raw as Record<string, unknown>;
    if (typeof w.id !== "string" || !w.id || seen.has(w.id) || w.id.length > 64) continue;
    if (typeof w.type !== "string" || !widgetMeta(w.type)) continue;
    seen.add(w.id);
    out.push({
      id: w.id,
      type: w.type,
      size: w.size === "full" ? "full" : "half",
      projectId: typeof w.projectId === "string" && w.projectId ? w.projectId : null,
    });
  }
  return out;
}
