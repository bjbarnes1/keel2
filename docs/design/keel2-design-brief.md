# Keel2 — Design Brief

> Companion document to the mockups produced in the April 2026 design session. This is the source of truth for tokens, components, and design behaviour. Hand this plus the screenshots to any AI tool, designer, or collaborator to produce consistent output.

---

## How to use this brief

- **The screenshots are authoritative for layout.** Don't re-design what's already mocked.
- **This brief is authoritative for rules** — tokens, naming, voice, anti-patterns.
- **Start your build** by pasting the CSS variable block at the end into `globals.css` and the Tailwind snippet into `tailwind.config.ts`. Everything else derives from those.
- **If you find yourself making a design decision this brief doesn't cover**, that decision probably deserves a note back into this document. Keel's consistency is its craft.

---

## 1. Product thesis (120 words)

Keel is money that speaks your life. It's an obligation-first budgeting app built on one insight: most people don't feel broke because they've spent too much — they feel broke because their money hasn't been held back for what's coming. Keel holds it for you. Commitments, goals, and wealth sit beneath a single waterline; above the line is what's genuinely yours to spend today. You add things by talking to it, not by filling forms. You ask it questions and it answers in one line and one picture. When an asset runs up, it notices and suggests sending some to a goal — showing you the goal jump two months closer before you commit. One metaphor, one accent colour, one calm voice.

---

## 2. Core principles

1. **Obligation-first.** Money is held for commitments before it's considered spendable. The product's primary job is to reveal what's *genuinely* available — not what your bank says is available.
2. **AI as calm helper.** The AI speaks the language of the user's life, not of finance. It's never a chatbot in a corner — it's woven into every surface.
3. **No forms.** Capture is conversational. Any time the app would otherwise ask for structured input, it reads a sentence and proposes a glass card the user confirms.
4. **One metaphor, everywhere.** The Waterline scales from Home (one fortnight) to Timeline (six weeks) to Goals (forward projection) to Ask (inline answer). Same visual grammar, different pressures.
5. **Red is banned for losses.** Amber for attention, gray for decline, sea-green for safe. Red is reserved for true emergencies — and we currently ship zero.
6. **Peak-end on every flow.** Every flow ends on a positive signal. Onboarding ends with "Yours to spend $2,340." Goal drill-in ends with "lands Aug 20." Take-some-off ends with "two months early."
7. **Sentence case everywhere.** Labels, headlines, buttons. The only exception is small uppercase category markers at 11px with 0.16em tracking.
8. **iOS 26 native.** Liquid Glass is embraced where it earns its place — floating controls, capture cards, tab bar. Concentric corner radii throughout. Don't fight the platform.

---

## 3. Colour system

Dark mode is the default and primary. A light mode can be added later but is not on the critical path — the warm-slate palette is part of the product's signature.

### Raw palette

| Token | Hex | Use |
|---|---|---|
| `--keel-tide` | `#0e1412` | Primary background — deep warm slate |
| `--keel-tide-2` | `#141a17` | Elevated surface (non-glass) |
| `--keel-ink` | `#f0ebdc` | Primary text — warm cream (never pure white) |
| `--keel-ink-2` | `#d4cfbf` | Secondary text |
| `--keel-ink-3` | `#a8ac9f` | Tertiary text, metadata |
| `--keel-ink-4` | `#8a8f88` | Quaternary text, hints |
| `--keel-ink-5` | `#5f645e` | Deep muted — uppercase section labels |
| `--keel-safe` | `#6bb391` | Primary accent — sea-green, used for "on track" / "safe" / positive |
| `--keel-safe-soft` | `#a8d7bd` | Soft sea-green — text on tinted glass, highlights |
| `--keel-safe-faint` | `#a8c9b6` | Faintest sea-green — muted positive commentary |
| `--keel-attend` | `#d4a55c` | Warm amber — used for attention, needs-a-look, slightly stale data |
| `--keel-btc` | `#d4a55c` | Bitcoin identity — same amber (semantic coincidence) |
| `--keel-eth` | `#9f97e8` | Ethereum identity — soft purple |
| `--keel-stock` | `#7fb5e8` | Traditional equity identity — muted blue |

### Semantic mapping

