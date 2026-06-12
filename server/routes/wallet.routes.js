import express from "express";
import * as walletController from "../controllers/wallet.controller.js";
import { withdrawLimiter, walletLimiter, transferLimiter } from "../config/security.js";
import { requireTelegramAuth, enforceTgIdParam } from "../middleware/telegramAuth.js";

const router = express.Router();

// Every wallet route requires a verified Telegram session.
router.use(requireTelegramAuth);
router.param("tg_id", enforceTgIdParam);

// GET /api/wallet/:tg_id - Get wallet info
router.get("/:tg_id", walletController.getWallet);

// GET /api/ops/:tg_id - Get operations history
router.get("/ops/:tg_id", walletController.getOps);

// POST /api/withdraw - Request withdrawal
router.post("/withdraw", withdrawLimiter, walletController.requestWithdraw);

// POST /api/withdraw/method - Save withdrawal method
router.post("/withdraw/method", walletLimiter, walletController.saveWithdrawMethod);

// POST /api/withdraw/cancel - Cancel withdrawal request
router.post("/withdraw/cancel", walletLimiter, walletController.cancelWithdraw);

// GET /api/requests/:tg_id - Get withdrawal requests
router.get("/requests/:tg_id", walletController.getRequests);

// POST /api/deposit - Process deposit (ADMIN ONLY; also requires admin token in controller)
router.post("/deposit", walletController.processDeposit);

// GET /api/wallet/withdraw/fee-preview - Preview withdrawal fee
router.get("/withdraw/fee-preview", walletController.getWithdrawalFeePreview);

// POST /api/wallet/transfer - Request user-to-user transfer
router.post("/transfer", transferLimiter, walletController.requestTransfer);

// GET /api/wallet/transfers/:tg_id - Get user transfers
router.get("/transfers/:tg_id", walletController.getUserTransfers);

// POST /api/wallet/transfer/cancel - Cancel pending transfer
router.post("/transfer/cancel", transferLimiter, walletController.cancelTransfer);

export default router;
