import { Suspense } from "react";
import type { Metadata } from "next";
import { DashboardSkeleton } from "@/components/dashboard/dashboard";
import { MyWeek } from "@/components/week/my-week";
import { getAllLabels, getDashboard } from "@/lib/data";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "My week" };

export default function WeekPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Week />
    </Suspense>
  );
}

async function Week() {
  const user = await requireUser();
  const [data, labels] = await Promise.all([
    getDashboard(user.id, null),
    getAllLabels(user.id),
  ]);
  return <MyWeek items={data.items} labels={labels} userId={user.id} />;
}
