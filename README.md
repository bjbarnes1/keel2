# Keel2

Keel2 is a simplified household-finance app built around one core question:

> After everything I owe is accounted for, what do I actually have left?

This repository implements the current Keel2 V1 direction:

- mobile-first Next.js app
- available-money calculation engine
- commitments and goals flows
- timeline projection and shortfall alerting
- AI-assisted bill parsing
- Prisma/Postgres-ready persistence, with a local file-backed fallback for development

## Stack

- Next.js 16
- TypeScript
- Tailwind CSS 4
- Prisma 7
- PostgreSQL
- Supabase-ready environment variables
- Vitest

## Current Product Scope

The app currently includes:

- Dashboard with Available Money waterfall
- Bills list
- Add bill flow
  - AI parse/confirm flow
  - Manual form fallback
- Edit bill flow
- Goals list and goal creation
- 60-day timeline projection
- Balance update flow
- Onboarding flow

## Local Development

Install dependencies:

```bash
npm install
```

Start the app:

```bash
npm run dev
```

Run checks:

```bash
npm test
npm run lint
npm run build
```

## Environment Variables

Copy `.env.example` to `.env.local` or set the same values in your environment:

```bash
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/keel2?schema=public"
NEXT_PUBLIC_SUPABASE_URL=""
NEXT_PUBLIC_SUPABASE_ANON_KEY=""
ANTHROPIC_API_KEY=""
```

### What each variable does

- `DATABASE_URL`: enables Prisma/Postgres persistence
- `NEXT_PUBLIC_SUPABASE_URL`: reserved for Supabase integration
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: reserved for Supabase integration
- `ANTHROPIC_API_KEY`: enables real Anthropic bill parsing in the AI bill flow

## Persistence Modes

Keel2 supports two persistence modes right now:

### 1. Local development fallback

If `DATABASE_URL` is not configured, the app reads and writes local development data from:

`data/dev-store.json`

This is useful for local iteration and demos.

### 2. Real database mode

If `DATABASE_URL` is configured, the app uses Prisma with PostgreSQL.

This is the mode you should use for Vercel deployments.

### Important Vercel note

The local file-backed fallback is only intended for local development. On Vercel, filesystem writes are not durable. For production writes to work correctly, you must set `DATABASE_URL`.

The app is set up to fail write actions in hosted production if no database is configured, rather than silently pretending data is persistent.

## AI Bill Parsing

The AI bill parsing flow is wired up in two modes:

- with `ANTHROPIC_API_KEY`: uses the real Anthropic API
- without `ANTHROPIC_API_KEY`: uses a local fallback parser so the flow still works in development

Current limitation:

- the AI parse/confirm flow is implemented and working
- the manual bill form is the fully persisted save path
- if you want the AI confirmation screen to save directly into the same backend path, that can be extended next

## Prisma

Generate the Prisma client manually if needed:

```bash
npx prisma generate
```

The repository also runs Prisma generation automatically on install via:

```bash
npm install
```

## Deploying To Vercel

### 1. Import the repo

Import this GitHub repository into Vercel:

`https://github.com/bjbarnes1/keel2`

### 2. Framework settings

Vercel should detect this as a Next.js app automatically.

Recommended defaults:

- Framework Preset: `Next.js`
- Install Command: `npm install`
- Build Command: managed by `vercel.json` as `npm run build:vercel`
- Output Directory: leave blank

### 3. Configure environment variables

At minimum, set:

- `DATABASE_URL`

Optional:

- `ANTHROPIC_API_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### 4. Deploy

Once `DATABASE_URL` is present, the app is ready for a normal Vercel deployment.

On Vercel, the build now runs:

```bash
npm run build:vercel
```

That command now runs a dedicated script which:

- validates that `DATABASE_URL` is present
- runs `prisma generate`
- runs `prisma migrate deploy` on production deployments
- runs `next build`

By default:

- Production deploys run migrations automatically
- Preview deploys skip migrations unless you explicitly opt in

If you want preview deployments to run migrations too, set:

```bash
VERCEL_RUN_MIGRATIONS=1
```

If you ever need to run the migration command directly, the repo also includes:

```bash
npm run db:migrate:deploy
```

## Branching

The repository default branch should be `main`.

If your local branch is still `master`, rename and push with:

```bash
git branch -m master main
git push -u origin main
```

## Suggested Next Work

- wire the AI confirmation screen directly into persisted bill creation
- add full income editing/setup
- enable Supabase auth
- switch fully from the local fallback store to Postgres in production
