import { neon } from "@neondatabase/serverless";
import { SCHEMA_STATEMENTS } from "./schema";

type Sql = (strings: TemplateStringsArray, ...values: any[]) => Promise<any[]>;
let wrapped: Sql | undefined;
let ready: Promise<void> | undefined;

/**
 * Lazily creates the Neon HTTP client (server-side only; secret comes from env).
 * Safety net: if the tables don't exist yet (migration skipped at build time),
 * they are created once on first use. All statements are idempotent.
 */
export function db(): Sql {
  if (!wrapped) {
    const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    const raw: any = neon(url);
    const hasTables = async () => !!(await raw.query("SELECT to_regclass('public.rooms') AS t"))[0]?.t;
    const ensure = () =>
      (ready ??= (async () => {
        if (await hasTables()) return;
        for (const s of SCHEMA_STATEMENTS) {
          try { await raw.query(s); } catch (e) { if (!(await hasTables())) throw e; }
        }
      })().catch((e) => { ready = undefined; throw e; }));
    wrapped = async (strings, ...values) => { await ensure(); return raw(strings, ...values); };
  }
  return wrapped;
}
