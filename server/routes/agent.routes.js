import express from "express";
import * as agentController from "../controllers/agent.controller.js";
import { query } from "../config/db.js";
import { requireTelegramAuth } from "../middleware/telegramAuth.js";

const router = express.Router();

router.use(requireTelegramAuth);

// Ensure the verified user can only read their OWN agent dashboard.
async function requireOwnUserId(req, res, next) {
  try {
    const result = await query("SELECT id FROM users WHERE tg_id = $1", [req.tgId]);
    if (result.rows.length === 0) {
      return res.status(403).json({ ok: false, error: "Forbidden" });
    }
    if (String(result.rows[0].id) !== String(req.params.user_id)) {
      return res.status(403).json({ ok: false, error: "Forbidden" });
    }
    return next();
  } catch (error) {
    return res.status(500).json({ ok: false, error: "Server error" });
  }
}

// Agent dashboard for a user (own dashboard only)
router.get("/dashboard/:user_id", requireOwnUserId, agentController.getAgentDashboard);

export default router;
