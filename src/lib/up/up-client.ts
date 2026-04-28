/**
 * Minimal Up Bank API JSON client (PAT bearer). Read-only list endpoints for ingest.
 *
 * @module lib/up/up-client
 */

const UP_API = "https://api.up.com.au/api/v1";

export type UpMoney = { currencyCode: string; value: string; valueInBaseUnits: number };

export type UpTransactionResource = {
  type: "transactions";
  id: string;
  attributes: {
    status: string;
    description: string;
    message: string | null;
    amount: UpMoney;
    settledAt: string | null;
    createdAt: string;
  };
  relationships?: {
    account?: { data?: { type: string; id: string } };
  };
};

export type UpAccountResource = {
  type: "accounts";
  id: string;
  attributes: {
    displayName: string;
    accountType: string;
  };
};

export type UpListResponse<T> = {
  data: T[];
  links?: { next?: string | null; prev?: string | null };
};

async function upFetch<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${UP_API}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    next: { revalidate: 0 },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Up API ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

export async function listUpAccounts(token: string) {
  return upFetch<UpListResponse<UpAccountResource>>(token, "/accounts?page[size]=99");
}

export async function listUpTransactionsPage(token: string, query: string) {
  return upFetch<UpListResponse<UpTransactionResource>>(token, `/transactions${query}`);
}

async function upFetchAbsolute<T>(token: string, absoluteUrl: string): Promise<T> {
  const res = await fetch(absoluteUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    next: { revalidate: 0 },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Up API ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

export async function fetchAllUpTransactionsSince(token: string, sinceIso: string, maxPages = 25) {
  const firstPath = `?page[size]=100&filter[status]=SETTLED&filter[since]=${encodeURIComponent(sinceIso)}`;
  let page = await listUpTransactionsPage(token, firstPath);
  const out: UpTransactionResource[] = [...page.data];
  let pages = 1;
  let nextUrl = page.links?.next;
  while (nextUrl && pages < maxPages) {
    page = await upFetchAbsolute<UpListResponse<UpTransactionResource>>(token, nextUrl);
    out.push(...page.data);
    nextUrl = page.links?.next ?? null;
    pages += 1;
  }
  return out;
}
