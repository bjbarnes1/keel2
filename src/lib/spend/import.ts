/**
 * Orchestrates CSV preview: parse raw text, infer or validate column mapping, surface issues.
 *
 * @module lib/spend/import
 */

import {
  type SpendCsvMapping,
  buildSpendRows,
  parseCsv,
  suggestSpendCsvMapping,
  validateSpendCsvMapping,
} from "./csv";

export type SpendCsvPreview = {
  headers: string[];
  mapping: SpendCsvMapping;
  rowCount: number;
  previewRows: Array<{
    line: number;
    postedOn: string;
    amount: number;
    memo: string;
  }>;
  issues: Array<{ line: number; message: string }>;
  mappingError: string | null;
};

function emptyMapping(): SpendCsvMapping {
  return { dateColumn: "", memoColumn: "" };
}

export function prepareSpendCsvPreview(
  csvText: string,
  mappingOverride?: SpendCsvMapping,
): SpendCsvPreview {
  const trimmed = csvText.trim();
  if (!trimmed) {
    return {
      headers: [],
      mapping: emptyMapping(),
      rowCount: 0,
      previewRows: [],
      issues: [{ line: 0, message: "Paste a CSV export to get started." }],
      mappingError: null,
    };
  }

  const parsed = parseCsv(trimmed);
  const baseMapping =
    mappingOverride ??
    (parsed.headers.length ? suggestSpendCsvMapping(parsed.headers) : emptyMapping());

  const mappingError =
    parsed.headers.length > 0 ? validateSpendCsvMapping(parsed.headers, baseMapping) : null;

  const built = mappingError
    ? { rows: [] as Array<{ line: number; postedOn: string; amount: number; memo: string }>, errors: [] as Array<{ line: number; message: string }> }
    : buildSpendRows(parsed.headers, parsed.rows, baseMapping);

  const issues = [...parsed.errors, ...built.errors];

  return {
    headers: parsed.headers,
    mapping: baseMapping,
    rowCount: parsed.rows.length,
    previewRows: built.rows.slice(0, 25),
    issues: issues.slice(0, 80),
    mappingError,
  };
}
