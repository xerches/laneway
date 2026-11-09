import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ProjectSkeleton, ProjectView } from "@/components/project/project-view";
import { getProjectBoard } from "@/lib/data";
import { requireUser } from "@/lib/session";

export default function ProjectPage(props: PageProps<"/w/[workspaceId]/p/[projectId]">) {
  return (
    <Suspense fallback={<ProjectSkeleton />}>
      <ProjectContent params={props.params} />
    </Suspense>
  );
}

async function ProjectContent({
  params,
}: {
  params: PageProps<"/w/[workspaceId]/p/[projectId]">["params"];
}) {
  const { workspaceId, projectId } = await params;
  const user = await requireUser();
  const board = await getProjectBoard(user.id, projectId);
  if (!board || board.project.workspaceId !== workspaceId) notFound();

  return (
    <ProjectView
      key={board.project.id}
      project={board.project}
      statuses={board.statuses}
      items={board.items}
      members={board.members}
      userId={user.id}
    />
  );
}
