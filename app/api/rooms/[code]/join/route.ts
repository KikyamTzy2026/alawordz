import { NextResponse } from "next/server";
import { joinRoom, normCode, errMsg } from "@/lib/game";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { code: string } }) {
  try {
    const body = await req.json().catch(() => ({}));
    const out = await joinRoom(normCode(params.code), body);
    return NextResponse.json(out.body, { status: out.status });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ ok: false, error: errMsg(e) }, { status: 500 });
  }
}
