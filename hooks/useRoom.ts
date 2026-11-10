"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ClaimView, RoomState } from "@/lib/types";
import { authHeaders, type Session } from "@/lib/session";

let ablyLoader: Promise<any> | null = null;
/** Loads the self-hosted Ably browser bundle once (see scripts/copy-ably.mjs). */
function loadAbly(): Promise<any> {
  const w = window as any;
  if (w.AblyPubSub) return Promise.resolve(w.AblyPubSub);
  if (!ablyLoader) {
    ablyLoader = new Promise((resolve, reject) => {
      const el = document.createElement("script");
      el.src = "/vendor/ably-v3.min.js";
      el.async = true;
      el.onload = () => resolve(w.AblyPubSub);
      el.onerror = () => { ablyLoader = null; reject(new Error("Could not load Ably")); };
      document.head.appendChild(el);
    });
  }
  return ablyLoader;
}

export type Cell = [number, number];
export type LiveMap = Record<string, { a: Cell; b: Cell } | null>;

export function useRoom(code: string, session: Session, onFatal: (k: "auth" | "gone") => void) {
  const [state, setState] = useState<RoomState | null>(null);
  const [live, setLive] = useState<LiveMap>({});
  const [audience, setAudience] = useState(0);
  const [online, setOnline] = useState<string[]>([]);
  const [conn, setConn] = useState<"connecting" | "online" | "offline">("connecting");
  const offset = useRef(0);
  const reqSeq = useRef(0);
  const appliedSeq = useRef(0);
  const selCh = useRef<any>(null);
  const lastSel = useRef("");
  const fatal = useRef(onFatal);
  fatal.current = onFatal;

  const serverNow = useCallback(() => Date.now() + offset.current, []);

  const apply = useCallback((s: RoomState) => {
    offset.current = s.serverNow - Date.now();
    setState(s);
  }, []);

  const refresh = useCallback(async () => {
    const id = ++reqSeq.current;
    try {
      const res = await fetch(`/api/rooms/${code}/state`, { headers: authHeaders(session), cache: "no-store" });
      if (res.status === 401) return fatal.current("auth");
      if (res.status === 404) return fatal.current("gone");
      if (!res.ok) return;
      const j = await res.json();
      if (id < appliedSeq.current) return; // stale response
      appliedSeq.current = id;
      apply(j.state);
    } catch { /* offline - the next poll will catch up */ }
  }, [code, session, apply]);

  const act = useCallback(
    async (type: string, extra: Record<string, unknown> = {}): Promise<any> => {
      try {
        const res = await fetch(`/api/rooms/${code}/action`, {
          method: "POST",
          headers: { ...authHeaders(session), "content-type": "application/json" },
          body: JSON.stringify({ type, ...extra }),
        });
        if (res.status === 401) { fatal.current("auth"); return { ok: false, error: "Session expired" }; }
        if (res.status === 404) { fatal.current("gone"); return { ok: false, error: "Room not found" }; }
        const j = await res.json().catch(() => ({ ok: false, error: "Unexpected server response" }));
        if (j.state) apply(j.state);
        return j;
      } catch {
        return { ok: false, error: "Network error" };
      }
    },
    [code, session, apply]
  );

  const addClaim = useCallback((c: ClaimView) => {
    setState((p) => (p && !p.claims.some((x) => x.word === c.word) ? { ...p, claims: [...p.claims, c] } : p));
    setLive((l) => ({ ...l, [c.playerId]: null }));
  }, []);

  const publishSel = useCallback((a: Cell | null, b: Cell | null) => {
    const k = a && b ? `${a}|${b}` : "";
    if (k === lastSel.current) return;
    lastSel.current = k;
    try { selCh.current?.publish("s", { a, b }); } catch {}
  }, []);

  // initial load + resilient polling fallback
  useEffect(() => {
    refresh();
        const beat = setInterval(() => act("heartbeat"), 12_000);
    const vis = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", vis);
    window.addEventListener("online", refresh);
    return () => {
      clearInterval(beat);
      document.removeEventListener("visibilitychange", vis);
      window.removeEventListener("online", refresh);
    };
  }, [refresh, act]);

  // polling fallback: fast while Ably is down, slow safety net while it is up
  useEffect(() => {
    const poll = setInterval(refresh, conn === "online" ? 10_000 : 2_500);
    return () => clearInterval(poll);
  }, [refresh, conn]);

  // Ably real-time connection
  useEffect(() => {
    let closed = false;
    let client: any;
    (async () => {
      const Ably = await loadAbly();
      if (closed) return;
      client = Ably.createClient({
        clientId: session.id, // device clients must carry a clientId (MAU pricing)
        authCallback: async (_params: any, cb: any) => {
          try {
            const r = await fetch("/api/ably/token", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ code, memberId: session.id, secret: session.secret }),
            });
            if (!r.ok) throw new Error("token request failed");
            cb(null, await r.json());
          } catch (e: any) { cb(e?.message || "token error", null); }
        },
      });
      client.connection.on((c: any) => {
        if (c.current === "connected") { setConn("online"); refresh(); }
        else if (c.current === "connecting" || c.current === "initialized") setConn("connecting");
        else setConn("offline");
      });
      const room = client.channels.get(`wh-${code}`);
      const sel = client.channels.get(`wh-sel-${code}`);
      selCh.current = sel;

      room.subscribe((m: any) => {
        if (m.name === "claim") addClaim(m.data as ClaimView);
        refresh();
      });
      sel.subscribe((m: any) => {
        const pid = m.clientId as string;
        if (!pid || pid === session.id) return;
        const d = m.data || {};
        setLive((l) => ({ ...l, [pid]: d.a && d.b ? { a: d.a, b: d.b } : null }));
      });

      const syncPresence = async () => {
        try {
          const members = await room.presence.get();
          const spectators = new Set<string>();
          const players = new Set<string>();
          for (const p of members) (p.data?.role === "spectator" ? spectators : players).add(p.clientId);
          setAudience(spectators.size);
          setOnline(Array.from(players));
        } catch {}
      };
      room.presence.subscribe(syncPresence);
      await room.presence.enter({ role: session.role });
      syncPresence();
    })().catch(() => setConn("offline"));
    return () => {
      closed = true;
      selCh.current = null;
      try { client?.close(); } catch {}
    };
  }, [code, session, refresh, addClaim]);

  // schedule server-authoritative transitions (countdown → playing → finished).
  // If the client clock is slightly ahead of the server, avoid a tight refresh loop:
  // when the target is already past, back off to 500ms instead of ~120ms.
  const status = state?.status;
  const startsAt = state?.startsAt;
  const endsAt = state?.endsAt;
  useEffect(() => {
    if (!status || (status !== "countdown" && status !== "playing")) return;
    const target = (status === "countdown" ? startsAt : endsAt) ?? 0;
    const remaining = target - serverNow();
    const delay = remaining > 0 ? remaining + 150 : 500;
    const t = setTimeout(() => (status === "countdown" ? refresh() : act("tick")), delay);
    return () => clearTimeout(t);
  }, [status, startsAt, endsAt, refresh, act, serverNow]);

  return { state, live, audience, online, conn, serverNow, act, refresh, addClaim, publishSel };
}
