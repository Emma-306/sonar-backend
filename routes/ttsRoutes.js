import express from "express";

import {
  getUserVoice,
  generateUserSpeech,
  generateUserSpeechAsync,
  getSpeechJob,
} from "../controllers/ttsController.js";

import authMiddleware from "../middleware/authMiddleware.js";
import { getTtsHealth } from "../controllers/ttsHealth.controller.js";

const router = express.Router();

router.get("/health", getTtsHealth);

// ============================================================
// GET USER VOICE
// ============================================================

router.get("/voice", authMiddleware, getUserVoice);

// ============================================================
// GENERATE SPEECH
// ============================================================

router.post("/speech", authMiddleware, generateUserSpeechAsync);

router.get("/speech/status/:jobId", authMiddleware, getSpeechJob);

export default router;
