import { Suspense } from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { SettingsView } from "@/components/settings/settings";
import { getIntegrations, getWorkspaces } from "@/lib/data";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <Suspense fallback={<SettingsSkeleton />}>
      <Settings />
    </Suspense>
  );
}

/** The address people reach Laneway on, for the snippets on this page. */
async function baseUrl() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (host) {
    const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
    return `${proto.split(",")[0].trim()}://${host}`;
  }
  return (process.env.LANEWAY_URLS ?? process.env.BETTER_AUTH_URL ?? "").split(",")[0].trim();
}

async function Settings() {
  const user = await requireUser();
  const [workspaces, integrations, base] = await Promise.all([
    getWorkspaces(user.id),
    getIntegrations(user.id),
    baseUrl(),
  ]);
  return <SettingsView workspaces={workspaces} baseUrl={base.replace(/\/$/, "")} {...integrations} />;
}

function SettingsSkeleton() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-5 md:px-8 md:py-7">
      <div className="skeleton h-7 w-40" />
      <div className="skeleton h-40 rounded-xl" />
      <div className="skeleton h-40 rounded-xl" />
    </div>
  );
}
