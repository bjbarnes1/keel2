export type SpendCsvMapping = {
  dateColumn: string;
  /** Single signed amount column (negative = spend). */
  amountColumn?: string;
  debitColumn?: string;
  creditColumn?: string;
  memoColumn: string;
};

export type ParsedSpendRow = {
  line: number;
  postedOn: string;
  amount: number;
  memo: string;
};

export type ParseSpendCsvResult = {
  headers: string[];
  rows: string[][];
  errors: Array<{ line: number; message: string }>;
};

const DATE_HEADER_HINTS = [
  "date",
  "transaction date",
  "posted",
  "post date",
  "value date",
  "settlement date",
];

const AMOUNT_HEADER_HINTS = ["amount", "value", "amt", "total", "transaction amount"];

const DEBIT_HEADER_HINTS = ["debit", "debits", "withdrawal", "withdrawals"];

const CREDIT_HEADER_HINTS = ["credit", "credits", "deposit", "deposits"];

const MEMO_HEADER_HINTS = [
  "description",
  "memo",
  "details",
  "narration",
  "narrative",
  "particulars",
  "payee",
  "merchant",
  "note",
  "notes",
];

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function parseCsvLine(line: string) {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]!;

    if (inQuotes) {
      if (char === '"') {
        if (line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current);
  return result.map((cell) => cell.trim());
}

export function parseCsv(text: string): ParseSpendCsvResult {
  const errors: Array<{ line: number; message: string }> = [];
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!normalized) {
    return { headers: [], rows: [], errors: [{ line: 0, message: "CSV is empty." }] };
  }

  const lines = normalized.split("\n").filter((line) => line.length > 0);
  if (lines.length === 0) {
    return { headers: [], rows: [], errors: [{ line: 0, message: "CSV is empty." }] };
  }

  const headers = parseCsvLine(lines[0]!);
  const rows: string[][] = [];

  for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
    const cells = parseCsvLine(lines[lineIndex]!);
    if (cells.length === 1 && cells[0] === "") {
      continue;
    }
    if (cells.length !== headers.length) {
      errors.push({
        line: lineIndex + 1,
        message: `Expected ${headers.length} columns, found ${cells.length}.`,
      });
    }
    rows.push(cells);
  }

  return { headers, rows, errors };
}

function findHeader(headers: string[], hints: string[]) {
  const normalizedHeaders = headers.map((header) => normalizeHeader(header));

  for (const hint of hints) {
    const index = normalizedHeaders.indexOf(hint);
    if (index >= 0) {
      return headers[index];
    }
  }

  for (const header of headers) {
    const normalized = normalizeHeader(header);
    if (hints.some((hint) => normalized.includes(hint))) {
      return header;
    }
  }

  return undefined;
}

export function suggestSpendCsvMapping(headers: string[]): SpendCsvMapping {
  const dateColumn =
    findHeader(headers, DATE_HEADER_HINTS) ??
    headers[0] ??
    "";

  const amountColumn = findHeader(headers, AMOUNT_HEADER_HINTS);
  const debitColumn = findHeader(headers, DEBIT_HEADER_HINTS);
  const creditColumn = findHeader(headers, CREDIT_HEADER_HINTS);

  const memoColumn =
    findHeader(headers, MEMO_HEADER_HINTS) ??
    headers.find((header) => header && header !== dateColumn) ??
    headers[headers.length - 1] ??
    "";

  if (amountColumn) {
    return { dateColumn, amountColumn, memoColumn };
  }

  return {
    dateColumn,
    debitColumn,
    creditColumn,
    memoColumn,
  };
}

export function normalizeMoneyInput(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  let value = trimmed;
  let sign = 1;

  if (/^\(.*\)$/.test(value)) {
    sign = -1;
    value = value.slice(1, -1);
  }

  value = value.replace(/[$€£]/g, "").replace(/,/g, "").trim();
  if (!value) {
    return null;
  }

  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return sign * parsed;
}

