CREATE TABLE IF NOT EXISTS stores (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  consumer_key TEXT,
  consumer_secret TEXT,
  plugin_version TEXT,
  woocommerce_version TEXT,
  wordpress_version TEXT,
  php_version TEXT,
  settings TEXT DEFAULT '{}',
  sync_config TEXT DEFAULT '{}',
  last_seen TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id TEXT,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium',
  type TEXT,
  timestamp TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_alerts_store ON alerts(store_id);
CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts(severity);
CREATE INDEX IF NOT EXISTS idx_alerts_timestamp ON alerts(timestamp DESC);
-- Expression index for the 7-day trend GROUP BY date(timestamp) query.
-- SQLite supports expression indexes from v3.31.0 (Jan 2020).
CREATE INDEX IF NOT EXISTS idx_alerts_date ON alerts(date(timestamp));

CREATE TABLE IF NOT EXISTS store_stats (
  store_id TEXT PRIMARY KEY,
  features TEXT DEFAULT '{}',
  health_status TEXT DEFAULT 'unknown',
  admin_notices TEXT DEFAULT '[]',
  error_counts TEXT DEFAULT '{}',
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS auth_tokens (
  token TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  issued TEXT DEFAULT (datetime('now')),
  expires TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_codes (
  email TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  expires TEXT NOT NULL
);
