
/**
 * On Netlify, servers stop when idle, so this scheduled function calls the
 * automations endpoint every 15 minutes instead. Set CRON_SECRET (or rely on
 * BETTER_AUTH_SECRET) in the site's environment variables.
 */
const handler = async () => {
  const base = process.env.URL;
  const secret = process.env.CRON_SECRET || process.env.BETTER_AUTH_SECRET;
  if (!base || !secret) return new Response("Not configured", { status: 500 });
  const response = await fetch(`${base}/api/cron/automations`, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}` },
  });
  return new Response(await response.text(), { status: response.status });
};

export default handler;

export const config = { schedule: "*/15 * * * *" };
