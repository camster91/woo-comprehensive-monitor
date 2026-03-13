-- Migration 002: add dedup_key to alerts for restart-safe deduplication
-- SQLite does not support ADD COLUMN IF NOT EXISTS — the migration runner
-- guards against duplicate runs via the schema_migrations table below.

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT DEFAULT (datetime('now'))
);

-- The migration runner (db.js) checks schema_migrations before executing this.
ALTER TABLE alerts ADD COLUMN dedup_key TEXT;

CREATE INDEX IF NOT EXISTS idx_alerts_dedup_key ON alerts(dedup_key, timestamp)
  WHERE dedup_key IS NOT NULL;
