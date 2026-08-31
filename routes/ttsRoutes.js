import express from "express";
import fs from "fs";
import path from "path";

import {
  getUserVoice,
  generateUserSpeechAsync,
  getSpeechJob,
  downloadAudio,
} from "../controllers/ttsController.js";

import authMiddleware from "../middleware/authMiddleware.js";

import { getTtsHealth } from "../controllers/ttsHealth.controller.js";
import { getVoiceModel, generateSpeech } from "../services/ttsServices.js";
import cloudinary from "../config/cloudinary.js";

const router = express.Router();

// ============================================================
// TTS HEALTH
// ============================================================

router.get("/health", getTtsHealth);

// ============================================================
// GET USER VOICE
// ============================================================
//
// GET /api/tts/voice
//

router.get("/voice", authMiddleware, getUserVoice);

// ============================================================
// GENERATE SPEECH
// ============================================================
//
// POST /api/tts/speech
//

router.post("/speech", authMiddleware, generateUserSpeechAsync);

// ============================================================
// PREVIEW VOICE
// ============================================================
//
// POST /api/tts/preview
//

router.post("/preview", authMiddleware, async (req, res) => {
  try {
    const { accent, gender, text } = req.body;

    if (!accent || !gender) {
      return res.status(400).json({
        success: false,
        message: "Accent and gender are required",
      });
    }

    const previewText = (text || "Hello there").trim();

    if (!previewText) {
      return res.status(400).json({
        success: false,
        message: "Preview text is required",
      });
    }

    const validAccents = ["nigerian", "british", "american"];
    const validVoices = ["male", "female"];

    if (!validAccents.includes(accent)) {
      return res.status(400).json({
        success: false,
        message: "Invalid accent",
      });
    }

    if (!validVoices.includes(gender)) {
      return res.status(400).json({
        success: false,
        message: "Invalid voice",
      });
    }

    const targetVoiceId = getVoiceModel(accent, gender);
    const outputDir = path.join(process.cwd(), "temp", "tts");
    const outputPath = path.join(
      outputDir,
      `preview-${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`,
    );

    fs.mkdirSync(outputDir, { recursive: true });

    await generateSpeech({
      text: previewText,
      accent,
      gender,
      outputPath,
    });

    const cloudinaryResult = await cloudinary.uploader.upload(outputPath, {
      resource_type: "video",
      folder: "sonar/audio",
      public_id: `voice-preview-${Date.now()}`,
    });

    try {
      fs.unlinkSync(outputPath);
    } catch (deleteError) {
      console.error("Failed to delete preview temp file:", deleteError);
    }

    return res.status(200).json({
      success: true,
      audioUrl: cloudinaryResult.secure_url,
      voiceModel: targetVoiceId,
    });
  } catch (error) {
    console.error("Preview voice generation failed:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to preview voice",
    });
  }
});

// ============================================================
// GET SPEECH JOB STATUS
// ============================================================
//
// GET /api/tts/speech/status/:jobId
//

router.get("/speech/status/:jobId", authMiddleware, getSpeechJob);

// ============================================================
// DOWNLOAD AUDIO
// ============================================================
//
// GET /api/tts/audio/:audioId/download
//

router.get("/audio/:audioId/download", authMiddleware, downloadAudio);

export default router;
