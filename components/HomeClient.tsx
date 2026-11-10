"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import JoinForm from "./JoinForm";
import { loadNick, saveNick, saveSession } from "@/lib/session";

export default function HomeClient() {
  const router = useRouter();
  const [nick, setNick] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => setNick(loadNick()), []);

  const create = async () => {
    if (!nick.trim()) return setErr("Enter a nickname first");
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/rooms", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ nickname: nick.trim() }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || "Could not create room");
      saveNick(nick.trim());
      saveSession(j.code, { id: j.memberId, secret: j.secret, role: "player", nickname: nick.trim() });
      router.push(`/room/${j.code}`);
    } catch (e: any) {
      setErr(e.message || "Network error"); setBusy(false);
    }
  };

  const cleanCode = code.toUpperCase().replace(/[^A-Z0-9]/g, "");

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center gap-6 px-4 py-8">
      <header className="text-center">
        <h1 className="text-5xl font-black tracking-tight sm:text-6xl">
          WORD<span className="text-emerald-400"> HUNT</span>
        </h1>
        <p className="mt-2 text-slate-400">1v1 real-time word search battle. No sign-up – just a nickname.</p>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3 rounded-2xl bg-slate-800/60 p-5 ring-1 ring-white/10">
          <h2 className="text-lg font-bold">Create a room</h2>
          <input
            value={nick} onChange={(e) => setNick(e.target.value)} maxLength={16} placeholder="Your nickname"
            className="w-full rounded-xl bg-slate-900 px-4 py-3 outline-none ring-1 ring-white/10 focus:ring-emerald-400"
          />
          <button disabled={busy} onClick={create}
            className="w-full rounded-xl bg-emerald-500 px-4 py-3 font-bold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60">
            {busy ? "Creating…" : "CREATE ROOM"}
          </button>
          {err && <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{err}</p>}
          <p className="text-xs text-slate-500">You become the host: pick the category, grid and timer, then start.</p>
        </div>

        <div className="space-y-3 rounded-2xl bg-slate-800/60 p-5 ring-1 ring-white/10">
          <h2 className="text-lg font-bold">Join a room</h2>
          <input
            value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={12} placeholder="ROOM ID"
            className="w-full rounded-xl bg-slate-900 px-4 py-3 text-center font-mono text-lg tracking-[0.3em] outline-none ring-1 ring-white/10 focus:ring-emerald-400"
          />
          {cleanCode.length >= 4 ? (
            <JoinForm key={cleanCode} code={cleanCode} onJoined={() => router.push(`/room/${cleanCode}`)} />
          ) : (
            <p className="text-sm text-slate-500">Enter a Room ID to join as a player or watch as a spectator.</p>
          )}
        </div>
      </section>
    </main>
  );
}
