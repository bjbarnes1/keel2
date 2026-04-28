"use client";

/**
 * Header avatar control: sign-out + navigation via Supabase browser client + portal menu.
 *
 * Identity / Data / Support groups, log-out confirmation {@link GlassSheet}, optional
 * focus cycle while the menu is open, and reduced-motion friendly panel transitions.
 *
 * Profile is intentionally omitted until the profile screen ships — restore an entry
 * under Identity when `/profile` has real content.
 *
 * @module components/keel/avatar-menu
 */

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";

import { GlassSheet } from "@/components/keel/glass-sheet";
import { AVATAR_MENU_GROUPS } from "@/components/keel/avatar-menu-groups";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { getStoredTheme, resolveTheme, subscribeThemeChange, toggleTheme } from "@/lib/theme/theme";

const MENU_Z = 70;
const PANEL_ANIM_MS = 180;
const PANEL_EASE = "cubic-bezier(0.32, 0.72, 0, 1)";

const FOCUSABLE_MENU = 'a[href], button:not([disabled]), [role="menuitem"]';

function subscribeReducedMotion(callback: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}

function getReducedMotionSnapshot() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function usePrefersReducedMotion() {
  return useSyncExternalStore(subscribeReducedMotion, getReducedMotionSnapshot, () => false);
}

export function AvatarMenu({ initialLetter = "K" }: { initialLetter?: string }) {
  const router = useRouter();
  const menuLabelId = useId();
  const [open, setOpen] = useState(false);
  const [logoutSheetOpen, setLogoutSheetOpen] = useState(false);
  const [letter, setLetter] = useState(initialLetter);
  const [mounted, setMounted] = useState(false);
  const [panelPos, setPanelPos] = useState<{ top: number; right: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const reducedMotion = usePrefersReducedMotion();
  const [themeLabel, setThemeLabel] = useState<string>(() => {
    const stored = getStoredTheme();
    return resolveTheme(stored) === "dark" ? "Switch to light mode" : "Switch to dark mode";
  });

  useEffect(() => {
    queueMicrotask(() => setMounted(true));
  }, []);

  useEffect(() => {
    const update = () => {
      const stored = getStoredTheme();
      setThemeLabel(resolveTheme(stored) === "dark" ? "Switch to light mode" : "Switch to dark mode");
    };
    update();
    return subscribeThemeChange(update);
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

  useEffect(() => {
    if (!open || !panelRef.current) return;
    const el = panelRef.current;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const nodes = [...el.querySelectorAll<HTMLElement>(FOCUSABLE_MENU)].filter(
        (n) => n.offsetParent !== null && !n.hasAttribute("data-avatar-ignore-focus"),
      );
      if (nodes.length === 0) return;
      const first = nodes[0]!;
      const last = nodes[nodes.length - 1]!;
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    el.addEventListener("keydown", onKeyDown);
    const t = window.setTimeout(() => {
      const first = el.querySelector<HTMLElement>(FOCUSABLE_MENU);
      first?.focus();
    }, 0);
    return () => {
      window.clearTimeout(t);
      el.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open && triggerRef.current) {
      triggerRef.current.focus();
    }
  }, [open]);

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
    setLogoutSheetOpen(false);
    close();
    router.push("/login");
    router.refresh();
  }

  const panelTransition = reducedMotion ? "none" : `opacity ${PANEL_ANIM_MS}ms ${PANEL_EASE}, transform ${PANEL_ANIM_MS}ms ${PANEL_EASE}`;

  const trigger = (
    <button
      type="button"
      ref={triggerRef}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-controls={open ? "avatar-menu-panel" : undefined}
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
          id="avatar-menu-panel"
          ref={panelRef}
          role="menu"
          aria-labelledby={menuLabelId}
          className="pointer-events-auto fixed max-h-[70vh] min-w-[260px] overflow-y-auto rounded-[var(--radius-lg)] border border-border p-1 shadow-[0_16px_48px_rgba(0,0,0,0.22),inset_0_0.5px_0_rgba(255,255,255,0.18)] dark:shadow-[0_16px_48px_rgba(0,0,0,0.5),inset_0_0.5px_0_rgba(255,255,255,0.08)]"
          style={{
            top: panelPos.top,
            right: panelPos.right,
            backgroundColor: "var(--glass-heavy-bg)",
            backdropFilter: "blur(40px) saturate(160%)",
            WebkitBackdropFilter: "blur(40px) saturate(160%)",
            opacity: open ? 1 : 0,
            transform: open ? "scale(1)" : "scale(0.98)",
            transition: panelTransition,
          }}
        >
          <p id={menuLabelId} className="sr-only">
            Account menu
          </p>

          {AVATAR_MENU_GROUPS.map((group, gi) => (
            <div key={group.id}>
              {gi > 0 ? <div className="h-[0.5px] bg-border" role="presentation" /> : null}
              <div
                className="px-4 pb-1.5 pt-3 text-[10px] font-medium uppercase tracking-[0.16em] text-[color:var(--keel-ink-5)]"
                aria-hidden="true"
                role="presentation"
              >
                {group.label}
              </div>
              <div className="pb-1">
                {group.items.map((item) =>
                  item.type === "link" ? (
                    <Link
                      key={item.href}
                      role="menuitem"
                      href={item.href}
                      onClick={close}
                      className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-[var(--radius-md)] px-4 py-2.5 text-left text-sm text-[color:var(--keel-ink)] transition-colors hover:bg-[color:var(--keel-ink-6)]"
                    >
                      <span>{item.label}</span>
                      {group.id === "data" ? (
                        <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--keel-ink-4)]" aria-hidden />
                      ) : null}
                    </Link>
                  ) : item.type === "action" && item.id === "toggleTheme" ? (
                    <button
                      key={item.id}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        toggleTheme();
                        // Keep menu open so the user sees the change immediately.
                      }}
                      className="w-full rounded-[var(--radius-md)] px-4 py-2.5 text-left text-sm text-[color:var(--keel-ink)] transition-colors hover:bg-[color:var(--keel-ink-6)]"
                    >
                      {themeLabel}
                    </button>
                  ) : (
                    <button
                      key="logout"
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        close();
                        setLogoutSheetOpen(true);
                      }}
                      className="w-full rounded-[var(--radius-md)] px-4 py-2.5 text-left text-sm text-[color:var(--keel-ink-2)] transition-colors hover:bg-[color:var(--keel-ink-6)]"
                    >
                      {item.label}
                    </button>
                  ),
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    ) : null;

  return (
    <>
      {trigger}
      {mounted ? createPortal(panel, document.body) : null}
      <GlassSheet
        open={logoutSheetOpen}
        onClose={() => setLogoutSheetOpen(false)}
        title="Log out of Keel?"
        size="compact"
        footer={
          <div className="flex gap-2">
            <button
              type="button"
              className="flex-1 rounded-[var(--radius-md)] border border-white/15 py-3 text-sm font-medium text-[color:var(--keel-ink-2)]"
              onClick={() => setLogoutSheetOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className={cn(
                "flex-1 rounded-[var(--radius-md)] py-3 text-sm font-semibold text-[color:var(--keel-ink)]",
                "glass-tint-attend border border-white/12",
              )}
              onClick={() => void signOut()}
            >
              Log out
            </button>
          </div>
        }
      >
        <p className="text-sm leading-relaxed text-[color:var(--keel-ink-3)]">
          You&apos;ll need to sign in again next time.
        </p>
      </GlassSheet>
    </>
  );
}
