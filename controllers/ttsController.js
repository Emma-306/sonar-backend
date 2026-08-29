import mongoose from "mongoose";
import path from "path";
import fs from "fs";

import User from "../models/User.js";
import File from "../models/File.js";
import Audio from "../models/Audio.js";

import cloudinary from "../config/cloudinary.js";

import { getVoiceModel, generateSpeech } from "../services/ttsServices.js";

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

// ============================================================
// GENERATE USER SPEECH
// ============================================================

export const generateUserSpeech = async (req, res) => {
  let outputPath = null;

  try {
    // ========================================================
    // REQUEST DATA
    // ========================================================

    const { text, fileId } = req.body;

    // ========================================================
    // CHECK TEXT
    // ========================================================

    if (!text || typeof text !== "string" || !text.trim()) {
      return res.status(400).json({
        success: false,
        message: "Text is required",
      });
    }

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

    const existingAudio = await Audio.findOne({
      userId: req.user.id,
      fileId: file._id,
      voiceModel: model,
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
      text: text.trim(),
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
      message: "Failed to generate speech",
      error: error.message,
    });
  }
};
