import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Wordmark } from "@/components/logo";
import { WelcomeForm } from "@/components/welcome-form";
import { getWorkspaces } from "@/lib/data";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Welcome" };

export default function WelcomePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 py-10">
      <Wordmark />
      <div className="w-full max-w-md rounded-xl border border-line bg-surface p-6 shadow-card">
        <Suspense fallback={<div className="skeleton h-72" />}>
          <Welcome />
        </Suspense>
      </div>
    </main>
  );
}

async function Welcome() {
  const user = await requireUser();
  const workspaces = await getWorkspaces(user.id);
  if (workspaces.length > 0) redirect("/");
  return <WelcomeForm firstName={user.name.split(" ")[0] || user.name} />;
}
