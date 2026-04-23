---
name: Unified Edit Sheet — RecordEditSheet primitive and consumer migration
overview: Establish a single shared edit-sheet primitive for all record types (Income, Commitment, Goal). Replaces three inconsistent edit patterns (inline form, full-screen edit, modal sheet) with one primitive consumed identically by all three entity types. Primary, secondary, and advanced field groups with progressive disclosure. Versioned edit semantics — edits apply from a user-chosen date forward, past projections preserved. Zod validation, Prisma writes, optimistic updates. Migrates Income edit (from full screen), Commitment edit (from current sheet), Goal edit (new). Retires the standalone /incomes/[id]/edit and /commitments/[id]/edit routes. Net code: significant consolidation — three edit flows collapse to one primitive plus three thin consumer shells.
todos:
  - id: record-edit-sheet-primitive
    content: |
      Create `src/components/keel/primitives/record-edit-sheet.tsx`. The shared edit-sheet primitive consumed by all record types.

      Props:
      ```typescript
      type RecordEditSheetProps<T> = {
        open: boolean;
        onClose: () => void;
        recordType: 'income' | 'commitment' | 'goal';
        record: T | null;               // null for "add" mode
        schema: ZodSchema<T>;
        sections: Array<RecordEditSection<T>>;
        onSubmit: (data: T, appliesFrom: Date) => Promise<void>;
        title?: string;                 // defaults to "Edit {recordType}" or "Add {recordType}"
      };

      type RecordEditSection<T> = {
        id: string;
        label: string;
        disclosure?: 'always' | 'progressive';  // progressive = collapsed by default
        fields: Array<RecordEditField<T>>;
      };

      type RecordEditField<T> = {
        id: keyof T;
        label: string;
        type: 'text' | 'number' | 'currency' | 'date' | 'select' | 'toggle';
        hint?: string;
        options?: Array<{ value: string; label: string }>;  // for select
        validation?: string;  // zod refinement message
      };
      ```

      Layout inside GlassSheet (from Commitments Rebuild PR):
      - GlassSheet size="tall"
      - Title: dynamic based on add/edit mode and record type
      - "Applies from (UTC date)" field at top — date picker, defaults to today, required
      - Versioning explainer box (once per sheet, collapsible):
        "Changes create a new version from the date you pick. Keel keeps using your current details until then, and doesn't rewrite how past dates were calculated."
      - Fields rendered by section:
        - Section label (CategoryGroupHeader)
        - Fields stacked vertically with 16px gap
        - Progressive-disclosure sections: chevron-expandable, collapsed by default
      - Footer: Cancel (left, ghost), Save (right, `.glass-tint-safe`)

      Field rendering:
      - Text input: 14px `--keel-ink`, glass-heavy background, border `0.5px rgba(240, 235, 220, 0.08)`, radius 10, padding 12px 14px, focus ring sea-green
      - Number/currency: same as text, tabular-nums, AUD prefix if currency, step 0.01
      - Date: native date picker, formatted display chip above in 'short-caps' format
      - Select: glass-heavy with chevron, dropdown opens inline or in nested GlassSheet on mobile
      - Toggle: pill switch, sea-green when on

      Validation:
      - Zod schema validates on submit
      - Field-level errors appear below each field in `--keel-attend` at 11px
      - Submit button disabled if any required field empty or any field invalid
      - Submit shows pending spinner for up to 2s, then either success (close sheet) or error (inline message above footer)

      Success:
      - Sheet closes with exit animation
      - Optimistic UI update via parent consumer's state management
      - Toast (if implemented): "Saved"

      Error:
      - Inline error message above footer
      - "Try again" retries, "Cancel" discards
      - Do NOT silently fail

      Sheet gestures:
      - Grab-handle drag-down-to-dismiss disabled while form is dirty (prevents accidental loss)
      - Backdrop tap with dirty form: confirm dialog "Discard changes?"
      - Escape with dirty form: same confirm dialog
    status: pending

  - id: shared-record-schemas
    content: |
      Create `src/lib/schemas/record-edit-schemas.ts`. Centralized Zod schemas and section definitions per record type, consumed by the primitive.

      Income schema:
      ```typescript
      export const incomeEditSchema = z.object({
        name: z.string().min(1).max(100),
        amountCents: z.number().int().min(1),
        frequency: z.enum(['weekly', 'fortnightly', 'monthly']),
        nextPayDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        isPrimary: z.boolean(),
      });

      export const incomeEditSections: RecordEditSection<z.infer<typeof incomeEditSchema>>[] = [
        {
          id: 'primary',
          label: 'Pay details',
          disclosure: 'always',
          fields: [
            { id: 'name', label: 'Name', type: 'text' },
            { id: 'amountCents', label: 'Amount (per pay)', type: 'currency' },
            { id: 'frequency', label: 'How often?', type: 'select', options: FREQUENCY_OPTIONS },
            { id: 'nextPayDate', label: 'Next payday', type: 'date' },
          ],
        },
        {
          id: 'advanced',
          label: 'Advanced',
          disclosure: 'progressive',
          fields: [
            { id: 'isPrimary', label: 'This is my primary income', type: 'toggle' },
          ],
        },
      ];
      ```

      Commitment schema:
      ```typescript
      export const commitmentEditSchema = z.object({
        name: z.string().min(1).max(100),
        amountCents: z.number().int().min(1),
        frequency: z.enum(['weekly', 'fortnightly', 'monthly', 'quarterly', 'annual']),
        nextDueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        fundedFromIncomeId: z.string().optional(),
        categoryId: z.string(),
        subcategoryId: z.string().optional(),
      });
      // sections similar pattern — primary (name/amount/frequency/nextDue), category (category/subcategory), funding (fundedFromIncomeId as progressive)
      ```

      Goal schema:
      ```typescript
      export const goalEditSchema = z.object({
        name: z.string().min(1).max(100),
        targetCents: z.number().int().min(0).nullable(),  // nullable = open-ended
        perPayCents: z.number().int().min(0),
        fundedFromIncomeId: z.string(),
        targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
      });
      // sections similar — primary (name/target/perPay), funding, timeline (targetDate progressive)
      ```

      Export all schemas and sections. Consumers import what they need.

      Unit tests: each schema accepts valid input, rejects invalid. Specific edge cases: negative amounts rejected, missing required fields rejected, invalid dates rejected, amountCents as string coerces correctly.
    status: pending

  - id: income-edit-consumer
    content: |
      Migrate income edit from `/incomes/[id]/edit` full-screen route to a sheet opened from `/incomes/[id]` detail page and `/incomes` list kebab.

      Create `src/components/keel/sheets/edit-income-sheet.tsx`:
      ```typescript
      'use client';
      
      import { RecordEditSheet } from '@/components/keel/primitives/record-edit-sheet';
      import { incomeEditSchema, incomeEditSections } from '@/lib/schemas/record-edit-schemas';
      import { updateIncomeVersion } from '@/app/actions/incomes';
      
      export function EditIncomeSheet({ income, open, onClose }) {
        const handleSubmit = async (data, appliesFrom) => {
          await updateIncomeVersion({ incomeId: income.id, data, appliesFrom });
          onClose();
        };
        
        return (
          <RecordEditSheet
            open={open}
            onClose={onClose}
            recordType="income"
            record={income}
            schema={incomeEditSchema}
            sections={incomeEditSections}
            onSubmit={handleSubmit}
          />
        );
      }
      ```

      Consumer 1 — `/incomes/[id]` detail page:
      - Kebab menu "Edit details" opens `<EditIncomeSheet />`
      - Replace any existing inline or route-based edit navigation

      Consumer 2 — `/incomes` list kebab:
      - Kebab "Edit" on each row opens `<EditIncomeSheet />` for that income

      Server action `updateIncomeVersion` (create in `src/app/actions/incomes.ts`):
      - Input: `{ incomeId, data (matching incomeEditSchema), appliesFrom (Date) }`
      - Creates a new `IncomeVersion` row (if that's your model pattern) OR updates the income with appliesFrom semantics
      - Preserves historical projections (past dates use the pre-edit version)
      - Revalidates relevant paths (`/incomes`, `/incomes/[id]`, `/timeline`, `/`)

      Delete the `/incomes/[id]/edit` route file entirely. Add a server redirect from `/incomes/[id]/edit` → `/incomes/[id]` in case any bookmarks exist.

      Update avatar menu and navigation links — nothing should route to the old edit path.
    status: pending

  - id: commitment-edit-consumer
    content: |
      Migrate commitment edit from the current sheet (likely `src/components/keel/commitment-edit-sheet.tsx` or similar) to consume RecordEditSheet.

      Create `src/components/keel/sheets/edit-commitment-sheet.tsx`:
      ```typescript
      // similar structure to EditIncomeSheet, with commitmentEditSchema and commitmentEditSections
      ```

      Consumers:
      - `/commitments/[id]` detail page kebab "Edit details" → opens EditCommitmentSheet
      - `/commitments` list kebab "Edit" → opens EditCommitmentSheet

      Server action: reuse or rewrite `updateCommitment` to match versioned semantics. If not versioned currently, add `appliesFrom` as an optional parameter and handle gracefully.

      Retire any old bespoke commitment edit sheet component. Delete after consumers migrated.
    status: pending

  - id: goal-edit-consumer
    content: |
      Add goal edit as a RecordEditSheet consumer. Currently goal editing may not exist as a formal flow — this establishes one.

      Create `src/components/keel/sheets/edit-goal-sheet.tsx`.

      Consumers:
      - `/goals/[id]` detail page kebab "Edit details" (route may need to be created if goal detail doesn't exist)
      - `/goals` list kebab "Edit" on each row

      Server action `updateGoal` in `src/app/actions/goals.ts`. If goals already have update logic, extend it to accept the edit sheet payload shape.

      If goal detail page doesn't exist yet, defer that creation — for now, just wire the edit sheet to open from the `/goals` list page. Goal detail page is a separate piece of work.
    status: pending

  - id: versioning-semantics-verification
    content: |
      Verify the versioning semantics work correctly across all three record types.

      Scenarios to test:

      **Income changed from $5,000/fortnightly to $5,500/fortnightly, applies from next fortnight:**
      - Past projections still use $5,000
      - Projections from appliesFrom date onward use $5,500
      - Timeline re-renders with the correct split

      **Commitment changed from $400/monthly to $450/monthly, applies from next billing cycle:**
      - Held amounts already reserved against $400 remain
      - New cycles from appliesFrom onward reserve $450
      - Historical Keel noticed observations still reference the old amount

      **Goal per-pay contribution changed from $200 to $150, applies from today:**
      - Past contributions remain logged at $200
      - Future contributions at $150
      - Sparkline on Home reflects the change going forward

      If your current schema doesn't support versioning (single row per income/commitment/goal with current values only), this todo becomes "implement versioning as a Prisma migration" — which is significantly more work than this PR's scope.

      Two paths:
      1. **Your schema supports versioning**: just verify the RecordEditSheet's appliesFrom parameter flows correctly through server actions to create new versions.
      2. **Your schema doesn't support versioning**: document this as a known limitation in the PR. The appliesFrom date is stored but applies the change immediately (no historical preservation). Add a TODO for versioning migration in a future PR.

      Flag this explicitly to the engineer implementing — versioning requires schema design, not just UI plumbing.
    status: pending

  - id: discard-confirmation-flow
    content: |
      Implement "Discard changes?" confirmation when user attempts to dismiss a dirty form.

      In RecordEditSheet, track dirty state: `dirty = !isEqual(initialValues, currentValues)`.

      On dismiss attempts (backdrop tap, escape, grab-handle drag, onClose prop):
      - If !dirty: dismiss immediately
      - If dirty: show a small confirmation inside the sheet (not a new sheet — an inline overlay):
        ```
        Discard changes?
        [Keep editing] [Discard]
        ```
      - Keep editing: closes the confirmation, sheet stays open
      - Discard: closes the sheet, no save

      Styling: confirmation overlay is a glass-heavy card centered in the sheet, with subtle backdrop dimming the form below (0.4 opacity overlay). Buttons: Keep editing (ghost), Discard (`.glass-tint-attend`).

      Accessibility: focus moves to "Keep editing" by default. Escape dismisses confirmation, keeping sheet open.
    status: pending

  - id: unit-tests-edit-sheet
    content: |
      Create `src/components/keel/primitives/record-edit-sheet.test.tsx`.

      Cases:
      - Renders with all field types correctly
      - Progressive-disclosure sections collapsed by default, expandable
      - Valid submission triggers onSubmit with correct payload
      - Invalid submission shows inline errors, does not call onSubmit
      - Applies-from date defaults to today
      - Dirty-form discard confirmation appears on dismiss attempts
      - Clean-form dismissal works without confirmation
      - Escape key handling (dismissal or discard confirmation appropriately)
      - Focus management (first field focused on open, restored on close)
      - prefers-reduced-motion: instant animations

      Use React Testing Library. Mock server actions.

      Add integration tests for each consumer (EditIncomeSheet, EditCommitmentSheet, EditGoalSheet):
      - Opens with correct data
      - Calls correct server action on submit
      - Closes on success
      - Shows error inline on failure
    status: pending

  - id: lint-build-test-manual
    content: |
      `npm run lint`, `npm run build`, `npm test`. All pass.

      Manual QA:

      **Income edit:**
      - /incomes list → kebab → Edit opens sheet with income pre-filled
      - /incomes/[id] detail → kebab → Edit opens same sheet
      - Change name, amount, frequency — save, verify changes appear on list and in Timeline projections
      - Old /incomes/[id]/edit URL redirects to /incomes/[id]
      - Full-screen edit route is gone

      **Commitment edit:**
      - /commitments list → kebab → Edit opens sheet
      - /commitments/[id] detail → kebab → Edit opens same sheet
      - Change amount, save, verify Timeline updates
      - Old /commitments/[id]/edit route deleted

      **Goal edit:**
      - /goals list → kebab → Edit opens sheet
      - Change per-pay contribution, save, verify sparkline on Home updates

      **Versioning (if supported):**
      - Edit with appliesFrom = next week
      - Timeline shows past projections with old values, future with new
      - Home Available Money reflects the change appropriately

      **Dirty-form discard:**
      - Open edit sheet, change a field, attempt to dismiss
      - Confirmation appears
      - Keep editing: sheet stays open, changes preserved
      - Discard: sheet closes, changes lost

      **Validation:**
      - Submit with name empty: inline error under name field
      - Submit with negative amount: inline error
      - Submit with invalid date: inline error
      - Submit button disabled while any error present

      **Accessibility:**
      - Tab navigation through fields works
      - Focus trap within sheet
      - Escape triggers discard confirmation if dirty, dismisses if clean
      - prefers-reduced-motion: instant animations

      **Negative check:**
      - No full-screen edit routes remain (grep `/edit` in app router — only deleted pages should return)
      - No duplicate edit UI across record types — all consume RecordEditSheet
    status: pending

isProject: false
---

# Unified Edit Sheet — the plan

## What this PR lands

A single shared primitive (RecordEditSheet) consumed by Income, Commitment, and Goal edit flows. Replaces three inconsistent patterns with one consistent pattern.

## Why this matters

From the UX audit: "Editing an income goes to a full screen; editing a commitment opens a modal sheet. These are semantically identical operations with different chrome."

The inconsistency creates three problems:
1. Users re-learn patterns per entity type
2. Engineering maintains three edit codepaths
3. Adding a new record type (e.g., Asset edit) requires inventing a fourth pattern

RecordEditSheet solves all three. One primitive, one pattern, three thin consumer shells.

## Dependencies

- **GlassSheet primitive** from Commitments Rebuild PR (RecordEditSheet sits inside GlassSheet)
- **KebabRow primitive** from Commitments Rebuild PR (kebab menus open the sheets)
- **Pre-Launch Sprint PR** (establishes Income detail page where sheet is consumed)

Land after those.

## What this PR does NOT include

- **Record detail page rebuilds** — separate work. This PR only handles edit flows.
- **Versioning schema migration** — if your schema doesn't already support versioning, this PR documents the limitation rather than adding the migration. Versioning is a bigger undertaking worth its own PR.
- **Delete/archive operations** — those are confirmation sheets, not edit sheets. Separate primitive.

## Risk

Medium-low. The primitive is well-scoped, consumers are thin, tests cover behavior. Main risk: versioning semantics need your schema to support them. If your current schema is single-row-per-entity with current values only, this PR becomes "build edit UI with appliesFrom stored but not respected in history" — which is fine as an interim state but creates a future dataloss concern if users edit expecting historical preservation.

Flag this with the engineer before starting. If versioning isn't supported, the applies-from UI still ships but with a tooltip saying "Changes apply immediately. Historical preservation coming soon."

## Net code impact

Significant consolidation. Three bespoke edit flows (IncomeEdit full-screen page, CommitmentEditSheet inline modal, GoalEdit — probably doesn't exist yet) collapse into one primitive plus three thin consumer shells plus centralized schemas.

Rough estimate: +300 lines for the primitive, +150 for schemas, -500 lines for retired edit UI across three record types, +100 for test coverage. Net -50 lines while adding functionality.
