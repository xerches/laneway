"use client";

import { startTransition, useOptimistic } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDistanceToNowStrict } from "date-fns";
import { AtSign, Bell, CheckCheck, Mail, MessageSquare, Repeat, UserRoundPlus } from "lucide-react";
import { markNotificationRead } from "@/actions";
import { DueChip } from "@/components/project/pickers";
import { Dot, Pill } from "@/components/ui/bits";
import { Button } from "@/components/ui/button";
import { useToday } from "@/lib/client";
import type { DashboardItem, NotificationEntry } from "@/lib/types";
import { cn } from "@/lib/utils";
import { DashboardSkeleton } from "./dashboard";

const ICONS: Record<string, typeof Bell> = {
  email: Mail,
  recurring: Repeat,
  assigned: UserRoundPlus,
  comment: MessageSquare,
  mention: AtSign,
};

const card = "rounded-xl border border-line bg-surface shadow-card";

/** One place for what needs you: late and due-today items, then notifications. */
export function InboxView({
  notifications,
  dated,
}: {
  notifications: NotificationEntry[];
  dated: DashboardItem[];
}) {
  const today = useToday();
  const router = useRouter();
  const [list, markRead] = useOptimistic(
    notifications,
    (current, id: string | null) =>
      current.map((n) =>
        (id === null || n.id === id) && !n.readAt
          ? { ...n, readAt: new Date().toISOString() }
          : n,
      ),
  );

  if (!today) return <DashboardSkeleton />;

  const attention = dated
    .filter((i) => i.dueDate && i.dueDate <= today)
    .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));
  const unread = list.filter((n) => !n.readAt).length;

  function read(id: string | null) {
    startTransition(async () => {
      markRead(id);
      await markNotificationRead({ notificationId: id });
    });
  }

  function open(n: NotificationEntry) {
    if (!n.readAt) read(n.id);
    if (n.projectId) {
      router.push(
        `/w/${n.workspaceId}/p/${n.projectId}${n.itemId ? `?item=${n.itemId}` : ""}`,
      );
    }
  }

  return (
    <div className="thin-scroll h-full overflow-y-auto">
      <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-5 md:px-8 md:py-7">
        <header className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Inbox</h1>
            <p className="text-[13px] text-muted">
              {attention.length === 0 && unread === 0
                ? "You're all caught up."
                : `${attention.length} need${attention.length === 1 ? "s" : ""} attention · ${unread} unread`}
            </p>
          </div>
          {unread > 0 ? (
            <Button size="sm" onClick={() => read(null)}>
              <CheckCheck size={14} /> Mark all read
            </Button>
          ) : null}
        </header>

        {attention.length > 0 ? (
          <section className={card} aria-label="Needs attention">
            <h2 className="flex h-11 items-center border-b border-line px-4 text-sm font-semibold">
              Needs attention
            </h2>
            <ul className="flex flex-col divide-y divide-line">
              {attention.map((item) => (
                <li key={item.id}>
                  <Link
                    href={`/w/${item.workspaceId}/p/${item.projectId}?item=${item.id}`}
                    className="flex min-h-11 items-center gap-3 px-4 py-2 hover:bg-surface-2/60"
                  >
                    <Pill color={item.statusColor} className="h-5 w-24 shrink-0 justify-center px-2 text-[11px] max-sm:w-20">
                      {item.statusName}
                    </Pill>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium">{item.title}</span>
                      <span className="flex items-center gap-1.5 text-xs text-faint">
                        <Dot color={item.projectColor} className="h-2 w-2" />
                        {item.projectName}
                      </span>
                    </span>
                    {item.dueDate ? <DueChip date={item.dueDate} today={today} /> : null}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className={card} aria-label="Notifications">
          <h2 className="flex h-11 items-center border-b border-line px-4 text-sm font-semibold">
            Notifications
          </h2>
          {list.length === 0 ? (
            <p className="px-4 py-10 text-center text-[13px] text-muted">
              Nothing yet. You&apos;ll hear here when an email becomes an item, a
              repeating item comes back, or someone assigns or comments.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {list.map((n) => {
                const Icon = ICONS[n.type] ?? Bell;
                return (
                  <li key={n.id}>
                    <button
                      onClick={() => open(n)}
                      className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-surface-2/60"
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                          n.readAt ? "bg-surface-2 text-faint" : "bg-accent/12 text-accent",
                        )}
                      >
                        <Icon size={14} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            "block truncate text-[13px]",
                            n.readAt ? "text-muted" : "font-semibold",
                          )}
                        >
                          {n.title}
                        </span>
                        <span className="block text-xs text-muted">{n.body}</span>
                        <span className="text-[11px] text-faint">
                          {formatDistanceToNowStrict(new Date(n.createdAt), { addSuffix: true })}
                        </span>
                      </span>
                      {!n.readAt ? (
                        <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-accent" aria-label="Unread" />
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
