import { Wordmark } from "@/components/logo";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 py-10">
      <Wordmark />
      <div className="w-full max-w-sm rounded-xl border border-line bg-surface p-6 shadow-card">
        {children}
      </div>
    </main>
  );
}
