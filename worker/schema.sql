CREATE TABLE IF NOT EXISTS daily (
  date TEXT PRIMARY KEY,
  sleep_score REAL,
  sleep_seconds INTEGER,
  hrv_avg REAL,
  resting_hr REAL,
  stress_avg REAL,
  bb_high REAL,
  bb_low REAL,
  steps INTEGER,
  intensity_minutes INTEGER,
  calories INTEGER,
  raw_json TEXT,
  synced_at INTEGER
);

CREATE TABLE IF NOT EXISTS activities (
  id TEXT PRIMARY KEY,
  date TEXT,
  type TEXT,
  start_ts INTEGER,
  duration_s INTEGER,
  distance_m REAL,
  avg_hr REAL,
  raw_json TEXT
);

CREATE TABLE IF NOT EXISTS sync_state (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
