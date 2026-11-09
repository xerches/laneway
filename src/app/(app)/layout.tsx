import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { getProjects, getUnreadCount, getWorkspaces } from "@/lib/data";
import { requireUser } from "@/lib/session";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}

async function Shell({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [workspaces, projects, unread] = await Promise.all([
    getWorkspaces(user.id),
    getProjects(user.id),
    getUnreadCount(user.id),
  ]);
  if (workspaces.length === 0) redirect("/welcome");

  return (
    <AppShell user={user} workspaces={workspaces} projects={projects} unread={unread}>
      {children}
    </AppShell>
  );
}

function ShellSkeleton() {
  return (
    <div className="flex h-dvh">
      <div className="hidden w-64 shrink-0 flex-col gap-3 border-r border-line bg-surface p-4 md:flex">
        <div className="skeleton h-6 w-28" />
        <div className="skeleton h-8" />
        <div className="skeleton mt-2 h-5 w-32" />
        <div className="skeleton h-5 w-40" />
        <div className="skeleton h-5 w-36" />
      </div>
      <div className="flex-1 p-6">
        <div className="skeleton h-7 w-56" />
        <div className="skeleton mt-6 h-40" />
      </div>
    </div>
  );
}