| Semantic | Raw token |
|---|---|
| `--color-bg-primary` | `--keel-tide` |
| `--color-bg-elevated` | `--keel-tide-2` |
| `--color-text-primary` | `--keel-ink` |
| `--color-text-secondary` | `--keel-ink-2` |
| `--color-text-tertiary` | `--keel-ink-3` |
| `--color-text-quaternary` | `--keel-ink-4` |
| `--color-label` | `--keel-ink-5` |
| `--color-accent` | `--keel-safe` |
| `--color-accent-soft` | `--keel-safe-soft` |
| `--color-positive` | `--keel-safe` |
| `--color-attention` | `--keel-attend` |
| `--color-negative` | `--keel-ink-3` *(deliberately muted — never red)* |

### Rules

- **Never use pure white.** All "white" text is `--keel-ink` (#f0ebdc). The warmth is non-negotiable — it separates Keel from every cold dashboard aesthetic.
- **Never use pure black.** Background is `--keel-tide`, which has a subtle warm tint.
- **Gains are shown in soft green; losses are shown in neutral gray, not red.** This is a deliberate violation of every trading app convention and is Keel's single most distinguishing visual decision.
- **Amber is reserved for attention.** Use it when data is stale, holding is incomplete, or the user should look at something. Never use amber for negative movement in markets — that's gray.
- **Semantic colours carry meaning, not decoration.** If a piece of text is green, it means "safe" or "positive." If something is amber, it means "needs a look." Don't tint things for visual interest.

---

## 4. Typography

### Font family

| Role | Stack |
|---|---|
| Primary | `"SF Pro Text", -apple-system, BlinkMacSystemFont, "Inter", system-ui, sans-serif` |
| Numerics | Same family, with `font-variant-numeric: tabular-nums` on all dollar amounts |

Do not introduce a serif. Do not use a display font. The system sans at different weights and sizes does all the work.

### Scale

| Role | Size | Weight | Tracking | Notes |
|---|---|---|---|---|
| Hero numeric | 60–68px | 500 | `-0.035em` | The big "Available Money" / "Your position" number |
| Detail hero | 38–44px | 500 | `-0.03em` | Commitment, Goal, Wealth detail screen heroes |
| Screen title | 22–32px | 500 | `-0.025em` | Page headlines ("Wealth", "Let's set your keel") |
| Section header | 16px | 500 | `-0.01em` | Card titles, row headings |
| Body | 14px | 400 | normal | Default body copy, transaction rows |
| Body-secondary | 13px | 400 | normal | Supporting copy, button labels |
| Meta | 12px | 400 | normal | Secondary metadata, timestamps |
| Hint | 11px | 400 | normal | Tertiary hints, tiny labels |
| Section label (uppercase) | 11px | 500 | `0.16em` | Category markers — the *only* place we use uppercase |
| Tick label (uppercase) | 8–9px | 500 | `0.1–0.18em` | Chart axis labels, date separators |

### Rules

- **Only two weights: 400 regular and 500 medium.** Never 600 or 700 — they feel heavy against the warm palette.
- **Tabular numerics everywhere dollars appear.** `font-variant-numeric: tabular-nums`. This is a hard rule — non-tabular dollar amounts look amateur.
- **Letter-spacing tightens with size.** Headlines get negative tracking; body stays at normal; uppercase labels get positive tracking.
- **No italic.** If you're tempted to italicise for emphasis, use colour or weight instead.

---

## 5. Spacing and radii

### Spacing scale

Base unit: **4px.** Everything is a multiple.

| Token | Value | Use |
|---|---|---|
| `--space-1` | 4px | Icon gap, tight pairing |
| `--space-2` | 8px | Component internal gap |
| `--space-3` | 12px | Card internal rhythm |
| `--space-4` | 16px | Standard card padding |
| `--space-5` | 20px | Screen horizontal padding |
| `--space-6` | 24px | Section gap |
| `--space-7` | 28px | Screen padding (comfortable) |
| `--space-8` | 32px | Major section separation |
| `--space-10` | 40px | Hero separation |

### Corner radii (concentric system)

iOS 26 concentric corners: inner radii follow the formula *parent radius minus the gap*. Stick to the scale below.

| Token | Value | Use |
|---|---|---|
| `--radius-phone` | 38px | Device frame (iPhone 16/17 approximate) |
| `--radius-xl` | 24px | Sheet grabber, hero card, swipe card |
| `--radius-lg` | 20px | Modal sheet, large glass pane |
| `--radius-md` | 18px | Standard card |
| `--radius-sm` | 16px | Button, row card |
| `--radius-xs` | 14px | Nested card, transaction row |
| `--radius-xxs` | 10px | Tight icon container |
| `--radius-pill` | 999px | Floating tab bar, glass chip, confidence chip |

### Rules

- **Concentric means parent 24 → child 18 → inner 14.** Never put a 16-radius card inside a 20-radius card — the gap will feel wrong.
- **Pills are for floating or pill-shaped controls only.** Tab bar, chips, small status markers.
- **No rounded corners on single-sided borders.** If a row has only `border-bottom`, the card it's inside should handle the radius.

---

## 6. Surface system — Liquid Glass

Five surface treatments. Don't invent a sixth.

### 1. Clear glass (default card)

```css
background: rgba(255, 255, 255, 0.035);
backdrop-filter: blur(20px);
-webkit-backdrop-filter: blur(20px);
border: 0.5px solid rgba(255, 255, 255, 0.08);
box-shadow: inset 0 0.5px 0 rgba(255, 255, 255, 0.06);
```

Use for: standard cards, transaction rows, ask bubbles, capture cards.

### 2. Heavy glass (floating controls)

```css
background: rgba(20, 26, 23, 0.55);
backdrop-filter: blur(30px) saturate(180%);
-webkit-backdrop-filter: blur(30px) saturate(180%);
border: 0.5px solid rgba(255, 255, 255, 0.12);
box-shadow: 
  inset 0 0.5px 0 rgba(255, 255, 255, 0.1),
  0 8px 30px rgba(0, 0, 0, 0.35);
```

Use for: floating tab bar, modal sheet grabbers, voice input pill.

### 3. Tinted glass (sea-green — positive)

```css
background: rgba(107, 179, 145, 0.14);
backdrop-filter: blur(20px);
-webkit-backdrop-filter: blur(20px);
border: 0.5px solid rgba(107, 179, 145, 0.22);
box-shadow: inset 0 0.5px 0 rgba(255, 255, 255, 0.08);
```

Use for: user's message bubbles in Ask, primary buttons, confirmed-state rows, destination selection in Take Some Off.

### 4. Tinted glass (amber — attention)

```css
background: rgba(212, 165, 92, 0.12);
backdrop-filter: blur(20px);
-webkit-backdrop-filter: blur(20px);
border: 0.5px solid rgba(212, 165, 92, 0.2);
```

Use for: confidence chips when flagging "needs a look", BTC identity tag, stale data markers.

### 5. Flat surface (no glass)

```css
background: rgba(0, 0, 0, 0.2);
border-radius: var(--radius-xs);
```

Use for: nested inlay cards (like the "Seen 6 times" strip inside a swipe card). The restraint of *not* glassing every surface is what makes the glass feel special where it appears.

### Rules

- **Every glass surface needs the inset top highlight.** The `inset 0 0.5px 0 rgba(255, 255, 255, 0.06)` line is what makes it feel like physical glass rather than a translucent rectangle. It's the signature detail.
- **Never use glass over a completely flat colour.** The backdrop-filter needs something to refract. Ensure the page has a soft radial gradient (see each screen in mockups) even if barely perceptible.
- **Don't double-glass.** A glass card inside a glass card dilutes the effect. Use a flat surface for the inner element.
- **Glass is used for surfaces that should feel movable, modal, or atop content.** It's *not* used for base layout elements like the page background.

---

## 7. Motion and haptics

### Timing

| Interaction | Duration | Easing |
|---|---|---|
| Micro (hover, chip selection) | 150ms | `cubic-bezier(0.4, 0, 0.2, 1)` |
| State change (toggle, select) | 250ms | `cubic-bezier(0.32, 0.72, 0, 1)` |
| Sheet present/dismiss | 350ms | `cubic-bezier(0.32, 0.72, 0, 1)` |
| Navigation push | 400ms | `cubic-bezier(0.32, 0.72, 0, 1)` |
| Waterline recalc (slider drag) | 180ms | `cubic-bezier(0.4, 0, 0.2, 1)` |
| Celebration (goal hit, import complete) | 700ms | custom spring, see below |

### Easing rules

- **No bounce in professional surfaces.** The iOS 26 "snap" curve (`0.32, 0.72, 0, 1`) is the default for state transitions.
- **Deceleration for exits.** Sheets dismiss with a deceleration curve so they feel like they're coming to rest.
- **Celebration spring only for earned moments.** Goal hit, onboarding complete. Never for routine confirmations.

### Haptics

| Event | Haptic |
|---|---|
| Swipe-accept on onboarding card | Medium tap |
| Swipe-skip on onboarding card | Light tap |
| Slider crosses a meaningful threshold | Selection |
| Primary CTA confirm | Medium tap |
| Keel noticed panel appears with insight | Light tap |
| Error / invalid input | Double gentle — never the iOS "error" alarm |

On iOS native use `UIImpactFeedbackGenerator`; on web, skip haptics entirely (the visual restraint carries).

---

## 8. The Waterline (signature element)

The single most distinguishing visual element. Every surface that represents time uses it.

### The rule
The Waterline is a horizontal axis representing time, with marks above the line for gains (income, asset rises) and marks below the line for commitments (anchors, outflows). Today is always a cream disc (`--keel-ink`) with a subtle halo. Goals and targets are always sea-green rings.

### Three scales

**1. Home (one fortnight)**
- Compact horizontal strip, ~20px tall
- Fills from left to current-day position in soft sea-green
- Upcoming commitments shown as small dots below the line
- Labels: "Apr 17" left, "May 1" right, "Day 7 of 14" below centre

**2. Timeline (six weeks, three fortnights)**
- Full-width SVG, ~160px tall
- Soft vertical dividers between fortnights (dashed, faint)
- Pay events rise above the line with amounts floating above them
- Commitments anchor below the line, with weight signalled by stroke length (mortgage deeper than phone)
- Today = cream disc; amber markers for items needing attention

**3. Goal detail (projection)**
- 2D extension: horizontal is time, vertical is amount saved
- Solid line from today's amount to projected landing point
- Dashed continuation if projection extends beyond goal
- Filled area beneath the line in soft sea-green (the rising water)
- Small dots along the projection for each fortnightly contribution

**4. Ask Keel (inline answer)**
- Mini version embedded in an AI response bubble
- Shows only today and the answer endpoint
- Used when the AI's answer is a point in time ("lands Sep 12")

**5. Take Some Off (impact preview)**
- Inside the destination card
- Shows old target date as a hollow gray dot, new target date as filled sea-green
- Emphasises the *jump* between the two

### Rules

- **Always horizontal, always left-to-right time.** Don't orient it vertically.
- **Today is always the cream disc.** This is the one constant across every rendering.
- **Never show value on the Waterline without a label.** Numbers floating without context feel like noise.
- **Don't overload it.** Three types of marks maximum at any scale: today, contributions/events above, commitments/targets below.

---

## 9. Microcopy voice

Keel speaks like a calm, knowledgeable friend — not a bank, not a startup, not a chatbot.

### Register

- **Declarative, not imperative.** "On pace for September 12" — not "Your goal will be reached September 12."
- **Hedged when uncertain.** "Looks like a regular commitment" when confident. "Not sure about this one" when less so. "Possibly quarterly — need a look" when genuinely uncertain.
- **Ownership language.** "Your keel," "your position," "your fortnight." Not "the user's" or "my" (the AI's).
- **Nautical where earned.** "Welcome aboard," "set your keel," "ballast below the waterline" — sparingly, never for its own sake.

### Do / don't table

| Institutional | Keel |
|---|---|
| "Available balance" | "Yours to spend" |
| "Insufficient funds" | "Medical buffer is empty — draw from Emergency?" |
| "Submit" | "Lock it in" / "Plan the move" / "Add to Commitments" |
| "Error processing request" | "Something went sideways — try again?" |
| "Loading…" | (Show a skeleton; no label) |
| "Continue" | "Open Keel" / "Add to Commitments" / descriptive verb |
| "Get Started" | "Add your first income" / descriptive starting action |
| "Transaction successful" | "Done — your Japan jar just grew" |
| "Category" | (Use the actual type: Commitment, Income, Goal) |
| "Net worth" | "Your position" |
| "Loss" / "Down" | Neutral number, no colour, no label |
| "Attention needed" (red) | "Insurance lands on a tight pay — spread it?" |

### Punctuation

- **Sentence case everywhere** except 11px uppercase category labels.
- **No exclamation marks.** Ever.
- **No emoji.** Ever.
- **Em dashes are fine** (—) and used for observational pauses.
- **Ellipses only for actual continuation**, never for suspense.

---

## 10. Component library

Each component listed here appears somewhere in the mockups. When in doubt, match the mockup.

### Hero number
Use: Home, Goal detail, Wealth detail, capture preview.
Format: small uppercase label (11px) + giant number (44–68px, 500) + single-line context (13–14px, secondary).

### Stat tile (3-across or 2-across)
Clear glass card. 10px uppercase label → 17–18px value (500, tabular). No border, no change indicator inside. Use for Liquid/Held/Watching, Saved/To go/Per pay.

### Glass capture card
Heavy-ish glass with saturation boost. Row-per-field with 0.5px dividers. "Auto" pills in tinted green where Keel derived the value. Primary CTA below. Secondary text-only link for "Not quite right — tell Keel more".

### Swipe review card
Clear glass, larger corner radius (24px), inset highlight and outer shadow. Structure: AI opening line → icon + subject → amount+cadence hero → evidence panel (flat inlay) → category pill + confidence chip → closing "I'll do X" line.

### AI observation row ("Keel noticed")
Small green-dot label ("KEEL NOTICED" in 11px uppercase), then a single sentence in `--keel-ink-2` with key values weighted in `--keel-safe-soft`. Max 2 sentences. Never three.

### Ask chip (suggestion)
Clear glass pill. 12px text. Used for follow-up prompts under Ask Keel answers, or proactive prompts on Home / Goal / Wealth screens.

### What-if slider
iOS-native-style. Thick track (4px) in `rgba(255,255,255,0.06)`, filled portion in `--keel-safe`, 22px round knob in `--keel-ink` with subtle inner highlight and outer shadow. Live value label above-right. Live impact sentence below ("Lands Aug 20 — three weeks sooner").

### Floating tab bar
Heavy glass, pill-shaped (999px), 7–8px padding. 5 items max. Active item gets inner glass fill and visible label; inactive items show icon only in `--keel-ink-3`. iOS 26: shrinks to icon-only on scroll.

### Event/transaction row
Date stamp left (9px uppercase day + 14px date), 0.5px vertical divider, subject + status line centre, value right. 12–14px padding. Status colour-coded: sea-green "Ready", gray "Holding", amber "Needs a look", quaternary "Scheduled".

### Sheet grabber
42×5px pill in `rgba(255,255,255,0.18)`, centred, 12px below status bar. Title centred below grabber at 15px/500 in `--keel-ink-2`. Close (X) button top-right.

### Primary button (CTA)
Tinted-green glass. 16px vertical padding, full-width. 14–15px/500 text in `#d4e6dc`. Small trailing arrow icon for forward flows.

### Secondary button (escape/alt action)
No background, no border. Text-only at 13px in `--keel-ink-4`. Used for "Not quite right", "Split across multiple?", "Skip all".

---

## 11. Screen inventory

Each screen below has: *purpose* (emotional moment), *structure* (what's on it), *key notes* (anything non-obvious).

### Home
- Purpose: "How much do I actually have right now?" — one glance, calm answer.
- Structure: Available Money hero → Waterline (current fortnight) → Next Up commitment → Closest Goal progress.
- Notes: Empty state reframes $0 as potential, not failure. See onboarding empty-state mockup.

### Timeline
- Purpose: "What's coming in the next six weeks?"
- Structure: Full-width Waterline (3 fortnights) → summary glass pane → grouped upcoming events.
- Notes: Future events fade in opacity by fortnight. Insurance row shows amber "holding $210 of $420" as the one attention state.

### Wealth
- Purpose: "What do I have? What's it doing?"
- Structure: Your Position hero → Liquid/Held/Watching tiles → Crypto section → Shares section → Watching section → Held Assets section → Keel noticed.
- Notes: No line chart at top. No pie chart anywhere. Losses shown neutral. "Your position", not "Net worth".

### Goal detail (e.g. Japan trip)
- Purpose: "Am I on track? What if I change things?"
- Structure: Title + target-date subtitle → 2D Waterline projection → Saved/To go/Per pay tiles → What if sliders → Ask chips.
- Notes: Sliders are live — Ask Keel runs the math on each frame. "Pull from Bitcoin?" chip bridges to Wealth.

### Wealth detail (e.g. Bitcoin)
- Purpose: "What's this holding doing? What's my next move?"
- Structure: Symbol + current value hero → gain chip → mini-Waterline trajectory → Acquisitions list → Keel noticed → Take Some Off CTA.
- Notes: Amber palette for BTC semantically doubles as "attention" — volatility is built into the colour.

### Ask Keel (sheet)
- Purpose: "Answer my real question about my money."
- Structure: Sheet grabber → conversation (user bubble right, AI bubble left) → answer with inline Waterline → follow-up chips → voice-first input pill.
- Notes: Mic is the primary input. Text is secondary. Never a send button for text — the AI should be reached by voice on mobile.

### Conversational capture (sheet)
- Purpose: "Add a thing without a form."
- Structure: Grabber → user message (their sentence) → "Here's what I've got" label → structured glass card with editable rows → primary CTA + "Not quite right" escape.
- Notes: Used for commitments, assets, income, watchlist items. Same pattern everywhere.

### Commitment detail (e.g. Mortgage)
- Purpose: "What's this? Am I covering it? What does it mean for the rest of my life?"
- Structure: Back affordance → title + cadence hero → Held this fortnight progress → Keel noticed (the life-context line) → upcoming schedule (3 items, fading).
- Notes: Only one AI insight. Not three. Restraint is the feature.

### Take Some Off (sheet)
- Purpose: "Move wealth into a goal and show me the impact before I commit."
- Structure: Grabber → amount slider hero (with "leaves $X" remaining) → slider → destination cards (pre-selected one expanded with impact Waterline) → Plan the move CTA.
- Notes: Destination cards carry *category-specific benefit microcopy*. Goal = "lands X". Emergency = "adds Y months cover". Mortgage = "saves $Z interest".

### Onboarding 1 — Reading
- Purpose: "Trust that Keel is actually doing the work."
- Structure: Progress indicator (2 of 3) → headline + deal-framing subtitle → live discovery checklist (green ticks for confident, amber ? for uncertain) → "Ready in a moment" footer.
- Notes: The amber "3 possibly quarterly — need a look" row is the single most important element on the screen. It's the AI admitting uncertainty.

### Onboarding 2 — Review stack
- Purpose: "Confirm what Keel found — swipe by swipe."
- Structure: Counter (4 of 12) + Skip all → progress bar → headline + gesture hint → card stack (front + 2 peek cards) → Skip/Add button pair.
- Notes: Supports both gesture and buttons. "Skip all" visible at all times as escape hatch. Front card uses heavier glass than standard.

### Onboarding 3 — Welcome aboard
- Purpose: "Deliver on the two-minute promise."
- Structure: Progress (3 of 3, fully filled) → nautical headline with user's name → summary card (4 rows, fourth tinted and weighted) → Keel noticed (proactive goal suggestion) → Open Keel primary CTA.
- Notes: The weighted fourth row ("Yours to spend $2,340") is the peak-end. Don't dilute it with more rows.

---

## 12. Interaction patterns

### Navigation model

- **Tab bar is always visible** on main surfaces (Home, Timeline, Wealth, Goals, Ask) except when a full-screen sheet is presented.
- **Sheets present from the bottom** with spring curve. Grabber + title at top. Close (X) top-right. Tap-outside dismisses.
- **Detail screens push from the right** (iOS standard). Back affordance top-left shows source screen name ("← Timeline", "← Wealth", "← Goals").
- **No deep stacks.** Maximum three levels deep: tab → detail → sheet. If you'd need a fourth, restructure.

### Gestures

- **Swipe right on onboarding card** → accept. Haptic: medium tap.
- **Swipe left on onboarding card** → skip. Haptic: light tap.
- **Pull-to-dismiss sheets** (downward drag on grabber) — iOS 26 default.
- **Long-press on a commitment / goal / holding row** → context menu (Edit, Archive, Ask about this). Deferrable to v1.1.

### Voice input (Ask Keel)

- Mic button in the floating input pill on Ask.
- Tap → pill morphs into waveform visualisation.
- Release → transcript appears in user bubble, AI starts responding.
- "Ask anything about your money…" placeholder when idle.

---

## 13. AI integration rules

### Where AI appears

1. **Ask Keel** — dedicated conversation surface, accessed via tab bar.
2. **Conversational capture** — every time a user adds anything.
3. **Keel noticed** — single-sentence observations on Home, Commitment detail, Wealth detail, Goal detail, Take Some Off.
4. **Onboarding reading** — parses statements, produces swipe cards.
5. **Projection engine** — powers the What If sliders and "lands X" microcopy throughout.

### Voice registers

| Confidence | Phrasing |
|---|---|
| High | "This is a regular commitment" / "On pace for Sep 12" |
| Moderate | "Looks like a monthly bill" / "Likely quarterly" |
| Low | "Not sure — take a look?" / "Possibly spending, not a commitment" |
| Observational | "Your BTC is up $4,200 since October — want to send some to Japan?" |

### Rules

- **AI text never exceeds 2 sentences.** If the insight needs more, it needs a drill-in, not a longer paragraph.
- **AI text always includes one weighted-green value** (a dollar figure, a date, a percentage). The green anchor is the evidence.
- **The AI proposes, the user confirms.** No AI action executes without a confirm tap. No exceptions.
- **AI voice is consistent across surfaces.** Same register, same phrasing patterns, whether in Ask or in Keel noticed.

---

## 14. Anti-patterns

Things Keel does not do. If you find yourself building one of these, stop and re-read the brief.

- **No red for losses.** Ever. Gains green, declines neutral, attention amber.
- **No forms.** Capture is always conversational. If an input screen has more than one field visible, it's wrong.
- **No line charts on primary screens.** Home and Wealth hero don't get sparklines. Detail screens may use minimal trajectory viz.
- **No pie charts.** Three tiles with numbers always beat a pie chart with labels.
- **No "Transaction successful" toasts.** State updates silently and convincingly.
- **No institutional language.** "Balance", "submit", "category", "transaction" — banned from user-facing copy.
- **No exclamation marks, no emoji.** The warmth comes from typography and colour, not punctuation.
- **No progress bars on goals.** Waterline projection always. Progress bar is fine only for a single clear state (Held this fortnight: $1,840 of $1,840).
- **No tutorials.** If a screen needs a tutorial, it needs redesign.
- **No coach marks on first-run.** The Grandma test (can a non-budgeter use it without explanation) must pass.
- **No "Continue", "Next", "Get Started" buttons.** Every button is a descriptive verb about the specific action.
- **No pure white, no pure black.** `--keel-ink` and `--keel-tide`.
- **No third accent colour.** If a screen needs blue, it's wrong.
- **No double glass.** A glass card inside a glass card. Use flat inlay for inner elements.

---

## 15. Build order (recommended)

If you're building the app from scratch, ship in this order. Each step produces a usable artifact on its own.

1. **Tokens and type system** — the `:root` CSS variables and Tailwind config. Takes a day, saves weeks.
2. **Home screen** — gets you to a live cleared-balance number.
3. **Conversational capture** — replace every form with this pattern from day one.
4. **Timeline** — unlocks the multi-period view, most of the data model falls out of this.
5. **Ask Keel (text-only first)** — wire up the Claude API for projections; add voice later.
6. **Onboarding import** — the story that lets you market the app.
7. **Goal detail + What if sliders** — the delight moment.
8. **Wealth + Take Some Off** — v1.1. New data pipeline (market prices, asset valuations). Ship after core is solid.

---

## Appendix A — CSS variables block (copy-paste)

```css
:root {
  /* Surfaces */
  --keel-tide: #0e1412;
  --keel-tide-2: #141a17;

  /* Text */
  --keel-ink: #f0ebdc;
  --keel-ink-2: #d4cfbf;
  --keel-ink-3: #a8ac9f;
  --keel-ink-4: #8a8f88;
  --keel-ink-5: #5f645e;

  /* Accents */
  --keel-safe: #6bb391;
  --keel-safe-soft: #a8d7bd;
  --keel-safe-faint: #a8c9b6;
  --keel-attend: #d4a55c;

  /* Asset identity */
  --keel-btc: #d4a55c;
  --keel-eth: #9f97e8;
  --keel-stock: #7fb5e8;

  /* Spacing */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-7: 28px;
  --space-8: 32px;
  --space-10: 40px;

  /* Radii */
  --radius-phone: 38px;
  --radius-xl: 24px;
  --radius-lg: 20px;
  --radius-md: 18px;
  --radius-sm: 16px;
  --radius-xs: 14px;
  --radius-xxs: 10px;
  --radius-pill: 999px;

  /* Glass presets — apply via utility classes */
  --glass-clear-bg: rgba(255, 255, 255, 0.035);
  --glass-clear-border: rgba(255, 255, 255, 0.08);
  --glass-heavy-bg: rgba(20, 26, 23, 0.55);
  --glass-heavy-border: rgba(255, 255, 255, 0.12);
  --glass-tint-safe-bg: rgba(107, 179, 145, 0.14);
  --glass-tint-safe-border: rgba(107, 179, 145, 0.22);
  --glass-tint-attend-bg: rgba(212, 165, 92, 0.12);
  --glass-tint-attend-border: rgba(212, 165, 92, 0.2);
  --glass-inset-highlight: inset 0 0.5px 0 rgba(255, 255, 255, 0.06);
  --glass-inset-highlight-heavy: inset 0 0.5px 0 rgba(255, 255, 255, 0.1);

  /* Motion */
  --ease-micro: cubic-bezier(0.4, 0, 0.2, 1);
  --ease-snap: cubic-bezier(0.32, 0.72, 0, 1);
  --dur-micro: 150ms;
  --dur-state: 250ms;
  --dur-sheet: 350ms;
  --dur-nav: 400ms;
}
```

## Appendix B — Tailwind config snippet

```ts
// tailwind.config.ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        tide: { DEFAULT: '#0e1412', 2: '#141a17' },
        ink: {
          DEFAULT: '#f0ebdc',
          2: '#d4cfbf',
          3: '#a8ac9f',
          4: '#8a8f88',
          5: '#5f645e',
        },
        safe: {
          DEFAULT: '#6bb391',
          soft: '#a8d7bd',
          faint: '#a8c9b6',
        },
        attend: '#d4a55c',
        btc: '#d4a55c',
        eth: '#9f97e8',
        stock: '#7fb5e8',
      },
      fontFamily: {
        sans: [
          '"SF Pro Text"',
          '-apple-system',
          'BlinkMacSystemFont',
          'Inter',
          'system-ui',
          'sans-serif',
        ],
      },
      borderRadius: {
        phone: '38px',
        xl: '24px',
        lg: '20px',
        md: '18px',
        sm: '16px',
        xs: '14px',
        xxs: '10px',
      },
      spacing: {
        '1.5': '6px',
        '7': '28px',
      },
      transitionTimingFunction: {
        snap: 'cubic-bezier(0.32, 0.72, 0, 1)',
        micro: 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
      transitionDuration: {
        150: '150ms',
        250: '250ms',
        350: '350ms',
      },
    },
  },
};

export default config;
```

## Appendix C — Glass utility classes (copy-paste)

```css
.glass-clear {
  background: var(--glass-clear-bg);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 0.5px solid var(--glass-clear-border);
  box-shadow: var(--glass-inset-highlight);
}

.glass-heavy {
  background: var(--glass-heavy-bg);
  backdrop-filter: blur(30px) saturate(180%);
  -webkit-backdrop-filter: blur(30px) saturate(180%);
  border: 0.5px solid var(--glass-heavy-border);
  box-shadow:
    var(--glass-inset-highlight-heavy),
    0 8px 30px rgba(0, 0, 0, 0.35);
}

.glass-tint-safe {
  background: var(--glass-tint-safe-bg);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 0.5px solid var(--glass-tint-safe-border);
  box-shadow: inset 0 0.5px 0 rgba(255, 255, 255, 0.08);
}

.glass-tint-attend {
  background: var(--glass-tint-attend-bg);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 0.5px solid var(--glass-tint-attend-border);
}

.inlay-flat {
  background: rgba(0, 0, 0, 0.2);
  border-radius: var(--radius-xs);
}
```

---

## Surface density: Home upcoming vs Timeline legend

The **same scheduled events** may render with **different density** on Home and on Timeline by design:

- **Home** uses richer **upcoming payment cards** (e.g. inline running balance, direction cues). Home is the calm “today + next few beats” surface; a bit more detail per row is appropriate.
- **Timeline** uses **denser legend rows** so users can scan many events along the waterline without vertical sprawl.

Do not force pixel-identical row chrome across both surfaces. Do keep **voice, tokens, and typography scale** aligned so it still feels like one product.

---

## Changelog

- **v1.1** — Apr 2026. Documented deliberate **Home vs Timeline** row density (richer upcoming cards on Home; denser legend on Timeline).
- **v1.0** — Apr 2026. Initial brief produced alongside the Keel2 redesign mockup set. Covers Home, Timeline, Wealth, Goals, Ask Keel, Conversational capture, Commitment/Wealth/Goal detail, Take Some Off, Onboarding. Dark mode only. Light mode deferred.
