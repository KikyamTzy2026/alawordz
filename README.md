# WORD HUNT – Real-Time 1v1 Word Search Battle

Create a room, share the Room ID, and race a friend to find the hidden words. No login – just a nickname.
Others can **watch live as spectators**.

**Stack:** Next.js 14 (App Router) · TypeScript · Tailwind CSS · Vercel Functions · Neon PostgreSQL · Ably (real-time). No Firebase.

## Features

- Create / join a room with a 6-character Room ID (max **2 players**, unlimited **spectators**)
- **JOIN AS PLAYER** or **WATCH AS SPECTATOR** on every entry point (home page and direct `/room/ID` links)
- Host picks duration (5–30 min), grid (18×18 / 20×20) and category; both players press **READY**; host starts; 3-second countdown
- 23 categories: 11 English (incl. Random Mix) + 12 Filipino (with proper **Ñ** support: `PIÑA`, `CARIÑOSA`, `SANTONIÑO`, `ESPAÑA`, …)
- 25–35 hidden words per puzzle, 8 directions (horizontal, vertical, diagonal, forward and backward)
- Drag from first to last letter (snaps to a straight line); rounded capsule highlights; each player's live drag preview is visible to the opponent and to spectators
- Unique highlight colors per player (Blue / Green default, 8 colors, duplicates blocked server-side)
- Scoring: **+10** per correct word, **+20** to whoever claims the final word (finishes the board), invalid selections = 0
- Spectators: **SPECTATING** badge, live audience count, can join mid-match, see final results, can never claim/ready/change settings
- Reconnection: refresh or reopen the Room ID and you are back in; a player who lost their device can rejoin with the same nickname once their old connection has been silent for 20 s
- Rooms are deleted automatically after inactivity (default 60 min)

## Game rules in detail

- Both players hunt the **same** list; a word can be claimed only once (first valid claim wins – enforced by a database primary key, so simultaneous claims are race-safe).
- The match ends when **all words are claimed** (the player who claimed the last word gets the +20 finish bonus) or when the **server timer** expires. Highest score wins; equal scores are a draw.
- Host can start a rematch from the results screen.

## Architecture & security

| Concern | How it works |
| --- | --- |
| Authority | The database is the single source of truth. Timer, countdown, claims, scores and winner are computed server-side from DB timestamps; clients only render. |
| Validation | `POST /api/rooms/[code]/action` (`claim`) re-reads the grid, checks the line is straight, extracts the letters, matches a listed word (forward or reverse) and inserts into `claims (room_id, word)` with `ON CONFLICT DO NOTHING`. |
| Hidden grid | The puzzle is generated when the host starts and is **not sent to anyone until the countdown ends**. |
| Identity | Joining returns a random secret (stored hashed with SHA-256). Every request sends `x-member-id` / `x-member-secret`; roles (player vs spectator, host) are checked on every action. |
| Real-time | The server publishes events (`claim`, `sync`) to Ably channel `wh-<ROOM>` after each change; clients refetch state on `sync` and also poll every 10 s as a fallback. |
| Ably tokens | `/api/ably/token` issues a 1-hour token scoped to **one room**: everyone can subscribe + use presence; only players may publish drag previews (`wh-sel-<ROOM>`); spectators are subscribe-only. The root `ABLY_API_KEY` never reaches the browser. |
| Audience count | Ably presence on the room channel (spectators vs players). |
| Secrets | `DATABASE_URL`, `ABLY_API_KEY`, `CRON_SECRET` are read only in server code (no `NEXT_PUBLIC_` variables). |

> Note: as in every browser word-search, the grid is visible to the players once the match runs, so a determined player could write a solver. The server still guarantees that scoring, timing and one-claim-per-word are fair.

## Ably SDK note (MAU pricing)

New Ably accounts are on MAU pricing, which rejects the classic `ably` package (error 40168). This project uses Ably's v3 split packages:
`@ably/pubsub-server` on the server (publishing + token signing) and `@ably/pubsub-device` in the browser (served from `public/vendor`, copied on postinstall). Every browser client carries a `clientId` (its member id).

## Database

Schema: [`db/schema.sql`](db/schema.sql) (identical to [`db/migrations/001_init.sql`](db/migrations/001_init.sql)).
Tables: `rooms`, `members` (players + spectators), `claims`.
Migrations run with `npm run migrate` and **automatically on every Vercel deploy** (the `vercel-build` script). Applied files are tracked in a `_migrations` table, so re-running is safe. If no database URL is set (e.g. a local `npm run build`), the script skips quietly.

## Deploy to Vercel (step by step)

1. **Push this folder to a GitHub repo** and import it in Vercel (framework: Next.js is auto-detected).
2. **Add Neon:** Vercel project → *Storage* → *Marketplace* → **Neon** → create database → connect to the project.
   This injects `DATABASE_URL` (and related variables) into all environments.
3. **Add Ably:** create a free app at <https://ably.com>, copy its **root API key**, and add it in
   Vercel → *Settings* → *Environment Variables* as `ABLY_API_KEY` (Production, Preview, Development).
4. **Add `CRON_SECRET`:** any long random string (e.g. `openssl rand -hex 32`). Vercel Cron sends it as a bearer token to `/api/cron/cleanup`.
5. **Deploy.** The build runs migrations, then `next build`. Share your URL – you are live.

Optional: `ROOM_TTL_MINUTES` (default `60`) – minutes of inactivity before a room is deleted.

### Automatic cleanup

- `vercel.json` registers a daily cron (`0 3 * * *`, compatible with the Hobby plan) calling `/api/cron/cleanup`.
- Expired rooms are also purged opportunistically every time a new room is created, and active rooms keep themselves alive through a 12-second heartbeat.
- Deleting a room cascades to its members and claims.

## Run locally

```bash
npm install                 # also copies Ably's browser bundle into public/vendor
cp .env.example .env.local  # fill in DATABASE_URL, ABLY_API_KEY, CRON_SECRET
npm run migrate             # creates the tables (reads DATABASE_URL from the environment)
npm run dev                 # http://localhost:3000
```

`npm run migrate` reads `process.env`, so either export the variables first
(`export $(grep -v '^#' .env.local | xargs)`) or run `vercel env pull .env.local` and use Node's `--env-file`:
`node --env-file=.env.local scripts/migrate.mjs`.

Open the site in two browsers (or one normal + one private window): create a room in the first, join as player in the second, and watch from a third as spectator.

Other scripts: `npm run build`, `npm run start`, `npm run typecheck`.

## Project layout

```
app/                      pages + API routes (rooms, join, state, action, ably/token, cron/cleanup)
components/               HomeClient, JoinForm, Lobby, GameScreen, Board (SVG), RoomClient
hooks/useRoom.ts          state sync, Ably connection, presence, live selections
lib/game.ts               server game logic (join, state machine, validation, scoring)
lib/puzzle.ts, words.ts   puzzle generator and the word banks (English + Filipino)
db/                       schema.sql + migrations/
scripts/                  migrate.mjs, copy-ably.mjs
```

## Customising

- **Add words / categories:** edit `lib/words.ts` (bank) and `lib/constants.ts` (label). Words are UPPERCASE with no spaces; keep them 3–14 letters.
- **Scoring / countdown:** constants at the top of `lib/game.ts`.
