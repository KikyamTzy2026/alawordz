-- WORD HUNT initial schema
CREATE TABLE IF NOT EXISTS rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'lobby' CHECK (status IN ('lobby','countdown','playing','finished')),
  host_id uuid,
  duration_min int NOT NULL DEFAULT 10,
  category text NOT NULL DEFAULT 'random',
  grid_size int NOT NULL DEFAULT 18,
  grid jsonb,
  words jsonb,
  starts_at timestamptz,
  ends_at timestamptz,
  finished_at timestamptz,
  winner_id uuid,
  draw boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_activity timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rooms_last_activity_idx ON rooms (last_activity);

CREATE TABLE IF NOT EXISTS members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  secret_hash text NOT NULL,
  nickname text NOT NULL,
  role text NOT NULL CHECK (role IN ('player','spectator')),
  seat smallint CHECK (seat IN (0,1)),
  color text,
  ready boolean NOT NULL DEFAULT false,
  bonus int NOT NULL DEFAULT 0,
  joined_at timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS members_room_idx ON members (room_id);
CREATE UNIQUE INDEX IF NOT EXISTS members_room_seat_uniq ON members (room_id, seat) WHERE role = 'player';
CREATE UNIQUE INDEX IF NOT EXISTS members_room_color_uniq ON members (room_id, color) WHERE role = 'player';

CREATE TABLE IF NOT EXISTS claims (
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  word text NOT NULL,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  ar smallint NOT NULL,
  ac smallint NOT NULL,
  br smallint NOT NULL,
  bc smallint NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, word)
);
