# Keel locked build — cutover notes

## Environment

- `KEEL_UP_BANK_TOKEN` — Up personal access token (server only). Enables `/spend/up` and `POST /api/up/sync`.
- `KEEL_UP_WEBHOOK_SECRET` — optional; send as `x-keel-webhook-secret` on webhook calls (ingest still PAT-first).
- `CRON_SECRET` — Vercel Cron must send `Authorization: Bearer <CRON_SECRET>` to `/api/cron/daily-alerts`.

## Database

Apply migration `20260424180000_locked_build_schema` (Prisma `migrate deploy` in prod).

## Household

- Any budget **member** can invite others (Soph parity with owner).
- Link the joint Up transactional account under **Spend → Up sync**; categorisation rules live under **Spend → Rules**.
- Medical sub-items and rebate workflow: **Medical** route from the home cockpit action chips.

## Transfers

Cashflow page shows **recommended** sweeps only — users execute transfers in Up / UBank / ING apps.
