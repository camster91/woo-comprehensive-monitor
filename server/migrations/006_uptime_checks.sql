CREATE TABLE IF NOT EXISTS uptime_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id TEXT,
  status_code INTEGER,
  response_time_ms INTEGER,
  ssl_expiry_date TEXT,
  ssl_days_remaining INTEGER,
  checked_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_uptime_store ON uptime_checks(store_id, checked_at);
