import "server-only";
import { and, asc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/db";
import { calendarFeed, item, project, workspace, workspaceMember } from "@/db/schema";
import { addDaysTo } from "./dates";

/**
 * Private calendar links. A calendar app subscribes to one and shows every
 * open item with a due date as an all-day event, read-only. Changes are made
 * in Laneway; the calendar picks them up on its next refresh.
 */

const MAX_EVENTS = 2000;

export async function loadFeed(feedId: string) {
  const [row] = await db.select().from(calendarFeed).where(eq(calendarFeed.id, feedId));
  return row ?? null;
}

export type FeedEvent = {
  id: string;
  key: string;
  title: string;
  dueDate: string;
  priority: string;
  projectName: string;
  workspaceName: string;
  url: string;
};

/** Open, dated items the feed's owner can still see, within the feed's workspaces. */
export async function feedEvents(
  feed: { userId: string; workspaceIds: string[] | null },
  baseUrl: string,
): Promise<FeedEvent[]> {
  const memberOf = await db
    .select({ id: workspaceMember.workspaceId })
    .from(workspaceMember)
    .where(eq(workspaceMember.userId, feed.userId));
  const allowed = memberOf
    .map((m) => m.id)
    .filter((id) => !feed.workspaceIds || feed.workspaceIds.includes(id));
  if (allowed.length === 0) return [];

  const rows = await db
    .select({
      id: item.id,
      number: item.number,
      title: item.title,
      dueDate: item.dueDate,
      priority: item.priority,
      projectId: project.id,
      projectKey: project.key,
      projectName: project.name,
      workspaceId: workspace.id,
      workspaceName: workspace.name,
    })
    .from(item)
    .innerJoin(project, eq(project.id, item.projectId))
    .innerJoin(workspace, eq(workspace.id, item.workspaceId))
    .where(
      and(
        inArray(item.workspaceId, allowed),
        isNull(item.completedAt),
        isNotNull(item.dueDate),
        isNull(project.archivedAt),
      ),
    )
    .orderBy(asc(item.dueDate))
    .limit(MAX_EVENTS);

  return rows.map((r) => ({
    id: r.id,
    key: `${r.projectKey}-${r.number}`,
    title: r.title,
    dueDate: r.dueDate!,
    priority: r.priority,
    projectName: r.projectName,
    workspaceName: r.workspaceName,
    url: `${baseUrl}/w/${r.workspaceId}/p/${r.projectId}?item=${r.id}`,
  }));
}

/** Escapes text for an iCalendar property value (RFC 5545 §3.3.11). */
function escapeText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/[;,]/g, (c) => `\\${c}`);
}

/** Folds a content line at 75 octets, as RFC 5545 asks. */
function fold(line: string) {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let size = 0;
  for (const char of line) {
    const n = Buffer.byteLength(char, "utf8");
    if (size + n > (parts.length ? 74 : 75)) {
      parts.push(current);
      current = "";
      size = 0;
    }
    current += char;
    size += n;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

const compactDate = (day: string) => day.replaceAll("-", "");

function stamp(date: Date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** The whole calendar as iCalendar text. */
export function buildCalendar(name: string, events: FeedEvent[], now = new Date()) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Laneway//Calendar feed//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(name)}`,
    "X-WR-CALDESC:Due dates from Laneway. Change them in Laneway.",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];
  for (const e of events) {
    const description = [
      `${e.workspaceName} → ${e.projectName}`,
      e.priority !== "none" ? `Priority: ${e.priority}` : null,
      e.url,
    ]
      .filter(Boolean)
      .join("\n");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.id}@laneway`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART;VALUE=DATE:${compactDate(e.dueDate)}`,
      `DTEND;VALUE=DATE:${compactDate(addDaysTo(e.dueDate, 1))}`,
      `SUMMARY:${escapeText(`${e.key} ${e.title}`)}`,
      `DESCRIPTION:${escapeText(description)}`,
      `URL:${e.url}`,
      `CATEGORIES:${escapeText(e.workspaceName)}`,
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

export async function noteFetch(feedId: string) {
  await db.update(calendarFeed).set({ lastFetchedAt: new Date() }).where(eq(calendarFeed.id, feedId));
}
