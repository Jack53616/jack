import pg from 'pg';
import fs from 'fs';
import dotenv from 'dotenv';
const { Pool } = pg;

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  const sql = fs.readFileSync('./migration_v4.sql', 'utf8');
  const statements = sql.split(';').filter(s => s.trim().length > 0);
  
  for (const stmt of statements) {
    const trimmed = stmt.trim();
    if (!trimmed || trimmed.startsWith('--')) continue;
    try {
      await pool.query(trimmed);
      console.log('✅', trimmed.substring(0, 60).replace(/\n/g, ' ') + '...');
    } catch (err) {
      console.log('⚠️', trimmed.substring(0, 60).replace(/\n/g, ' ') + '...', '→', err.message);
    }
  }
  
  console.log('\n✅ Migration complete!');
  await pool.end();
}

run().catch(console.error);
