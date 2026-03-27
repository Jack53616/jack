import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { getClient, query } from "../config/db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const storageRoot = path.resolve(__dirname, "../../storage/kyc");

export const ensureKycDirectory = async (userId, requestId) => {
  const dir = path.join(storageRoot, String(userId), String(requestId));
  await fs.mkdir(dir, { recursive: true });
  return dir;
};

export const upsertBotState = async (userId, flowName, state, payload = {}, expiresAt = null) => {
  await query(
    `INSERT INTO bot_user_states (user_id, flow_name, state, payload_json, expires_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (user_id, flow_name)
     DO UPDATE SET state = $3, payload_json = $4, expires_at = $5, updated_at = NOW()`,
    [userId, flowName, state, JSON.stringify(payload), expiresAt]
  );
};

export const getBotState = async (userId, flowName) => {
  const result = await query(
    `SELECT * FROM bot_user_states WHERE user_id = $1 AND flow_name = $2`,
    [userId, flowName]
  );
  return result.rows[0] || null;
};

export const clearBotState = async (userId, flowName) => {
  await query(`DELETE FROM bot_user_states WHERE user_id = $1 AND flow_name = $2`, [userId, flowName]);
};

export const ensureDraftKyc = async ({ userId, tgId, firstName = null, lastName = null, countryCode, countryName, documentType }) => {
  const existing = await query(
    `SELECT id, status FROM kyc_verifications WHERE user_id = $1 AND status IN ('draft', 'pending') ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );
  if (existing.rows.length > 0) {
    if (existing.rows[0].status === 'draft') {
      await query(
        `UPDATE kyc_verifications
         SET first_name = $1, last_name = $2, country_code = $3, country_name = $4, document_type = $5, updated_at = NOW()
         WHERE id = $6`,
        [firstName, lastName, countryCode, countryName, documentType, existing.rows[0].id]
      );
    }
    return existing.rows[0];
  }
  const created = await query(
    `INSERT INTO kyc_verifications (user_id, tg_id, first_name, last_name, country_code, country_name, document_type, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft', NOW(), NOW()) RETURNING id`,
    [userId, tgId, firstName, lastName, countryCode, countryName, documentType]
  );
  return created.rows[0];
};

export const updateKycFile = async (requestId, side, filePath, telegramFileId) => {
  const columnPath = side === "front"
    ? "front_file_path"
    : side === "back"
      ? "back_file_path"
      : "face_file_path";
  const columnFileId = side === "front"
    ? "front_telegram_file_id"
    : side === "back"
      ? "back_telegram_file_id"
      : "face_telegram_file_id";
  await query(
    `UPDATE kyc_verifications SET ${columnPath} = $1, ${columnFileId} = $2, updated_at = NOW() WHERE id = $3`,
    [filePath, telegramFileId, requestId]
  );
};

export const submitKycRequest = async (requestId) => {
  const client = await getClient();
  try {
    await client.query("BEGIN");
    const result = await client.query(`SELECT * FROM kyc_verifications WHERE id = $1 FOR UPDATE`, [requestId]);
    if (result.rows.length === 0) throw new Error("KYC request not found");
    const row = result.rows[0];
    if (!row.front_file_path || !row.back_file_path || !row.face_file_path) throw new Error("KYC images are incomplete");
    await client.query(
      `UPDATE kyc_verifications SET status = 'pending', submitted_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [requestId]
    );
    await client.query("COMMIT");
    return row;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
