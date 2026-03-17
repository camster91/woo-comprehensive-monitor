CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id TEXT,
  portal_user_id INTEGER,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT DEFAULT 'open',
  priority TEXT DEFAULT 'normal',
  admin_reply TEXT,
  replied_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE SET NULL,
  FOREIGN KEY (portal_user_id) REFERENCES portal_users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_tickets_store ON tickets(store_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
