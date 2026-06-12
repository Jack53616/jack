import { query } from "../config/db.js";
import { verifyRoleToken } from "../services/authTokens.js";

export const verifyOfficialAgent = async (req, res, next) => {
  try {
    const header = req.headers["authorization"] || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : req.headers["x-official-agent-token"];
    if (!token) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    const decoded = verifyRoleToken(token);
    if (!decoded || decoded.role !== "official_agent" || !decoded.officialAgentId) {
      return res.status(401).json({ ok: false, error: "Invalid token" });
    }

    const result = await query(
      `SELECT id, username, name, wallet_name, is_active, last_login_at
       FROM official_agents
       WHERE id = $1`,
      [decoded.officialAgentId]
    );
    if (result.rows.length === 0 || !result.rows[0].is_active) {
      return res.status(403).json({ ok: false, error: "Official agent inactive or not found" });
    }

    req.officialAgent = result.rows[0];
    next();
  } catch (error) {
    return res.status(401).json({ ok: false, error: "Invalid or expired token" });
  }
};
