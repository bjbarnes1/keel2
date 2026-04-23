/**
 * Zod schemas and section metadata for {@link RecordEditSheet} (income + commitment).
 *
 * @module lib/schemas/record-edit-schemas
 */

import { z } from "zod";

import type { CommitmentFrequency, PayFrequency } from "@/lib/types";

export type RecordEditFieldType = "text" | "number" | "currency" | "date" | "select" | "toggle";

export type RecordEditFieldDef<T extends Record<string, unknown>> = {
  id: keyof T & string;
  label: string;
  type: RecordEditFieldType;
  hint?: string;
  options?: Array<{ value: string; label: string }>;
};

export type RecordEditSectionDef<T extends Record<string, unknown>> = {
  id: string;
  label: string;
  disclosure?: "always" | "progressive";
  fields: Array<RecordEditFieldDef<T>>;
};

export const FREQUENCY_OPTIONS_INCOME: Array<{ value: PayFrequency; label: string }> = [
  { value: "weekly", label: "Weekly" },
  { value: "fortnightly", label: "Fortnightly" },
  { value: "monthly", label: "Monthly" },
];

export const FREQUENCY_OPTIONS_COMMITMENT: Array<{ value: CommitmentFrequency; label: string }> = [
  { value: "weekly", label: "Weekly" },
  { value: "fortnightly", label: "Fortnightly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annual", label: "Annual" },
];

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.");

export const incomeEditSchema = z.object({
  name: z.string().min(1, "Name is required.").max(100),
  amount: z.number().finite().positive("Amount must be greater than zero."),
  frequency: z.enum(["weekly", "fortnightly", "monthly"]),
  nextPayDate: isoDate,
});

export type IncomeEditValues = z.infer<typeof incomeEditSchema>;

export const incomeEditSections: RecordEditSectionDef<IncomeEditValues>[] = [
  {
    id: "primary",
    label: "Pay details",
    disclosure: "always",
    fields: [
      { id: "name", label: "Name", type: "text" },
      { id: "amount", label: "Amount (per pay)", type: "currency" },
      {
        id: "frequency",
        label: "How often",
        type: "select",
        options: FREQUENCY_OPTIONS_INCOME.map((o) => ({ value: o.value, label: o.label })),
      },
      { id: "nextPayDate", label: "Next payday", type: "date" },
    ],
  },
];

export const commitmentEditSchema = z.object({
  name: z.string().min(1, "Name is required.").max(100),
  amount: z.number().finite().positive("Amount must be greater than zero."),
  frequency: z.enum(["weekly", "fortnightly", "monthly", "quarterly", "annual"]),
  nextDueDate: isoDate,
  categoryId: z.string().min(1, "Category is required."),
  subcategoryId: z.preprocess(
    (val) => (val === "" || val === null || val === undefined ? undefined : val),
    z.string().optional(),
  ),
  fundedByIncomeId: z.string().min(1, "Pick an income."),
});

export type CommitmentEditValues = z.infer<typeof commitmentEditSchema>;

export const commitmentEditSections: RecordEditSectionDef<CommitmentEditValues>[] = [
  {
    id: "primary",
    label: "Payment details",
    disclosure: "always",
    fields: [
      { id: "name", label: "Name", type: "text" },
      { id: "amount", label: "Amount", type: "currency" },
      {
        id: "frequency",
        label: "How often",
        type: "select",
        options: FREQUENCY_OPTIONS_COMMITMENT.map((o) => ({ value: o.value, label: o.label })),
      },
      { id: "nextDueDate", label: "Next due", type: "date" },
    ],
  },
  {
    id: "category",
    label: "Category",
    disclosure: "progressive",
    fields: [
      { id: "categoryId", label: "Category", type: "select", options: [] },
      { id: "subcategoryId", label: "Subcategory", type: "select", options: [] },
    ],
  },
  {
    id: "funding",
    label: "Funding",
    disclosure: "progressive",
    fields: [{ id: "fundedByIncomeId", label: "Funded from income", type: "select", options: [] }],
  },
];
