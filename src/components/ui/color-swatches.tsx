"use client";

import { Check } from "lucide-react";
import { COLORS, colorFg, colorVar } from "@/lib/colors";

export function ColorSwatches({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Color">
      {COLORS.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={c}
          title={c}
          onClick={() => onChange(c)}
          style={{ background: colorVar(c), color: colorFg(c) }}
          className="flex h-6 w-6 items-center justify-center rounded-full transition-transform hover:scale-110"
        >
          {value === c ? <Check size={13} strokeWidth={3} /> : null}
        </button>
      ))}
    </div>
  );
}
