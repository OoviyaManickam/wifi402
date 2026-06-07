-- WiFi402 sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet      TEXT NOT NULL,
  mac         TEXT,
  ip          TEXT NOT NULL,
  plan_id     TEXT NOT NULL,
  paid_amount NUMERIC NOT NULL,
  duration_ms BIGINT NOT NULL,
  expires_at  BIGINT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'active'
);

-- Index for fast scheduler lookups
CREATE INDEX IF NOT EXISTS idx_sessions_status_expires
  ON sessions (status, expires_at);

-- Index for IP lookups (portal status checks)
CREATE INDEX IF NOT EXISTS idx_sessions_ip
  ON sessions (ip, status);

-- Row Level Security: service role bypasses; anon can only read their own session by IP
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon read own session" ON sessions
  FOR SELECT USING (true);

CREATE POLICY "service insert" ON sessions
  FOR INSERT WITH CHECK (true);

CREATE POLICY "service update" ON sessions
  FOR UPDATE USING (true);
