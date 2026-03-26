import express from "express";
import * as officialAgentController from "../controllers/officialAgent.controller.js";
import { verifyOfficialAgent } from "../middleware/officialAgentAuth.js";
import { officialAgentAuthLimiter } from "../config/security.js";

const router = express.Router();

router.post("/login", officialAgentAuthLimiter, officialAgentController.login);
router.use(verifyOfficialAgent);
router.get("/me", officialAgentController.me);
router.get("/dashboard", officialAgentController.getDashboard);
router.get("/users", officialAgentController.getUsers);
router.get("/wallet", officialAgentController.getWallet);
router.post("/transfers", officialAgentController.transferBalance);
router.get("/trades/today-times", officialAgentController.getTodayTradeTimes);
router.get("/trades/open", officialAgentController.getOpenTrades);
router.get("/trades/closed", officialAgentController.getClosedTrades);
router.get("/trades/profits", officialAgentController.getProfits);
router.post("/reports", officialAgentController.createReport);
router.get("/reports", officialAgentController.getReports);

export default router;
