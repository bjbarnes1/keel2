---
name: Launch Polish — remaining UX audit items, tab bar icons, copy cleanup, miscellaneous fixes
overview: Final polish pass before launch. Covers all UX audit items not captured in earlier PRs — Wealth tab icon change (document → donut), Ask tab icon refinement, rename the ambiguous "Update" button on Home, goal card redesign for detail screen, segmented-control styling fix on Commitments list, copy cleanup across onboarding and empty states, favicon and app icon verification, meta tags audit, 404 and error pages. Small items in isolation, but together they're the difference between "this app feels like a launch-ready product" and "this app has obvious rough edges."
todos:
  - id: tab-bar-icon-updates
    content: |
      Update the Wealth and Ask tab bar icons per the UX audit.

      Current state:
      - Home: house (keep)
      - Timeline: vertical bars (keep)
      - Wealth: document (wrong — implies paperwork, not holdings)
      - Goals: target rings (keep)
      - Ask: question mark (ambiguous)

      Changes:

      **Wealth: donut / allocation ring**
      Find `src/components/keel/tab-bar.tsx`. Replace the wealth icon SVG with a donut icon:
      - Outer ring: stroke, no fill
      - Two or three visible segments: one larger arc (~70%), one smaller arc (~30%)
      - Suggests "portions of a whole" (asset allocation)
      - Distinct from Goals' concentric bullseye
      - 1.5px stroke, 20-22px viewBox, `currentColor` fill/stroke so theming works

      Simple SVG:
      ```svg
      <svg viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="11" cy="11" r="7.5" stroke-dasharray="32 15" stroke-dashoffset="8" />
      </svg>
      ```

      **Ask: speech bubble**
      Replace the question mark with a chat bubble:
      - Rounded rectangle with a small tail
      - 1.5px stroke, outlined style
      - Implies "converse with something" more clearly than question mark

      Simple SVG:
      ```svg
      <svg viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M4 5 Q4 3, 6 3 H16 Q18 3, 18 5 V13 Q18 15, 16 15 H10 L6 18 V15 Q4 15, 4 13 Z" />
      </svg>
      ```

      Verify both icons render correctly at 20px, 22px, 24px. Check active state (filled or heavier stroke) and inactive state (outlined, muted).

      Active state styling: label visible below icon, icon in `--keel-ink`, optional subtle pill background `.glass-tint-safe` at 6% opacity.
      Inactive state: icon-only, `--keel-ink-4`.
    status: pending

  - id: home-update-button-rename
    content: |
      Rename or remove the ambiguous "Update" button on the Home screen.

      Find `src/app/page.tsx`. Near the bottom: "Last updated 21 Apr. Your available money stays positive across the next 42 days." with an "Update" button to the right.

      Investigate what Update does:
      - If it refreshes projection data: rename to "Refresh projection"
      - If it opens Capture: rename to "Add transaction"
      - If it's vestigial (no meaningful action): remove entirely

      Most likely case: the button triggered a data refresh that's now automatic on page load. If so, remove the button and simplify the copy:
      ```
      Your available money stays positive across the next 42 days.
      Last updated 21 Apr.
      ```

      If the button IS load-bearing for some reason (manual reconciliation, rare edge case), rename to "Refresh" and ensure the action is idempotent (safe to click multiple times).

      Update the adjacent copy to match whatever the button actually does. Ambiguous UI is worse than no UI.
    status: pending

  - id: goal-detail-screen-creation
    content: |
      Create a proper goal detail screen. Currently tapping a goal row on Home or `/goals` may or may not route anywhere meaningful.

      Create `src/app/goals/[id]/page.tsx` with structure:

      **Header:** Back arrow, goal name, kebab menu (Edit via RecordEditSheet, Archive)

      **Hero card** (glass-heavy):
      - Goal name, "targeting $X by Y" (or "open-ended goal")
      - Current balance prominently displayed, tabular-nums
      - Progress bar below: filled portion = balance/target, `--keel-safe-soft` on `--keel-ink-6` background
      - If open-ended: show accumulated total with "building steadily" subtitle

      **Contribution card** (glass-tint-safe):
      - Label "PER PAY"
      - Value: formatAud(perPayCents), tabular-nums
      - Subtitle: "Funded from {incomeName}"
      - Small edit action (inline chevron or tappable row → opens RecordEditSheet)

      **Trajectory card** (glass-clear):
      - Small chart showing accumulation curve over past + projection into future
      - Timeline dots on the curve marking contribution events
      - If target exists: horizontal line at target amount, projected-hit-date shown below ("Expected to reach target on 15 March 2028")
      - Interactive: tap a date on the curve, shows balance at that date

      **Recent contributions list:**
      - Section header "RECENT CONTRIBUTIONS"
      - Rows: date, amount, running balance
      - Default 10 most recent, "Show all" link expands

      **Actions via kebab:**
      - Edit goal (RecordEditSheet)
      - Archive goal

      Empty state (no contributions yet): centered message "Your contributions will appear here after your next pay."

      Route integration: Home goal rows tap → `/goals/[id]`. `/goals` list rows tap → `/goals/[id]`. Ask Keel references goals with tap-to-navigate.
    status: pending

  - id: commitments-segmented-control
    content: |
      Fix the sort-pill styling on the Commitments list per the UX audit.

      Currently: "Due date / Amount / Name" as three separate pills. Users may not realize they're a segmented control.

      Option A: proper segmented control with sliding background
      Option B: keep separate pills but visually cluster so intent is clearer

      **Recommendation: Option A.** Implement as a single container with three equal-width segments. Active segment has a background pill that visually slides between positions on selection.

      ```tsx
      <div class="segmented-control">
        <button data-active={sortBy === 'dueDate'}>Due date</button>
        <button data-active={sortBy === 'amount'}>Amount</button>
        <button data-active={sortBy === 'name'}>Name</button>
      </div>
      ```

      Styling:
      - Container: `glass-heavy` background, border-radius 999px (fully rounded), padding 3px, display flex
      - Each button: flex 1, centered text, 13px weight 500, padding 6px 12px, border-radius 999px, background transparent, color `--keel-ink-4`
      - Active button: background `rgba(240, 235, 220, 0.08)`, color `--keel-ink`
      - Transition: background 200ms `cubic-bezier(0.32, 0.72, 0, 1)`

      Alternative: move sort selection entirely into the header kebab menu (done already in Commitments Rebuild PR). If that approach is taken, delete the segmented control from the main list surface.

      Decide based on how commonly users change sort. If rarely, kebab is fine. If frequently, keep the visible segmented control but fix the styling.

      My read: most users sort by Due date and never change it. Move to kebab. Remove the segmented control from the list.
    status: pending

  - id: onboarding-empty-states-copy
    content: |
      Audit all empty states and onboarding copy for voice consistency.

      Find all components rendering empty states. Check:
      - Home (first-run, no incomes or commitments)
      - Commitments list (no commitments)
      - Incomes list (no incomes)
      - Goals list (no goals)
      - Wealth (no assets)
      - Timeline (no events)
      - Ask (no conversation yet)
      - Spend (no imports)

      Voice check per the brief:
      - Calm declarative, not excited
      - Sentence case, never title case or ALL CAPS
      - No exclamation marks
      - No "let's get started!" or "welcome!" patterns
      - Australian English, not American

      Examples of correct empty-state copy:
      - Home: "Add your income first. Then add the commitments that live below the waterline."
      - Commitments: "Your recurring bills and subscriptions go here. Tap + to add your first one."
      - Goals: "Savings goals help you picture the future. Add one to start tracking."
      - Timeline: "Your timeline will fill in as you add income and commitments."
      - Ask: "Ask about your money. Questions like 'how much do I have' or 'can I afford X by Y'."

      Replace any that don't match this tone. Keep empty states short — 1-2 sentences maximum. If a longer explanation is warranted, link to a help article rather than pack the empty state with text.

      For onboarding flows (first-run tutorial, guided add-your-first-income, etc.): same voice rules, plus maintain the calm pace. Don't rush users. Allow skipping at every step.
    status: pending

  - id: favicon-and-app-icons
    content: |
      Verify favicon and app icon files are present and correct.

      Required files in `public/`:
      - `favicon.ico` (32x32 minimum, multi-size ideal)
      - `apple-touch-icon.png` (180x180, uses the real keel fin icon)
      - `icon-192.png`, `icon-512.png` for PWA
      - `manifest.json` with correct app name, theme color, icons list

      Verify:
      - favicon.ico uses the Keel icon (keel fin + waterline), not a placeholder
      - apple-touch-icon is the correct production icon (not the droplet version Claude Design initially produced)
      - manifest.json has `"name": "Keel"`, `"theme_color": "#0e1412"`, `"background_color": "#0e1412"`
      - Opengraph meta tags: title "Keel", description "...", image pointing to a 1200x630 social preview

      Meta tags in `src/app/layout.tsx`:
      ```tsx
      export const metadata = {
        title: 'Keel',
        description: 'Obligation-first personal budgeting. See what\'s yours to spend.',
        themeColor: '#0e1412',
        openGraph: {
          title: 'Keel',
          description: 'Obligation-first personal budgeting.',
          images: ['/og-image.png'],
        },
      };
      ```

      Generate the OG image: 1200x630 PNG with the Keel wordmark centered on the deep tide background. Use the real wordmark from the Claude Design iteration.

      Test sharing the URL on a few platforms (WhatsApp, Twitter, SMS, iMessage, Slack) to verify the preview renders correctly.
    status: pending

  - id: error-and-404-pages
    content: |
      Design custom 404 and error pages. Currently Next.js uses default styling that looks nothing like Keel.

      Create `src/app/not-found.tsx`:
      ```tsx
      export default function NotFound() {
        return (
          <div className="not-found-container">
            <div className="not-found-content">
              <h1>This page doesn't exist.</h1>
              <p>The URL may be mistyped or the page may have moved.</p>
              <Link href="/">Take me home</Link>
            </div>
          </div>
        );
      }
      ```

      Styling:
      - Full viewport, centered content
      - Keel wordmark at top (small, 40px high)
      - Heading: 24px weight 500 `--keel-ink`
      - Paragraph: 14px `--keel-ink-3`
      - Link: sea-green button, "Take me home" → `/`
      - Background: same tide as app

      Create `src/app/error.tsx` for runtime errors:
      ```tsx
      'use client';
      
      export default function Error({ error, reset }) {
        return (
          <div className="error-container">
            <h1>Something went wrong.</h1>
            <p>We've logged the issue. Try again in a moment.</p>
            <button onClick={reset}>Try again</button>
          </div>
        );
      }
      ```

      Log errors to Sentry or your error tracker. Never show raw error messages to users — they're scary and unhelpful.
    status: pending

  - id: responsive-and-tablet-audit
    content: |
      Audit the app on tablet-width viewports (768px to 1024px).

      The app is primarily mobile. But users occasionally open it on iPad or in a resized browser window. Current state: likely just stretched mobile layout, which works but looks amateur.

      Minimum bar for tablet:
      - Content max-width: 520px centered on screens >768px
      - Visible chrome around the centered content: `--keel-tide-2` background extends to screen edges
      - Tab bar: either stays pinned to bottom or moves to the left as a vertical rail (rail is aspirational — pinned bottom is fine for launch)
      - Sheets: don't stretch to full width on tablet, cap at 520px centered
      - Charts: don't expand to 1200px viewport width — stay readable at 520px

      If content stretches full-width on tablet (which is probably the current state), add a centering wrapper in `layout.tsx`:
      ```tsx
      <main className="max-w-[520px] mx-auto">{children}</main>
      ```

      Also check: does the app work on desktop at 1440px wide? Not for daily use, but for demos and investor pitches — make sure the centered content isn't hilariously small with vast empty gutters.

      If concerning, add a subtle "Keel works best on mobile" toast on desktop views, with a QR code to download or open on phone. (Optional — low priority.)
    status: pending

  - id: accessibility-audit
    content: |
      Run an accessibility audit. Use tools like axe DevTools, Lighthouse accessibility score, or manual screen-reader testing.

      Check:
      - All interactive elements keyboard-navigable (Tab, Enter, Escape)
      - Focus visible on all focusable elements (visible outline, not just color change)
      - ARIA labels on icon-only buttons (kebab, close, edit, etc.)
      - Form fields labeled
      - Error messages associated with their fields via aria-describedby
      - Color contrast meets WCAG AA (cream on tide should pass at 4.5:1)
      - Images have alt text (empty alt for decorative)
      - Charts have text alternatives (aria-label describing the trajectory)
      - Focus traps in sheets work correctly
      - prefers-reduced-motion respected everywhere

      Target: Lighthouse accessibility score >=95. Fix any failures.

      Known gotchas in this design:
      - Glass surfaces with low contrast: verify cream text on tide glass is still readable
      - Gesture-only interactions: every gesture needs a non-gesture alternative (scrub via button or keyboard)
      - Motion-heavy components (Timeline chart): ensure reduced-motion fallback is functional

      Document any known accessibility gaps with tickets for post-launch fixes.
    status: pending

  - id: copy-audit-global
    content: |
      Global pass on all user-facing copy.

      Check for:
      - Inconsistent capitalization ("Available money" vs "Available Money" — pick one, use everywhere)
      - Inconsistent terminology (Commitment vs Bill — already audited in Commitments Rebuild PR)
      - Typos
      - Americanisms ("color" vs "colour", "favorite" vs "favourite") — default to Australian English
      - Pronoun consistency ("your money" vs "my money" — use "your")
      - Abbreviation consistency ("$5,000" vs "$5k" — prefer full for precision, short in compact UI)
      - Currency symbol: always "$" and AUD context (launching AU-first)

      Specifically audit:
      - Button labels
      - Section headers
      - Empty states
      - Error messages
      - Tooltips
      - Settings labels
      - Menu items

      Run the copy past Soph for a gut check — "does this sound like something a person would say?"

      Don't agonize over every word. Catch the jarring ones.
    status: pending

  - id: final-verification
    content: |
      Pre-launch verification checklist:

      - [ ] `npm run lint` passes
      - [ ] `npm run build` produces production bundle
      - [ ] `npm test` passes
      - [ ] Lighthouse performance >=85 on mobile
      - [ ] Lighthouse accessibility >=95
      - [ ] Lighthouse SEO >=90
      - [ ] Lighthouse best practices >=95
      - [ ] Manual smoke test: can a brand-new user onboard and see their first projection?
      - [ ] Manual smoke test: can they add a commitment via Capture and see it on Timeline?
      - [ ] Manual smoke test: can they skip a payment and see the effect?
      - [ ] Manual smoke test: can they see their available money with correct math?
      - [ ] No console errors on any page during typical flow
      - [ ] No 404s on any asset (check Network tab)
      - [ ] favicon, app icon, OG image all correct
      - [ ] Error tracking configured (Sentry or equivalent)
      - [ ] Analytics configured (PostHog or equivalent)
      - [ ] Preview deployment tested on real iPhone
      - [ ] Preview deployment tested on real Android
      - [ ] Partner (Soph) has tested the app end-to-end
      - [ ] No red anywhere (grep confirms)
      - [ ] No "bill" in user-facing text (grep confirms, commitment vocabulary consistent)
      - [ ] No orange or amber-as-primary (grep confirms, amber only for attention states)
      - [ ] Launch comms written (email to waitlist, launch tweet, landing page hero)
      - [ ] Support email configured (or at least a way for users to contact you)
      - [ ] Pricing / free tier clear (even if launching free, communicate the plan)

      If all items check, you're ready to launch.

      If any item fails, triage: is it launch-blocking, or can it be a day-1 patch?

      Nothing launches perfectly. Ship when the essential thesis is intact, the core flows work, and the remaining work is polish rather than fundamentals.
    status: pending

