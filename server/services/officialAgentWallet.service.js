import { getClient } from "../config/db.js";
import logger from "../config/logger.js";

const ensureWallet = async (client, officialAgentId) => {
  await client.query(
    `INSERT INTO official_agent_wallets (official_agent_id)
     VALUES ($1)
     ON CONFLICT (official_agent_id) DO NOTHING`,
    [officialAgentId]
  );
};

export const allocateOfficialAgentWallet = async ({ officialAgentId, amount, note = "", relatedAdminId = null, type = "allocate" }) => {
  const client = await getClient();
  try {
    await client.query("BEGIN");
    await ensureWallet(client, officialAgentId);
    const walletResult = await client.query(
      `SELECT * FROM official_agent_wallets WHERE official_agent_id = $1 FOR UPDATE`,
      [officialAgentId]
    );
    const wallet = walletResult.rows[0];
    const amountValue = Number(amount);
    const before = Number(wallet.balance || 0);
    const after = before + amountValue;
    if (after < 0) {
      throw new Error("Insufficient official agent wallet balance");
    }

    await client.query(
      `UPDATE official_agent_wallets
       SET balance = $1,
           total_allocated = total_allocated + $2,
           updated_at = NOW()
       WHERE official_agent_id = $3`,
      [after, amountValue > 0 ? amountValue : 0, officialAgentId]
    );

    await client.query(
      `INSERT INTO official_agent_wallet_transactions
       (official_agent_id, type, amount, balance_before, balance_after, related_admin_id, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [officialAgentId, type, amountValue, before, after, relatedAdminId, note]
    );

    await client.query("COMMIT");
    return { before, after };
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error(`Official agent wallet allocation failed: ${error.message}`);
    throw error;
  } finally {
    client.release();
  }
};

export const transferFromOfficialAgentWallet = async ({ officialAgentId, userId, amount, note = "", walletNameSnapshot = null }) => {
  const client = await getClient();
  try {
    await client.query("BEGIN");
    await ensureWallet(client, officialAgentId);

    const walletResult = await client.query(
      `SELECT w.*, a.wallet_name FROM official_agent_wallets w
       JOIN official_agents a ON a.id = w.official_agent_id
       WHERE official_agent_id = $1 FOR UPDATE`,
      [officialAgentId]
    );
    const wallet = walletResult.rows[0];
    const amountValue = Number(amount);
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      throw new Error("Invalid transfer amount");
    }

    const before = Number(wallet.balance || 0);
    if (before < amountValue) {
      throw new Error("Insufficient official agent wallet balance");
    }

    const userResult = await client.query(`SELECT id FROM users WHERE id = $1 FOR UPDATE`, [userId]);
    if (userResult.rows.length === 0) {
      throw new Error("User not found");
    }

    const after = before - amountValue;
    await client.query(
      `UPDATE official_agent_wallets
       SET balance = $1,
           total_sent = total_sent + $2,
           updated_at = NOW()
       WHERE official_agent_id = $3`,
      [after, amountValue, officialAgentId]
    );

    await client.query(`UPDATE users SET balance = balance + $1 WHERE id = $2`, [amountValue, userId]);

    await client.query(
      `INSERT INTO official_agent_wallet_transactions
       (official_agent_id, type, amount, balance_before, balance_after, related_user_id, note)
       VALUES ($1, 'transfer_to_user', $2, $3, $4, $5, $6)`,
      [officialAgentId, amountValue, before, after, userId, note]
    );

    await client.query(
      `INSERT INTO official_agent_transfers
       (official_agent_id, user_id, amount, wallet_name_snapshot, note)
       VALUES ($1, $2, $3, $4, $5)`,
      [officialAgentId, userId, amountValue, walletNameSnapshot || wallet.wallet_name, note]
    );

    await client.query(
      `INSERT INTO ops (user_id, type, amount, note)
       VALUES ($1, 'official_agent_credit', $2, $3)`,
      [userId, amountValue, note || `Official agent wallet transfer`]
    );

    await client.query("COMMIT");
    return { before, after, amount: amountValue };
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error(`Official agent transfer failed: ${error.message}`);
    throw error;
  } finally {
    client.release();
  }
};
