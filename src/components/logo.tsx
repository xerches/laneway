export function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <rect x="2" y="3" width="5.4" height="18" rx="2" fill="var(--c-indigo)" />
      <rect x="9.3" y="3" width="5.4" height="12" rx="2" fill="var(--c-teal)" />
      <rect x="16.6" y="3" width="5.4" height="7.5" rx="2" fill="var(--c-amber)" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2 text-[15px] font-semibold tracking-tight">
      <Logo size={22} />
      Laneway
    </span>
  );
}
