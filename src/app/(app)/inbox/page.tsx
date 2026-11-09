import { Suspense } from "react";
import type { Metadata } from "next";
import { DashboardSkeleton } from "@/components/dashboard/dashboard";
import { InboxView } from "@/components/dashboard/inbox";
import { getDashboard, getNotifications } from "@/lib/data";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Inbox" };

export default function InboxPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Inbox />
    </Suspense>
  );
}

async function Inbox() {
  const user = await requireUser();
  const [notifications, dashboard] = await Promise.all([
    getNotifications(user.id),
    getDashboard(user.id, null),
  ]);
  const open = dashboard.items.filter((i) => !i.completedAt && i.dueDate);
  return <InboxView notifications={notifications} dated={open} />;
}
