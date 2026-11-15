/**
 * When Laneway runs as its own long-lived server (self-hosted, or `next dev`),
 * it runs its due-date and schedule automations every 15 minutes by calling
 * its own cron endpoint. Hosted platforms (Netlify, Vercel) stop idle servers,
 * so there a scheduled job calls the endpoint instead.
 *
 * Set LANEWAY_SCHEDULER=0 to turn this off.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.LANEWAY_SCHEDULER === "0") return;
  if (process.env.NETLIFY || process.env.VERCEL) return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const port = process.env.PORT || "3000";
  const secret = process.env.CRON_SECRET || process.env.BETTER_AUTH_SECRET;
  if (!secret) return;

  const tick = async () => {
    try {
      await fetch(`http://127.0.0.1:${port}/api/cron/automations`, {
        method: "POST",
        headers: { authorization: `Bearer ${secret}` },
      });
    } catch {
      // The server may still be starting; the next tick will try again.
    }
  };

  const minute = 60_000;
  setTimeout(tick, minute);
  setInterval(tick, 15 * minute).unref();
}
