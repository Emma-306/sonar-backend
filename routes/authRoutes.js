import express from "express";

import {
  googleLogin,
  getCurrentUser,
  updateAccountSettings,
} from "../controllers/auth.controller.js";

import authMiddleware from "../middleware/authMiddleware.js";

const router = express.Router();

// ==========================================
// GOOGLE LOGIN
// ==========================================

router.post(
  "/google",
  googleLogin
);

// ==========================================
// GET CURRENT USER
// ==========================================

router.get(
  "/me",
  authMiddleware,
  getCurrentUser
);

// ==========================================
// UPDATE ACCOUNT SETTINGS
// ==========================================

router.patch(
  "/settings",
  authMiddleware,
  updateAccountSettings
);

export default router;