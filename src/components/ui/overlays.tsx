"use client";

import type { ComponentProps, ReactNode } from "react";
import { Dialog as D, DropdownMenu as M, Popover as P } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const surface =
  "z-50 rounded-lg border border-line bg-surface text-ink shadow-pop animate-pop outline-none";

// ---------------------------------------------------------------- popover

export const Popover = P.Root;
export const PopoverTrigger = P.Trigger;
export const PopoverClose = P.Close;
export const PopoverAnchor = P.Anchor;

export function PopoverContent({
  className,
  align = "start",
  sideOffset = 6,
  ...props
}: ComponentProps<typeof P.Content>) {
  return (
    <P.Portal>
      <P.Content
        align={align}
        sideOffset={sideOffset}
        collisionPadding={8}
        className={cn(surface, "p-1.5", className)}
        {...props}
      />
    </P.Portal>
  );
}

// ------------------------------------------------------------------- menu

export const Menu = M.Root;
export const MenuTrigger = M.Trigger;

export function MenuContent({
  className,
  align = "start",
  sideOffset = 6,
  ...props
}: ComponentProps<typeof M.Content>) {
  return (
    <M.Portal>
      <M.Content
        align={align}
        sideOffset={sideOffset}
        collisionPadding={8}
        className={cn(surface, "min-w-44 p-1.5", className)}
        {...props}
      />
    </M.Portal>
  );
}

export function MenuItem({
  className,
  danger,
  ...props
}: ComponentProps<typeof M.Item> & { danger?: boolean }) {
  return (
    <M.Item
      className={cn(
        "flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-[13px] outline-none select-none data-[highlighted]:bg-surface-2",
        danger ? "text-danger" : "text-ink",
        className,
      )}
      {...props}
    />
  );
}

export function MenuLabel({ className, ...props }: ComponentProps<typeof M.Label>) {
  return (
    <M.Label
      className={cn("px-2 pt-1.5 pb-1 text-[11px] font-medium text-faint uppercase tracking-wide", className)}
      {...props}
    />
  );
}

export function MenuSeparator() {
  return <M.Separator className="my-1 h-px bg-line" />;
}

// ----------------------------------------------------------------- dialog

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <D.Portal>
      <D.Overlay className="animate-fade fixed inset-0 z-40 bg-black/40" />
      <D.Content
        className={cn(
          surface,
          "fixed top-[12vh] left-1/2 max-h-[80vh] w-[min(560px,calc(100vw-24px))] -translate-x-1/2 overflow-y-auto p-5",
          className,
        )}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <D.Title className="text-base font-semibold">{title}</D.Title>
            {description ? (
              <D.Description className="mt-0.5 text-[13px] text-muted">
                {description}
              </D.Description>
            ) : (
              <D.Description className="sr-only">{title}</D.Description>
            )}
          </div>
          <D.Close
            aria-label="Close"
            className="rounded-md p-1 text-faint hover:bg-surface-2 hover:text-ink"
          >
            <X size={16} />
          </D.Close>
        </div>
        {children}
      </D.Content>
    </D.Portal>
  );
}
