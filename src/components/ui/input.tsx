import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const fieldClass =
  "w-full rounded-md border border-line bg-surface px-3 text-sm text-ink placeholder:text-faint outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-[var(--ring)]";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldClass, "h-9", className)} {...props} />;
}

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(fieldClass, "py-2 leading-relaxed", className)} {...props} />;
}
