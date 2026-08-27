import express from "express";

import {
  googleLogin,
  getCurrentUser,
} from "../controllers/auth.controller.js";

import authMiddleware from "../middleware/authMiddleware.js";

const router = express.Router();

// ==========================================
// GOOGLE LOGIN
// POST /api/auth/google
// ==========================================

router.post(
  "/google",
  googleLogin
);

// ==========================================
// GET CURRENT USER
// GET /api/auth/me
// ==========================================

router.get(
  "/me",
  authMiddleware,
  getCurrentUser
);

export default router;