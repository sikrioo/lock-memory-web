CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  client_id TEXT,
  stage INTEGER NOT NULL,
  mode TEXT NOT NULL,
  tier TEXT NOT NULL,
  difficulty INTEGER NOT NULL,
  pattern_json TEXT NOT NULL,
  display_time_ms INTEGER NOT NULL,
  input_limit_sec REAL NOT NULL,
  score_before INTEGER NOT NULL DEFAULT 0,
  combo_before INTEGER NOT NULL DEFAULT 0,
  score_awarded INTEGER,
  score_after INTEGER,
  combo_after INTEGER,
  score_submitted INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_run_stage ON sessions (run_id, stage);
CREATE INDEX IF NOT EXISTS idx_sessions_mode_created ON sessions (mode, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_client_created ON sessions (client_id, created_at DESC);

CREATE TABLE IF NOT EXISTS scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL UNIQUE,
  client_id TEXT,
  player_name TEXT,
  mode TEXT NOT NULL,
  score INTEGER NOT NULL,
  stage INTEGER NOT NULL,
  tier TEXT NOT NULL,
  combo INTEGER DEFAULT 0,
  elapsed_ms INTEGER,
  created_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE INDEX IF NOT EXISTS idx_scores_mode_score ON scores (mode, score DESC, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_scores_mode_created ON scores (mode, created_at DESC);

CREATE TABLE IF NOT EXISTS daily_challenges (
  challenge_date TEXT PRIMARY KEY,
  patterns_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
