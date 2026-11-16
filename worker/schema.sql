CREATE TABLE IF NOT EXISTS daily (
  date TEXT PRIMARY KEY NOT NULL,
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
  sleep_deep_s INTEGER,
  sleep_light_s INTEGER,
  sleep_rem_s INTEGER,
  sleep_awake_s INTEGER,
  sleep_need_min INTEGER,
  nap_seconds INTEGER,
  bb_charged INTEGER,
  bb_drained INTEGER,
  stress_rest_s INTEGER,
  stress_low_s INTEGER,
  stress_med_s INTEGER,
  stress_high_s INTEGER,
  calories_active INTEGER,
  hr_max INTEGER,
  sleep_stress_avg REAL,
  spo2_avg REAL,
  spo2_min REAL,
  resp_avg REAL,
  hrv_weekly_avg REAL,
  floors REAL,
  training_load REAL,
  hrv_status TEXT,
  raw_json TEXT,
  synced_at INTEGER
);

CREATE TABLE IF NOT EXISTS activities (
  id TEXT PRIMARY KEY NOT NULL,
  date TEXT,
  type TEXT,
  start_ts INTEGER,
  duration_s INTEGER,
  distance_m REAL,
  avg_hr REAL,
  training_load REAL,
  aerobic_te REAL,
  anaerobic_te REAL,
  calories REAL,
  max_hr REAL,
  total_sets INTEGER,
  total_reps INTEGER,
  avg_cadence REAL,
  avg_stride_m REAL,
  avg_gct_ms REAL,
  avg_power REAL,
  hr_zones_json TEXT,
  sets_json TEXT,
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

CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint TEXT PRIMARY KEY NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at INTEGER
);
