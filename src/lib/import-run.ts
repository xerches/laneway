import "server-only";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  activity,
  item,
  itemLabel,
  itemLink,
  label,
  page,
  project,
  status,
  workspace,
  workspaceMember,
} from "@/db/schema";
import { newId } from "./id";
import {
  DEFAULT_IMPORT_STATUSES,
  type ImportPlan,
  type ImportPreview,
  type ImportProject,
} from "./import";
import { createWorkspace, MutationError } from "./mutations";
import { projectKey } from "./utils";

/**
 * Loads an import file. Workspaces are matched to the person's own by name,
 * then by kind; projects that already exist (same name in that workspace) are
 * skipped, so running the same file twice adds nothing new.
 */

const lower = (s: string) => s.trim().toLowerCase();

async function myWorkspaces(userId: string) {
  return db
    .select({ id: workspace.id, name: workspace.name, kind: workspace.kind, position: workspace.position })
    .from(workspace)
    .innerJoin(workspaceMember, eq(workspaceMember.workspaceId, workspace.id))
    .where(eq(workspaceMember.userId, userId));
}

type Mine = Awaited<ReturnType<typeof myWorkspaces>>[number];

/** Which existing workspace each file workspace goes into, if any. */
function matchWorkspaces(plan: ImportPlan, mine: Mine[]) {
  const taken = new Set<string>();
  const byName = plan.workspaces.map((w) => mine.find((m) => lower(m.name) === lower(w.name)) ?? null);
  byName.forEach((m) => m && taken.add(m.id));
  return plan.workspaces.map((w, i) => {
    if (byName[i]) return byName[i];
    const sameKind = mine.filter((m) => m.kind === w.kind && !taken.has(m.id));
    if (sameKind.length !== 1) return null;
    taken.add(sameKind[0].id);
    return sameKind[0];
  });
}

const keyFor = (p: ImportProject) => p.key ?? projectKey(p.name);

/** Works out what an import would do, and what is wrong with the file. */
export async function previewImport(userId: string, plan: ImportPlan): Promise<ImportPreview> {
  const mine = await myWorkspaces(userId);
  const targets = matchWorkspaces(plan, mine);
  const ids = targets.flatMap((t) => (t ? [t.id] : []));
  const [existingProjects, existingLabels] = ids.length
    ? await Promise.all([
        db
          .select({ workspaceId: project.workspaceId, name: project.name, key: project.key })
          .from(project)
          .where(and(inArray(project.workspaceId, ids), isNull(project.archivedAt))),
        db.select({ workspaceId: label.workspaceId, name: label.name }).from(label).where(inArray(label.workspaceId, ids)),
      ])
    : [[], []];

  const problems: string[] = [];
  const preview: ImportPreview = { workspaces: [], problems };

  plan.workspaces.forEach((w, wi) => {
    const into = targets[wi];
    const theirProjects = existingProjects.filter((p) => p.workspaceId === into?.id);
    const theirLabels = existingLabels.filter((l) => l.workspaceId === into?.id).map((l) => lower(l.name));
    const labelNames = new Set([...theirLabels, ...w.labels.map((l) => lower(l.name))]);
    const keys = new Map(theirProjects.map((p) => [p.key.toUpperCase(), p.name]));

    const projects = w.projects.map((p) => {
      const exists = theirProjects.some((e) => lower(e.name) === lower(p.name));
      const key = keyFor(p);
      if (!exists) {
        const clash = keys.get(key);
        if (clash) problems.push(`${w.name} → ${p.name}: the key ${key} is already used by “${clash}”. Give it another key.`);
        keys.set(key, p.name);
        const statusNames = (p.statuses ?? DEFAULT_IMPORT_STATUSES).map((s) => lower(s.name));
        for (const it of p.items) {
          if (it.status && !statusNames.includes(lower(it.status))) {
            problems.push(`${w.name} → ${p.name} → “${it.title}”: no status called “${it.status}”.`);
          }
          for (const l of it.labels) {
            if (!labelNames.has(lower(l))) {
              problems.push(`${w.name} → ${p.name} → “${it.title}”: no label called “${l}”. Add it to the workspace's labels.`);
            }
          }
          if (it.startDate && it.dueDate && it.startDate > it.dueDate) {
            problems.push(`${w.name} → ${p.name} → “${it.title}”: it starts after it is due.`);
          }
        }
      }
      return { name: p.name, key, items: p.items.length, pages: p.pages.length, exists };
    });

    preview.workspaces.push({
      name: w.name,
      into: into ? { id: into.id, name: into.name } : null,
      labelsToAdd: w.labels.filter((l) => !theirLabels.includes(lower(l.name))).map((l) => l.name),
      projects,
    });
  });
  return preview;
}

export type ImportResult = {
  projects: { workspace: string; workspaceId: string; id: string; name: string; key: string; items: number }[];
  skipped: string[];
};

