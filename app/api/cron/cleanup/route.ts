import { NextResponse } from "next/server";
import { cleanupExpired } from "@/lib/game";

export const dynamic = "force-dynamic";

// Called by Vercel Cron (see vercel.json). Vercel sends "Authorization: Bearer $CRON_SECRET".
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const deleted = await cleanupExpired();
  return NextResponse.json({ ok: true, deleted });
}
