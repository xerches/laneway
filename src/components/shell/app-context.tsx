"use client";

import { createContext, use } from "react";
import type { ProjectLite, WorkspaceLite } from "@/lib/types";

export type AppContextValue = {
  user: { id: string; name: string; email: string };
  workspaces: WorkspaceLite[];
  projects: ProjectLite[];
  unread: number;
  openNewProject: (workspaceId?: string) => void;
  openPalette: () => void;
};

export const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const value = use(AppContext);
  if (!value) throw new Error("useApp must be used inside the app shell");
  return value;
}