isProject: false
---

# Launch Polish — the plan

## What this PR lands

Every UX audit item not captured elsewhere, plus launch-readiness essentials (icons, meta tags, error pages, accessibility). Not glamorous, but the difference between "launch-ready" and "obvious launch day embarrassments."

## Why bundled

These items are individually small but collectively important. Separating into 10 tiny PRs creates review overhead without value. One polish sprint before launch, one reviewable PR, one commit point for "everything else we need to fix."

## Dependencies

**All other PRs should land before this one.** This is the last polish pass. Dependencies:
- Pre-Launch Sprint PR (Home polish, date formatting, archive-not-delete foundations)
- Timeline Foundation + Rebuild PRs (Timeline is the hero feature)
- Commitments Rebuild PR (browse screen polish, primitives)
- Unified Edit Sheet PR (edit flows consistent)
- Avatar Menu + Settings PR (nav surfaces polish)
- Income Skip PR (feature completeness)
- Ask Keel Phase 1 PR (minimum Ask functionality)
- Ask Keel Phase 2 PR (if time permits; otherwise stub answers from Phase 1 are sufficient for launch)

## When to ship this

The week before launch. After everything else is in, before beta starts. Leaves room for bug triage from beta feedback.

## Scope management

Nothing in this PR is load-bearing. Every item could theoretically be cut or deferred. Use that:
- If time is short, cut the tablet/desktop audit (launch is mobile-first)
- If time is really short, cut the goal detail screen (Home + Goals list are enough for v1)
- If time is catastrophically short, ship with default Next.js 404 and fix it day 2

Don't let polish perfection block launch. The product is the Waterline thesis + accurate projections + honest UX. Everything else is a round-up.

## What this PR does NOT include

- **New features.** This is polish only, no new functionality.
- **Marketing site / landing page.** Separate project.
- **Docs / help content.** Would be nice, not required for launch.
- **Pricing page / paid plans.** If launching free, deferred. If launching paid, that's its own significant work.
- **Admin tooling.** Deferred until support volume demands it.

## After this PR merges

You're ready to launch. Do a final walk-through with Soph. Sleep on it. Announce when calm and ready.

Good luck.
