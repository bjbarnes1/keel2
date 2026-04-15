import { execSync } from "node:child_process";

function run(command) {
  console.log(`\n$ ${command}`);
  execSync(command, {
    stdio: "inherit",
    env: process.env,
  });
}

const databaseUrl = process.env.DATABASE_URL;
const vercelEnv = process.env.VERCEL_ENV ?? "local";
const shouldRunMigrations =
  vercelEnv === "production" ||
  process.env.VERCEL_RUN_MIGRATIONS === "1" ||
  process.env.CI !== "1";

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is required during Vercel builds so Prisma can prepare the app and run migrations.",
  );
}

console.log(`Starting Vercel build for environment: ${vercelEnv}`);

run("npx prisma generate");

if (shouldRunMigrations) {
  run("npx prisma migrate deploy");
} else {
  console.log(
    "Skipping prisma migrate deploy for this non-production build. Set VERCEL_RUN_MIGRATIONS=1 to force it.",
  );
}

run("npx next build");
