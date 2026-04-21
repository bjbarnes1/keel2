# Keel primitives audit (Commitments rebuild baseline)

Reference file: [`src/components/keel/primitives.tsx`](../src/components/keel/primitives.tsx). Tokens live in [`src/app/globals.css`](../src/app/globals.css).

## Token checklist (verified)

- `--keel-tide`, `--keel-tide-2`, `--keel-ink` … `--keel-ink-5`, `--keel-safe`, `--keel-safe-soft`, `--keel-attend`
- `.glass-clear`, `.glass-heavy`, `.glass-tint-safe`, `.glass-tint-attend`

## Component notes

| Primitive | Styling today | This PR |
|-----------|---------------|---------|
| **SurfaceCard** | `glass-clear`, `rounded-[--radius-md]`, `p-4` | OK; optional `className` override only if a screen needs different padding. |
| **CommitmentCard** | Raw `border bg-card`, `bg-emerald-500` / `bg-amber-500` progress, links `/bills/.../edit` | **Restyle** to Keel tokens, no Tailwind amber/emerald bars; link `/commitments/[id]`; swipe lives on browse list wrapper. |
| **AppShell** | `glass-heavy` floating tab bar, sticky header | OK; update `navItems` Home match for `/commitments`. |
| **AddCardLink** | `border-dashed border-primary/30 bg-primary/10` | **Later** align to glass/dashed Keel pattern; not blocking Commitments if FAB replaces primary add on that screen. |
| **IncomeCard** | `glass-clear` + `text-muted-foreground` / `text-primary` chip | OK for now; future Incomes rebuild. |
| **GoalCard** | `glass-clear` + `text-primary` / `emerald-500` | **Out of scope** this PR; note emerald for later Goals pass. |
| **SectionTitle** | Default `text-[17px] semibold` | OK. |
| **EmptyState** | Inside `SurfaceCard`, muted text | OK. |
| **HeroAvailableMoneyCard** etc. | Mixed Keel + legacy | Out of scope unless touched by routing. |
| **ModalSheet** | Legacy `bg-card border-border` | **Do not use** for new flows; prefer `GlassSheet`. |

## New reference primitives (this PR)

- `GlassSheet`, `RecordEditDisclosure` (shared edit-sheet disclosure), `CategoryGroupHeader`, `FloatingAddButton` — see `src/components/keel/`. Commitment rows use a **kebab menu** instead of swipe actions.
