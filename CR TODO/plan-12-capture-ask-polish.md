---
name: Capture and Ask experience polish — reducing friction across the AI-facing surfaces
overview: Tighten the three AI-adjacent surfaces (Ask, Capture, Edit commitment sheet) after initial testing revealed decision-heavy and jarring moments. Refactors Capture to feel like a receipt-confirm flow rather than a seven-field form. Removes the confusing "Stream short answers" checkbox and makes streaming an internal decision based on intent. Fixes the native-select dropdown styling in the Edit commitment sheet and duplicate Category label. Improves Ask's empty-data handling so it fails gracefully without three stacked disclaimers. Addresses the capture-sentence-routed-to-Ask collision so any classified-as-capture input in Ask is seamlessly routed to the Capture flow, regardless of streaming preference.
todos:
  - id: capture-layout-as-receipt
    content: |
      Rebuild the Capture preview layout to feel like a receipt being confirmed, not a form to complete.
      
      Current problem: after the user types their sentence and hits Capture, the parsed output shows as editable form fields (Name, Amount, Frequency, Next due, Category) plus action controls (Pick existing, Per-pay reserve, Add to Commitments, Not quite right). Seven interactive regions for what should be a confirm-or-correct decision.
      
      New structure:
      
      After parsing, show the parsed commitment as a read-only summary card. Example:
      
      ```
      [card]
        Here's what I heard
        
        Coffee Club           $12.50 every fortnight
        Starts Friday 1 May   Subscriptions · new category
        
        Per-pay reserve: $12.50 auto
      [/card]
      
      [primary button] Add to commitments [/primary button]
      [secondary link] Not quite right — tell me more [/secondary link]
      [tertiary link]  Edit fields manually [/tertiary link]
      ```
      
      The fields are rendered as typography, not inputs. Labels are muted, values are primary. The "Edit fields manually" link is an escape hatch that opens the form layout (for users who want to tweak) but is NOT the default.
      
      Rules:
      - Currency formatted with two decimal places ($12.50 not $12.5)
      - Dates formatted human-readable ("Friday 1 May", not "2026-05-01")
      - Category shown as pill if existing, or "Subscriptions · new category" if it's proposing a new one
      - "Auto" per-pay reserve is surfaced but not prominent — a muted subtitle, not a chip
      - Primary action is "Add to commitments" and it's visually dominant
      - The manual-edit escape hatch exists but is tertiary — small text link below
      
      This flip from form to receipt reduces the interactive surface from ~7 fields to 1 primary decision (Add or don't) with 2 escape hatches. Matches the mental model of "I typed a sentence, show me what you got, let me confirm."
      
      The underlying data and validation stay identical. This is purely a visual refactor of how the parsed output is presented.
    status: pending

  - id: remove-streaming-checkbox
    content: |
      Remove the "Stream short answers" checkbox from the Ask UI entirely. Streaming is an internal decision, not a user-facing preference.
      
      Reasoning: users don't know whether they want streaming. The checkbox exposes an implementation detail (how the response comes back) that's meaningless without understanding the implementation. It also creates a failure mode where users type a capture-shaped sentence, streaming is on, and the system says "streaming is for quick questions" instead of handling it gracefully.
      
      Replacement logic: streaming is determined by intent.
      - Intent = answer (quick question) → stream
      - Intent = scenario_whatif (complex projection) → no stream
      - Intent = capture (creating a commitment/income/goal) → no stream, route to Capture
      - Intent = out_of_scope → no stream, return refusal
      
      No user-facing control. The user types their question, the right mode kicks in automatically.
      
      Remove the checkbox from `ask-keel-panel.tsx`. Remove any code that conditionally branches on the user's streaming preference. The streaming decision moves into the route handler based on classified intent.
      
      If some users genuinely want to force a non-streaming mode (for debugging or preference), that can live in Settings under an "Advanced" section later. It does NOT belong at the top of the primary AI surface.
    status: pending

  - id: ask-capture-routing
    content: |
      When a user types a capture-shaped sentence in Ask, the system should seamlessly route to the Capture flow — not fail, not say "this is for quick questions," not require the user to navigate manually.
      
      The classifier already supports this (intent = capture). This todo wires the UI to route correctly.
      
      Flow when classifier returns `capture`:
      1. Ask UI shows a brief transition message in an AI bubble: "Got it — let me capture that." (1-2 seconds)
      2. Route to the Capture sheet with the parsed fields pre-populated
      3. The Capture sheet opens with the user's original sentence visible at top as "You said: '...'" in muted text
      4. The parsed receipt shows below (using the new receipt-style layout from the previous todo)
      5. User taps "Add to commitments" and lands in commitments with a confirmation toast
      6. Ask UI, if still open, shows a follow-up AI bubble: "Added Coffee Club to your commitments. Anything else?"
      
      No "streaming is for quick questions" error. No dead-end. No user-visible failure.
      
      If the classifier returns capture but parsing fails (LLM returned malformed output, required fields missing), show an Ask bubble: "I understood you want to add something, but I couldn't pull out the details. Try rephrasing, or use Capture directly [link]."
      
      This treats Ask as a universal input surface that dispatches to the right underlying flow. Users don't need to know whether "adding a commitment" is Ask or Capture — they just describe what they want.
    status: pending

  - id: edit-sheet-category-dropdown
    content: |
      Replace the native `<select>` dropdown in the Edit commitment sheet with a custom Keel-styled dropdown.
      
      Current problem: the category dropdown opens as a native browser select, which renders with iOS-default blue highlight, gray system fonts, and no Keel styling. The jarring visual break undermines the whole sheet.
      
      Replacement: custom dropdown component `<KeelSelect>` that:
      - Trigger looks identical to current select button (glass-heavy background, 0.5px border, cream text)
      - On tap, opens a sheet-style popover anchored below the trigger
      - Popover background: `rgba(20, 26, 23, 0.92)` + `backdrop-filter: blur(30px) saturate(180%)`
      - Popover border: 0.5px solid `rgba(240, 235, 220, 0.08)`
      - Each option: 44px tap target, cream text, hover/active state with 4% opacity fill
      - Selected option: subtle sea-green left border (2px) or check icon in `--keel-safe-soft`
      - Popover dismisses on outside tap, option tap, or escape
      
      Accessibility: must be keyboard navigable (arrow keys to move through options, Enter to select, Escape to close).
      
      On mobile, if screen real estate is tight, the popover can become a bottom sheet instead of an inline dropdown. Use the existing `<GlassSheet>` primitive with a list of selectable options.
      
      Consumers to update: Edit commitment sheet (Category, Subcategory, Frequency), Edit income sheet (Frequency), Capture sheet (Category), any other native selects in the app. Grep for `<select>` and replace with `<KeelSelect>`.
    status: pending

  - id: edit-sheet-duplicate-category-label
    content: |
      Remove the duplicated "Category" label in the Edit commitment sheet.
      
      Current state (per screenshot): the sheet has a section header "Category" and inside that section a field labeled "Category" followed by the dropdown. Two "Category" labels stacked.
      
      Fix: remove the inner field label. The section header alone is sufficient context. If the section contains both Category AND Subcategory, label them inline ("Category" / "Subcategory") but don't wrap a single field with a redundant outer header.
      
      While auditing this sheet, check other sections for the same pattern. "Funding" section, "Primary" section — verify no section has a single inner field with the same label as its section header.
    status: pending

  - id: ask-empty-data-handling
    content: |
      Improve Ask's handling of questions that require data the user doesn't have yet.
      
      Current problem: user asks "how much am I spending on Health" and gets three stacked disclaimers:
      1. "I'm having trouble matching that to your data."
      2. "Try rephrasing, or check Timeline for the exact figures."
      3. "Low confidence — double-check in Timeline."
      4. "Something didn't line up with your snapshot."
      
      Four different messages saying "I couldn't answer." Reads as broken.
      
      The real answer depends on *why* it failed:
      
      **If user has no spend data yet (no transactions imported):** 
      Response should be: "I don't have your spend history yet. Once you import transactions — from Settings → Spend — I'll be able to tell you how you're tracking against each category." Single message, forward-pointing, clear next step.
      
      **If user has spend data but the category has no transactions:**
      Response should be: "You haven't spent anything tagged Health in the period I can see. If you've spent on Health through another category, it would show up there instead."
      
      **If user has spend data and the category has transactions:**
      Actually answer the question.
      
      The classifier or the Ask route needs to check data availability before constructing the answer. If the snapshot reveals no transactions exist, that's a clean "here's why I can't help and here's what to do" response. If transactions exist but none in the queried category, that's also clean.
      
      Never stack multiple disclaimers. One message, one explanation, one next step.
    status: pending

  - id: capture-currency-and-date-formatting
    content: |
      Apply consistent currency and date formatting across all Capture output.
      
      Current violations (per screenshot): 
      - "$12.5" should be "$12.50" (two decimal places mandatory for currency)
      - "2026-05-01" should be "Fri 1 May" or similar human format
      - "fortnightly" should match the app's casing convention ("Fortnightly" if that's how the existing frequency pill renders)
      
      Use the `formatDate(date, format)` utility from the Pre-Launch Sprint PR and the currency formatter (should exist, probably `formatAud(cents)` — verify).
      
      Audit locations: Capture preview card, Capture form inputs (date picker displays formatted date above the raw input), Ask capture confirmation bubbles, Edit sheets, any other surface that displays user-input dates or amounts.
      
      Rule: no raw ISO dates or unformatted decimals reach the rendered UI. Pickers and inputs may use ISO internally, but the display is always human-formatted.
    status: pending

  - id: ask-capture-toggle-cleanup
    content: |
      Clean up the Ask screen's top controls.
      
      Current state (per screenshot): top-right has a "Capture" link. Top-left has "Stream short answers" checkbox.
      
      With streaming checkbox removed (earlier todo), the top-left is empty. The top-right "Capture" link remains but its role is unclear — does it open Capture? Does it switch modes?
      
      Proposed: remove the separate "Capture" link from Ask entirely. If a user wants to Capture directly, they navigate to the Capture tab (or the Avatar menu → Capture). Ask becomes a single-purpose surface: ask questions, get answers. Capture-intent inputs are routed automatically (from the routing todo) — no manual mode switch needed.
      
      The only thing that remains at the top of Ask is the screen title "Ask" and the close/avatar buttons on the right. Clean, single-purpose, no decisions to make before asking.
      
      If there's legitimate reason to keep a Capture shortcut on Ask (e.g., analytics show users navigating away constantly to reach Capture), revisit. But the default should be "Ask is for asking."
    status: pending

  - id: lint-build-test-manual
    content: |
      `npm run lint`, `npm run build`, `npm test`. All pass.
      
      Manual QA:
      
      **Capture receipt layout:**
      - Type "my gym is $80 per month"
      - Preview shows as receipt with one primary button, not a form
      - Currency renders "$80.00" not "$80"
      - Date renders human-readable
      - "Edit fields manually" link opens the form layout
      - Primary button "Add to commitments" adds the commitment
      
      **Streaming removed:**
      - Ask UI has no "Stream short answers" checkbox
      - Quick questions stream naturally (visible token-by-token text)
      - Scenario questions don't stream (arrive as structured response)
      - Capture-shaped questions route to Capture (no "streaming is for quick questions" error)
      
      **Ask → Capture routing:**
      - Type "add my Netflix $20 a month" in Ask
      - Ask shows brief "Got it — let me capture that"
      - Capture sheet opens with Netflix, $20, Monthly pre-filled
      - Confirm adds to commitments
      - Return to Ask shows "Added Netflix to your commitments"
      
      **Custom KeelSelect dropdown:**
      - Open Edit commitment sheet
      - Tap Category dropdown
      - Popover opens with Keel styling (no native iOS blue)
      - Keyboard navigation works (arrow keys, Enter, Escape)
      - Selection updates the form
      
      **Duplicate Category label:**
      - Edit commitment sheet has only one "Category" label visible per section
      
      **Ask empty data handling:**
      - User with no spend data asks "how much on Health"
      - Response is single forward-pointing message, not stacked disclaimers
      - Points to Settings → Spend as next step
      
      **Currency and date formatting:**
      - Grep diff for raw decimals like `$\d+\.\d(?!\d)` (single-decimal currency) — zero matches
      - Grep for ISO dates in JSX displayed to user — zero matches outside of `<input type="date">` values
      
      **Accessibility:**
      - All new dropdowns keyboard-accessible
      - Focus states visible
      - prefers-reduced-motion respected in new animations
    status: pending

