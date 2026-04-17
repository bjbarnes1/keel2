import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, ArrowDown, ArrowUp, ChevronRight, Plus } from "lucide-react";

import type {
  CommitmentView,
  GoalView,
  IncomeView,
  ProjectionEventView,
} from "@/lib/types";
import { cn, formatAud, sentenceCaseFrequency } from "@/lib/utils";

type NavItem =
  | { href: string; label: string }
  | { href: string; label: string; match: (path: string) => boolean };

const navItems: NavItem[] = [
  { href: "/", label: "Home" },
  { href: "/bills", label: "Bills" },
  { href: "/goals", label: "Goals" },
  { href: "/timeline", label: "Timeline" },
  {
    href: "/settings",
    label: "Settings",
    match: (path) => path === "/settings" || path.startsWith("/settings/"),
  },
];

function isNavActive(item: NavItem, currentPath: string) {
  return "match" in item ? item.match(currentPath) : item.href === currentPath;
}

export function AppShell({
  title,
  currentPath,
  children,
  backHref,
}: {
  title: string;
  currentPath: string;
  children: ReactNode;
  backHref?: string;
}) {
  return (
    <div className="mx-auto min-h-screen max-w-[420px] bg-background text-foreground">
      <header className="sticky top-0 z-30 flex items-center justify-between bg-background px-5 pb-2 pt-3">
        <div className="flex items-center gap-3">
          {backHref ? (
            <Link
              href={backHref}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="sr-only">Back</span>
            </Link>
          ) : null}
          <h1 className="text-xl font-bold tracking-[-0.5px]">{title}</h1>
        </div>
        <div className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-sm text-muted-foreground">
          B
        </div>
      </header>

      <main className="px-5 pb-28">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-[420px] justify-around px-2 pb-5 pt-2">
          {navItems.map((item) => {
            const active = isNavActive(item, currentPath);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex min-w-16 flex-col items-center gap-1 rounded-xl px-3 py-1 text-xs transition-colors",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span className="text-base">{active ? "◉" : "○"}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
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
          card: "border-emerald-500/20 bg-emerald-500/10",
          text: "text-emerald-500",
          subtitle: "You're in good shape",
        }
      : state === "tight"
        ? {
            card: "border-amber-500/20 bg-amber-500/10",
            text: "text-amber-500",
            subtitle: "Getting tight this cycle",
          }
        : {
            card: "border-red-500/20 bg-red-500/10",
            text: "text-red-500",
            subtitle: "Attention needed",
          };

  return (
    <section className={cn("rounded-2xl border p-6", theme.card)}>
      <p className="text-xs uppercase tracking-[0.5px] text-muted-foreground">
        Available Money
      </p>
      <p className={cn("mt-3 font-mono text-5xl font-bold tracking-[-1px]", theme.text)}>
        {formatAud(amount)}
      </p>
      <p className={cn("mt-3 text-sm font-semibold", theme.text)}>{theme.subtitle}</p>

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
      <span className={cn("font-mono text-sm text-foreground/90", amountClassName)}>
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
  return <section className={cn("rounded-2xl border border-border bg-card p-4", className)}>{children}</section>;
}

export function IncomeCard({ income }: { income: IncomeView }) {
  return (
    <SurfaceCard className="flex items-center justify-between">
      <div>
        <p className="text-xs text-muted-foreground">Next pay</p>
        <p className="mt-1 text-sm font-medium">
          {income.nextPayDate} · <span className="font-mono">{formatAud(income.amount)}</span>
        </p>
      </div>
      <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-500">
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
    <SurfaceCard>
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
  );
}

export function ProjectionRow({ event }: { event: ProjectionEventView }) {
  const isIncome = event.type === "income";
  const projected = event.projectedAvailableMoney ?? 0;

  return (
    <div className="flex items-center gap-3 border-b border-border py-3">
      <div
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-full",
          isIncome ? "bg-emerald-500/10 text-emerald-500" : "bg-amber-500/10 text-amber-500",
        )}
      >
        {isIncome ? <ArrowDown className="h-4 w-4" /> : <ArrowUp className="h-4 w-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{event.label}</p>
        <p className="text-xs text-muted-foreground">{event.date}</p>
      </div>
      <div className="text-right">
        <p className={cn("font-mono text-sm font-semibold", isIncome ? "text-emerald-500" : "text-foreground")}>
          {isIncome ? "+" : "-"}
          {formatAud(event.amount)}
        </p>
        <p
          className={cn(
            "font-mono text-xs",
            projected < 0
              ? "text-red-500"
              : projected < 500
                ? "text-amber-500"
                : "text-muted-foreground",
          )}
        >
          {formatAud(projected)}
        </p>
      </div>
    </div>
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
