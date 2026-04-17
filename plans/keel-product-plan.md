# Keel product plan (additions)

Living document for scope that is agreed but not yet fully implemented in the app.

## 1. Editable income with future-only effect

**Requirement:** Users must be able to change income (amount, frequency, name, next pay date), but changes must apply **from a chosen effective point forward**. They must **not** rewrite or invalidate past “journalled” behaviour—i.e. anything already implied by historical cashflow logic, imports, or audit-style records should stay interpretable under the rules that were true at the time.

**Principles:**

- Treat income as **versioned over time**, not a single mutable row that silently rewrites history.
- The UI should make the cutover explicit (e.g. “Applies from …”) with a safe default (e.g. next calendar day, or next pay cycle boundary—product choice).
- Dashboard and **projections** for a given `asOf` date must use the **income version active on that date**.
- Stored imports (e.g. transactions) and other artefacts are **not** back-adjusted when income changes; only forward behaviour changes.

**Likely implementation directions (pick one in build phase):**

- **Option A — Schedule table:** `Income` stays the logical stream; child rows `IncomeSchedule` (or `IncomeVersion`) hold `effectiveFrom`, `effectiveTo` (nullable), and fields `name`, `amount`, `frequency`, `nextPayDate` (or equivalent). “Current” = row where `effectiveFrom <= today < effectiveTo` (or open-ended).
- **Option B — Event log:** Append-only `IncomeChange` events with effective dates; materialize “current” in queries or a cached pointer updated on write.

**Engine / app changes (high level):**

- Resolve “active income definition” for each income id as of `asOf` when computing reserves, available money, and timeline.
- Migration: backfill one open-ended version per existing `Income` row matching today’s data.

**UX:**

- Incomes list: **Edit** opens a form; required field **Effective from** (date); copy-forward of current values with edits.
- Copy or tooltip: explain that past periods are unchanged.

---

## 2. Settings hub and slimmer bottom navigation

**Requirement:** Avoid an ever-growing bottom nav. Secondary / household / configuration flows should live under **Settings**, not as peer tabs next to core money workflows.

**Principles:**

- Bottom bar keeps a **small fixed set** of primary screens (e.g. Home, Bills, Goals, Timeline—exact list to confirm).
- **Settings** is one bottom-nav entry (or reachable from Home) that leads to a hub with links to sub-areas.
- Today’s “household” / sharing / secondary features move under Settings (and may keep old URLs with redirects for bookmarks).

**Candidate routes under `/settings`:**

- `/settings` — hub (grouped cards).
- `/settings/household` or `/settings/budget` — budget name, members, invites (today: `/budget/members`, invite accept can stay specialized).
- `/settings/incomes` — income list + add/edit (future-effective edits live here).
- `/settings/wealth` — wealth tracking (today: `/wealth`).
- `/settings/spend` — import / reconcile / vs budget (optional grouping of today’s `/spend/*`).
- Later: account, exports, API keys, etc.

**Navigation work:**

- Introduce `AppShell` variant or prop: **bottom nav mode** `primary` vs `settings` (hide bottom bar on settings sub-routes **or** show compact “Settings” context—product choice).
- Update `navItems` in `primitives.tsx` to the reduced set + Settings.
- Add redirects from legacy paths (`/incomes` → `/settings/incomes`, etc.) if URLs move.

**Simplicity:**

- Settings hub should stay **one screen of links**, not deep nesting, unless a subsection naturally needs it.

---

## Delivery order (suggested)

1. Settings hub + route moves + redirects + trimmed bottom nav (mostly mechanical, improves IA immediately).
2. Income versioning + future-effective edits + engine `asOf` resolution (foundational for trust and later features).
