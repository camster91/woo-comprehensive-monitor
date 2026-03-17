CREATE TABLE IF NOT EXISTS revenue_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id TEXT,
  date TEXT NOT NULL,
  total_revenue REAL DEFAULT 0,
  order_count INTEGER DEFAULT 0,
  orders_processing INTEGER DEFAULT 0,
  orders_completed INTEGER DEFAULT 0,
  orders_refunded INTEGER DEFAULT 0,
  orders_failed INTEGER DEFAULT 0,
  orders_pending INTEGER DEFAULT 0,
  refund_total REAL DEFAULT 0,
  abandoned_carts INTEGER DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  synced_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_revenue_store_date ON revenue_snapshots(store_id, date);
CREATE INDEX IF NOT EXISTS idx_revenue_date ON revenue_snapshots(date);
