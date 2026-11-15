import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AutomationsView } from "@/components/automations/automations";
import { getAutomations, getWorkspaces } from "@/lib/data";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Automations" };

export default function AutomationsPage(props: PageProps<"/w/[workspaceId]/automations">) {
  return (
    <Suspense fallback={<AutomationsSkeleton />}>
      <Automations params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Automations({
  params,
  searchParams,
}: {
  params: PageProps<"/w/[workspaceId]/automations">["params"];
  searchParams: PageProps<"/w/[workspaceId]/automations">["searchParams"];
}) {
  const [{ workspaceId }, query] = await Promise.all([params, searchParams]);
  const user = await requireUser();
  const [data, workspaces] = await Promise.all([
    getAutomations(user.id, workspaceId),
    getWorkspaces(user.id),
  ]);
  const workspace = workspaces.find((w) => w.id === workspaceId);
  if (!data || !workspace) notFound();
  const project = typeof query.project === "string" ? query.project : null;

  return (
    <AutomationsView
      key={workspaceId}
      workspace={workspace}
      focusProjectId={data.projects.some((p) => p.id === project) ? project : null}
      {...data}
    />
  );
}

function AutomationsSkeleton() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 px-4 py-5 md:px-8 md:py-7">
      <div className="skeleton h-7 w-48" />
      <div className="skeleton h-28 rounded-xl" />
      <div className="skeleton h-28 rounded-xl" />
    </div>
  );
}
