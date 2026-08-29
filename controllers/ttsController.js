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

const runningJobs = new Set();

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

const processSpeechJob = async (jobId) => {
  if (runningJobs.has(jobId)) return;
  runningJobs.add(jobId);

  const outputPath = path.join(
    process.cwd(),
    "temp",
    "tts",
    `speech-${jobId}.mp3`,
  );

  try {
    const job = await SpeechJob.findOne({ jobId });
    if (!job || job.status !== "pending") return;

    const [user, file] = await Promise.all([
      User.findById(job.userId),
      File.findOne({ _id: job.fileId, userId: job.userId }),
    ]);

    if (!user || !file)
      throw new Error("Speech source file or user was not found");

    const accent = user.onboarding?.preferredAccent;
    const gender = user.onboarding?.preferredVoiceGender;
    const voiceId = getVoiceModel(accent, gender);
    const text = file.extractedText?.trim().replace(/\s+/g, " ");

    if (!text) throw new Error("No extracted text is available for this PDF");

    console.log("Starting ElevenLabs generation", {
      jobId,
      fileId: job.fileId,
      textLength: text.length,
      voiceId,
    });

    await generateSpeech({ text, accent, gender, outputPath });
    const stats = fs.statSync(outputPath);
    const cloudinaryResult = await cloudinary.uploader.upload(outputPath, {
      resource_type: "video",
      folder: "sonar/audio",
      public_id: `speech-${Date.now()}`,
    });

    const audio = await Audio.create({
      userId: job.userId,
      fileId: job.fileId,
      textHash: job.textHash,
      originalName: `${path.parse(file.originalName).name}.mp3`,
      audioUrl: cloudinaryResult.secure_url,
      mimeType: "audio/mpeg",
      fileSize: stats.size,
      accent,
      gender,
      voiceModel: voiceId,
    });

    await SpeechJob.findOneAndUpdate(
      { jobId },
      { status: "completed", audio: audioResponse(audio), message: null },
    );
  } catch (error) {
    console.error("ElevenLabs speech generation failed:", error);
    await SpeechJob.findOneAndUpdate(
      { jobId },
      { status: "failed", message: error.message },
    );
  } finally {
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    runningJobs.delete(jobId);
  }
};

export const getUserVoice = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });

    const accent = user.onboarding?.preferredAccent;
    const gender = user.onboarding?.preferredVoiceGender;
    if (!accent || !gender) {
      return res
        .status(400)
        .json({ success: false, message: "Voice preferences are not set" });
    }

    return res.status(200).json({
      success: true,
      voice: { accent, gender, model: getVoiceModel(accent, gender) },
    });
  } catch (error) {
    console.error("Get user voice error:", error);
    return res
      .status(500)
      .json({
        success: false,
        message: error.message || "Failed to get user voice",
      });
  }
};

export const getSpeechJob = async (req, res) => {
  const job = await SpeechJob.findOne({
    jobId: req.params.jobId,
    userId: req.user.id,
  }).lean();

  if (!job)
    return res
      .status(404)
      .json({ success: false, message: "Speech job not found" });
  if (job.status === "pending") void processSpeechJob(job.jobId);

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
      return res
        .status(400)
        .json({ success: false, message: "A valid fileId is required" });
    }

    const [user, file] = await Promise.all([
      User.findById(req.user.id),
      File.findOne({ _id: fileId, userId: req.user.id }),
    ]);

    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    if (!file)
      return res
        .status(404)
        .json({ success: false, message: "PDF file not found" });

    const text = file.extractedText?.trim();
    const accent = user.onboarding?.preferredAccent;
    const gender = user.onboarding?.preferredVoiceGender;
    if (!text)
      return res
        .status(400)
        .json({
          success: false,
          message: "No extracted text is available for this PDF",
        });
    if (!accent || !gender)
      return res
        .status(400)
        .json({ success: false, message: "Voice preferences are not set" });

    const voiceId = getVoiceModel(accent, gender);
    const normalizedText = text.replace(/\s+/g, " ");
    const textHash = createHash("sha256").update(normalizedText).digest("hex");
    const existingAudio = await Audio.findOne({
      userId: req.user.id,
      fileId,
      voiceModel: voiceId,
      textHash,
    }).sort({ createdAt: -1 });

    if (existingAudio)
      return res
        .status(200)
        .json({ success: true, audio: audioResponse(existingAudio) });

    const activeJob = await SpeechJob.findOne({
      userId: req.user.id,
      fileId,
      textHash,
      status: "pending",
    }).lean();
    if (activeJob)
      return res
        .status(202)
        .json({ success: true, pending: true, jobId: activeJob.jobId });

    const jobId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await SpeechJob.create({
      jobId,
      userId: req.user.id,
      fileId,
      textHash,
      status: "pending",
    });

    res
      .status(202)
      .json({
        success: true,
        pending: true,
        jobId,
        message: "Speech generation started",
      });
    void processSpeechJob(jobId);
  } catch (error) {
    console.error("Start speech job error:", error);
    return res
      .status(500)
      .json({
        success: false,
        message: error.message || "Failed to start speech generation",
      });
  }
};
