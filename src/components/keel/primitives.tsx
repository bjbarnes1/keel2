import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, ChevronRight, Plus } from "lucide-react";

import type { CommitmentView, GoalView, IncomeView } from "@/lib/types";
import { cn, formatAud, sentenceCaseFrequency } from "@/lib/utils";

import { AvatarMenu } from "@/components/keel/avatar-menu";

type NavItem =
  | { href: string; label: string }
  | { href: string; label: string; match: (path: string) => boolean };

const navItems: NavItem[] = [
  {
    href: "/",
    label: "Home",
    match: (path) =>
      path === "/" || path.startsWith("/spend") || path.startsWith("/balance") || path.startsWith("/bills"),
  },
  { href: "/timeline", label: "Timeline" },
  { href: "/wealth", label: "Wealth" },
  { href: "/goals", label: "Goals", match: (path) => path === "/goals" || path.startsWith("/goals/") },
  { href: "/ask", label: "Ask" },
];

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
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M8.5 8.75c0-2.1 1.6-3.75 3.75-3.75S16 6.65 16 8.75c0 1.55-.9 2.85-2.2 3.45-.55.25-.95.75-1.05 1.35"
        stroke={stroke}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path d="M12.25 17.2h.01" stroke={stroke} strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function IconWealth({ active }: { active: boolean }) {
  const stroke = active ? "rgba(240, 235, 220, 0.92)" : "rgba(168, 172, 159, 0.95)";
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6.5 7.5h11a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z"
        stroke={stroke}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M8 10.5h8" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M9 14.5h3" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" />
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
  if (href === "/timeline") return <IconTimeline active={active} />;
  if (href === "/wealth") return <IconWealth active={active} />;
  if (href === "/goals") return <IconGoals active={active} />;
  if (href === "/ask") return <IconAsk active={active} />;
  return <IconHome active={active} />;
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
    <div className="keel-bg mx-auto min-h-screen max-w-[420px] bg-background text-foreground">
      <header className="sticky top-0 z-30 flex items-center justify-between bg-background/70 px-5 pb-2 pt-3 backdrop-blur-xl">
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
          <h1 className="text-[22px] font-medium tracking-[-0.025em]">{title}</h1>
        </div>
        <div className="flex items-center gap-2">
          {headerRight}
          <AvatarMenu />
        </div>
      </header>

      <main className="px-5 pb-32">{children}</main>

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center pb-[calc(12px+env(safe-area-inset-bottom))]">
        <nav className="pointer-events-auto glass-heavy mx-4 w-full max-w-[380px] rounded-[var(--radius-pill)] px-2 py-2">
          <div className="flex items-end justify-between gap-1">
            {navItems.map((item) => {
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
    <section className={cn("rounded-[var(--radius-xl)] p-6", theme.card)}>
      <p className="label-upper">Available money</p>
      <p className={cn("tabular-nums mt-3 font-mono text-5xl font-medium tracking-[-0.035em]", theme.text)}>
        {formatAud(amount)}
      </p>
      <p className={cn("mt-3 text-sm font-medium", theme.text)}>{theme.subtitle}</p>

      <div className="mt-5 space-y-2 text-sm">
        <WaterfallRow label="Bank balance" amount={bankBalance} />
        <WaterfallRow label="Reserved for bills" amount={-reserved} amountClassName="text-amber-500" />
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

export function CommitmentCard({ commitment }: { commitment: CommitmentView }) {
  const percentReserved = Math.min(
    Math.round((commitment.reserved / commitment.amount) * 100),
    100,
  );
  const progressClass = percentReserved >= 100 ? "bg-emerald-500" : "bg-amber-500";
  const statusClass = percentReserved >= 100 ? "text-emerald-500" : "text-amber-500";

  return (
    <Link
      href={`/bills/${commitment.id}/edit`}
      className="block rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[15px] font-medium">{commitment.name}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {sentenceCaseFrequency(commitment.frequency)} · Due {commitment.nextDueDate}
          </p>
        </div>
        <p className="font-mono text-[15px] font-semibold">{formatAud(commitment.amount)}</p>
      </div>

      <div className="mt-3 flex items-center justify-between gap-4 text-xs">
        <span className="text-muted-foreground">{commitment.category}</span>
        <span className={statusClass}>{percentReserved}% reserved</span>
      </div>

      <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/10">
        <div className={cn("h-full rounded-full", progressClass)} style={{ width: `${percentReserved}%` }} />
      </div>
    </Link>
  );
}

export function GoalCard({ goal }: { goal: GoalView }) {
  const hasTarget = Boolean(goal.targetAmount);
  const percent = goal.targetAmount
    ? Math.min(Math.round((goal.currentBalance / goal.targetAmount) * 100), 100)
    : 0;

  return (
    <Link href={`/goals/${goal.id}`} className="block">
      <SurfaceCard className="transition-colors hover:border-primary/40">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[15px] font-medium">{goal.name}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {hasTarget ? "Savings goal" : "Open-ended goal"}
          </p>
        </div>
        <p className="font-mono text-[15px] font-semibold text-primary">
          {formatAud(goal.contributionPerPay)}
          <span className="ml-1 font-sans text-xs font-normal text-muted-foreground">/pay</span>
        </p>
      </div>

      {hasTarget ? (
        <>
          <div className="mt-3 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              {formatAud(goal.currentBalance)} of {formatAud(goal.targetAmount ?? 0)}
            </span>
            <span className="text-primary">{percent}%</span>
          </div>
          <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
          </div>
          {goal.targetDate ? (
            <p className="mt-3 text-xs text-emerald-500">On track for {goal.targetDate}</p>
          ) : null}
        </>
      ) : (
        <p className="mt-3 text-xs text-primary">{formatAud(goal.currentBalance)} saved</p>
      )}
      </SurfaceCard>
    </Link>
  );
}

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
      <div className="fixed inset-x-0 bottom-0 mx-auto max-w-[420px] rounded-t-3xl border border-border bg-card p-6">
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
