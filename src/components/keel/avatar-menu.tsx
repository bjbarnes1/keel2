"use client";

/**
 * Header avatar control: sign-out + navigation via Supabase browser client + portal menu.
 *
 * @module components/keel/avatar-menu
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const MENU_Z = 70;
const PANEL_ANIM_MS = 180;
const PANEL_EASE = "cubic-bezier(0.32, 0.72, 0, 1)";

export function AvatarMenu({ initialLetter = "K" }: { initialLetter?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [letter, setLetter] = useState(initialLetter);
  const [mounted, setMounted] = useState(false);
  const [panelPos, setPanelPos] = useState<{ top: number; right: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    queueMicrotask(() => setMounted(true));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void createSupabaseBrowserClient()
      .auth.getUser()
      .then(({ data }) => {
        if (cancelled) return;
        const email = data.user?.email?.trim();
        if (email && email.length > 0) {
          setLetter(email[0]!.toUpperCase());
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      return;
    }
    const rect = triggerRef.current.getBoundingClientRect();
    setPanelPos({ top: rect.bottom + 8, right: Math.max(12, window.innerWidth - rect.right) });
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent | TouchEvent) {
      const t = event.target as Node;
      if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      close();
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer, { passive: true });
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
    };
  }, [open, close]);

  async function signOut() {
    const client = createSupabaseBrowserClient();
    await client.auth.signOut();
    close();
    router.push("/login");
    router.refresh();
  }

  const trigger = (
    <button
      type="button"
      ref={triggerRef}
      aria-haspopup="menu"
      aria-expanded={open}
      onClick={() => setOpen((value) => !value)}
      className="glass-clear flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium text-[color:var(--keel-ink-2)] transition-colors hover:text-[color:var(--keel-ink)]"
    >
      <span className="sr-only">Account menu</span>
      {letter}
    </button>
  );

  const panel =
    open && mounted && panelPos ? (
      <div
        className="pointer-events-none fixed inset-0"
        style={{ zIndex: MENU_Z }}
        aria-hidden={!open}
      >
        <div
          ref={panelRef}
          role="menu"
          className="pointer-events-auto fixed min-w-[220px] rounded-[var(--radius-lg)] border border-white/12 p-1 shadow-[0_16px_48px_rgba(0,0,0,0.35)]"
          style={{
            top: panelPos.top,
            right: panelPos.right,
            backgroundColor: "rgba(20, 26, 23, 0.92)",
            backdropFilter: "blur(40px) saturate(180%)",
            WebkitBackdropFilter: "blur(40px) saturate(180%)",
            opacity: open ? 1 : 0,
            transform: open ? "scale(1)" : "scale(0.98)",
            transition: `opacity ${PANEL_ANIM_MS}ms ${PANEL_EASE}, transform ${PANEL_ANIM_MS}ms ${PANEL_EASE}`,
          }}
        >
          <div className="px-3 py-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-[color:var(--keel-ink-3)]">Account</p>
          </div>
          <div className="h-px bg-white/10" />
          <Link
            role="menuitem"
            href="/settings"
            onClick={close}
            className="block rounded-[var(--radius-md)] px-3 py-2.5 text-sm text-[color:var(--keel-ink)] transition-colors hover:bg-white/6"
          >
            Settings
          </Link>
          <div className="my-1 h-px bg-white/10" />
          <Link
            role="menuitem"
            href="/commitments"
            onClick={close}
            className="block rounded-[var(--radius-md)] px-3 py-2.5 text-sm text-[color:var(--keel-ink)] transition-colors hover:bg-white/6"
          >
            Commitments
          </Link>
          <Link
            role="menuitem"
            href="/incomes"
            onClick={close}
            className="block rounded-[var(--radius-md)] px-3 py-2.5 text-sm text-[color:var(--keel-ink)] transition-colors hover:bg-white/6"
          >
            Incomes
          </Link>
          <Link
            role="menuitem"
            href="/wealth"
            onClick={close}
            className="block rounded-[var(--radius-md)] px-3 py-2.5 text-sm text-[color:var(--keel-ink)] transition-colors hover:bg-white/6"
          >
            Assets
          </Link>
          <div className="my-1 h-px bg-white/10" />
          <Link
            role="menuitem"
            href="/help"
            onClick={close}
            className="block rounded-[var(--radius-md)] px-3 py-2.5 text-sm text-[color:var(--keel-ink)] transition-colors hover:bg-white/6"
          >
            Help & feedback
          </Link>
          <div className="my-1 h-px bg-white/10" />
          <button
            type="button"
            role="menuitem"
            onClick={() => void signOut()}
            className="w-full rounded-[var(--radius-md)] px-3 py-2.5 text-left text-sm text-[color:var(--keel-ink-2)] transition-colors hover:bg-white/6"
          >
            Log out
          </button>
        </div>
      </div>
    ) : null;

  return (
    <>
      {trigger}
      {mounted ? createPortal(panel, document.body) : null}
    </>
  );
}
