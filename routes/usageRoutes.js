import express from "express";

import { getUsage } from "../controllers/usageController.js";
import authMiddleware from "../middleware/authMiddleware.js";

const router = express.Router();

// ==========================================
// GET USER USAGE
// GET /api/usage
// ==========================================

router.get("/", authMiddleware, getUsage);

export default router;