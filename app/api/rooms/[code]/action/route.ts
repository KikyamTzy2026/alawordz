import { NextResponse } from "next/server";
import { authenticate, handleAction, normCode, errMsg } from "@/lib/game";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { code: string } }) {
  try {
    const code = normCode(params.code);
    const me = await authenticate(req, code);
    if (me === "gone") return NextResponse.json({ ok: false, error: "Room not found" }, { status: 404 });
    if (!me) return NextResponse.json({ ok: false, error: "Session expired" }, { status: 401 });
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
    const out = await handleAction(code, me, body);
    return NextResponse.json(out.body, { status: out.status });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ ok: false, error: errMsg(e) }, { status: 500 });
  }
}
