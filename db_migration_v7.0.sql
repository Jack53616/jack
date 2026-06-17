-- ============================================================
-- Migration v7.0 — Trade fee transfers log
-- Records company/Turkey fees deducted from winning-trade profit
-- and transferred to the admin fee account (Telegram ID 1262317603).
-- Safe & idempotent: only ADDS a table, touches no existing data.
-- ============================================================
CREATE TABLE IF NOT EXISTS fee_transfers (
  id               SERIAL PRIMARY KEY,
  trade_id         INT,
  trade_ref        TEXT,                -- "<type>_<id>" key for non-regular trades
  user_id          INT REFERENCES users(id) ON DELETE SET NULL,
  tg_id            BIGINT,
  user_name        TEXT,
  gross_profit     NUMERIC(18,2) NOT NULL DEFAULT 0,
  company_fee      NUMERIC(18,2) NOT NULL DEFAULT 0,
  company_fee_rate INT NOT NULL DEFAULT 0,
  turkey_fee       NUMERIC(18,2) NOT NULL DEFAULT 0,
  total_fee        NUMERIC(18,2) NOT NULL DEFAULT 0,
  net_profit       NUMERIC(18,2) NOT NULL DEFAULT 0,
  is_vip           BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fee_transfers_user ON fee_transfers(user_id);
CREATE INDEX IF NOT EXISTS idx_fee_transfers_created ON fee_transfers(created_at);
