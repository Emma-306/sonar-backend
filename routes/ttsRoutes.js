import express from "express";

import {
  getUserVoice,
  generateUserSpeech,
} from "../controllers/ttsController.js";

import authMiddleware from "../middleware/authMiddleware.js";

const router = express.Router();

// ============================================================
// GET USER VOICE
// ============================================================

router.get(
  "/voice",
  authMiddleware,
  getUserVoice
);

// ============================================================
// GENERATE SPEECH
// ============================================================

router.post(
  "/speech",
  authMiddleware,
  generateUserSpeech
);

export default router;