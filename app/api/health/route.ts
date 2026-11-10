import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ablyRest } from "@/lib/ably";
import { signTokenRequest } from "@/lib/ablyAuth";
import { errMsg } from "@/lib/game";

export const dynamic = "force-dynamic";

// Open /api/health in the browser to see which part of the setup is broken. Returns no secrets.
export async function GET() {
  const out: any = {
    sdk: "ably-pubsub-v3", // if this field is missing, the deployed code is old
    env: {
      DATABASE_URL: !!(process.env.DATABASE_URL || process.env.POSTGRES_URL),
      ABLY_API_KEY: !!process.env.ABLY_API_KEY,
      CRON_SECRET: !!process.env.CRON_SECRET,
    },
  };
  try { await db()`SELECT 1`; out.database = "ok"; } catch (e) { out.database = errMsg(e); }
  try { signTokenRequest({ clientId: "health", capability: '{"wh-test":["subscribe"]}', ttl: 60000 }); out.ablyToken = "ok"; }
  catch (e: any) { out.ablyToken = "FAILED: " + String(e?.message || e).slice(0, 200); }
  try { await (await ablyRest()).time(); out.ablyServerSdk = "ok"; }
  catch (e: any) { out.ablyServerSdk = "FAILED: " + String(e?.message || e).slice(0, 200); }
  const good = out.database === "ok" && out.ablyToken === "ok" && out.ablyServerSdk === "ok";
  return NextResponse.json(out, { status: good ? 200 : 500 });
}
