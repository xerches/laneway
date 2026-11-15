import { handlePullRequest, loadHook, noteDelivery, verifySignature } from "@/lib/github";
import { MutationError } from "@/lib/mutations";

/**
 * GitHub webhook. Set it up in a repository's Settings → Webhooks with the
 * payload URL and secret from Laneway's Settings page, content type
 * application/json, and the "Pull requests" event.
 */

const MAX_BODY = 1_000_000;

export async function POST(request: Request, ctx: RouteContext<"/api/integrations/github/[hookId]">) {
  const { hookId } = await ctx.params;
  if (!/^[a-z0-9]{10,32}$/.test(hookId)) {
    return Response.json({ error: "Unknown webhook" }, { status: 404 });
  }
  const hook = await loadHook(hookId);
  if (!hook) return Response.json({ error: "Unknown webhook" }, { status: 404 });

  const body = await request.text();
  if (body.length > MAX_BODY) return Response.json({ error: "Too large" }, { status: 413 });
  if (!verifySignature(hook.secret, body, request.headers.get("x-hub-signature-256"))) {
    return Response.json({ error: "The signature doesn't match this webhook's secret" }, { status: 401 });
  }
  await noteDelivery(hook.id);

  const event = request.headers.get("x-github-event") ?? "";
  if (event === "ping") return Response.json({ ok: true, pong: true });
  if (event !== "pull_request") return Response.json({ ok: true, ignored: `event ${event}` });

  let payload: { action?: unknown; pull_request?: unknown };
  try {
    payload = JSON.parse(body);
  } catch {
    return Response.json({ error: "Send the payload as application/json" }, { status: 400 });
  }
  const pr = payload.pull_request as Parameters<typeof handlePullRequest>[2] | undefined;
  if (!pr || typeof pr !== "object" || typeof pr.number !== "number") {
    return Response.json({ error: "No pull request in that payload" }, { status: 400 });
  }

  try {
    const result = await handlePullRequest(hook, String(payload.action ?? ""), pr);
    return Response.json(result);
  } catch (error) {
    if (error instanceof MutationError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
