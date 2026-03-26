import { query } from "../config/db.js";

export const createOfficialAgentReport = async ({ officialAgentId, reportedUserId, reason }) => {
  const trimmedReason = String(reason || "").trim();
  if (trimmedReason.length < 10) {
    throw new Error("Report reason is too short");
  }
  if (trimmedReason.length > 1000) {
    throw new Error("Report reason is too long");
  }
  const result = await query(
    `INSERT INTO official_agent_reports (official_agent_id, reported_user_id, reason, status, created_at)
     VALUES ($1, $2, $3, 'pending', NOW()) RETURNING *`,
    [officialAgentId, reportedUserId, trimmedReason]
  );
  return result.rows[0];
};
