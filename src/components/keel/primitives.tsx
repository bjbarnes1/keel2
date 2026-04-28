/**
 * Shared layout and presentational primitives for Keel screens.
 *
 * Contains `AppShell` (header + tab bar), cards, dashboard sections, and small atoms
 * used across routes. Mostly Server Component–friendly; individual exports may be
 * client-only when they embed interactive children.
 *
 * **Styling:** composes Tailwind with `cn()` and CSS variables from `globals.css`.
 *
 * @module components/keel/primitives
 */

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, ChevronRight, Plus } from "lucide-react";

import type { CommitmentView, IncomeView } from "@/lib/types";
import { cn, formatAud, sentenceCaseFrequency } from "@/lib/utils";

import { AvatarMenu } from "@/components/keel/avatar-menu";

type NavItem =
  | { href: string; label: string }
  | { href: string; label: string; match: (path: string) => boolean };

const ALL_NAV_ITEMS: NavItem[] = [
  {
    href: "/",
    label: "Home",
    match: (path) =>
      path === "/" ||
      path.startsWith("/spend") ||
      path.startsWith("/balance") ||
      path.startsWith("/bills") ||
      path.startsWith("/commitments") ||
      path.startsWith("/incomes"),
  },
  { href: "/budget", label: "Budget" },
  { href: "/timeline", label: "Timeline" },
  { href: "/cashflow", label: "Cashflow" },
  { href: "/ask", label: "Ask" },
  { href: "/goals", label: "Goals", match: (path) => path === "/goals" || path.startsWith("/goals/") },
  { href: "/wealth", label: "Wealth" },
];

function tabNavItems(): NavItem[] {
  if (process.env.NEXT_PUBLIC_KEEL_ASK_AVAILABLE === "1") {
    return ALL_NAV_ITEMS;
  }
  return ALL_NAV_ITEMS.filter((item) => item.href !== "/ask");
}

function isNavActive(item: NavItem, currentPath: string) {
  return "match" in item ? item.match(currentPath) : item.href === currentPath;
}

function IconHome({ active }: { active: boolean }) {
  const stroke = active ? "rgba(240, 235, 220, 0.92)" : "rgba(168, 172, 159, 0.95)";
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z"
        stroke={stroke}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconTimeline({ active }: { active: boolean }) {
  const stroke = active ? "rgba(240, 235, 220, 0.92)" : "rgba(168, 172, 159, 0.95)";
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 19V5" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M8 16V9" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M12 16V7" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M16 16V11" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M20 16V6" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function IconAsk({ active }: { active: boolean }) {
  const stroke = active ? "rgba(240, 235, 220, 0.92)" : "rgba(168, 172, 159, 0.95)";
  const fillDot = active ? "rgba(240, 235, 220, 0.35)" : "rgba(168, 172, 159, 0.28)";
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6.5 6.5c0-1.1.9-2 2-2h7c1.1 0 2 .9 2 2v7.5c0 .8-.5 1.5-1.2 1.8l-2.3 1v-1.8H8.5c-1.1 0-2-.9-2-2V6.5Z"
        stroke={stroke}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M9 10h4.5" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M9 13h2.5" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="17.5" cy="7.5" r="2.2" fill={fillDot} stroke={stroke} strokeWidth="1.1" />
    </svg>
  );
}

