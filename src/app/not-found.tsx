import Link from "next/link";
import { Wordmark } from "@/components/logo";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 py-10 text-center">
      <Wordmark />
      <div className="flex flex-col items-center gap-2">
        <h1 className="text-lg font-semibold">We couldn&apos;t find that</h1>
        <p className="max-w-sm text-[13px] text-muted">
          The page may have been deleted, or it belongs to a workspace you
          can&apos;t see.
        </p>
        <Link
          href="/"
          className="mt-3 inline-flex h-9 items-center rounded-md bg-accent px-3.5 text-sm font-medium text-accent-fg shadow-card hover:brightness-110"
        >
          Back to home
        </Link>
      </div>
    </main>
  );
}
