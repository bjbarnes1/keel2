---
name: Commitments Rebuild — browse screen, unified sheets, design primitives, vocabulary cleanup
overview: Rebuild the Commitments section end-to-end. Replaces the current commitments list with a properly grouped, scannable browse screen using new shared primitives (GlassSheet, CategoryGroupHeader, FloatingAddButton, KebabRow). Refactors commitment detail to use the new primitives and reference the upcoming-list pattern established in the Pre-Launch Sprint PR. Splits edit/archive into their own sheets consuming the shared RecordEditSheet primitive (built in the Unified Edit Sheet PR, consumed here). Redirects /bills → /commitments so the route matches the product's vocabulary. Removes swipe actions globally across commitment surfaces. Adds Commitments to the avatar menu's data-management group. Audits all user-facing strings for vocabulary consistency ("commitment" not "bill"). No database changes.
todos:
  - id: primitive-glass-sheet
    content: |
      Create `src/components/keel/primitives/glass-sheet.tsx`. The shared bottom-sheet primitive used for all modal-style interactions (edit, archive, skip, detail overflow).

      Props:
      ```typescript
      {
        open: boolean;
        onClose: () => void;
        title?: string;
        children: ReactNode;
        footer?: ReactNode;
        size?: 'compact' | 'medium' | 'tall';  // 40vh | 60vh | 85vh
      }
      ```

      Behavior:
      - Backdrop: `rgba(14, 20, 18, 0.6)` + `backdrop-filter: blur(12px) saturate(140%)`, fade in 200ms on open
      - Sheet panel: anchored bottom, full width (desktop caps at 520px centered)
      - Background: `rgba(20, 26, 23, 0.92)` + `backdrop-filter: blur(40px) saturate(180%)`
      - Border-radius: `24px 24px 0 0`
      - Shadow: `0 -12px 48px rgba(0, 0, 0, 0.4), inset 0 0.5px 0 rgba(255, 255, 255, 0.08)`
      - Entry: transform translateY(100%) → 0 with `cubic-bezier(0.32, 0.72, 0, 1)` over 280ms
      - Exit: reverse animation, 220ms
      - Grab handle: 32px × 3px pill at top center, 12px top padding, `rgba(240, 235, 220, 0.25)`
      - Dismiss via: backdrop tap, grab-handle drag-down (gesture threshold 80px), escape key, onClose prop
      - Focus trap: first focusable element receives focus on open; restore previous focus on close
      - Scroll lock: body `overflow: hidden` while open

      Title area (if title prop): padding 16px 20px 8px, 17px weight 500 `--keel-ink`, centered.

      Footer area (if footer prop): padding 12px 20px 20px, border-top `0.5px solid rgba(240, 235, 220, 0.08)`, sticky at sheet bottom.

      Content area: padding 0 20px 16px, scrolls internally if content exceeds sheet height.

      Respect `prefers-reduced-motion`: entry/exit become instant fades, no translate.

      Unit test for GlassSheet: open=true renders, open=false unmounts after exit animation, backdrop click fires onClose, escape key fires onClose, focus traps correctly.
    status: pending

  - id: primitive-kebab-row
    content: |
      Create `src/components/keel/primitives/kebab-row.tsx`. A tappable row with a kebab (three-dots) button at its right edge, used across commitments list, incomes list, goals list.

      Props:
      ```typescript
      {
        onTap: () => void;                    // main row tap → navigate
        onKebabTap: () => void;               // kebab tap → open action sheet
        children: ReactNode;                  // row content (consumer composes)
      }
      ```

      Layout: flex row, row body takes 1fr, kebab button takes 40px. Both independently tappable — stopPropagation on kebab handler.

      Kebab button: 40px × 40px tap target, centered. Icon 16px, three dots vertical stack, `--keel-ink-3`. Hover/active: `rgba(255, 255, 255, 0.04)` background, same border-radius as row.

      Row body: inherits from row styling in consumer. No default padding — consumer controls.

      Accessibility: kebab button has `aria-label="More actions"`, keyboard-tappable (Enter and Space trigger onKebabTap). Row body has `role="button"`, keyboard-tappable (Enter triggers onTap).

      This primitive is used in three places tonight (commitments, incomes, goals). Don't copy-paste the markup.
    status: pending

  - id: primitive-floating-add-button
    content: |
      Create `src/components/keel/primitives/floating-add-button.tsx`. The + button anchored to a scroll surface's bottom-right for primary "add new" affordance.

      Props:
      ```typescript
      {
        onTap: () => void;
        label?: string;            // optional text label ("Add commitment")
        icon?: ReactNode;          // defaults to + glyph
      }
      ```

      Styling:
      - Fixed position: `bottom: calc(tab-bar-height + 16px); right: 16px`
      - Size: 56px × 56px circular if no label; pill 56px × auto if label
      - Background: `.glass-tint-safe` (sea-green 14% opacity) + `backdrop-filter: blur(30px) saturate(180%)`
      - Border: `0.5px solid rgba(142, 196, 168, 0.25)`
      - Shadow: `0 8px 24px rgba(0, 0, 0, 0.4), inset 0 0.5px 0 rgba(255, 255, 255, 0.08)`
      - Icon: + glyph in `--keel-safe-soft`, 20px
      - Label: 13px weight 500 `--keel-safe-soft` if present
      - Tap animation: scale(0.95) for 100ms

      Hides automatically when: (a) scroll direction is down and user has scrolled >80px (reveals on scroll up), (b) a GlassSheet is open.

      Hide animation: opacity + translateY(16px), 200ms ease-out.

      Unit test: renders, onTap fires, hides on scroll-down, reveals on scroll-up, hides when sheet open.
    status: pending

  - id: primitive-category-group-header
    content: |
      Create `src/components/keel/primitives/category-group-header.tsx`. Section header used above grouped rows (by category, by frequency, etc.).

      Props:
      ```typescript
      {
        label: string;               // "HOUSING (36A)" — renders as-is, consumer capitalizes
        count?: number;              // shown at right if present: "2"
        action?: { label: string; onTap: () => void };  // optional right-side action
      }
      ```

      Styling: grid `1fr auto`, padding 20px 8px 8px, border-bottom `0.5px solid rgba(240, 235, 220, 0.06)`.

      Label: 10px uppercase, letter-spacing 0.16em, weight 500, `--keel-ink-5`.

      Count (if present): 10px tabular-nums, `--keel-ink-5`.

      Action (if present): 11px weight 500, `--keel-safe-soft`, right-aligned, no underline, hover opacity 0.8.

      Used in: commitments browse (by category), incomes browse (by status if archived section exists), timeline legend (by section).
    status: pending

  - id: commitments-browse-screen
    content: |
      Rebuild `src/app/commitments/page.tsx`. The current screen shows all commitments in a flat sorted list with swipe actions. Replace with a properly grouped browse surface.

      Structure:

      **Header strip:**
      - "Commitments" title, 24px weight 500
      - Kebab on right: opens small popover with "Sort: Due date / Amount / Name", "Show archived: on/off"
      - Remove the current sort-pill segmented control (moved into kebab popover)

      **Overview card** (glass-heavy):
      - Grid: 3 columns `1fr 1fr 1fr`
      - "Count" label, integer value
      - "Reserved now" label, formatAud(sum of held amounts)
      - "Annualized" label, formatAud(sum of annualized amounts)
      - Labels 10px uppercase `--keel-ink-5`, values 16px weight 500 `--keel-ink`, tabular-nums

      **Grouped list** (by category):
      - CategoryGroupHeader per category: label "HOUSING (36A)", count 2
      - Rows: KebabRow primitive wrapping commitment content
        - Grid: `1fr auto`, gap 12px, padding 14px 8px
        - Main area: commitment name (14px weight 500), secondary line (12px `--keel-ink-4`): "Fortnightly · Due 23 Apr", tertiary line (11px `--keel-ink-5`): "Housing (36A)"
        - Amount: right-aligned, `--keel-ink` 14px weight 500 tabular-nums, subline "86% funded toward next due date" in `--keel-ink-4` 11px
        - Progress bar: below row, full-width, 3px height, `--keel-safe-soft` fill on `--keel-ink-6` background, radius 2px
      - Row tap → /commitments/[id]
      - Kebab → opens action sheet: Skip next, Edit, Archive

      **Archived section** (if any):
      - CategoryGroupHeader: "ARCHIVED" with count and "Show" toggle
      - Collapsed by default, expands on toggle tap
      - Rows rendered at 0.6 opacity with same structure
      - Kebab popover shows "Restore", "Edit"

      **Floating add button:**
      - FloatingAddButton at bottom-right
      - onTap opens Capture sheet with commitment scoped

      Remove:
      - All SwipeActionRow usages
      - The "Prefer a form? Add manually" text link at bottom (replaced by floating button + capture toggle)

      Empty state: if zero commitments, centered glass-clear card: "Your recurring bills and subscriptions go here. Tap + to add your first one." Icon above: subtle waterline glyph (reusing logo path at 40% opacity).
    status: pending

  - id: commitment-detail-refactor
    content: |
      Refactor `src/app/commitments/[id]/page.tsx` to consume the new primitives and match the visual language of the browse screen.

      The Pre-Launch Sprint PR already restored the visible upcoming-list with per-row Skip/Unskip toggles. This todo ensures the full detail page is coherent with the new browse screen.

      Structure:

      **Header:** Back arrow (left), commitment name (center, 18px weight 500), kebab (right). Kebab popover: Edit, Archive.

      **Hero card** (glass-heavy):
      - Name, frequency, next due — layout from current design
      - Progress bar showing held vs target

      **Held amount card** (glass-tint-safe):
      - Label "HELD TOWARD NEXT DUE DATE"
      - Value: formatAud(held), large
      - Context: "$X of $Y"

      **Keel noticed card** (glass-heavy, optional):
      - Only renders when there's a meaningful observation
      - Label "KEEL NOTICED"
      - Body: 14px `--keel-ink-2`, max 2 sentences

      **Upcoming section** (from Pre-Launch Sprint):
      - CategoryGroupHeader "Upcoming · Next N scheduled payments"
      - Per-row Skip/Unskip toggles

      **Recent spend section:**
      - CategoryGroupHeader "Recent spend · Linked transactions"
      - Empty state: "No linked spend yet." in `--keel-ink-4`

      **Actions:** None at bottom of page. All actions via kebab menu.

      Remove:
      - Any inline edit form on the detail page (if one still exists)
      - The separate `/commitments/[id]/edit` route (archived — edit becomes a sheet consuming RecordEditSheet)
      - Any Delete button (archive only)

      Kebab popover entries:
      - "Edit details" → opens RecordEditSheet
      - "Archive" → opens GlassSheet with archive confirmation (amber, reversible, cascade explanation)
    status: pending

  - id: archive-confirmation-sheet
    content: |
      Create `src/components/keel/sheets/archive-commitment-sheet.tsx`. Confirmation sheet for archiving a commitment.

      Opens from kebab on browse row or detail page.

      Content:
      - Title: "Archive {commitment.name}?"
      - Body paragraphs (`--keel-ink-2`, 14px):
        - "Archived commitments stop appearing in your timeline and available money."
        - "Any held amount is released — $X moves back to your available balance."
        - "You can restore this anytime from the Archived section."
      - Footer: Cancel (ghost button), Archive (`.glass-tint-attend`)

      On confirm: call `archiveCommitmentAction({ commitmentId })`. Server action sets `archivedAt = new Date()`, releases any held pool amount back to availableMoney, revalidates paths. Close sheet, optimistic UI update showing commitment in archived section.

      Unit test for server action: archived commitment sets archivedAt, releases held pool, doesn't affect historical projections, doesn't hard delete.
    status: pending

  - id: route-redirect-bills-to-commitments
    content: |
      Add redirect from `/bills` and `/bills/*` to `/commitments` and `/commitments/*`.

      In `next.config.ts` or wherever redirects live:
      ```typescript
      async redirects() {
        return [
          { source: '/bills', destination: '/commitments', permanent: true },
          { source: '/bills/:id', destination: '/commitments/:id', permanent: true },
          { source: '/bills/:id/edit', destination: '/commitments/:id', permanent: true },  // edit becomes sheet on detail
        ];
      }
      ```

      Search codebase for hardcoded references to `/bills` and update to `/commitments`. Check:
      - Tab bar (should already be /commitments)
      - Avatar menu Commitments link
      - Any internal Link components
      - Any router.push calls
      - Any server action revalidatePath calls

      Do not break anything that still imports from files in `src/app/bills/` — if those routes exist, move them to `src/app/commitments/` as part of this.
    status: pending

  - id: avatar-menu-commitments-entry
    content: |
      Ensure Commitments appears in the avatar menu's data-management group.

      Check `src/components/keel/avatar-menu.tsx`. The menu should have three groups:
      - Identity: Profile, Settings
      - Data: Commitments, Incomes, Assets (Wealth)
      - Support: Help & feedback, Log out

      If Commitments isn't in the Data group, add it. Route to `/commitments`. Label "Commitments". Same row styling as Incomes and Assets.

      The avatar menu restructure is the subject of its own PR (Avatar Menu + Settings Polish). This todo just confirms Commitments is present correctly; if that PR hasn't landed, use whatever the current menu structure is.
    status: pending

  - id: vocabulary-audit
    content: |
      Audit user-facing strings for "bill" vs "commitment". Keel's vocabulary is "commitment" — not "bill", not "subscription", not "recurring expense".

      Grep for user-facing occurrences:
      - `"bill"`, `"Bill"`, `"BILL"` (in JSX, in strings)
      - `"bills"`, `"Bills"`, `"BILLS"`
      
      Replace with "commitment" / "Commitment" / "COMMITMENT" and "commitments" / "Commitments" / "COMMITMENTS" where user-facing.

      Keep "bill" in:
      - Prisma schema field names (if any)
      - Internal variable names / type names
      - Comments that accurately describe external-world billing relationships (e.g., "the biller sends us a bill" is fine in a comment about external billers)

      Don't replace "bill" in these contexts:
      - "Last bill arrived on 4 May" referring to a real external bill → consider "Last statement received 4 May"
      - "Bill amount" referring to the amount of the thing-the-biller-sent → OK to keep if the context is clear

      For ambiguous cases: err on the side of "commitment" for user-facing strings, keep "bill" only when literally referring to an external invoice.

      Check:
      - All page components under `src/app/`
      - All components under `src/components/keel/`
      - All button labels, tooltips, empty states, error messages
      - All route paths (already done in previous todo)
      - Avatar menu, tab bar, any navigation

      Specific known areas needing attention:
      - "Add bill" → "Add commitment"
      - "Edit bill" → "Edit commitment"
      - "Bill amount" → "Amount"
      - "Next bill" → "Next due" or "Next payment"
      - "Bills list" → "Commitments list"
    status: pending

  - id: swipe-actions-removal
    content: |
      Remove the SwipeActionRow primitive and all consumers. Replace with KebabRow.

      Find `src/components/keel/swipe-action-row.tsx` (or wherever the primitive lives). List all files importing it. For each consumer:
      - Replace SwipeActionRow with KebabRow
      - Move swipe actions into the kebab popover
      - Map swipe-right / swipe-left semantics to primary row tap (open detail) vs kebab tap (show actions)

      Delete the primitive file after all consumers migrated. Delete any gesture helpers that were only used by it.

      Known consumers (from the screenshots):
      - Commitments browse rows (Skip next / Archive)
      - Incomes browse rows (if swipe was used there)

      After removal, grep for `SwipeAction` — zero matches.
    status: pending

  - id: lint-build-test-manual-qa
    content: |
      `npm run lint`, `npm run build`, `npm test`. All pass.

      Manual QA:

      **Commitments browse:**
      - /commitments renders with overview card, grouped list, floating add button
      - Categories render with CategoryGroupHeader and row counts
      - Each row: tap opens detail, kebab opens action sheet
      - No swipe actions visible
      - Floating + button anchored bottom-right, hides on scroll-down
      - Archived section collapsed by default; toggle reveals archived commitments at 0.6 opacity
      - Sort options accessible via header kebab

      **Commitment detail:**
      - Renders all sections: hero, held, keel noticed, upcoming, recent spend
      - Kebab menu: Edit (opens sheet), Archive (opens sheet)
      - Upcoming list from Pre-Launch Sprint is present and functional
      - No inline edit form
      - No Delete button, no red

      **Archive flow:**
      - Kebab → Archive → sheet opens with consequence explanation
      - Confirm → commitment disappears from active list, appears in Archived section
      - Restore from archived section → commitment returns to active list
      - Held amount released correctly

      **Route redirects:**
      - Old /bills URL redirects to /commitments with 301
      - Any bookmarks to /bills/[id] redirect correctly

      **Vocabulary:**
      - No "bill" or "Bills" in user-facing text
      - Route is /commitments, menu label is "Commitments"
      - Button labels all say "commitment" not "bill"

      **Primitives:**
      - GlassSheet backdrop blur, entry animation, focus trap all work
      - KebabRow row tap and kebab tap independently trigger
      - FloatingAddButton hides on scroll-down, reveals on scroll-up, hides when sheet open
      - CategoryGroupHeader action link clickable

      **Accessibility:**
      - All new primitives keyboard-navigable
      - ARIA labels on kebab buttons
      - Focus trap in GlassSheet
      - prefers-reduced-motion: instant animations, no gesture-dependent UI

      **Negative check:**
      - Grep diff for `text-red`, `bg-red`, `amber-500`, `amber-600`, `orange-` — zero matches
      - Grep diff for `SwipeAction` — zero matches
      - Grep user-facing strings for "bill" — zero matches (excluding external-bill-references)
    status: pending