function IconWealth({ active }: { active: boolean }) {
  const stroke = active ? "rgba(240, 235, 220, 0.92)" : "rgba(168, 172, 159, 0.95)";
  const fillA = active ? "rgba(240, 235, 220, 0.2)" : "rgba(168, 172, 159, 0.16)";
  const fillB = active ? "rgba(240, 235, 220, 0.1)" : "rgba(168, 172, 159, 0.09)";
  const fillC = active ? "rgba(240, 235, 220, 0.06)" : "rgba(168, 172, 159, 0.06)";
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke={stroke} strokeWidth="1.6" />
      <path
        d="M12 12 12 3a9 9 0 0 1 8.485 6H12Z"
        fill={fillA}
        stroke={stroke}
        strokeWidth="1.15"
        strokeLinejoin="round"
      />
      <path
        d="M12 12 20.485 9A9 9 0 0 1 17.364 19.5L12 12Z"
        fill={fillB}
        stroke={stroke}
        strokeWidth="1.15"
        strokeLinejoin="round"
      />
      <path
        d="M12 12 6.636 19.5A9 9 0 0 1 3.515 9L12 12Z"
        fill={fillC}
        stroke={stroke}
        strokeWidth="1.15"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconGoals({ active }: { active: boolean }) {
  const stroke = active ? "rgba(240, 235, 220, 0.92)" : "rgba(168, 172, 159, 0.95)";
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 5c2.5 2.2 6 3.4 6 7.2 0 3.4-2.7 6.1-6 6.8-3.3-.7-6-3.4-6-6.8C6 8.4 9.5 7.2 12 5Z"
        stroke={stroke}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M12 10.2V16" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function TabIcon({ href, active }: { href: string; active: boolean }) {
  if (href === "/") return <IconHome active={active} />;
  if (href === "/budget") return <IconHome active={active} />;
  if (href === "/timeline") return <IconTimeline active={active} />;
  if (href === "/cashflow") return <IconTimeline active={active} />;
  if (href === "/wealth") return <IconWealth active={active} />;
  if (href === "/goals") return <IconGoals active={active} />;
  if (href === "/ask") return <IconAsk active={active} />;
  return <IconHome active={active} />;
}

function DesktopSidebarNav({ currentPath }: { currentPath: string }) {
  return (
    <nav className="flex flex-col gap-0.5" aria-label="Primary">
      {tabNavItems().map((item) => {
        const active = isNavActive(item, currentPath);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "bg-white/10 text-[color:var(--keel-ink)]"
                : "text-[color:var(--keel-ink-3)] hover:bg-white/[0.06] hover:text-[color:var(--keel-ink-2)]",
            )}
          >
            <TabIcon href={item.href} active={active} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({
  title,
  currentPath,
  children,
  backHref,
  headerRight,
}: {
  title: string;
  currentPath: string;
  children: ReactNode;
  backHref?: string;
  headerRight?: ReactNode;
}) {
  return (
    <div className="keel-bg flex min-h-screen justify-center bg-background text-foreground lg:justify-stretch">
      <aside className="sticky top-0 hidden h-screen w-[220px] shrink-0 flex-col border-r border-white/[0.06] bg-background/80 px-3 py-5 backdrop-blur-xl lg:flex">
        <Link href="/" className="mb-6 px-2 text-lg font-semibold tracking-tight text-[color:var(--keel-ink)]">
          Keel
        </Link>
        <DesktopSidebarNav currentPath={currentPath} />
        <div className="mt-auto px-2 pt-6">
          <AvatarMenu />
        </div>
      </aside>

      <div className="mx-auto flex w-full min-w-0 max-w-[520px] flex-1 flex-col lg:max-w-none">
        <header className="sticky top-0 z-30 flex items-center justify-between bg-background/70 px-5 pb-2 pt-3 backdrop-blur-xl lg:px-8 lg:pt-5">
          <div className="flex items-center gap-3">
            {backHref ? (
              <Link
                href={backHref}
                className="glass-clear inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:border-white/20 hover:text-foreground"
              >
                <ArrowLeft className="h-4 w-4" />
                <span className="sr-only">Back</span>
              </Link>
            ) : null}
            <h1 className="text-[22px] font-medium tracking-[-0.025em] lg:text-2xl">{title}</h1>
          </div>
          <div className="flex items-center gap-2 lg:hidden">
            {headerRight}
            <AvatarMenu />
          </div>
          <div className="hidden items-center gap-2 lg:flex">
            {headerRight}
          </div>
        </header>

        <main className="px-5 pb-32 lg:mx-auto lg:w-full lg:max-w-6xl lg:px-8 lg:pb-12">{children}</main>

        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center pb-[calc(12px+env(safe-area-inset-bottom))] lg:hidden">
          <nav className="pointer-events-auto glass-heavy mx-4 w-full max-w-[480px] rounded-[var(--radius-pill)] px-2 py-2">
            <div className="flex items-end justify-between gap-1">
              {tabNavItems().map((item) => {
                const active = isNavActive(item, currentPath);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex min-w-0 flex-1 flex-col items-center justify-end gap-1 rounded-[var(--radius-pill)] px-2 py-2 transition-[background-color,transform,color] duration-[var(--dur-nav)]",
                      active
                        ? "glass-clear text-[color:var(--keel-ink)]"
                        : "text-[color:var(--keel-ink-3)] hover:text-[color:var(--keel-ink-2)]",
                    )}
                  >
                    <TabIcon href={item.href} active={active} />
                    {active ? (
                      <span className="w-full truncate text-center text-[11px] font-medium leading-none">
                        {item.label}
                      </span>
                    ) : (
                      <span className="h-[11px]" />
                    )}
                  </Link>
                );
              })}
            </div>
          </nav>
        </div>
      </div>
    </div>
  );
}

export function HeroAvailableMoneyCard({
  amount,
  bankBalance,
  reserved,
  goalContributions,
}: {
  amount: number;
  bankBalance: number;
  reserved: number;
  goalContributions: number;
}) {
  const state =
    amount > 500 ? "healthy" : amount > 0 ? "tight" : "danger";

  const theme =
    state === "healthy"
      ? {
          card: "glass-tint-safe",
          text: "text-primary",
          subtitle: "You're in good shape",
        }
      : state === "tight"
        ? {
            card: "glass-tint-attend",
            text: "text-[color:var(--color-attention)]",
            subtitle: "Getting tight this cycle",
          }
        : {
            card: "glass-clear",
            text: "text-muted-foreground",
            subtitle: "Attention needed",
          };

  return (
    <section className={cn("rounded-[var(--radius-xl)] p-6 lg:p-7", theme.card)}>
      <p className="label-upper">Available money</p>
      <p
        className={cn(
          "tabular-nums mt-3 font-mono text-[44px] font-medium tracking-[-0.035em] sm:text-5xl lg:text-[52px]",
          theme.text,
        )}
      >
        {formatAud(amount)}
      </p>
      <p className={cn("mt-3 text-sm font-medium", theme.text)}>{theme.subtitle}</p>

      <div className="mt-5 space-y-2 text-sm">
        <WaterfallRow label="Bank balance" amount={bankBalance} />
        <WaterfallRow
          label="Reserved for commitments"
          amount={-reserved}
          amountClassName="text-[color:var(--keel-ink-2)]"
        />
        <WaterfallRow label="Goal contributions" amount={-goalContributions} amountClassName="text-primary" />
        <div className="my-2 h-px bg-white/10" />
        <WaterfallRow
          label="Yours to spend"
          amount={amount}
          labelClassName={theme.text + " font-semibold"}
          amountClassName={theme.text + " font-semibold"}
        />
      </div>
    </section>
  );
}

function WaterfallRow({
  label,
  amount,
  labelClassName,
  amountClassName,
}: {
  label: string;
  amount: number;
  labelClassName?: string;
  amountClassName?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className={cn("text-sm text-muted-foreground", labelClassName)}>{label}</span>
      <span className={cn("tabular-nums font-mono text-sm text-foreground/90", amountClassName)}>
        {amount < 0 ? "-" : ""}
        {formatAud(Math.abs(amount))}
      </span>
    </div>
  );
}

export function SurfaceCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "glass-clear rounded-[var(--radius-md)] p-4",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function IncomeCard({ income }: { income: IncomeView }) {
  return (
    <SurfaceCard className="flex items-center justify-between">
      <div>
        <p className="text-xs text-muted-foreground">Next pay</p>
        <p className="mt-1 text-sm font-medium">
          {income.nextPayDate} ·{" "}
          <span className="tabular-nums font-mono">{formatAud(income.amount)}</span>
        </p>
      </div>
      <span className="glass-tint-safe rounded-full px-3 py-1 text-xs font-medium text-primary">
        {sentenceCaseFrequency(income.frequency)}
      </span>
    </SurfaceCard>
  );
}

export function SectionTitle({
  title,
  actionHref,
  actionLabel,
}: {
  title: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="mb-3 mt-6 flex items-center justify-between">
      <h2 className="text-[17px] font-semibold">{title}</h2>
      {actionHref && actionLabel ? (
        <Link href={actionHref} className="text-sm font-medium text-primary">
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}

export function CommitmentCardContent({ commitment }: { commitment: CommitmentView }) {
  const pctFunded = Math.min(Math.round(commitment.percentFunded), 100);
  const fillColor = commitment.isAttention ? "var(--keel-attend)" : "var(--keel-safe)";
  const statusLine = commitment.isAttention
    ? "Needs a look this pay period"
    : pctFunded >= 100
      ? "Fully reserved for the next due date"
      : `${pctFunded}% funded toward next due date`;

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[15px] font-medium text-[color:var(--keel-ink)]">{commitment.name}</p>
          <p className="mt-1 text-xs text-[color:var(--keel-ink-3)]">
            {sentenceCaseFrequency(commitment.frequency)} · Due {commitment.nextDueDate}
          </p>
        </div>
        <p className="font-mono text-[15px] font-semibold tabular-nums text-[color:var(--keel-ink)]">
          {formatAud(commitment.amount)}
        </p>
      </div>

      <div className="mt-3 flex items-center justify-between gap-4 text-xs">
        <span className="text-[color:var(--keel-ink-4)]">{commitment.category}</span>
        <span
          className={cn(
            commitment.isAttention ? "text-[color:var(--keel-attend)]" : "text-[color:var(--keel-safe-soft)]",
          )}
        >
          {statusLine}
        </span>
      </div>

      <div className="mt-3 h-1 overflow-hidden rounded-full bg-[rgba(255,255,255,0.06)]">
        <div
          className="h-full rounded-full transition-[width] duration-300"
          style={{ width: `${pctFunded}%`, backgroundColor: fillColor }}
        />
      </div>
    </>
  );
}

export function CommitmentCard({ commitment }: { commitment: CommitmentView }) {
  return (
    <Link href={`/commitments/${commitment.id}`} className="block">
      <SurfaceCard className="transition-colors hover:border-white/16">
        <CommitmentCardContent commitment={commitment} />
      </SurfaceCard>
    </Link>
  );
}

export { GoalCard } from "@/components/keel/goal-card";

export function AddCardLink({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-primary/30 bg-primary/10 px-4 py-4 text-sm font-medium text-primary transition-colors hover:border-primary/50"
    >
      <Plus className="h-4 w-4" />
      {label}
    </Link>
  );
}

export function EmptyState({
  title,
  description,
  actionHref,
  actionLabel,
}: {
  title: string;
  description: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <SurfaceCard className="text-center">
      <p className="text-base font-medium text-muted-foreground">{title}</p>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
      {actionHref && actionLabel ? (
        <Link
          href={actionHref}
          className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary"
        >
          {actionLabel}
          <ChevronRight className="h-4 w-4" />
        </Link>
      ) : null}
    </SurfaceCard>
  );
}

export function ModalSheet({
  title,
  description,
  children,
  backHref,
}: {
  title: string;
  description: string;
  children: ReactNode;
  backHref: string;
}) {
  return (
    <AppShell title="Balance" currentPath="/">
      <div className="fixed inset-0 bg-black/55" />
      <div className="fixed inset-x-0 bottom-0 mx-auto max-w-[520px] rounded-t-3xl border border-border bg-card p-6 lg:max-w-lg">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
          </div>
          <Link href={backHref} className="rounded-full border border-border px-3 py-1 text-sm text-muted-foreground">
            Close
          </Link>
        </div>
        {children}
      </div>
    </AppShell>
  );
}

export { ProjectionRow } from "@/components/keel/projection-row";
