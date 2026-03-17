-- V2 Features Migration
-- Notifications, Activity Feed, Dispute Templates, Webhook Config, Digest Tracking, Settings

-- In-app notifications (notification bell)
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_type TEXT NOT NULL DEFAULT 'admin',  -- 'admin' or 'client'
  user_id INTEGER,                          -- portal_user_id for clients, NULL for admin
  title TEXT NOT NULL,
  message TEXT,
  type TEXT NOT NULL DEFAULT 'info',        -- info, warning, error, success
  link TEXT,                                -- optional deep link (e.g. /disputes)
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_type, user_id, read);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at);

-- Activity log (real-time feed on Overview)
CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER,
  event_type TEXT NOT NULL,   -- order, dispute, uptime, ticket, revenue, alert, inventory
  title TEXT NOT NULL,
  detail TEXT,
  severity TEXT DEFAULT 'info',  -- info, warning, error, success
  metadata TEXT,              -- JSON
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_activity_store ON activity_log(store_id);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log(created_at);
CREATE INDEX IF NOT EXISTS idx_activity_type ON activity_log(event_type);

-- Dispute response templates
CREATE TABLE IF NOT EXISTS dispute_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  reason TEXT NOT NULL,          -- fraudulent, product_not_received, etc.
  evidence_text TEXT NOT NULL,   -- pre-written response
  is_default INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Webhook configurations (Slack/Discord)
CREATE TABLE IF NOT EXISTS webhook_configs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'slack',  -- slack, discord, custom
  events TEXT NOT NULL DEFAULT '[]',       -- JSON array of event types to notify
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Weekly digest tracking
CREATE TABLE IF NOT EXISTS digest_sent (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipient TEXT NOT NULL,
  store_id INTEGER,
  week_key TEXT NOT NULL,       -- e.g. "2026-W12"
  sent_at TEXT DEFAULT (datetime('now')),
  UNIQUE(recipient, store_id, week_key)
);

-- App settings (dark mode, preferences)
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Seed default dispute templates
INSERT OR IGNORE INTO dispute_templates (id, name, reason, evidence_text, is_default) VALUES
(1, 'Fraudulent - Digital Product', 'fraudulent',
'This transaction was authorized by the cardholder. We have verified the following:

1. **Card Verification**: The payment passed CVC, AVS, and 3D Secure checks
2. **Customer Identity**: The customer registered an account with matching billing details
3. **Digital Delivery**: The product/subscription was delivered digitally and accessed by the customer
4. **IP & Device**: Purchase IP matches the customer''s known geographic location
5. **Customer History**: The customer has previous successful orders with no disputes

The cardholder authorized this purchase and received the product/service as described.', 1),

(2, 'Product Not Received - Digital', 'product_not_received',
'The customer received their product/subscription immediately upon purchase:

1. **Instant Delivery**: Digital products are delivered automatically upon successful payment
2. **Account Access**: The customer''s account was activated and they logged in after purchase
3. **Usage Logs**: System records show the customer accessed their subscription/product
4. **Confirmation Email**: Order confirmation was sent to the customer''s email at time of purchase
5. **Support History**: No contact from customer about delivery issues before dispute

The product was delivered digitally and confirmed received by the customer.', 1),

(3, 'Subscription Cancelled', 'subscription_canceled',
'This charge was for an active subscription that the customer agreed to:

1. **Subscription Terms**: Customer agreed to recurring billing at sign-up
2. **Renewal Notice**: Renewal notification was sent before the charge
3. **Active Usage**: Customer was actively using the subscription during the billed period
4. **Cancellation Policy**: Our cancellation policy is clearly stated and easy to follow
5. **No Cancellation Request**: No cancellation request was received before the billing date

The customer was aware of and consented to the recurring charge.', 1),

(4, 'Duplicate Charge', 'duplicate',
'This is not a duplicate charge:

1. **Unique Orders**: Each charge corresponds to a separate, unique order
2. **Different Dates/Products**: The orders have distinct dates, products, or quantities
3. **Order Confirmations**: Separate confirmation emails were sent for each order
4. **Fulfillment Records**: Each order was fulfilled independently

If the customer sees multiple charges, each one is for a legitimate, separate transaction.', 1),

(5, 'General Dispute', 'general',
'We are responding to this dispute with the following evidence:

1. **Valid Transaction**: The purchase was completed with the customer''s authorization
2. **Product/Service Delivered**: The product or service was provided as described
3. **Terms of Service**: The customer agreed to our terms at the time of purchase
4. **Customer Communication**: We attempted to resolve any issues directly with the customer
5. **Refund Policy**: Our refund policy was available and communicated at checkout

We believe this charge is valid and request the dispute be resolved in our favor.', 1);