isProject: false
---

# Capture and Ask polish — the plan

## What this PR lands

Refactors three AI-adjacent surfaces to remove clunkiness observed in early testing:

1. **Capture becomes a receipt-confirm flow** — not a seven-field form
2. **Streaming checkbox removed** — internal decision based on intent, not user-facing preference
3. **Ask routes capture-shaped inputs to Capture** — seamless handoff, no dead-ends
4. **Edit sheet styled dropdowns** — custom KeelSelect replaces native browser selects
5. **Empty data handling in Ask** — single forward-pointing message when data doesn't exist
6. **Currency and date formatting** — consistency audit

## Why bundled

All six fixes touch the same class of surface (AI-facing UI) and many overlap in files. Splitting would create merge conflicts. Bundling also lets QA validate the user experience as a coherent whole — "can a new user capture their first commitment without friction" is a single question answered by all six fixes together.

## What this PR does NOT include

- **Full Ask Keel safety implementation** — separate PR (tripwires, cost ceilings, etc.)
- **Three-layer AI context architecture** — separate PR (Plan 11)
- **Voice input** — post-launch
- **Multi-turn conversation memory** — post-launch

## Dependencies

- **Pre-Launch Sprint PR** (establishes `formatDate` utility and archive-not-delete patterns)
- **Unified Edit Sheet PR** (if this PR modifies Edit commitment sheet, it consumes the RecordEditSheet primitive from that PR — sequence accordingly)

## Risk

Low-medium. The receipt layout for Capture is the most significant behavioral change — users who've learned the current form layout will see different chrome. Mitigation: since the product hasn't launched, there are no existing users to disorient. Pre-launch is the correct time for this kind of UX evolution.

The streaming checkbox removal is a real product decision worth double-checking before shipping. Currently it's a visible control; removing it means users who had it unchecked no longer have that preference respected. If analytics later show some users genuinely needed non-streaming mode for a reason, add it back as an Advanced setting. For now, trust the intent classifier to route correctly.

## The broader observation

The clunkiness in these screens shares one root cause: **too many decisions per screen**. A clean Keel experience makes one decision at a time. Every surface should have exactly one primary action, with escape hatches available but not prominent.

Check future screens against this test: "How many things is the user being asked to decide here?" If the answer is more than one, consider whether the additional decisions can be hidden behind escape hatches (tertiary links, "advanced" disclosure, settings) rather than promoted to the primary surface.

This is the design discipline that makes Keel feel calm versus the default fintech behavior of putting everything everywhere.
