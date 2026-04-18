"use client";

import Link from "next/link";

type FloatingAddButtonProps = {
  href: string;
  label?: string;
  className?: string;
};

/**
 * FAB fixed above the tab bar. Uses glass-heavy + safe tint.
 */
export function FloatingAddButton({ href, label = "Add", className }: FloatingAddButtonProps) {
  const vibrate = () => {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(12);
    }
  };

  return (
    <Link
      href={href}
      onPointerDown={vibrate}
      className={`fixed bottom-24 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full glass-heavy glass-tint-safe border border-white/15 text-[22px] font-light text-[var(--keel-ink)] shadow-[0_8px_28px_rgba(0,0,0,0.35)] transition-transform active:scale-95 ${className ?? ""}`}
      aria-label={label}
    >
      <span aria-hidden>+</span>
    </Link>
  );
}
