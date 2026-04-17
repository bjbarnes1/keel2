import { describe, expect, it } from "vitest";

import {
  buildSpendRows,
  normalizeMoneyInput,
  parseCsv,
  parseSpendDate,
  suggestSpendCsvMapping,
} from "./csv";

describe("parseCsv", () => {
  it("parses a simple header and rows", () => {
    const result = parseCsv("Date,Amount,Description\n2024-01-02,-12.50,Coffee\n");
    expect(result.headers).toEqual(["Date", "Amount", "Description"]);
    expect(result.rows).toEqual([["2024-01-02", "-12.50", "Coffee"]]);
    expect(result.errors).toEqual([]);
  });

  it("handles quoted commas", () => {
    const result = parseCsv('Date,Memo\n2024-01-02,"Payee, Pty Ltd"\n');
    expect(result.rows).toEqual([["2024-01-02", "Payee, Pty Ltd"]]);
  });
});

describe("normalizeMoneyInput", () => {
  it("strips currency symbols and commas", () => {
    expect(normalizeMoneyInput("$1,234.50")).toBe(1234.5);
  });

  it("treats parentheses as negative", () => {
    expect(normalizeMoneyInput("(45.20)")).toBe(-45.2);
  });
});

describe("parseSpendDate", () => {
  it("parses ISO dates", () => {
    const date = parseSpendDate("2024-06-01");
    expect(date?.toISOString().slice(0, 10)).toBe("2024-06-01");
  });

  it("parses AU-style day-first dates", () => {
    const date = parseSpendDate("03/11/2024");
    expect(date?.toISOString().slice(0, 10)).toBe("2024-11-03");
  });
});

describe("suggestSpendCsvMapping", () => {
  it("suggests columns from typical bank export headers", () => {
    const mapping = suggestSpendCsvMapping([
      "Transaction Date",
      "Debit",
      "Credit",
      "Description",
    ]);
    expect(mapping.dateColumn).toBe("Transaction Date");
    expect(mapping.debitColumn).toBe("Debit");
    expect(mapping.creditColumn).toBe("Credit");
    expect(mapping.memoColumn).toBe("Description");
  });
});

describe("buildSpendRows", () => {
  it("builds signed amounts from a single amount column", () => {
    const headers = ["Date", "Amount", "Description"];
    const rows = [
      ["2024-01-02", "-10.00", "Groceries"],
      ["2024-01-03", "2000", "Salary"],
    ];
    const mapping = {
      dateColumn: "Date",
      amountColumn: "Amount",
      memoColumn: "Description",
    };
    const built = buildSpendRows(headers, rows, mapping);
    expect(built.errors).toEqual([]);
    expect(built.rows).toEqual([
      { line: 2, postedOn: "2024-01-02", amount: -10, memo: "Groceries" },
      { line: 3, postedOn: "2024-01-03", amount: 2000, memo: "Salary" },
    ]);
  });

  it("builds signed amounts from debit/credit columns", () => {
    const headers = ["Date", "Debit", "Credit", "Description"];
    const rows = [
      ["2024-01-02", "15.00", "", "Fuel"],
      ["2024-01-03", "", "50.00", "Refund"],
    ];
    const mapping = {
      dateColumn: "Date",
      debitColumn: "Debit",
      creditColumn: "Credit",
      memoColumn: "Description",
    };
    const built = buildSpendRows(headers, rows, mapping);
    expect(built.errors).toEqual([]);
    expect(built.rows).toEqual([
      { line: 2, postedOn: "2024-01-02", amount: -15, memo: "Fuel" },
      { line: 3, postedOn: "2024-01-03", amount: 50, memo: "Refund" },
    ]);
  });
});
