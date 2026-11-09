import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Dashboard, DashboardSkeleton } from "@/components/dashboard/dashboard";
import { getDashboard, getRole } from "@/lib/data";
import { requireUser } from "@/lib/session";

export default function WorkspacePage(props: PageProps<"/w/[workspaceId]">) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <WorkspaceHome params={props.params} />
    </Suspense>
  );
}

async function WorkspaceHome({ params }: { params: PageProps<"/w/[workspaceId]">["params"] }) {
  const { workspaceId } = await params;
  const user = await requireUser();
  if (!(await getRole(user.id, workspaceId))) notFound();
  const data = await getDashboard(user.id, workspaceId);
  return (
    <Dashboard
      key={workspaceId}
      workspaceId={workspaceId}
      items={data.items}
      activity={data.activity}
    />
  );
}
