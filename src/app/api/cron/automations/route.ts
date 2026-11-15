import { timingSafeEqual } from "node:crypto";
import { runTimedAutomations } from "@/lib/automations";

/**
 * Runs due-date and schedule automations. Self-hosted Laneway calls this
 * itself every 15 minutes (see src/instrumentation.ts). Elsewhere, point a
 * cron job at it with the header `Authorization: Bearer <CRON_SECRET>`.
 */

function secret() {
  return process.env.CRON_SECRET || process.env.BETTER_AUTH_SECRET || "";
}

function authorized(request: Request) {
  const expected = secret();
  const header = request.headers.get("authorization") ?? "";
  const given = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Not allowed" }, { status: 401 });
  const result = await runTimedAutomations();
  return Response.json({ ok: true, ...result });
}
