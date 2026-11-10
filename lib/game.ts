import crypto from "node:crypto";
import { db } from "./db";
import { publish, publishSync } from "./ably";
import { buildPuzzle } from "./puzzle";
import { CATEGORIES, COLORS, DURATIONS, GRID_SIZES } from "./constants";
import type { PlayerView, Role, RoomState } from "./types";

export interface Me { id: string; role: Role; roomId: string; nickname: string }
export interface Out { status: number; body: any }
export const ok = (body: any = {}): Out => ({ status: 200, body: { ok: true, ...body } });
export const bad = (error: string, status = 400, extra: any = {}): Out => ({ status, body: { ok: false, error, ...extra } });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const ROOM_TTL_MIN = Math.max(5, Number(process.env.ROOM_TTL_MINUTES || 60));
const COUNTDOWN_MS = 3000;
const FINISH_BONUS = 20;
const WORD_POINTS = 10;
const STALE_MS = 20_000; // a player unseen for this long may be reclaimed by nickname

export const hashSecret = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const newSecret = () => crypto.randomBytes(24).toString("hex");
const makeCode = () => Array.from({ length: 6 }, () => CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]).join("");
export const normCode = (s: unknown) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
export const cleanNick = (s: unknown) =>
  String(s ?? "").replace(/[\u0000-\u001f\u007f<>]/g, "").trim().replace(/\s+/g, " ").slice(0, 16);
const ms = (v: any) => (v ? new Date(v).getTime() : null);

/* ----------------------------- housekeeping ----------------------------- */

export async function cleanupExpired(): Promise<number> {
  const rows = await db()`DELETE FROM rooms WHERE last_activity < now() - make_interval(mins => ${ROOM_TTL_MIN}::int) RETURNING id`;
  return rows.length;
}

/* ------------------------------ auth helpers ----------------------------- */

export async function verifyCreds(code: string, id: string, secret: string): Promise<Me | "gone" | null> {
  const q = db();
  if (!UUID.test(id) || !secret) {
    const r = await q`SELECT 1 FROM rooms WHERE code=${code}`;
    return r.length ? null : "gone";
  }
  const rows = await q`SELECT m.id, m.role, m.nickname, m.secret_hash, m.room_id FROM members m JOIN rooms r ON r.id=m.room_id WHERE m.id=${id} AND r.code=${code}`;
  const m = rows[0];
  if (!m) {
    const r = await q`SELECT 1 FROM rooms WHERE code=${code}`;
    return r.length ? null : "gone";
  }
  const a = Buffer.from(m.secret_hash);
  const b = Buffer.from(hashSecret(secret));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  await q`UPDATE members SET last_seen=now() WHERE id=${id}`;
  return { id: m.id, role: m.role as Role, roomId: m.room_id, nickname: m.nickname };
}

export const authenticate = (req: Request, code: string) =>
  verifyCreds(code, req.headers.get("x-member-id") || "", req.headers.get("x-member-secret") || "");

/* ------------------------------ create / join ----------------------------- */

export async function createRoom(nicknameRaw: unknown): Promise<Out> {
  const nick = cleanNick(nicknameRaw);
  if (!nick) return bad("Enter a nickname first");
  const q = db();
  await cleanupExpired().catch(() => {});
  for (let i = 0; i < 8; i++) {
    const code = makeCode();
    try {
      const r = await q`INSERT INTO rooms (code) VALUES (${code}) RETURNING id`;
      const secret = newSecret();
      const m = await q`INSERT INTO members (room_id, secret_hash, nickname, role, seat, color) VALUES (${r[0].id}, ${hashSecret(secret)}, ${nick}, 'player', 0, ${COLORS[0].id}) RETURNING id`;
      await q`UPDATE rooms SET host_id=${m[0].id} WHERE id=${r[0].id}`;
      return ok({ code, memberId: m[0].id, secret, role: "player" });
    } catch (e: any) {
      if (e?.code === "23505") continue; // code collision
      throw e;
    }
  }
  return bad("Could not create a room, please try again", 500);
}

