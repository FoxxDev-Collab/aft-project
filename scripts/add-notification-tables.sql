-- Add notification log table to track email notifications
CREATE TABLE IF NOT EXISTS notification_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER,
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('sent', 'failed', 'pending')),
  message_id TEXT,
  error TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (request_id) REFERENCES aft_requests(id)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_notification_log_request_id ON notification_log(request_id);
CREATE INDEX IF NOT EXISTS idx_notification_log_recipient ON notification_log(recipient);
CREATE INDEX IF NOT EXISTS idx_notification_log_status ON notification_log(status);
CREATE INDEX IF NOT EXISTS idx_notification_log_created_at ON notification_log(created_at);

-- Add notification preferences table for users
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id INTEGER PRIMARY KEY,
  email_enabled INTEGER DEFAULT 1,
  notify_on_assignment INTEGER DEFAULT 1,
  notify_on_approval INTEGER DEFAULT 1,
  notify_on_rejection INTEGER DEFAULT 1,
  notify_on_completion INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (user_id) REFERENCES users(id)
);