isProject: false
---

# Commitments Rebuild — the plan

## What this PR lands

A coherent Commitments section that matches the design system and respects the vocabulary. Three layers of change:

1. **Shared primitives** — GlassSheet, KebabRow, FloatingAddButton, CategoryGroupHeader. Built once, consumed across Commitments, Incomes, Goals.
2. **Commitments browse screen rebuild** — grouped by category, overview card at top, floating add, kebab menus replacing swipe
3. **Commitment detail refactor** — new primitives, kebab-driven actions, no inline edit form

Plus vocabulary cleanup (bill → commitment) and route redirect (/bills → /commitments).

## Dependencies

**Lands after Pre-Launch Sprint PR.** That PR establishes the upcoming-list pattern on detail pages. This PR depends on it.

**Lands alongside or before Unified Edit Sheet PR.** This PR references `RecordEditSheet` in the commitment detail kebab menu. If that PR isn't ready, kebab "Edit details" routes to the existing edit screen until RecordEditSheet is available.

## Why bundled

The primitives (GlassSheet, KebabRow, FloatingAddButton, CategoryGroupHeader) are used by the browse screen AND the detail refactor AND consumed by Incomes/Goals rebuilds later. Building them in isolation would leave consumers unclear. Building them alongside their first consumer (Commitments) proves them in context.

The vocabulary audit is bundled because renaming from "bill" to "commitment" touches the same files this PR already modifies. Separating would cause merge conflicts.

## What this PR does NOT include

- **RecordEditSheet primitive** — that's the Unified Edit Sheet PR's job
- **Incomes rebuild** — Incomes gets its own small PR consuming these primitives
- **Goals rebuild** — Goals gets its own small PR
- **Avatar menu restructure** — separate PR
- **Hard delete functionality** — archive only, hard delete not user-reachable
- **Category creation/management** — categories remain managed via Settings

## Risk

Medium. New primitives have test coverage but get their real shakedown in consumer code. Vocabulary audit risks missing occurrences (grep is not semantic analysis). Route redirect needs production verification after deploy.

## Rollout

Keep `/bills` as a redirect permanently (301). Any external links users have bookmarked continue working. Don't delete the old route files until two weeks post-launch with no 404 spikes in logs.
