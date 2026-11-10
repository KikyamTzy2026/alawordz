"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import JoinForm from "./JoinForm";
import Lobby from "./Lobby";
import GameScreen from "./GameScreen";
import { useRoom } from "@/hooks/useRoom";
import { clearSession, loadSession, type Session } from "@/lib/session";

function Splash({ text }: { text: string }) {
  return <div className="grid h-dvh place-items-center text-slate-400">{text}</div>;
}

export default function RoomClient({ code }: { code: string }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [notice, setNotice] = useState("");
  useEffect(() => setSession(loadSession(code)), [code]);

  if (session === undefined) return <Splash text="Loading…" />;
  if (!session)
    return (
      <main className="mx-auto grid min-h-dvh max-w-md place-items-center px-4">
        <div className="w-full space-y-4 rounded-2xl bg-slate-800/60 p-6 ring-1 ring-white/10">
          <div>
            <h1 className="text-2xl font-black">WORD<span className="text-emerald-400"> HUNT</span></h1>
            <p className="text-sm text-slate-400">Room <span className="font-mono font-bold tracking-widest text-white">{code}</span></p>
          </div>
          <JoinForm code={code} notice={notice} onJoined={(s) => { setNotice(""); setSession(s); }} />
        </div>
      </main>
    );
  return (
    <RoomView
      key={session.id} code={code} session={session}
      onFatal={(k) => {
        clearSession(code);
        setNotice(k === "gone" ? "That room no longer exists." : "Your session expired. Rejoin with the same nickname to reconnect.");
        setSession(null);
      }}
    />
  );
}

function RoomView({ code, session, onFatal }: { code: string; session: Session; onFatal: (k: "auth" | "gone") => void }) {
  const router = useRouter();
  const room = useRoom(code, session, onFatal);
  const { state } = room;
  if (!state) return <Splash text="Connecting to room…" />;

  const leave = async () => {
    if (state.status === "lobby" || session.role === "spectator") {
      await room.act("leave");
      clearSession(code);
    } // mid-match: keep the session so the player can reconnect with the Room ID
    router.push("/");
  };

  return state.status === "lobby" ? (
    <Lobby state={state} audience={room.audience} online={room.online} conn={room.conn} act={room.act} onLeave={leave} />
  ) : (
    <GameScreen
      state={state} audience={room.audience} online={room.online} live={room.live} conn={room.conn}
      serverNow={room.serverNow} act={room.act} addClaim={room.addClaim} onLive={room.publishSel} onLeave={leave}
    />
  );
}
