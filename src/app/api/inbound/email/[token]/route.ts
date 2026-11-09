import { createItemFromEmail } from "@/lib/mutations";

/**
 * Email intake. A mail service (Postmark, Mailgun, SendGrid, Zapier, Make…)
 * posts each incoming email here and it becomes an item in the project that
 * owns the token. Field names differ between services, so we accept the
 * common spellings.
 */

function pick(source: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value;
    if (value && typeof value === "object") {
      const nested = value as Record<string, unknown>;
      const inner = nested.Email ?? nested.email ?? nested.address ?? nested.text;
      if (typeof inner === "string" && inner.trim()) return inner;
    }
  }
  return "";
}

function stripHtml(html: string): string {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>(?=.)/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/inbound/email/[token]">,
) {
  const { token } = await ctx.params;
  if (!/^[a-z0-9]{20,40}$/.test(token)) {
    return Response.json({ error: "Unknown address" }, { status: 404 });
  }

  let fields: Record<string, unknown> = {};
  const type = request.headers.get("content-type") ?? "";
  try {
    if (type.includes("application/json")) {
      const body = await request.json();
      if (body && typeof body === "object") fields = body as Record<string, unknown>;
    } else {
      const form = await request.formData();
      for (const [key, value] of form.entries()) {
        if (typeof value === "string") fields[key] = value;
      }
    }
  } catch {
    return Response.json({ error: "Couldn't read that message" }, { status: 400 });
  }

  const subject = pick(fields, ["subject", "Subject"]);
  const from = pick(fields, ["from", "From", "sender", "FromFull", "from_email"]);
  const text =
    pick(fields, ["text", "TextBody", "body-plain", "stripped-text", "body", "plain"]) ||
    stripHtml(pick(fields, ["html", "HtmlBody", "body-html"]));

  if (!subject && !text) {
    return Response.json({ error: "The message had no subject or body" }, { status: 400 });
  }

  const created = await createItemFromEmail(token, {
    subject: subject || text.split("\n")[0].slice(0, 120),
    from: from.slice(0, 200),
    text,
  });
  if (!created) return Response.json({ error: "Unknown address" }, { status: 404 });
  return Response.json({ ok: true, itemId: created.id });
}
