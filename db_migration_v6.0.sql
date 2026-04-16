-- QL Trading AI v6.0 - User Transfers + Temp Ban + Fee Display
-- Run this migration on your database

-- 1. Add ban_expires column for temporary bans
ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_expires TIMESTAMPTZ;

-- 2. Create user-to-user transfers table
CREATE TABLE IF NOT EXISTS user_transfers (
  id SERIAL PRIMARY KEY,
  from_user_id INT REFERENCES users(id) ON DELETE CASCADE,
  to_user_id INT REFERENCES users(id) ON DELETE CASCADE,
  amount NUMERIC(18,2) NOT NULL,
  note TEXT,
  status TEXT DEFAULT 'pending',
  admin_note TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Ensure fee columns exist on requests table (may already exist from earlier migrations)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='requests' AND column_name='fee_amount') THEN
    ALTER TABLE requests ADD COLUMN fee_amount NUMERIC(18,2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='requests' AND column_name='fee_rate') THEN
    ALTER TABLE requests ADD COLUMN fee_rate NUMERIC(10,4) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='requests' AND column_name='net_amount') THEN
    ALTER TABLE requests ADD COLUMN net_amount NUMERIC(18,2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='requests' AND column_name='days_since_deposit') THEN
    ALTER TABLE requests ADD COLUMN days_since_deposit INT DEFAULT 0;
  END IF;
END $$;

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_user_transfers_from ON user_transfers(from_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_transfers_to ON user_transfers(to_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_transfers_status ON user_transfers(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_ban_expires ON users(ban_expires) WHERE ban_expires IS NOT NULL;
