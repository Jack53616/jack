import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const migrations = [
  "ALTER TABLE mass_trades ADD COLUMN IF NOT EXISTS result_type VARCHAR(20) DEFAULT 'random'",
  "ALTER TABLE mass_trades ADD COLUMN IF NOT EXISTS speed VARCHAR(20) DEFAULT 'normal'",
  "ALTER TABLE mass_trades ADD COLUMN IF NOT EXISTS lot_size DECIMAL(10,2) DEFAULT 0.50",
  "ALTER TABLE mass_trades ADD COLUMN IF NOT EXISTS duration_seconds INTEGER DEFAULT 3600",
];

async function run() {
  const client = await pool.connect();
  try {
    for (const sql of migrations) {
      try {
        await client.query(sql);
        console.log('✅', sql.substring(0, 60) + '...');
      } catch (e) {
        console.log('⚠️ Skipped:', e.message.substring(0, 80));
      }
    }
    console.log('\n✅ All migrations completed!');
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(console.error);
