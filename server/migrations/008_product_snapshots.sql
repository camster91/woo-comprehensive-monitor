CREATE TABLE IF NOT EXISTS product_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id TEXT,
  product_id INTEGER NOT NULL,
  name TEXT,
  sku TEXT,
  stock_status TEXT,
  stock_quantity INTEGER,
  price REAL,
  regular_price REAL,
  synced_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_store ON product_snapshots(store_id, product_id);
CREATE INDEX IF NOT EXISTS idx_product_stock ON product_snapshots(stock_status);
