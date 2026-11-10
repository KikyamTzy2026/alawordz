export type Status = "lobby" | "countdown" | "playing" | "finished";
export type Role = "player" | "spectator";

export interface Settings {
  durationMin: number;
  category: string;
  gridSize: number;
}

export interface PlayerView {
  id: string;
  nickname: string;
  color: string; // color id, see COLORS
  ready: boolean;
  seat: number;
  bonus: number;
}

export interface ClaimView {
  word: string;
  playerId: string;
  a: [number, number];
  b: [number, number];
}

export interface RoomState {
  code: string;
  status: Status;
  serverNow: number;
  hostId: string | null;
  settings: Settings;
  players: PlayerView[];
  grid: string[] | null; // rows; null until the countdown ends
  words: string[] | null;
  claims: ClaimView[];
  startsAt: number | null;
  endsAt: number | null;
  winnerId: string | null;
  draw: boolean;
  me: { id: string; role: Role; nickname: string };
}
