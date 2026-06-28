CREATE TABLE IF NOT EXISTS leaderboard_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL UNIQUE,
  session_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  player_name TEXT NOT NULL,
  name_source TEXT NOT NULL,
  mode TEXT NOT NULL,
  score INTEGER NOT NULL,
  stage INTEGER NOT NULL,
  tier TEXT NOT NULL,
  combo INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE INDEX IF NOT EXISTS idx_leaderboard_entries_mode_score
  ON leaderboard_entries (mode, score DESC, stage DESC, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_leaderboard_entries_mode_created
  ON leaderboard_entries (mode, created_at DESC);