export async function joinRoom(code: string, body: any): Promise<Out> {
  const q = db();
  const nick = cleanNick(body?.nickname);
  const role: Role = body?.role === "spectator" ? "spectator" : "player";
  if (!nick) return bad("Enter a nickname first");
  const rooms = await q`SELECT id, status FROM rooms WHERE code=${code}`;
  const room = rooms[0];
  if (!room) return bad("Room not found. Check the Room ID.", 404);

  // 1) Resume an existing session of the same role
  if (typeof body?.memberId === "string" && typeof body?.secret === "string") {
    const me = await verifyCreds(code, body.memberId, body.secret);
    if (me && me !== "gone" && me.role === role) return ok({ memberId: me.id, secret: body.secret, role: me.role });
  }

  if (role === "spectator") {
    const secret = newSecret();
    const m = await q`INSERT INTO members (room_id, secret_hash, nickname, role) VALUES (${room.id}, ${hashSecret(secret)}, ${nick}, 'spectator') RETURNING id`;
    await publishSync(code);
    return ok({ memberId: m[0].id, secret, role: "spectator" });
  }

  // 2) Player: reclaim a seat by nickname if that player has disconnected
  const players = await q`SELECT id, nickname, seat, color, last_seen FROM members WHERE room_id=${room.id} AND role='player' ORDER BY seat`;
  const same = players.find((p: any) => p.nickname.toLowerCase() === nick.toLowerCase());
  if (same) {
    if (Date.now() - new Date(same.last_seen).getTime() < STALE_MS)
      return bad("That nickname is already in use by a connected player in this room.", 409);
    const secret = newSecret();
    await q`UPDATE members SET secret_hash=${hashSecret(secret)}, last_seen=now() WHERE id=${same.id}`;
    await publishSync(code);
    return ok({ memberId: same.id, secret, role: "player", reclaimed: true });
  }

  // 3) New player: only while the room is in the lobby and a seat is free
  if (room.status !== "lobby")
    return bad("This match is already in progress. You can watch it as a spectator.", 409, { canSpectate: true });
  const taken = new Set(players.map((p: any) => p.seat));
  const seat = [0, 1].find((s) => !taken.has(s));
  if (seat === undefined) return bad("Room is full (2/2 players). You can watch as a spectator.", 409, { canSpectate: true });
  const usedColors = new Set(players.map((p: any) => p.color));
  const color = COLORS.find((c) => !usedColors.has(c.id))!.id;
  const secret = newSecret();
  try {
    const m = await q`INSERT INTO members (room_id, secret_hash, nickname, role, seat, color) VALUES (${room.id}, ${hashSecret(secret)}, ${nick}, 'player', ${seat}, ${color}) RETURNING id`;
    await q`UPDATE rooms SET last_activity=now() WHERE id=${room.id}`;
    await publishSync(code);
    return ok({ memberId: m[0].id, secret, role: "player" });
  } catch (e: any) {
    if (e?.code === "23505") return bad("Room is full (2/2 players). You can watch as a spectator.", 409, { canSpectate: true });
    throw e;
  }
}

/* ------------------------------ state machine ----------------------------- */

async function decideWinner(roomId: string) {
  const q = db();
  const rows = await q`SELECT m.id, ((SELECT count(*) FROM claims c WHERE c.member_id=m.id)::int * ${WORD_POINTS} + m.bonus) AS score FROM members m WHERE m.room_id=${roomId} AND m.role='player'`;
  const s = rows.map((r: any) => ({ id: r.id as string, score: Number(r.score) })).sort((a, b) => b.score - a.score);
  const draw = s.length >= 2 && s[0].score === s[1].score;
  const winner = !draw && s.length ? s[0].id : null;
  await q`UPDATE rooms SET winner_id=${winner}, draw=${draw} WHERE id=${roomId}`;
}

async function finishRoom(roomId: string, code: string) {
  const r = await db()`UPDATE rooms SET status='finished', finished_at=now() WHERE id=${roomId} AND status IN ('countdown','playing') RETURNING id`;
  if (!r.length) return false;
  await decideWinner(roomId);
  await publishSync(code);
  return true;
}

/** Lazily applies time-based transitions (countdown -> playing -> finished). The DB is the single source of truth. */
async function advance(room: any) {
  const now = Date.now();
  const starts = ms(room.starts_at);
  const ends = ms(room.ends_at);
  let changed = false;
  if (room.status === "countdown" && starts && now >= starts) {
    await db()`UPDATE rooms SET status='playing' WHERE id=${room.id} AND status='countdown'`;
    room.status = "playing";
    changed = true;
  }
  if ((room.status === "playing" || room.status === "countdown") && ends && now >= ends) {
    await finishRoom(room.id, room.code);
    changed = true;
  }
  if (changed) {
    const r = await db()`SELECT * FROM rooms WHERE id=${room.id}`;
    return r[0] ?? room;
  }
  return room;
}

