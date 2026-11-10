"use client";
import { useState } from "react";
import type { RoomState } from "@/lib/types";
import { CATEGORIES, COLORS, DURATIONS, GRID_SIZES, catLabel, colorHex } from "@/lib/constants";

interface Props {
  state: RoomState; audience: number; online: string[]; conn: string;
  act: (t: string, x?: any) => Promise<any>; onLeave: () => void;
}

const chip = (on: boolean, disabled: boolean) =>
  `rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
    on ? "bg-emerald-500 text-slate-950" : "bg-slate-900 text-slate-300 ring-1 ring-white/10"
  } ${disabled ? "opacity-60 cursor-not-allowed" : "hover:ring-emerald-400"}`;

export default function Lobby({ state, audience, online, conn, act, onLeave }: Props) {
  const me = state.me;
  const isPlayer = me.role === "player";
  const isHost = state.hostId === me.id;
  const mine = state.players.find((p) => p.id === me.id);
  const s = state.settings;
  const [msg, setMsg] = useState("");
  const [copied, setCopied] = useState("");
  const run = async (t: string, x?: any) => {
    setMsg("");
    const r = await act(t, x);
    if (!r.ok) setMsg(r.error || "Something went wrong");
  };
  const allReady = state.players.length === 2 && state.players.every((p) => p.ready);
  const takenByOther = new Set(state.players.filter((p) => p.id !== me.id).map((p) => p.color));
  const copy = (what: string, text: string) => {
    navigator.clipboard?.writeText(text).then(() => { setCopied(what); setTimeout(() => setCopied(""), 1500); });
  };
  const seats = [0, 1].map((i) => state.players.find((p) => p.seat === i) ?? null);

  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-3 p-3 sm:p-5">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-black">WORD<span className="text-emerald-400"> HUNT</span></h1>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {!isPlayer && <span className="rounded-full bg-amber-400 px-3 py-1 text-xs font-black text-slate-900">SPECTATING</span>}
          <span className="rounded-full bg-slate-800 px-3 py-1 ring-1 ring-white/10">👁 {audience} watching</span>
          <span className={`h-2.5 w-2.5 rounded-full ${conn === "online" ? "bg-emerald-400" : "bg-amber-400 pulse-soft"}`} title={`Live connection: ${conn}`} />
          <button onClick={onLeave} className="rounded-lg bg-slate-800 px-3 py-1.5 ring-1 ring-white/10 hover:bg-slate-700">Leave</button>
        </div>
      </header>

      <section className="flex flex-wrap items-center gap-3 rounded-2xl bg-slate-800/60 p-4 ring-1 ring-white/10">
        <div>
          <p className="text-xs uppercase tracking-wider text-slate-400">Room ID</p>
          <p className="font-mono text-3xl font-black tracking-[0.25em]">{state.code}</p>
        </div>
        <div className="ml-auto flex gap-2">
          <button onClick={() => copy("id", state.code)} className="rounded-lg bg-slate-900 px-3 py-2 text-sm ring-1 ring-white/10 hover:ring-emerald-400">{copied === "id" ? "Copied ✓" : "Copy ID"}</button>
          <button onClick={() => copy("link", `${location.origin}/room/${state.code}`)} className="rounded-lg bg-slate-900 px-3 py-2 text-sm ring-1 ring-white/10 hover:ring-emerald-400">{copied === "link" ? "Copied ✓" : "Copy invite link"}</button>
        </div>
      </section>

      <div className="grid flex-1 gap-3 md:grid-cols-2">
        <section className="space-y-3 rounded-2xl bg-slate-800/60 p-4 ring-1 ring-white/10">
          <h2 className="font-bold">Players <span className="text-slate-400">({state.players.length}/2)</span></h2>
          {seats.map((p, i) =>
            p ? (
              <div key={p.id} className="flex items-center gap-3 rounded-xl bg-slate-900 p-3 ring-1 ring-white/10">
                <span className="h-8 w-8 rounded-full" style={{ background: colorHex(p.color) }} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">
                    {p.nickname}{p.id === me.id && <span className="text-slate-400"> (you)</span>}
                    {p.id === state.hostId && <span className="ml-2 rounded bg-slate-700 px-1.5 py-0.5 text-[10px] font-bold">HOST</span>}
                  </p>
                  <p className="text-xs text-slate-400">{online.includes(p.id) ? "Online" : "Offline / reconnecting…"}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-black ${p.ready ? "bg-emerald-500 text-slate-950" : "bg-slate-700 text-slate-300"}`}>
                  {p.ready ? "READY" : "NOT READY"}
                </span>
              </div>
            ) : (
              <div key={`empty${i}`} className="rounded-xl border border-dashed border-white/15 p-3 text-center text-sm text-slate-500">
                Waiting for opponent… share the Room ID
              </div>
            )
          )}

          {isPlayer && mine && (
            <div>
              <p className="mb-2 text-sm text-slate-400">Your highlight color</p>
              <div className="flex flex-wrap gap-2">
                {COLORS.map((c) => {
                  const taken = takenByOther.has(c.id);
                  const on = mine.color === c.id;
                  return (
                    <button
                      key={c.id} disabled={taken} title={taken ? `${c.name} (taken)` : c.name}
                      onClick={() => run("color", { color: c.id })}
                      className={`relative h-9 w-9 rounded-full transition ${on ? "ring-2 ring-white ring-offset-2 ring-offset-slate-800" : ""} ${taken ? "opacity-25 cursor-not-allowed" : "hover:scale-110"}`}
                      style={{ background: c.hex }}
                    >
                      {taken && <span className="absolute inset-0 grid place-items-center text-lg font-black text-white">×</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        <section className="space-y-3 rounded-2xl bg-slate-800/60 p-4 ring-1 ring-white/10">
          <h2 className="font-bold">Game settings {!isHost && <span className="text-xs font-normal text-slate-400">(host controls these)</span>}</h2>
          <div>
            <p className="mb-1.5 text-sm text-slate-400">Duration</p>
            <div className="flex flex-wrap gap-2">
              {DURATIONS.map((d) => (
                <button key={d} disabled={!isHost} onClick={() => run("settings", { durationMin: d })} className={chip(s.durationMin === d, !isHost)}>{d} min</button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-sm text-slate-400">Grid</p>
            <div className="flex gap-2">
              {GRID_SIZES.map((g) => (
                <button key={g} disabled={!isHost} onClick={() => run("settings", { gridSize: g })} className={chip(s.gridSize === g, !isHost)}>{g}×{g}</button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-sm text-slate-400">Category</p>
            <select
              disabled={!isHost} value={s.category} onChange={(e) => run("settings", { category: e.target.value })}
              className="w-full rounded-xl bg-slate-900 px-3 py-2.5 outline-none ring-1 ring-white/10 focus:ring-emerald-400 disabled:opacity-60"
            >
              <optgroup label="English">
                {CATEGORIES.filter((c) => c.lang === "en").map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </optgroup>
              <optgroup label="Filipino">
                {CATEGORIES.filter((c) => c.lang === "fil").map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </optgroup>
            </select>
            <p className="mt-2 text-sm text-slate-300">Selected: <span className="font-bold text-emerald-300">{catLabel(s.category)}</span> · {s.gridSize >= 20 ? "30–35" : "25–30"} hidden words</p>
          </div>
        </section>
      </div>

      <footer className="space-y-2">
        {msg && <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{msg}</p>}
        {isPlayer ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              onClick={() => run("ready", { ready: !mine?.ready })}
              className={`rounded-xl px-4 py-3.5 text-lg font-black transition ${mine?.ready ? "bg-slate-700 text-white hover:bg-slate-600" : "bg-emerald-500 text-slate-950 hover:bg-emerald-400"}`}
            >
              {mine?.ready ? "CANCEL READY" : "READY"}
            </button>
            {isHost ? (
              <button
                disabled={!allReady} onClick={() => run("start")}
                className="rounded-xl bg-blue-500 px-4 py-3.5 text-lg font-black text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {allReady ? "START MATCH" : state.players.length < 2 ? "WAITING FOR OPPONENT" : "WAITING FOR BOTH READY"}
              </button>
            ) : (
              <div className="grid place-items-center rounded-xl bg-slate-800/60 px-4 py-3.5 text-slate-300 ring-1 ring-white/10">Waiting for the host to start…</div>
            )}
          </div>
        ) : (
          <div className="rounded-xl bg-slate-800/60 px-4 py-3.5 text-center text-slate-300 ring-1 ring-white/10">
            You are spectating – the match will appear here live when the host starts it.
          </div>
        )}
      </footer>
    </main>
  );
}
