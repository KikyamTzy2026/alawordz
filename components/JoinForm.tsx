"use client";
import { useEffect, useState } from "react";
import { joinRequest, loadNick, type Session } from "@/lib/session";
import type { Role } from "@/lib/types";

/** Nickname + JOIN AS PLAYER / WATCH AS SPECTATOR. Used on the home page and on direct room links. */
export default function JoinForm({
  code, onJoined, notice,
}: { code: string; onJoined: (s: Session) => void; notice?: string }) {
  const [nick, setNick] = useState("");
  const [busy, setBusy] = useState<Role | null>(null);
  const [err, setErr] = useState(notice || "");
  useEffect(() => setNick(loadNick()), []);

  const go = async (role: Role) => {
    if (!nick.trim()) return setErr("Enter a nickname first");
    setBusy(role); setErr("");
    const r = await joinRequest(code, nick.trim(), role);
    setBusy(null);
    if ("error" in r) setErr(r.error);
    else onJoined(r.session);
  };

  return (
    <div className="space-y-3">
      <input
        value={nick} onChange={(e) => setNick(e.target.value)} maxLength={16} placeholder="Your nickname"
        className="w-full rounded-xl bg-slate-900 px-4 py-3 text-base outline-none ring-1 ring-white/10 focus:ring-emerald-400"
      />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button disabled={!!busy} onClick={() => go("player")}
          className="rounded-xl bg-emerald-500 px-4 py-3 font-bold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60">
          {busy === "player" ? "Joining…" : "JOIN AS PLAYER"}
        </button>
        <button disabled={!!busy} onClick={() => go("spectator")}
          className="rounded-xl bg-slate-700 px-4 py-3 font-bold text-white transition hover:bg-slate-600 disabled:opacity-60">
          {busy === "spectator" ? "Joining…" : "WATCH AS SPECTATOR"}
        </button>
      </div>
      {err && <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{err}</p>}
    </div>
  );
}