/** Runs the import. Call previewImport first; this refuses a file with problems. */
export async function runImport(userId: string, plan: ImportPlan): Promise<ImportResult> {
  const preview = await previewImport(userId, plan);
  if (preview.problems.length) throw new MutationError(preview.problems[0]);

  const mine = await myWorkspaces(userId);
  const result: ImportResult = { projects: [], skipped: [] };

  for (const [wi, w] of plan.workspaces.entries()) {
    const target = preview.workspaces[wi].into;
    const workspaceId =
      target?.id ??
      (await createWorkspace(userId, {
        name: w.name,
        kind: w.kind,
        color: w.color,
        position: mine.length + wi,
      }));

    // Labels: add the ones the workspace doesn't have yet.
    const have = await db.select().from(label).where(eq(label.workspaceId, workspaceId));
    const missing = w.labels.filter((l) => !have.some((h) => lower(h.name) === lower(l.name)));
    if (missing.length) {
      await db.insert(label).values(
        missing.map((l, i) => ({ id: newId(), workspaceId, name: l.name, color: l.color, position: have.length + i })),
      );
    }
    const labels = await db.select({ id: label.id, name: label.name }).from(label).where(eq(label.workspaceId, workspaceId));
    const labelId = new Map(labels.map((l) => [lower(l.name), l.id]));

    for (const [pi, p] of w.projects.entries()) {
      if (preview.workspaces[wi].projects[pi].exists) {
        result.skipped.push(`${w.name} → ${p.name}`);
        continue;
      }
      const made = await importProject(userId, workspaceId, p, labelId);
      result.projects.push({ workspace: target?.name ?? w.name, workspaceId, ...made });
    }
  }
  return result;
}

async function importProject(
  userId: string,
  workspaceId: string,
  p: ImportProject,
  labelId: Map<string, string>,
) {
  const projectId = newId();
  const key = keyFor(p);
  const statuses = (p.statuses ?? DEFAULT_IMPORT_STATUSES).map((s, position) => ({ ...s, id: newId(), position }));
  const statusOf = (name?: string) =>
    (name && statuses.find((s) => lower(s.name) === lower(name))) || statuses[0];
  const firstOpen = statuses.find((s) => s.category !== "done") ?? statuses[0];
  const firstDone = statuses.find((s) => s.category === "done") ?? statuses[statuses.length - 1];

  type Row = typeof item.$inferInsert;
  const rows: Row[] = [];
  const labelRows: { itemId: string; labelId: string }[] = [];
  const linkRows: (typeof itemLink.$inferInsert)[] = [];
  let number = 0;
  const now = new Date();

  for (const [index, it] of p.items.entries()) {
    const st = statusOf(it.status);
    const id = newId();
    rows.push({
      id,
      projectId,
      workspaceId,
      number: ++number,
      title: it.title,
      description: it.description,
      statusId: st.id,
      priority: it.priority,
      assigneeId: userId,
      startDate: it.startDate ?? null,
      dueDate: it.dueDate ?? null,
      position: index + 1,
      source: "import",
      completedAt: st.category === "done" ? now : null,
      createdBy: userId,
    });
    for (const name of new Set(it.labels.map(lower))) {
      const lid = labelId.get(name);
      if (lid) labelRows.push({ itemId: id, labelId: lid });
    }
    for (const l of it.links) {
      linkRows.push({ id: newId(), itemId: id, workspaceId, url: l.url, title: l.title, createdBy: userId });
    }
    for (const [si, s] of it.subtasks.entries()) {
      const sub = typeof s === "string" ? { title: s, done: false } : s;
      rows.push({
        id: newId(),
        projectId,
        workspaceId,
        number: ++number,
        title: sub.title,
        statusId: sub.done ? firstDone.id : firstOpen.id,
        priority: "none",
        assigneeId: userId,
        parentId: id,
        position: si + 1,
        source: "import",
        completedAt: sub.done ? now : null,
        createdBy: userId,
      });
    }
  }

  await db.transaction(async (tx) => {
    const [{ next }] = await tx
      .select({ next: sql<number>`coalesce(max(${project.position}), -1) + 1` })
      .from(project)
      .where(eq(project.workspaceId, workspaceId));
    await tx.insert(project).values({
      id: projectId,
      workspaceId,
      name: p.name,
      description: p.description,
      color: p.color,
      key,
      itemSeq: number,
      inboundToken: newId(28),
      position: next,
      createdBy: userId,
    });
    await tx.insert(status).values(
      statuses.map((s) => ({ id: s.id, projectId, name: s.name, color: s.color, category: s.category, position: s.position })),
    );
    // Parents before subtasks, in chunks so a big project stays within limits.
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      await tx.insert(item).values(chunk.filter((r) => !r.parentId));
      const subs = chunk.filter((r) => r.parentId);
      if (subs.length) await tx.insert(item).values(subs);
    }
    if (rows.length) {
      await tx.insert(activity).values(
        rows.map((r) => ({
          id: newId(),
          itemId: r.id!,
          projectId,
          workspaceId,
          userId,
          type: "created",
          data: { by: "Import" },
        })),
      );
    }
    if (labelRows.length) await tx.insert(itemLabel).values(labelRows);
    if (linkRows.length) await tx.insert(itemLink).values(linkRows);
    if (p.pages.length) {
      await tx.insert(page).values(
        p.pages.map((pg, i) => ({
          id: newId(),
          projectId,
          workspaceId,
          title: pg.title,
          body: pg.body,
          position: i + 1,
          createdBy: userId,
          updatedBy: userId,
        })),
      );
    }
  });

  return { id: projectId, name: p.name, key, items: p.items.length };
}
