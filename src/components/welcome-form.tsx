"use client";

import { useState, useTransition } from "react";
import { setUpWorkspaces } from "@/actions";
import { Dot } from "@/components/ui/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { todayString } from "@/lib/dates";

const FIELDS = [
  { label: "For your own life", placeholder: "Personal", color: "teal" },
  { label: "For your job", placeholder: "Day job", color: "blue" },
  { label: "For your business or side project", placeholder: "My business", color: "violet" },
];

export function WelcomeForm({ firstName }: { firstName: string }) {
  const [names, setNames] = useState(["Personal", "Day job", "My business"]);
  const [sample, setSample] = useState(true);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const cleaned = names.map((n, i) => n.trim() || FIELDS[i].placeholder) as [
      string,
      string,
      string,
    ];
    startTransition(async () => {
      await setUpWorkspaces({ names: cleaned, sample, today: todayString() });
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold">Welcome, {firstName}</h1>
        <p className="mt-0.5 text-[13px] text-muted">
          Laneway keeps each part of your life in its own workspace, so work never
          leaks into home. Name your three. You can rename them later.
        </p>
      </div>

      {FIELDS.map((field, index) => (
        <label key={field.label} className="flex flex-col gap-1.5 text-[13px] font-medium">
          <span className="flex items-center gap-2">
            <Dot color={field.color} />
            {field.label}
          </span>
          <Input
            value={names[index]}
            placeholder={field.placeholder}
            maxLength={40}
            autoFocus={index === 0}
            onChange={(e) =>
              setNames((prev) => prev.map((n, i) => (i === index ? e.target.value : n)))
            }
          />
        </label>
      ))}

      <label className="flex items-start gap-2.5 text-[13px] text-muted">
        <input
          type="checkbox"
          checked={sample}
          onChange={(e) => setSample(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
        />
        Add a sample chores project so there is something to look at.
      </label>

      <Button type="submit" variant="primary" disabled={pending} className="justify-center">
        {pending ? "Setting up…" : "Create my workspaces"}
      </Button>
    </form>
  );
}
