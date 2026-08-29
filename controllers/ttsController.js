import mongoose from "mongoose";
import { createHash } from "crypto";
import path from "path";
import fs from "fs";

import User from "../models/User.js";
import File from "../models/File.js";
import Audio from "../models/Audio.js";
import SpeechJob from "../models/SpeechJob.js";

import cloudinary from "../config/cloudinary.js";

import { getVoiceModel, generateSpeech } from "../services/ttsServices.js";

const audioResponse = (audio) => ({
  id: audio._id,
  fileId: audio.fileId,
  originalName: audio.originalName,
  accent: audio.accent,
  gender: audio.gender,
  voiceModel: audio.voiceModel,
  fileSize: audio.fileSize,
  audioUrl: audio.audioUrl,
});

// ============================================================
// GET USER VOICE
// ============================================================

export const getUserVoice = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const accent = user.onboarding?.preferredAccent;

    const gender = user.onboarding?.preferredVoiceGender;

    if (!accent || !gender) {
      return res.status(400).json({
        success: false,
        message: "Voice preferences are not set",
      });
    }

    let model;

    try {
      model = getVoiceModel(accent, gender);
    } catch (voiceError) {
      return res.status(400).json({
        success: false,
        message: voiceError.message,
      });
    }

    return res.status(200).json({
      success: true,

      voice: {
        accent,
        gender,
        model,
      },
    });
  } catch (error) {
    console.error("Get user voice error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get user voice",
    });
  }
};

export const getSpeechJob = async (req, res) => {
  const job = await SpeechJob.findOne({
    jobId: req.params.jobId,
    userId: req.user.id,
  }).lean();

  if (!job) {
    return res.status(404).json({
      success: false,
      message: "Speech job not found",
    });
  }

  return res.status(200).json({
    success: job.status !== "failed",
    pending: job.status === "pending",
    jobId: job.jobId,
    status: job.status,
    message: job.message,
    audio: job.audio,
  });
};

export const generateUserSpeechAsync = async (req, res) => {
  try {
    const { fileId } = req.body;

    if (!fileId || !mongoose.Types.ObjectId.isValid(fileId)) {
      return res.status(400).json({
        success: false,
        message: "A valid fileId is required",
      });
    }

    const [user, file] = await Promise.all([
      User.findById(req.user.id),
      File.findOne({ _id: fileId, userId: req.user.id }),
    ]);

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    if (!file) {
      return res
        .status(404)
        .json({ success: false, message: "PDF file not found" });
    }

    const text = file.extractedText?.trim();
    const accent = user.onboarding?.preferredAccent;
    const gender = user.onboarding?.preferredVoiceGender;

    if (!text) {
      return res.status(400).json({
        success: false,
        message: "No extracted text is available for this PDF",
      });
    }

    if (!accent || !gender) {
      return res
        .status(400)
        .json({ success: false, message: "Voice preferences are not set" });
    }

    const model = getVoiceModel(accent, gender);
    const normalizedText = text.replace(/\s+/g, " ");
    const textHash = createHash("sha256").update(normalizedText).digest("hex");

    const existingAudio = await Audio.findOne({
      userId: req.user.id,
      fileId: file._id,
      voiceModel: model,
      textHash,
    }).sort({ createdAt: -1 });

    if (existingAudio) {
      return res
        .status(200)
        .json({ success: true, audio: audioResponse(existingAudio) });
    }

    const activeJob = await SpeechJob.findOne({
      userId: req.user.id,
      fileId,
      textHash,
      status: "pending",
    }).lean();

    if (activeJob) {
      return res
        .status(202)
        .json({ success: true, pending: true, jobId: activeJob.jobId });
    }

    const jobId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await SpeechJob.create({
      jobId,
      userId: req.user.id,
      fileId,
      textHash,
      status: "pending",
    });

    res.status(202).json({
      success: true,
      pending: true,
      jobId,
      message: "Speech generation started",
    });

    const outputPath = path.join(
      process.cwd(),
      "temp",
      "tts",
      `speech-${jobId}.wav`,
    );

    try {
      console.log("Starting background Piper generation", {
        jobId,
        fileId,
        textLength: normalizedText.length,
        model,
      });

      await generateSpeech({
        text: normalizedText,
        accent,
        gender,
        outputPath,
      });
      const stats = fs.statSync(outputPath);
      const cloudinaryResult = await cloudinary.uploader.upload(outputPath, {
        resource_type: "video",
        folder: "sonar/audio",
        public_id: `speech-${Date.now()}`,
      });

      const audio = await Audio.create({
        userId: req.user.id,
        fileId: file._id,
        textHash,
        originalName: `${path.parse(file.originalName).name}.wav`,
        audioUrl: cloudinaryResult.secure_url,
        mimeType: "audio/wav",
        fileSize: stats.size,
        accent,
        gender,
        voiceModel: model,
      });

      await SpeechJob.findOneAndUpdate(
        { jobId },
        {
          status: "completed",
          audio: audioResponse(audio),
        },
      );
    } catch (error) {
      console.error("Background speech generation failed:", error);
      await SpeechJob.findOneAndUpdate(
        { jobId },
        {
          status: "failed",
          message: error.message,
        },
      );
    } finally {
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    }

    return undefined;
  } catch (error) {
    console.error("Start speech job error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to start speech generation",
    });
  }
};

// ============================================================
// LEGACY SYNCHRONOUS GENERATE USER SPEECH
// ============================================================

