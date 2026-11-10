import type { Role } from "./types";

export interface Session { id: string; secret: string; role: Role; nickname: string }

const key = (code: string) => `wordhunt:session:${code}`;
export const NICK_KEY = "wordhunt:nick";

export function loadSession(code: string): Session | null {
  try {
    const v = localStorage.getItem(key(code));
    return v ? (JSON.parse(v) as Session) : null;
  } catch { return null; }
}
export function saveSession(code: string, s: Session) {
  try { localStorage.setItem(key(code), JSON.stringify(s)); } catch {}
}
export function clearSession(code: string) {
  try { localStorage.removeItem(key(code)); } catch {}
}
export const loadNick = () => { try { return localStorage.getItem(NICK_KEY) || ""; } catch { return ""; } };
export const saveNick = (n: string) => { try { localStorage.setItem(NICK_KEY, n); } catch {} };

export const authHeaders = (s: Session) => ({ "x-member-id": s.id, "x-member-secret": s.secret });

export async function joinRequest(
  code: string, nickname: string, role: Role
): Promise<{ session: Session } | { error: string; canSpectate?: boolean }> {
  const prev = loadSession(code);
  try {
    const res = await fetch(`/api/rooms/${code}/join`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nickname, role, memberId: prev?.id, secret: prev?.secret }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.ok) return { error: j.error || "Could not join the room", canSpectate: j.canSpectate };
    const session: Session = { id: j.memberId, secret: j.secret, role: j.role, nickname };
    saveSession(code, session);
    saveNick(nickname);
    return { session };
  } catch {
    return { error: "Network error. Please try again." };
  }
}