export async function getState(code: string, me: Me): Promise<RoomState | null> {
  const q = db();
  const rows = await q`SELECT * FROM rooms WHERE code=${code}`;
  if (!rows[0]) return null;
  const room = await advance(rows[0]);
  const [members, claims] = await Promise.all([
    q`SELECT id, nickname, seat, color, ready, bonus FROM members WHERE room_id=${room.id} AND role='player' ORDER BY seat`,
    q`SELECT word, member_id, ar, ac, br, bc FROM claims WHERE room_id=${room.id} ORDER BY claimed_at`,
  ]);
  const reveal = room.status === "playing" || room.status === "finished"; // never leak the grid during the countdown
  const players: PlayerView[] = members.map((m: any) => ({
    id: m.id, nickname: m.nickname, color: m.color, ready: m.ready, seat: m.seat, bonus: m.bonus,
  }));
  return {
    code,
    status: room.status,
    serverNow: Date.now(),
    hostId: room.host_id,
    settings: { durationMin: room.duration_min, category: room.category, gridSize: room.grid_size },
    players,
    grid: reveal ? room.grid : null,
    words: reveal ? room.words : null,
    claims: claims.map((c: any) => ({ word: c.word, playerId: c.member_id, a: [c.ar, c.ac], b: [c.br, c.bc] })),
    startsAt: ms(room.starts_at),
    endsAt: ms(room.ends_at),
    winnerId: room.winner_id,
    draw: room.draw,
    me: { id: me.id, role: me.role, nickname: me.nickname },
  };
}

const withState = async (code: string, me: Me) => ok({ state: await getState(code, me) });

/* --------------------------------- claims --------------------------------- */

const isCell = (v: any, n: number) =>
  Array.isArray(v) && v.length === 2 && v.every((x) => Number.isInteger(x) && x >= 0 && x < n);

async function claimWord(code: string, me: Me, body: any): Promise<Out> {
  if (me.role !== "player") return bad("Spectators cannot select words", 403);
  const q = db();
  const rows = await q`SELECT * FROM rooms WHERE id=${me.roomId}`;
  if (!rows[0]) return bad("Room not found", 404);
  const room = await advance(rows[0]);
  if (room.status !== "playing") return bad("The match is not running", 409, { reason: "time" });

  const grid: string[] = room.grid;
  const words: string[] = room.words;
  const n = grid.length;
  if (!isCell(body.a, n) || !isCell(body.b, n)) return bad("Invalid selection", 400, { reason: "invalid" });
  const [r0, c0] = body.a as [number, number];
  const [r1, c1] = body.b as [number, number];
  const dr = r1 - r0, dc = c1 - c0;
  const straight = dr === 0 || dc === 0 || Math.abs(dr) === Math.abs(dc);
  const len = Math.max(Math.abs(dr), Math.abs(dc)) + 1;
  if (!straight || len < 3) return bad("Invalid selection", 200, { reason: "invalid" });

  const sr = Math.sign(dr), sc = Math.sign(dc);
  const letters: string[] = [];
  for (let i = 0; i < len; i++) letters.push(Array.from(grid[r0 + sr * i])[c0 + sc * i]);
  const text = letters.join("");
  const reversed = letters.slice().reverse().join("");
  const word = words.find((w) => w === text || w === reversed);
  if (!word) return { status: 200, body: { ok: false, reason: "invalid" } };

  // Atomic claim: primary key (room_id, word) guarantees a word can only be claimed once
  const ins = await q`INSERT INTO claims (room_id, word, member_id, ar, ac, br, bc) VALUES (${room.id}, ${word}, ${me.id}, ${r0}, ${c0}, ${r1}, ${c1}) ON CONFLICT DO NOTHING RETURNING word`;
  if (!ins.length) return { status: 200, body: { ok: false, reason: "taken" } };

  const cnt = await q`SELECT count(*)::int AS n FROM claims WHERE room_id=${room.id}`;
  const finished = cnt[0].n >= words.length;
  await publish(code, "claim", { word, playerId: me.id, a: [r0, c0], b: [r1, c1] });
  if (finished) {
    await q`UPDATE members SET bonus=${FINISH_BONUS} WHERE id=${me.id}`;
    await finishRoom(room.id, code);
  }
  return { status: 200, body: { ok: true, word, finished } };
}

/* --------------------------------- actions -------------------------------- */

