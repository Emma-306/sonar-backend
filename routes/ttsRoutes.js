import express from "express";

import {
  getUserVoice,
  generateUserSpeechAsync,
  getSpeechJob,
  downloadAudio,
} from "../controllers/ttsController.js";

import authMiddleware from "../middleware/authMiddleware.js";

import { getTtsHealth } from "../controllers/ttsHealth.controller.js";

const router = express.Router();

// ============================================================
// TTS HEALTH
// ============================================================

router.get(
  "/health",
  getTtsHealth
);

// ============================================================
// GET USER VOICE
// ============================================================
//
// GET /api/tts/voice
//

router.get(
  "/voice",
  authMiddleware,
  getUserVoice
);

// ============================================================
// GENERATE SPEECH
// ============================================================
//
// POST /api/tts/speech
//

router.post(
  "/speech",
  authMiddleware,
  generateUserSpeechAsync
);

// ============================================================
// GET SPEECH JOB STATUS
// ============================================================
//
// GET /api/tts/speech/status/:jobId
//

router.get(
  "/speech/status/:jobId",
  authMiddleware,
  getSpeechJob
);

// ============================================================
// DOWNLOAD AUDIO
// ============================================================
//
// GET /api/tts/audio/:audioId/download
//

router.get(
  "/audio/:audioId/download",
  authMiddleware,
  downloadAudio
);

export default router;