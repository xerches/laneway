"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const signup = mode === "signup";

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const name = String(form.get("name") ?? "").trim();

    setError(null);
    setPending(true);
    const result = signup
      ? await authClient.signUp.email({ email, password, name })
      : await authClient.signIn.email({ email, password });
    if (result.error) {
      setPending(false);
      setError(result.error.message ?? "Something went wrong. Please try again.");
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold">
          {signup ? "Create your account" : "Welcome back"}
        </h1>
        <p className="mt-0.5 text-[13px] text-muted">
          {signup
            ? "One account for your personal, work and business boards."
            : "Sign in to your boards."}
        </p>
      </div>

      {signup ? (
        <label className="flex flex-col gap-1.5 text-[13px] font-medium">
          Name
          <Input name="name" autoComplete="name" required autoFocus maxLength={80} />
        </label>
      ) : null}
      <label className="flex flex-col gap-1.5 text-[13px] font-medium">
        Email
        <Input
          name="email"
          type="email"
          autoComplete="email"
          required
          autoFocus={!signup}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-[13px] font-medium">
        Password
        <Input
          name="password"
          type="password"
          autoComplete={signup ? "new-password" : "current-password"}
          required
          minLength={8}
        />
        {signup ? (
          <span className="font-normal text-faint">At least 8 characters.</span>
        ) : null}
      </label>

      {error ? (
        <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-[13px] text-danger">
          {error}
        </p>
      ) : null}

      <Button type="submit" variant="primary" disabled={pending} className="justify-center">
        {pending ? "One moment…" : signup ? "Create account" : "Sign in"}
      </Button>

      <p className="text-center text-[13px] text-muted">
        {signup ? "Already have an account? " : "New here? "}
        <Link
          href={signup ? "/login" : "/signup"}
          className="font-medium text-accent hover:underline"
        >
          {signup ? "Sign in" : "Create an account"}
        </Link>
      </p>
    </form>
  );
}
