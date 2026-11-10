// Applies SQL files in db/migrations once each. Skips quietly when no database URL is set,
// so `npm run build` works locally without a database.
import { neon } from "@neondatabase/serverless";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url) {
  console.log("[migrate] No DATABASE_URL set - skipping migrations.");
  process.exit(0);
}
const sql = neon(url);
await sql.query("CREATE TABLE IF NOT EXISTS _migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "db", "migrations");
const done = new Set((await sql.query("SELECT name FROM _migrations")).map((r) => r.name));
for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
  if (done.has(file)) continue;
  const statements = readFileSync(join(dir, file), "utf8")
    .split(/;[ \t]*\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const s of statements) await sql.query(s);
  await sql.query("INSERT INTO _migrations (name) VALUES ($1)", [file]);
  console.log("[migrate] applied", file);
}
console.log("[migrate] up to date");
