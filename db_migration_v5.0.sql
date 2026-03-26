-- QL Trading AI v5.0 - Official Agents + KYC + Reports

CREATE TABLE IF NOT EXISTS official_agents (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  wallet_name TEXT DEFAULT 'محفظة الوكيل الرسمي',
  notes TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_by_admin BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS official_agent_wallets (
  id SERIAL PRIMARY KEY,
  official_agent_id INT UNIQUE REFERENCES official_agents(id) ON DELETE CASCADE,
  balance NUMERIC(18,2) DEFAULT 0,
  total_allocated NUMERIC(18,2) DEFAULT 0,
  total_sent NUMERIC(18,2) DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS official_agent_wallet_transactions (
  id SERIAL PRIMARY KEY,
  official_agent_id INT REFERENCES official_agents(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  amount NUMERIC(18,2) NOT NULL,
  balance_before NUMERIC(18,2) DEFAULT 0,
  balance_after NUMERIC(18,2) DEFAULT 0,
  related_user_id INT REFERENCES users(id) ON DELETE SET NULL,
  related_admin_id INT,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS official_agent_transfers (
  id SERIAL PRIMARY KEY,
  official_agent_id INT REFERENCES official_agents(id) ON DELETE CASCADE,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  amount NUMERIC(18,2) NOT NULL,
  wallet_name_snapshot TEXT,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS official_agent_reports (
  id SERIAL PRIMARY KEY,
  official_agent_id INT REFERENCES official_agents(id) ON DELETE CASCADE,
  reported_user_id INT REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  admin_note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by_admin INT
);

CREATE TABLE IF NOT EXISTS kyc_verifications (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  tg_id BIGINT NOT NULL,
  country_code TEXT NOT NULL,
  country_name TEXT NOT NULL,
  document_type TEXT NOT NULL,
  front_file_path TEXT,
  back_file_path TEXT,
  front_telegram_file_id TEXT,
  back_telegram_file_id TEXT,
  status TEXT DEFAULT 'draft',
  rejection_reason TEXT,
  submitted_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  reviewed_by_admin INT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bot_user_states (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  flow_name TEXT NOT NULL,
  state TEXT NOT NULL,
  payload_json TEXT DEFAULT '{}',
  expires_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, flow_name)
);

CREATE INDEX IF NOT EXISTS idx_official_agent_wallet_tx_agent ON official_agent_wallet_transactions(official_agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_official_agent_transfers_agent ON official_agent_transfers(official_agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_official_agent_reports_status ON official_agent_reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_kyc_verifications_status ON kyc_verifications(status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_kyc_verifications_user ON kyc_verifications(user_id, status);
CREATE INDEX IF NOT EXISTS idx_bot_user_states_flow ON bot_user_states(flow_name, user_id);
