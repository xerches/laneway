import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { githubHook, item, project, status, user, workspaceMember } from "@/db/schema";
import { fireAutomations, type AutomationEvent } from "./automations";
import { todayString } from "./dates";
import * as m from "./mutations";

/**
 * GitHub pull requests. A webhook belongs to one workspace. When a pull
 * request's title, description or branch mentions an item key such as
 * ALI-12, the item gets a link to the PR, and a merge can move it to done.
 */

export type GithubHook = typeof githubHook.$inferSelect;

export async function loadHook(hookId: string) {
  const [row] = await db.select().from(githubHook).where(eq(githubHook.id, hookId));
  return row ?? null;
}

/** Checks the X-Hub-Signature-256 header against the hook's secret. */
export function verifySignature(secret: string, body: string, header: string | null) {
  if (!header?.startsWith("sha256=")) return false;
  const expected = Buffer.from(
    "sha256=" + createHmac("sha256", secret).update(body).digest("hex"),
  );
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

const KEY = /\b([A-Za-z][A-Za-z0-9]{0,9})-(\d{1,7})\b/g;
const MAX_REFS = 20;

/** Item keys mentioned in some text, upper-cased and without repeats. */
export function findKeys(...texts: (string | null | undefined)[]) {
  const found = new Map<string, { key: string; number: number }>();
  for (const text of texts) {
    for (const match of (text ?? "").matchAll(KEY)) {
      const key = match[1].toUpperCase();
      const number = Number(match[2]);
      found.set(`${key}-${number}`, { key, number });
      if (found.size >= MAX_REFS) return [...found.values()];
    }
  }
  return [...found.values()];
}

type PullRequest = {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  merged?: boolean;
  head?: { ref?: string };
};

export type DeliveryResult = {
  ok: true;
  ignored?: string;
  items: { key: string; linked: boolean; movedTo: string | null }[];
};

/** Handles one `pull_request` delivery for a hook that has passed its signature check. */
export async function handlePullRequest(
  hook: GithubHook,
  action: string,
  pr: PullRequest,
): Promise<DeliveryResult> {
  if (!["opened", "edited", "reopened", "closed", "ready_for_review"].includes(action)) {
    return { ok: true, ignored: `action ${action}`, items: [] };
  }
  const merged = action === "closed" && pr.merged === true;
  if (action === "closed" && !merged) return { ok: true, ignored: "closed without merging", items: [] };

  // The hook acts for the person who set it up, and only while they can
  // still see the workspace.
  const [owner] = hook.createdBy
    ? await db
        .select({ id: user.id })
        .from(workspaceMember)
        .innerJoin(user, eq(user.id, workspaceMember.userId))
        .where(
          and(
            eq(workspaceMember.userId, hook.createdBy),
            eq(workspaceMember.workspaceId, hook.workspaceId),
          ),
        )
    : [];
  if (!owner) throw new m.MutationError("The person who set up this webhook no longer has access.");
  const actor: m.Actor = { id: owner.id, name: "GitHub", by: "GitHub" };

  const refs = findKeys(pr.title, pr.body, pr.head?.ref);
  if (refs.length === 0) return { ok: true, ignored: "no item keys mentioned", items: [] };

  const projects = await db
    .select({ id: project.id, key: project.key })
    .from(project)
    .where(
      and(
        eq(project.workspaceId, hook.workspaceId),
        inArray(
          sql`upper(${project.key})`,
          [...new Set(refs.map((r) => r.key))],
        ),
      ),
    );
  const byKey = new Map(projects.map((p) => [p.key.toUpperCase(), p]));
  const targets: { key: string; projectId: string; number: number }[] = [];
  for (const ref of refs) {
    const p = byKey.get(ref.key);
    if (p) targets.push({ key: `${p.key}-${ref.number}`, projectId: p.id, number: ref.number });
  }

  const today = todayString();
  const events: AutomationEvent[] = [];
  const results: DeliveryResult["items"] = [];
  const title = String(pr.title ?? "").slice(0, 300);
  const url = String(pr.html_url ?? "");
  if (!/^https:\/\/github\.com\//.test(url)) throw new m.MutationError("That pull request has no GitHub link.");

  for (const target of targets) {
    const [row] = await db
      .select({ id: item.id, statusId: item.statusId, completedAt: item.completedAt })
      .from(item)
      .where(and(eq(item.projectId, target.projectId), eq(item.number, target.number)));
    if (!row) continue;

    const linked = await m.linkPullRequest(actor, row.id, { url, title, number: pr.number });
    let movedTo: string | null = null;
    if (merged) {
      await m.noteMergedPullRequest(actor, row.id, { title, number: pr.number });
      if (hook.onMerge === "done" && !row.completedAt) {
        const [done] = await db
          .select({ id: status.id, name: status.name })
          .from(status)
          .where(and(eq(status.projectId, target.projectId), eq(status.category, "done")))
          .orderBy(asc(status.position))
          .limit(1);
        if (done) {
          const result = await m.patchItem(actor, row.id, { statusId: done.id }, today);
          if (result.changed.includes("statusId")) {
            events.push({ type: "status_changed", itemId: row.id });
            movedTo = done.name;
          }
          if (result.spawnedId) events.push({ type: "item_created", itemId: result.spawnedId });
        }
      }
    }
    results.push({ key: target.key, linked, movedTo });
  }

  if (events.length) await fireAutomations(events, today);
  return { ok: true, items: results };
}

export async function noteDelivery(hookId: string) {
  await db.update(githubHook).set({ lastDeliveryAt: new Date() }).where(eq(githubHook.id, hookId));
}
