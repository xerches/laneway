import { z } from "zod";
import { COLORS } from "./colors";
import { isSafeLink } from "./links";

/**
 * The import file: workspaces, their labels, and projects with statuses,
 * pages and items. Used to load a plan written elsewhere (for example in
 * Obsidian) in one go. Shared by the Settings page (to preview) and the
 * server (to import).
 */

const color = z.enum(COLORS);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Dates look like 2026-11-30.");
const text = (max: number) => z.string().trim().min(1).max(max);

const link = z.object({
  url: z.string().trim().max(2000).refine(isSafeLink, "Links must start with https:, http:, obsidian: or mailto:."),
  title: z.string().trim().max(200).default(""),
});

const subtask = z.union([
  text(300),
  z.object({ title: text(300), done: z.boolean().default(false) }),
]);

const importItem = z.object({
  title: text(300),
  description: z.string().max(20_000).default(""),
  /** A status name from the project. Defaults to the first one. */
  status: z.string().trim().max(60).optional(),
  priority: z.enum(["none", "low", "medium", "high", "urgent"]).default("none"),
  /** Label names from the workspace. */
  labels: z.array(text(40)).max(20).default([]),
  startDate: day.nullish(),
  dueDate: day.nullish(),
  links: z.array(link).max(20).default([]),
  subtasks: z.array(subtask).max(50).default([]),
});

const importProject = z.object({
  name: text(80),
  /** Item key prefix, e.g. WED for WED-1. Made from the name if left out. */
  key: z
    .string()
    .trim()
    .regex(/^[A-Za-z][A-Za-z0-9]{0,9}$/, "A key is 1 to 10 letters or digits, starting with a letter.")
    .transform((k) => k.toUpperCase())
    .optional(),
  color: color.default("blue"),
  description: z.string().max(2000).default(""),
  statuses: z
    .array(
      z.object({
        name: text(40),
        color: color.default("gray"),
        category: z.enum(["todo", "active", "done"]),
      }),
    )
    .min(1)
    .max(12)
    .optional(),
  pages: z.array(z.object({ title: text(200), body: z.string().max(50_000).default("") })).max(20).default([]),
  items: z.array(importItem).max(500).default([]),
});

const importWorkspace = z.object({
  name: text(60),
  kind: z.enum(["personal", "work", "business"]).default("personal"),
  color: color.default("violet"),
  labels: z.array(z.object({ name: text(40), color: color.default("gray") })).max(50).default([]),
  projects: z.array(importProject).max(50),
});

export const importSchema = z.object({
  version: z.literal(1),
  workspaces: z.array(importWorkspace).min(1).max(10),
});

export type ImportPlan = z.infer<typeof importSchema>;
export type ImportProject = z.infer<typeof importProject>;
export type ImportItem = z.infer<typeof importItem>;

/** The statuses a project gets when the file doesn't list its own. */
export const DEFAULT_IMPORT_STATUSES: NonNullable<ImportProject["statuses"]> = [
  { name: "Backlog", color: "gray", category: "todo" },
  { name: "To do", color: "blue", category: "todo" },
  { name: "In progress", color: "amber", category: "active" },
  { name: "Blocked", color: "red", category: "active" },
  { name: "Done", color: "green", category: "done" },
];

/** What an import would do, shown before anything is written. */
export type ImportPreview = {
  workspaces: {
    name: string;
    /** The existing workspace it goes into, or null when a new one is made. */
    into: { id: string; name: string } | null;
    labelsToAdd: string[];
    projects: { name: string; key: string; items: number; pages: number; exists: boolean }[];
  }[];
  problems: string[];
};

/** Turns a zod error into lines a person can act on. */
export function describeImportError(error: z.ZodError): string[] {
  return error.issues.slice(0, 8).map((issue) => {
    const where = issue.path.length ? issue.path.join(" → ") : "the file";
    return `${where}: ${issue.message}`;
  });
}
