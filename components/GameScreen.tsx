"use client";
import { useEffect, useMemo, useState } from "react";
import Board, { type LiveSel } from "./Board";
import type { Cell, LiveMap } from "@/hooks/useRoom";
import type { ClaimView, RoomState } from "@/lib/types";
import { catLabel, colorHex } from "@/lib/constants";

interface Props {
  state: RoomState; audience: number; online: string[]; live: LiveMap; conn: string;
  serverNow: () => number; act: (t: string, x?: any) => Promise<any>;
  addClaim: (c: ClaimView) => void; onLive: (a: Cell | null, b: Cell | null) => void; onLeave: () => void;
}

const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

export default function GameScreen({ state, audience, online, live, conn, serverNow, act, addClaim, onLive, onLeave }: Props) {
  const me = state.me;
  const isPlayer = me.role === "player";
  const [now, setNow] = useState(() => serverNow());
  useEffect(() => {
    const t = setInterval(() => setNow(serverNow()), 200);
    return () => clearInterval(t);
  }, [serverNow]);

  const [toast, setToast] = useState<{ text: string; color: string } | null>(null);
  const [flash, setFlash] = useState<{ a: Cell; b: Cell; key: number } | null>(null);
  const [showResults, setShowResults] = useState(true);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1600);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => { if (state.status === "finished") setShowResults(true); }, [state.status]);

  const byId = useMemo(() => Object.fromEntries(state.players.map((p) => [p.id, p])), [state.players]);
  const claims = useMemo(
    () => state.claims.map((c) => ({ ...c, color: colorHex(byId[c.playerId]?.color) })),
    [state.claims, byId]
  );
  const found = (id: string) => state.claims.filter((c) => c.playerId === id).length;
  const scoreOf = (id: string) => found(id) * 10 + (byId[id]?.bonus ?? 0);
  const claimOf = useMemo(() => Object.fromEntries(claims.map((c) => [c.word, c])), [claims]);

  const myColor = colorHex(byId[me.id]?.color);
  const others: LiveSel[] = Object.entries(live)
    .filter(([pid, v]) => pid !== me.id && v && byId[pid])
    .map(([pid, v]) => ({ color: colorHex(byId[pid].color), a: v!.a, b: v!.b }));

  const countdownLeft = state.status === "countdown" ? (state.startsAt ?? 0) - now : 0;
  const running = state.status === "playing" || (state.status === "countdown" && countdownLeft <= 0);
  const timeLeft = state.endsAt && running ? state.endsAt - now : state.status === "finished" ? 0 : state.settings.durationMin * 60_000;
  const canPlay = isPlayer && state.status === "playing" && !!state.endsAt && now < state.endsAt;

  const onSelect = async (a: Cell, b: Cell) => {
    const r = await act("claim", { a, b });
    if (r.ok) {
      addClaim({ word: r.word, playerId: me.id, a, b });
      setToast({ text: r.finished ? `+10 ${r.word} · +20 FINISH BONUS!` : `+10  ${r.word}`, color: "#4ade80" });
    } else {
      setFlash({ a, b, key: Date.now() });
      setToast({
        text: r.reason === "taken" ? "Already claimed!" : r.reason === "time" ? "Time's up" : r.error && !r.reason ? r.error : "Not a word on the list",
        color: "#f87171",
      });
    }
  };

  const winner = state.winnerId ? byId[state.winnerId] : null;
  const iWon = winner?.id === me.id;
  const words = state.words ?? [];

  return (
    <div className="flex h-dvh flex-col gap-2 p-2 sm:gap-3 sm:p-3">
      {/* header */}
      <header className="flex flex-none items-center gap-2">
        <h1 className="hidden text-lg font-black sm:block">WORD<span className="text-emerald-400"> HUNT</span></h1>
        <span className="rounded-lg bg-slate-800 px-2 py-1 font-mono text-xs tracking-widest ring-1 ring-white/10">{state.code}</span>
        {!isPlayer && <span className="rounded-full bg-amber-400 px-2.5 py-1 text-[11px] font-black text-slate-900">SPECTATING</span>}
        <span className="rounded-full bg-slate-800 px-2.5 py-1 text-xs ring-1 ring-white/10">👁 {audience}<span className="hidden sm:inline"> watching</span></span>
        <span className={`h-2.5 w-2.5 rounded-full ${conn === "online" ? "bg-emerald-400" : "bg-amber-400 pulse-soft"}`} title={`Live connection: ${conn}`} />
        <div className={`mx-auto font-mono text-3xl font-black tabular-nums sm:text-4xl ${running && timeLeft < 30_000 && state.status === "playing" ? "text-rose-400 pulse-soft" : ""}`}>
          {mmss(timeLeft)}
        </div>
        <button onClick={onLeave} className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm ring-1 ring-white/10 hover:bg-slate-700">Leave</button>
      </header>

      {/* scoreboard */}
      <div className="grid flex-none grid-cols-2 gap-2">
        {[0, 1].map((seat) => {
          const p = state.players.find((x) => x.seat === seat);
          if (!p) return <div key={seat} className="rounded-xl bg-slate-800/40 p-2 text-center text-sm text-slate-500 ring-1 ring-white/5">Empty seat</div>;
          const lead = state.players.length === 2 && scoreOf(p.id) > scoreOf(state.players.find((x) => x.id !== p.id)!.id);
          return (
            <div key={p.id} className="flex items-center gap-2 rounded-xl bg-slate-800/70 p-2 ring-1 ring-white/10" style={{ boxShadow: `inset 3px 0 0 ${colorHex(p.color)}` }}>
              <span className="h-3 w-3 flex-none rounded-full" style={{ background: colorHex(p.color) }} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {p.nickname}{p.id === me.id && <span className="text-slate-400"> (you)</span>} {lead && "👑"}
                </p>
                <p className="text-[11px] text-slate-400">
                  {found(p.id)} words · {online.includes(p.id) ? "online" : "reconnecting…"}
                </p>
              </div>
              <p className="text-2xl font-black tabular-nums">{scoreOf(p.id)}</p>
            </div>
          );
        })}
      </div>

      {/* board + words */}
      <div className="flex min-h-0 flex-1 flex-col gap-2 lg:flex-row">
        <div className="cq relative min-h-0 min-w-0 flex-1">
          <div className="absolute inset-0 grid place-items-center">
            <div
              className="relative rounded-2xl bg-slate-900/70 p-1.5 ring-1 ring-white/10"
              style={{ width: "min(100cqw, 100cqh)", height: "min(100cqw, 100cqh)" }}
            >
              {state.grid ? (
                <Board
                  grid={state.grid} claims={claims} myColor={myColor} canPlay={canPlay}
                  others={others} flash={flash} onSelect={onSelect} onLive={onLive}
                />
              ) : (
                <div className="grid h-full place-items-center text-slate-500">Get ready…</div>
              )}
              {toast && (
                <div key={toast.text + toast.color} className="pop pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-slate-950/90 px-4 py-1.5 text-sm font-bold shadow-lg ring-1 ring-white/10" style={{ color: toast.color }}>
                  {toast.text}
                </div>
              )}
            </div>
          </div>
        </div>

        <aside className="flex max-h-[30%] min-h-0 flex-none flex-col rounded-2xl bg-slate-800/60 p-2.5 ring-1 ring-white/10 lg:max-h-none lg:w-72">
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <h2 className="truncate text-sm font-bold text-emerald-300">{catLabel(state.settings.category)}</h2>
            <span className="flex-none text-xs text-slate-400">{state.claims.length}/{words.length}</span>
          </div>
          <div className="flex min-h-0 flex-1 flex-wrap content-start gap-1 overflow-auto lg:grid lg:grid-cols-2 lg:content-start lg:gap-1.5">
            {words.map((w) => {
              const c = claimOf[w];
              return (
                <span
                  key={w}
                  className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold lg:text-xs ${c ? "line-through" : "bg-slate-900 text-slate-200"}`}
                  style={c ? { background: `${c.color}33`, color: c.color } : undefined}
                >
                  {w}
                </span>
              );
            })}
          </div>
        </aside>
      </div>

      {/* countdown */}
      {state.status === "countdown" && (
        <div className="fixed inset-0 z-20 grid place-items-center bg-slate-950/85 backdrop-blur-sm">
          <div className="text-center">
            <p className="mb-2 text-slate-400">{catLabel(state.settings.category)} · {state.settings.durationMin} min</p>
            <div key={Math.ceil(countdownLeft / 1000)} className="pop text-[9rem] font-black leading-none text-emerald-400">
              {countdownLeft > 0 ? Math.ceil(countdownLeft / 1000) : "GO!"}
            </div>
            {!isPlayer && <p className="mt-2 text-amber-300">You are spectating</p>}
          </div>
        </div>
      )}

      {/* results */}
      {state.status === "finished" && showResults && (
        <div className="fixed inset-0 z-30 grid place-items-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="pop w-full max-w-md space-y-4 rounded-3xl bg-slate-800 p-6 text-center ring-1 ring-white/15">
            <p className="text-sm uppercase tracking-widest text-slate-400">Final results</p>
            <h2 className="text-3xl font-black">
              {state.draw ? "It's a draw!" : winner ? (isPlayer ? (iWon ? "You win! 🏆" : `${winner.nickname} wins`) : `${winner.nickname} wins 🏆`) : "Match over"}
            </h2>
            <div className="space-y-2">
              {[...state.players].sort((a, b) => scoreOf(b.id) - scoreOf(a.id)).map((p) => (
                <div key={p.id} className="flex items-center gap-3 rounded-xl bg-slate-900 p-3 text-left" style={{ boxShadow: `inset 4px 0 0 ${colorHex(p.color)}` }}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{p.nickname} {p.id === state.winnerId && "👑"}</p>
                    <p className="text-xs text-slate-400">{found(p.id)} words{p.bonus ? ` · +${p.bonus} finish bonus` : ""}</p>
                  </div>
                  <p className="text-3xl font-black tabular-nums">{scoreOf(p.id)}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-400">{state.claims.length} of {words.length} words found</p>
            <div className="grid gap-2">
              {isPlayer && state.hostId === me.id && (
                <button onClick={() => act("rematch")} className="rounded-xl bg-emerald-500 px-4 py-3 font-black text-slate-950 hover:bg-emerald-400">PLAY AGAIN</button>
              )}
              {isPlayer && state.hostId !== me.id && <p className="text-sm text-slate-400">Waiting for the host to start a rematch…</p>}
              <button onClick={() => setShowResults(false)} className="rounded-xl bg-slate-700 px-4 py-3 font-bold hover:bg-slate-600">View board</button>
              <button onClick={onLeave} className="rounded-xl px-4 py-2 text-sm text-slate-400 hover:text-white">Leave room</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