export function parseSpendDate(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const date = new Date(`${trimmed}T00:00:00Z`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const slashMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slashMatch) {
    let day = Number(slashMatch[1]);
    let month = Number(slashMatch[2]);
    let year = Number(slashMatch[3]);
    if (year < 100) {
      year += 2000;
    }
    // Prefer day-first ordering for AU-style exports.
    if (month > 12 && day <= 12) {
      const swap = month;
      month = day;
      day = swap;
    }
    const iso = `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
    const date = new Date(`${iso}T00:00:00Z`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function columnIndex(headers: string[], column: string) {
  const index = headers.indexOf(column);
  return index;
}

export function validateSpendCsvMapping(
  headers: string[],
  mapping: SpendCsvMapping,
): string | null {
  if (!headers.length) {
    return "No headers were detected.";
  }
  if (!mapping.dateColumn || columnIndex(headers, mapping.dateColumn) < 0) {
    return "Pick a valid date column.";
  }
  if (!mapping.memoColumn || columnIndex(headers, mapping.memoColumn) < 0) {
    return "Pick a valid description column.";
  }

  const hasAmount = Boolean(mapping.amountColumn);
  const hasDebitCredit = Boolean(mapping.debitColumn || mapping.creditColumn);

  if (hasAmount === hasDebitCredit) {
    return "Choose either an Amount column, or a Debit/Credit pair (not both).";
  }

  if (mapping.amountColumn && columnIndex(headers, mapping.amountColumn) < 0) {
    return "Pick a valid amount column.";
  }

  if (mapping.debitColumn && columnIndex(headers, mapping.debitColumn) < 0) {
    return "Pick a valid debit column.";
  }

  if (mapping.creditColumn && columnIndex(headers, mapping.creditColumn) < 0) {
    return "Pick a valid credit column.";
  }

  return null;
}

export function buildSpendRows(
  headers: string[],
  rows: string[][],
  mapping: SpendCsvMapping,
): { rows: ParsedSpendRow[]; errors: Array<{ line: number; message: string }> } {
  const validationError = validateSpendCsvMapping(headers, mapping);
  if (validationError) {
    return { rows: [], errors: [{ line: 1, message: validationError }] };
  }

  const dateIndex = columnIndex(headers, mapping.dateColumn);
  const memoIndex = columnIndex(headers, mapping.memoColumn);
  const amountIndex = mapping.amountColumn
    ? columnIndex(headers, mapping.amountColumn)
    : -1;
  const debitIndex = mapping.debitColumn
    ? columnIndex(headers, mapping.debitColumn)
    : -1;
  const creditIndex = mapping.creditColumn
    ? columnIndex(headers, mapping.creditColumn)
    : -1;

  const parsed: ParsedSpendRow[] = [];
  const errors: Array<{ line: number; message: string }> = [];

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const lineNumber = rowIndex + 2;
    const cells = rows[rowIndex] ?? [];

    const rawDate = cells[dateIndex] ?? "";
    const date = parseSpendDate(rawDate);
    if (!date) {
      errors.push({ line: lineNumber, message: `Invalid date: "${rawDate}".` });
      continue;
    }

    const memo = (cells[memoIndex] ?? "").trim() || "Imported transaction";

    let amount = 0;
    if (amountIndex >= 0) {
      const rawAmount = cells[amountIndex] ?? "";
      const parsedAmount = normalizeMoneyInput(rawAmount);
      if (parsedAmount === null) {
        errors.push({ line: lineNumber, message: `Invalid amount: "${rawAmount}".` });
        continue;
      }
      amount = parsedAmount;
    } else {
      const debitRaw = debitIndex >= 0 ? (cells[debitIndex] ?? "") : "";
      const creditRaw = creditIndex >= 0 ? (cells[creditIndex] ?? "") : "";
      const debit = debitRaw.trim() ? normalizeMoneyInput(debitRaw) : 0;
      const credit = creditRaw.trim() ? normalizeMoneyInput(creditRaw) : 0;

      if (debit === null || credit === null) {
        errors.push({ line: lineNumber, message: "Invalid debit/credit value." });
        continue;
      }

      if (debit !== 0 && credit !== 0) {
        errors.push({
          line: lineNumber,
          message: "A row should not have both debit and credit amounts.",
        });
        continue;
      }

      if (debit !== 0) {
        amount = -Math.abs(debit);
      } else if (credit !== 0) {
        amount = Math.abs(credit);
      } else {
        continue;
      }
    }

    const postedOn = date.toISOString().slice(0, 10);
    parsed.push({ line: lineNumber, postedOn, amount, memo });
  }

  return { rows: parsed, errors };
}
