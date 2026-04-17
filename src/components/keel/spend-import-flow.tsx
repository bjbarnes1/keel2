"use client";

import { useMemo, useState, useTransition } from "react";

import {
  commitSpendCsvAction,
  prepareSpendCsvAction,
} from "@/app/actions/keel-spend";
import type { SpendAccountView } from "@/lib/persistence/keel-store";
import type { SpendCsvMapping } from "@/lib/spend/csv";
import type { SpendCsvPreview } from "@/lib/spend/import";

type Props = {
  accounts: SpendAccountView[];
};

function columnOptions(headers: string[]) {
  return [{ value: "", label: "— Select column —" }, ...headers.map((header) => ({ value: header, label: header }))];
}

export function SpendImportFlow({ accounts }: Props) {
  const [csvText, setCsvText] = useState("");
  const [filename, setFilename] = useState("");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [mapping, setMapping] = useState<SpendCsvMapping | null>(null);
  const [preview, setPreview] = useState<SpendCsvPreview | null>(null);
  const [mode, setMode] = useState<"amount" | "split">("amount");
  const [isPending, startTransition] = useTransition();

  const mappingJson = useMemo(
    () => (mapping ? JSON.stringify(mapping) : ""),
    [mapping],
  );

  function runInitialParse(text: string) {
    if (!text.trim()) {
      setPreview(null);
      setMapping(null);
      return;
    }

    startTransition(() => {
      void (async () => {
        const next = await prepareSpendCsvAction(text);
        setPreview(next);
        setMapping(next.mapping);
        setMode(next.mapping.amountColumn ? "amount" : "split");
      })();
    });
  }

  function refreshPreview(nextMapping: SpendCsvMapping) {
    if (!csvText.trim()) {
      return;
    }

    startTransition(() => {
      void (async () => {
        const next = await prepareSpendCsvAction(csvText, JSON.stringify(nextMapping));
        setPreview(next);
        setMapping(next.mapping);
      })();
    });
  }

  function updateMapping(partial: Partial<SpendCsvMapping>) {
    if (!mapping) {
      return;
    }

    const base: SpendCsvMapping = { ...mapping, ...partial };
    const next: SpendCsvMapping =
      mode === "amount"
        ? {
            dateColumn: base.dateColumn,
            memoColumn: base.memoColumn,
            amountColumn: base.amountColumn,
          }
        : {
            dateColumn: base.dateColumn,
            memoColumn: base.memoColumn,
            debitColumn: base.debitColumn,
            creditColumn: base.creditColumn,
          };

    setMapping(next);
    refreshPreview(next);
  }

  function switchMode(nextMode: "amount" | "split") {
    setMode(nextMode);
    if (!mapping) {
      return;
    }

    const next: SpendCsvMapping =
      nextMode === "amount"
        ? {
            dateColumn: mapping.dateColumn,
            memoColumn: mapping.memoColumn,
            amountColumn: mapping.amountColumn ?? "",
          }
        : {
            dateColumn: mapping.dateColumn,
            memoColumn: mapping.memoColumn,
            debitColumn: mapping.debitColumn ?? "",
            creditColumn: mapping.creditColumn ?? "",
          };

    setMapping(next);
    refreshPreview(next);
  }

  return (
    <div className="space-y-4">
      <label className="block space-y-2">
        <span className="text-sm font-medium">Account</span>
        <select
          value={accountId}
          onChange={(event) => setAccountId(event.target.value)}
          className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
        >
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block space-y-2">
        <span className="text-sm font-medium">CSV file</span>
        <input
          type="file"
          accept=".csv,text/csv"
          className="w-full text-sm"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) {
              return;
            }

            const text = await file.text();
            setCsvText(text);
            setFilename(file.name);
            runInitialParse(text);
          }}
        />
        <p className="text-xs text-muted-foreground">
          Exports stay on your device until you tap import. Keel stores rows in your budget after you confirm.
        </p>
      </label>

      {preview?.headers.length ? (
        <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-medium">Column mapping</p>
            <div className="flex gap-2 text-xs">
              <button
                type="button"
                className={`rounded-full px-3 py-1 ${mode === "amount" ? "bg-primary text-primary-foreground" : "border border-border"}`}
                onClick={() => switchMode("amount")}
              >
                Amount column
              </button>
              <button
                type="button"
                className={`rounded-full px-3 py-1 ${mode === "split" ? "bg-primary text-primary-foreground" : "border border-border"}`}
                onClick={() => switchMode("split")}
              >
                Debit / credit
              </button>
            </div>
          </div>

          {preview.mappingError ? (
            <p className="text-sm text-amber-600">{preview.mappingError}</p>
          ) : null}

          <div className="grid gap-3">
            <label className="space-y-1 text-xs text-muted-foreground">
              Date
              <select
                value={mapping?.dateColumn ?? ""}
                onChange={(event) => updateMapping({ dateColumn: event.target.value })}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
              >
                {columnOptions(preview.headers).map((option) => (
                  <option key={`date-${option.value}`} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-xs text-muted-foreground">
              Description
              <select
                value={mapping?.memoColumn ?? ""}
                onChange={(event) => updateMapping({ memoColumn: event.target.value })}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
              >
                {columnOptions(preview.headers).map((option) => (
                  <option key={`memo-${option.value}`} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            {mode === "amount" ? (
              <label className="space-y-1 text-xs text-muted-foreground">
                Amount (use negative numbers for spending)
                <select
                  value={mapping?.amountColumn ?? ""}
                  onChange={(event) => updateMapping({ amountColumn: event.target.value })}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
                >
                  {columnOptions(preview.headers).map((option) => (
                    <option key={`amount-${option.value}`} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-xs text-muted-foreground">
                  Debit (money out)
                  <select
                    value={mapping?.debitColumn ?? ""}
                    onChange={(event) => updateMapping({ debitColumn: event.target.value })}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
                  >
                    {columnOptions(preview.headers).map((option) => (
                      <option key={`debit-${option.value}`} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-xs text-muted-foreground">
                  Credit (money in)
                  <select
                    value={mapping?.creditColumn ?? ""}
                    onChange={(event) => updateMapping({ creditColumn: event.target.value })}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
                  >
                    {columnOptions(preview.headers).map((option) => (
                      <option key={`credit-${option.value}`} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {preview?.issues.length ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
          <p className="font-medium text-amber-700">Parser notes</p>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            {preview.issues.slice(0, 6).map((issue) => (
              <li key={`${issue.line}-${issue.message}`}>
                Line {issue.line}: {issue.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {preview?.previewRows.length ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Preview</p>
            <p className="text-xs text-muted-foreground">
              {preview.previewRows.length} of {preview.rowCount} rows
            </p>
          </div>
          <div className="overflow-hidden rounded-2xl border border-border">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Amount</th>
                  <th className="px-3 py-2 font-medium">Memo</th>
                </tr>
              </thead>
              <tbody>
                {preview.previewRows.map((row) => (
                  <tr key={`${row.line}-${row.postedOn}-${row.amount}`} className="border-t border-border">
                    <td className="px-3 py-2 font-mono">{row.postedOn}</td>
                    <td className="px-3 py-2 font-mono">{row.amount.toFixed(2)}</td>
                    <td className="px-3 py-2">{row.memo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <form action={commitSpendCsvAction} className="space-y-3">
        <input type="hidden" name="csvText" value={csvText} />
        <input type="hidden" name="filename" value={filename} />
        <input type="hidden" name="mapping" value={mappingJson} />
        <input type="hidden" name="accountId" value={accountId} />

        <button
          type="submit"
          disabled={
            isPending ||
            !csvText.trim() ||
            !accountId ||
            !mappingJson ||
            Boolean(preview?.mappingError) ||
            !preview?.previewRows.length
          }
          className="w-full rounded-2xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-40"
        >
          {isPending ? "Working…" : "Import transactions"}
        </button>
      </form>
    </div>
  );
}
