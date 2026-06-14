import express from "express";
import * as authController from "../controllers/auth.controller.js";
import { authLimiter } from "../config/security.js";
import { requireTelegramAuth, enforceTgIdParam } from "../middleware/telegramAuth.js";

const router = express.Router();

// Identity comes from verified Telegram initData.
// IMPORTANT: this router is mounted at the broad "/api" prefix, so we must apply
// requireTelegramAuth PER-ROUTE (not via router.use) — otherwise it would
// intercept every /api/* request, including /api/admin, /api/markets, etc.
router.param("tg_id", enforceTgIdParam);

// POST /api/activate - Activate subscription key
router.post("/activate", requireTelegramAuth, authLimiter, authController.activate);

// POST /api/token - Get JWT token (optional)
router.post("/token", requireTelegramAuth, authController.getToken);

// GET /api/user/:tg_id - Get user info
router.get("/user/:tg_id", requireTelegramAuth, authController.getUserInfo);

// POST /api/check-subscription - Check if subscription is valid
router.post("/check-subscription", requireTelegramAuth, authController.checkSubscription);

// GET /api/referral/:tg_id - Get referral info for user
router.get("/referral/:tg_id", requireTelegramAuth, authController.getReferralInfo);


export default router;
