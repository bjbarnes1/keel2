---
name: Avatar Menu + Settings Polish — transparency fix, three-group structure, chevrons, duplicate route removal
overview: Fixes the avatar menu's transparency issue (text-over-text unreadability), restructures it into three semantic groups (Identity, Data, Support), hides the empty Profile screen from the menu until built, replaces "Open" buttons with chevrons across Settings, deletes the duplicate /settings/wealth route, removes Wealth from the Settings list (already in tab bar and avatar menu), and adds commitments to the avatar menu's data-management group. Small PR, purely polish, but touches surfaces users see on every session.
todos:
  - id: avatar-menu-transparency-fix
    content: |
      Fix the avatar menu's backdrop opacity. Current state: menu overlays home content at low opacity, causing "Available Money" and menu items to visually compete.

      Find `src/components/keel/avatar-menu.tsx` (or wherever the dropdown menu renders).

      Current styling (approximate — verify):
      ```css
      background: rgba(20, 26, 23, 0.6);
      backdrop-filter: blur(20px);
      ```

      Change to:
      ```css
      background: rgba(20, 26, 23, 0.92);
      backdrop-filter: blur(40px) saturate(180%);
      border: 0.5px solid rgba(240, 235, 220, 0.08);
      box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5), inset 0 0.5px 0 rgba(255, 255, 255, 0.08);
      ```

      The content underneath should be perceptually present but NOT readable through the menu. Test against the Home screen with lots of content below — menu items should be crisply readable against the glass.

      Respect `prefers-reduced-motion`: skip the blur animation on menu open, use instant opacity transition.
    status: pending

  - id: avatar-menu-three-group-structure
    content: |
      Restructure the avatar menu into three semantic groups with subtle separators.

      Current menu (from screenshots):
      ```
      ACCOUNT
      Profile
      Settings
      ───
      Commitments
      Incomes
      Assets
      ───
      Help & feedback
      ───
      Log out
      ```

      New structure:
      ```
      Identity
      ─ Settings
      ─ Profile (only if built, see next todo)
      
      Data
      ─ Commitments
      ─ Incomes
      ─ Assets (→ /wealth)
      
      Support
      ─ Help & feedback
      ─ Log out
      ```

      Group headers: 10px uppercase `--keel-ink-5`, letter-spacing 0.16em, padding 12px 16px 6px. Not clickable.

      Items within group: 14px `--keel-ink`, padding 10px 16px. Hover/press: `rgba(240, 235, 220, 0.04)` background. Icons optional — if added, 16px leading.

      Separators between groups: `0.5px solid rgba(240, 235, 220, 0.08)`, no margin.

      "Log out" in support group: destructive styling? No. Per brief, no red. Just regular item styling. The action fires a confirmation ("Log out of Keel?") via GlassSheet before executing.

      Menu width: 260px. Height: content-sized, max 70vh with internal scroll if needed.

      Position: anchored to avatar button, top-right aligned. On mobile, may need to switch to full-height side sheet on narrow viewports — leave that as a future consideration, desktop/tablet anchor for now.
    status: pending

  - id: hide-profile-until-built
    content: |
      Remove the Profile entry from the avatar menu. Currently routes to a near-empty page that says "this screen is simply not built yet."

      Changes:
      - Remove Profile from the avatar menu's Identity group
      - Keep the `/profile` route file but return a minimal placeholder (redirect to Settings or show a brief "Coming soon" card)
      - Add a TODO comment at the top of the Profile route file: "Profile screen pending design. Currently hidden from avatar menu. Restore menu entry in `avatar-menu.tsx` once content exists."

      The reasoning: exposing a menu item that leads to a dead-end confuses users and makes the product feel incomplete. Hide until there's real content.

      When content lands (avatar upload, display name, timezone preferences, notification settings), restore the menu entry.
    status: pending

  - id: settings-chevron-cleanup
    content: |
      Replace "Open" buttons with chevrons across the Settings list.

      Find `src/app/settings/page.tsx`. Current structure: rows with "Open" text button on the right.

      Changes per row:
      - Remove the "Open" text button element
      - Add a chevron icon (›, or right-arrow SVG) at the right edge
      - Icon size 16px, color `--keel-ink-4`
      - Extend the entire row's tappable area to cover icon and full row width
      - Row hover/press: `rgba(240, 235, 220, 0.04)` background

      Row structure:
      - Grid: `1fr auto`, gap 12px, padding 16px 20px
      - Main area: primary label (15px weight 500 `--keel-ink`), secondary description (13px `--keel-ink-4`)
      - Right area: chevron icon only

      Remove the "Open" label entirely — chevron carries the affordance. Standard iOS Settings pattern.

      Border between rows: `0.5px solid rgba(240, 235, 220, 0.04)`. No rounded corners per-row if using a unified card (settings as one large card with internal rows). If rows are separate cards, keep rounded corners.
    status: pending

  - id: delete-duplicate-wealth-route
    content: |
      Delete `/settings/wealth` route. Wealth already lives at `/wealth` (main tab) and is accessible via the avatar menu's Data group as "Assets".

      Changes:
      - Delete `src/app/settings/wealth/page.tsx` and any related files
      - Remove the "Wealth" entry from the Settings list
      - Delete the "Open wealth in Settings" link from the /wealth page (it's the redundancy we're eliminating)
      - Add a redirect from `/settings/wealth` → `/wealth` (301) in next.config

      Keep the Wealth data model and server actions as they are — this is purely removing a duplicate UI surface.

      Settings list entries that remain:
      - Household (members and invites)
      - Incomes (pay sources and future changes)
      - Categories (add and organize budget categories)
      - Spend (CSV import, reconcile, budget vs actual)

      The "Incomes" entry in Settings is a separate concept from the "Incomes" item in the avatar menu — Settings/Incomes is for structural settings (cadence, primary designation, future change management); avatar menu/Incomes is the browse screen. If this feels duplicative, consider also removing Incomes from Settings — but leave that call for a follow-up audit. This PR's scope is just Wealth deduplication.
    status: pending

  - id: avatar-menu-commitments-assets-labeling
    content: |
      Finalize labeling in the avatar menu's Data group.

      Current state: "Commitments", "Incomes", "Assets".

      Semantic check:
      - "Commitments" → routes to `/commitments` ✓ correct
      - "Incomes" → routes to `/incomes` ✓ correct
      - "Assets" → routes to `/wealth` ✓ but the label mismatches the route

      Decision: keep "Assets" label (it's the more accurate user-facing term for what they see — holdings, crypto, equities, property) while the route stays `/wealth` (internal convention). Users don't see the URL; they see the menu label.

      Confirm the avatar menu renders all three items with chevrons (same pattern as Settings rows), consistent row styling, and tap handlers route correctly.

      The "Wealth" tab bar label stays "Wealth" — it's one-word and scans faster than "Assets" in tight horizontal space. Tabs can afford terse labels; menu items can afford more semantic labels.
    status: pending

  - id: log-out-confirmation
    content: |
      Log out currently fires immediately on tap. Add a confirmation sheet.

      On "Log out" tap in the avatar menu:
      - Close the menu
      - Open a GlassSheet with:
        - Title: "Log out of Keel?"
        - Body: "You'll need to sign in again next time."
        - Footer: Cancel (ghost), Log out (`.glass-tint-attend`)
      - Confirm: fire existing log-out action
      - Cancel: close sheet

      Small but meaningful — prevents accidental logouts during menu exploration.
    status: pending

  - id: unit-tests
    content: |
      Extend tests as needed:

      - Avatar menu renders three groups with correct headers and items
      - Profile hidden when feature flag off (currently always off)
      - Settings list has no Wealth entry
      - Settings rows render chevrons, not "Open" buttons
      - Settings row tap navigates to correct route (not just the chevron — whole row)
      - /settings/wealth redirects to /wealth
      - Log out tap opens confirmation sheet; confirm fires action; cancel does nothing
      - Avatar menu backdrop opacity matches spec (sampling computed style)
    status: pending

  - id: lint-build-test-manual
    content: |
      `npm run lint`, `npm run build`, `npm test`. All pass.

      Manual QA:

      **Avatar menu:**
      - Tap avatar → menu opens
      - Background is readable, not showing text from Home through the menu
      - Three groups with headers: Identity, Data, Support
      - Profile item NOT present (until built)
      - Commitments, Incomes, Assets routes correctly
      - Log out opens confirmation sheet, doesn't fire immediately

      **Settings:**
      - /settings renders with chevron rows (no "Open" buttons)
      - Full row is tappable, not just the chevron
      - No Wealth entry in the list
      - Remaining entries: Household, Incomes, Categories, Spend

      **Redirects:**
      - Navigate to /settings/wealth: redirects to /wealth
      - No 404 on any old URL

      **Profile:**
      - Profile removed from avatar menu
      - /profile route file exists but isn't reachable from nav
      - Direct navigation to /profile shows a minimal placeholder (not the "simply not built yet" empty state — can show "Coming soon" briefly)

      **Log out:**
      - Tap "Log out" in avatar menu
      - Menu closes, confirmation sheet opens
      - "Log out" button confirms, fires log out action
      - "Cancel" button closes sheet

      **Accessibility:**
      - Avatar menu keyboard-navigable (Tab/Shift+Tab, Enter to activate)
      - Focus restores to avatar button when menu closes
      - Screen reader announces group headers correctly
    status: pending

isProject: false
---

# Avatar Menu + Settings Polish — the plan

## What this PR lands

Small polish PR covering multiple overlapping surfaces. Five concrete improvements:

1. Avatar menu transparency properly opaque (was bleeding-through unreadable)
2. Three-group semantic structure (Identity / Data / Support)
3. Profile hidden from menu until content exists
4. Settings rows use chevrons instead of "Open" buttons
5. Duplicate Wealth route removed

Plus two small improvements that belong here: log-out confirmation, and Settings list pruning.

## Why bundled

All five touch the same surface (menu + settings navigation). Splitting them would create multiple small PRs modifying overlapping files. Bundling ensures a single coherent "nav surfaces feel clean" commit.

## Dependencies

- **Commitments Rebuild PR** (GlassSheet primitive for log-out confirmation)
- **None from Timeline work** — independent surfaces

Can land in parallel with Timeline Foundation or after Commitments Rebuild, whichever is convenient.

## Risk

Low. UI-only changes, no schema migrations, no engine logic. Main risk is accidentally breaking menu navigation on specific browsers — worth manual testing on Safari iOS specifically.

## What this PR does NOT include

- **Full Settings redesign** — that's its own larger piece of work. This PR only does chevron cleanup and Wealth deduplication.
- **Profile screen content** — deferred until design exists
- **Tab bar changes** — separate work, revisit with usage data
- **Notification settings, preferences, theming** — all deferred to Profile-screen build later