export const generateUserSpeech = async (req, res) => {
  let outputPath = null;

  try {
    // ========================================================
    // REQUEST DATA
    // ========================================================

    const { fileId } = req.body;

    // ========================================================
    // CHECK FILE ID
    // ========================================================

    if (!fileId) {
      return res.status(400).json({
        success: false,
        message: "fileId is required",
      });
    }

    // ========================================================
    // VALIDATE FILE ID
    // ========================================================

    if (!mongoose.Types.ObjectId.isValid(fileId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid fileId",
      });
    }

    // ========================================================
    // GET USER
    // ========================================================

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // ========================================================
    // GET PDF
    // ========================================================

    const file = await File.findOne({
      _id: fileId,
      userId: req.user.id,
    });

    if (!file) {
      return res.status(404).json({
        success: false,
        message: "PDF file not found",
      });
    }

    const text = file.extractedText;

    if (!text || !text.trim()) {
      return res.status(400).json({
        success: false,
        message: "No extracted text is available for this PDF",
      });
    }

    // ========================================================
    // GET VOICE
    // ========================================================

    const accent = user.onboarding?.preferredAccent;

    const gender = user.onboarding?.preferredVoiceGender;

    if (!accent || !gender) {
      return res.status(400).json({
        success: false,
        message: "Voice preferences are not set",
      });
    }

    // ========================================================
    // GET PIPER MODEL
    // ========================================================

    let model;

    try {
      model = getVoiceModel(accent, gender);
    } catch (voiceError) {
      return res.status(400).json({
        success: false,
        message: voiceError.message,
      });
    }

    const normalizedText = text.trim().replace(/\s+/g, " ");
    const textHash = createHash("sha256").update(normalizedText).digest("hex");

    const existingAudio = await Audio.findOne({
      userId: req.user.id,
      fileId: file._id,
      voiceModel: model,
      textHash,
    }).sort({ createdAt: -1 });

    if (existingAudio) {
      return res.status(200).json({
        success: true,
        message: "Speech already generated.",
        audio: {
          id: existingAudio._id,
          fileId: existingAudio.fileId,
          originalName: existingAudio.originalName,
          accent: existingAudio.accent,
          gender: existingAudio.gender,
          voiceModel: existingAudio.voiceModel,
          fileSize: existingAudio.fileSize,
          audioUrl: existingAudio.audioUrl,
        },
      });
    }

    console.log("=================================");

    console.log("Generating speech");

    console.log("User:", req.user.id);

    console.log("File ID:", fileId);

    console.log("File:", file.originalName);

    console.log("Accent:", accent);

    console.log("Gender:", gender);

    console.log("Model:", model);

    console.log("Text length:", normalizedText.length);

    console.log(
      "Model path:",
      path.join(process.cwd(), "tts", "models", `${model}.onnx`),
    );

    console.log("=================================");

    // ========================================================
    // CREATE TEMPORARY AUDIO PATH
    // ========================================================

    const filename = `speech-${Date.now()}.wav`;

    const outputDirectory = path.join(process.cwd(), "temp", "tts");

    // Create temp directory
    if (!fs.existsSync(outputDirectory)) {
      fs.mkdirSync(outputDirectory, {
        recursive: true,
      });
    }

    outputPath = path.join(outputDirectory, filename);

    // ========================================================
    // GENERATE AUDIO WITH PIPER
    // ========================================================

    console.log("Starting Piper speech generation...");

    await generateSpeech({
      text: normalizedText,
      accent,
      gender,
      outputPath,
    });

    console.log("Piper generation completed.");

    // ========================================================
    // CHECK AUDIO
    // ========================================================

    if (!fs.existsSync(outputPath)) {
      throw new Error("Audio file was not created");
    }

    const stats = fs.statSync(outputPath);

    if (stats.size === 0) {
      throw new Error("Generated audio file is empty");
    }

    console.log("Generated audio size:", stats.size, "bytes");

    // ========================================================
    // UPLOAD AUDIO TO CLOUDINARY
    // ========================================================

    console.log("Uploading audio to Cloudinary...");

    const cloudinaryResult = await cloudinary.uploader.upload(outputPath, {
      resource_type: "video",
      folder: "sonar/audio",

      public_id: `speech-${Date.now()}`,
    });

    console.log("Audio uploaded to Cloudinary:");

    console.log(cloudinaryResult.secure_url);

    // ========================================================
    // SAVE AUDIO TO MONGODB
    // ========================================================

    const audio = await Audio.create({
      userId: req.user.id,

      fileId: file._id,

      textHash,

      originalName: `${path.parse(file.originalName).name}.wav`,

      audioUrl: cloudinaryResult.secure_url,

      mimeType: "audio/wav",

      fileSize: stats.size,

      accent,

      gender,

      voiceModel: model,
    });

    console.log("Audio saved to MongoDB:", audio._id);

    // ========================================================
    // DELETE TEMPORARY AUDIO
    // ========================================================

    if (outputPath && fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);

      console.log("Temporary audio deleted.");
    }

    // ========================================================
    // RESPONSE
    // ========================================================

    return res.status(201).json({
      success: true,

      message: "Speech generated successfully.",

      audio: {
        id: audio._id,

        fileId: audio.fileId,

        originalName: audio.originalName,

        accent: audio.accent,

        gender: audio.gender,

        voiceModel: audio.voiceModel,

        fileSize: audio.fileSize,

        audioUrl: audio.audioUrl,
      },
    });
  } catch (error) {
    // ========================================================
    // LOG ERROR
    // ========================================================

    console.error("Generate speech error:", error);

    // ========================================================
    // DELETE TEMP AUDIO
    // ========================================================

    if (outputPath && fs.existsSync(outputPath)) {
      try {
        fs.unlinkSync(outputPath);

        console.log("Deleted temporary audio after failure.");
      } catch (deleteError) {
        console.error("Failed to delete temporary audio:", deleteError);
      }
    }

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to generate speech",
      error: error.message,
    });
  }
};
