CREATE TABLE IF NOT EXISTS disputes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id TEXT REFERENCES stores(id) ON DELETE SET NULL,
  stripe_dispute_id TEXT NOT NULL,
  stripe_charge_id TEXT,
  order_id TEXT,
  customer_name TEXT,
  customer_email TEXT,
  amount REAL,
  currency TEXT DEFAULT 'USD',
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'needs_response',
  due_by TEXT,
  evidence_generated INTEGER DEFAULT 0,
  evidence_summary TEXT,
  store_name TEXT,
  store_url TEXT,
  products TEXT DEFAULT '[]',
  metadata TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_disputes_stripe_id ON disputes(stripe_dispute_id);
CREATE INDEX IF NOT EXISTS idx_disputes_store_id ON disputes(store_id);
CREATE INDEX IF NOT EXISTS idx_disputes_status ON disputes(status);
CREATE INDEX IF NOT EXISTS idx_disputes_due_by ON disputes(due_by);
CREATE INDEX IF NOT EXISTS idx_disputes_created_at ON disputes(created_at DESC);