export async function handleAction(code: string, me: Me, body: any): Promise<Out> {
  const q = db();
  const type = String(body?.type ?? "");

  if (type === "heartbeat") {
    await q`UPDATE rooms SET last_activity=now() WHERE id=${me.roomId}`;
    return ok();
  }
  if (type === "tick") return withState(code, me); // getState applies time transitions
  if (type === "claim") return claimWord(code, me, body);

  const rooms = await q`SELECT * FROM rooms WHERE id=${me.roomId}`;
  const room = rooms[0];
  if (!room) return bad("Room not found", 404);
  const isHost = room.host_id === me.id;

  switch (type) {
    case "ready": {
      if (me.role !== "player") return bad("Spectators cannot ready up", 403);
      const r = await q`UPDATE members SET ready=${!!body.ready} WHERE id=${me.id} AND role='player' AND EXISTS (SELECT 1 FROM rooms WHERE id=${room.id} AND status='lobby') RETURNING id`;
      if (!r.length) return bad("The match has already started", 409);
      await publishSync(code);
      return withState(code, me);
    }
    case "color": {
      if (me.role !== "player") return bad("Spectators cannot pick a color", 403);
      const color = COLORS.find((c) => c.id === body.color)?.id;
      if (!color) return bad("Unknown color");
      if (room.status !== "lobby") return bad("Colors can only be changed in the lobby", 409);
      try {
        await q`UPDATE members SET color=${color} WHERE id=${me.id}`;
      } catch (e: any) {
        if (e?.code === "23505") return bad("That color is already taken by your opponent", 409);
        throw e;
      }
      await publishSync(code);
      return withState(code, me);
    }
    case "settings": {
      if (!isHost || me.role !== "player") return bad("Only the host can change settings", 403);
      if (room.status !== "lobby") return bad("Settings are locked once the match starts", 409);
      const durationMin = Number(body.durationMin ?? room.duration_min);
      const gridSize = Number(body.gridSize ?? room.grid_size);
      const category = String(body.category ?? room.category);
      if (!DURATIONS.includes(durationMin) || !GRID_SIZES.includes(gridSize) || !CATEGORIES.some((c) => c.id === category))
        return bad("Invalid settings");
      const changed = durationMin !== room.duration_min || gridSize !== room.grid_size || category !== room.category;
      await q`UPDATE rooms SET duration_min=${durationMin}, grid_size=${gridSize}, category=${category}, last_activity=now() WHERE id=${room.id}`;
      if (changed) await q`UPDATE members SET ready=false WHERE room_id=${room.id} AND role='player'`;
      await publishSync(code);
      return withState(code, me);
    }
    case "start": {
      if (!isHost || me.role !== "player") return bad("Only the host can start the match", 403);
      const puzzle = buildPuzzle(room.category, room.grid_size);
      const startsAt = new Date(Date.now() + COUNTDOWN_MS);
      const endsAt = new Date(startsAt.getTime() + room.duration_min * 60_000);
      const r = await q`UPDATE rooms SET status='countdown', grid=${JSON.stringify(puzzle.grid)}::jsonb, words=${JSON.stringify(puzzle.words)}::jsonb,
          starts_at=${startsAt.toISOString()}::timestamptz, ends_at=${endsAt.toISOString()}::timestamptz, finished_at=NULL, winner_id=NULL, draw=false, last_activity=now()
        WHERE id=${room.id} AND status='lobby'
          AND (SELECT count(*) FROM members WHERE room_id=${room.id} AND role='player' AND ready)=2 RETURNING id`;
      if (!r.length) return bad("Both players must be READY before starting", 409);
      await publishSync(code);
      return withState(code, me);
    }
    case "rematch": {
      if (!isHost || me.role !== "player") return bad("Only the host can start a rematch", 403);
      if (room.status !== "finished") return bad("The match is not finished", 409);
      await q`DELETE FROM claims WHERE room_id=${room.id}`;
      await q`UPDATE members SET ready=false, bonus=0 WHERE room_id=${room.id}`;
      await q`UPDATE rooms SET status='lobby', grid=NULL, words=NULL, starts_at=NULL, ends_at=NULL, finished_at=NULL, winner_id=NULL, draw=false, last_activity=now() WHERE id=${room.id}`;
      await publishSync(code);
      return withState(code, me);
    }
    case "leave": {
      // Leaving only frees the seat while in the lobby; mid-match you can always reconnect with the Room ID.
      if (room.status === "lobby" || me.role === "spectator") {
        await q`DELETE FROM members WHERE id=${me.id}`;
        if (me.role === "player" && isHost) {
          const next = await q`SELECT id FROM members WHERE room_id=${room.id} AND role='player' ORDER BY seat LIMIT 1`;
          if (next[0]) await q`UPDATE rooms SET host_id=${next[0].id} WHERE id=${room.id}`;
          else await q`DELETE FROM rooms WHERE id=${room.id}`;
        }
        await publishSync(code);
      }
      return ok();
    }
    default:
      return bad("Unknown action");
  }
}

/** Turns an unexpected server error into a message that tells the owner what to fix. */
export function errMsg(e: unknown): string {
  const m = String((e as any)?.message ?? e ?? "");
  if (m.includes("DATABASE_URL")) return "Server setup error: DATABASE_URL is not set. Connect Neon to the Vercel project and redeploy.";
  if (m.includes("ABLY_API_KEY")) return "Server setup error: " + m.slice(0, 120);
  if (/password authentication|ECONNREFUSED|fetch failed|ENOTFOUND|endpoint/i.test(m)) return "Database connection failed. Check that DATABASE_URL in Vercel is the current Neon connection string.";
  if (/does not exist|permission denied/i.test(m)) return "Database error: " + m.slice(0, 140);
  return "Server error. Check the Vercel function logs for details.";
}
