import { Suspense } from "react";
import type { Metadata } from "next";
import { Dashboard, DashboardSkeleton } from "@/components/dashboard/dashboard";
import { getDashboard } from "@/lib/data";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Home" };

export default function HomePage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Home />
    </Suspense>
  );
}

async function Home() {
  const user = await requireUser();
  const data = await getDashboard(user.id, null);
  return <Dashboard workspaceId={null} items={data.items} activity={data.activity} />;
}
