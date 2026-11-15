import { buildCalendar, feedEvents, loadFeed, noteFetch } from "@/lib/calendar";

/**
 * A private calendar link: GET /api/calendar/<secret>.ics. Calendar apps
 * subscribe to it and refresh it every hour or so. The secret in the path is
 * the only key, so anyone with the link can read these due dates.
 */

function baseUrl(request: Request) {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost ?? request.headers.get("host");
  if (!host) return new URL(request.url).origin;
  const proto =
    request.headers.get("x-forwarded-proto")?.split(",")[0].trim() ??
    (host.startsWith("localhost") || host.startsWith("127.") ? "http" : new URL(request.url).protocol.replace(":", ""));
  return `${proto}://${host}`;
}

export async function GET(request: Request, ctx: RouteContext<"/api/calendar/[feed]">) {
  const { feed: raw } = await ctx.params;
  const feedId = raw.replace(/\.ics$/, "");
  if (!/^[a-z0-9]{32}$/.test(feedId)) return new Response("Not found", { status: 404 });
  const feed = await loadFeed(feedId);
  if (!feed) return new Response("Not found", { status: 404 });

  const events = await feedEvents(feed, baseUrl(request));
  await noteFetch(feed.id);
  return new Response(buildCalendar(feed.name, events), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="laneway.ics"`,
      "Cache-Control": "private, no-store",
    },
  });
}
