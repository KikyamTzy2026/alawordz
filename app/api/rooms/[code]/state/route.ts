import { NextResponse } from "next/server";
import { authenticate, getState, normCode, errMsg } from "@/lib/game";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { code: string } }) {
  try {
    const code = normCode(params.code);
    const me = await authenticate(req, code);
    if (me === "gone") return NextResponse.json({ ok: false, error: "Room not found" }, { status: 404 });
    if (!me) return NextResponse.json({ ok: false, error: "Not a member of this room" }, { status: 401 });
    const state = await getState(code, me);
    if (!state) return NextResponse.json({ ok: false, error: "Room not found" }, { status: 404 });
    return NextResponse.json({ ok: true, state }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ ok: false, error: errMsg(e) }, { status: 500 });
  }
}
