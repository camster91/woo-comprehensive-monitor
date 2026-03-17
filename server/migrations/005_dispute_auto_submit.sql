ALTER TABLE disputes ADD COLUMN auto_submit_at TEXT;
ALTER TABLE disputes ADD COLUMN hold INTEGER DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_disputes_auto_submit ON disputes(auto_submit_at) WHERE hold = 0;
