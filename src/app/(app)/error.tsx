"use client";

import { Button } from "@/components/ui/button";

/** Shown in place of a page that failed to load; the sidebar stays usable. */
export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="max-w-sm text-[13px] text-muted">
        This page didn&apos;t load. Your data is safe. Try again, and if it keeps
        happening, check your connection.
      </p>
      <Button variant="primary" className="mt-3" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
