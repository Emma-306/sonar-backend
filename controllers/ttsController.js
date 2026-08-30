import mongoose from "mongoose";
import { createHash } from "crypto";
import path from "path";
import fs from "fs";

import {
  reserveUsage,
  releaseUsage,
} from "../services/usageService.js";

import User from "../models/User.js";
import File from "../models/File.js";
import Audio from "../models/Audio.js";
import SpeechJob from "../models/SpeechJob.js";

import cloudinary from "../config/cloudinary.js";
import {
  getVoiceModel,
  generateSpeech,
} from "../services/ttsServices.js";

const runningJobs = new Set();

// ============================================================
// AUDIO RESPONSE
// ============================================================

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
// PROCESS SPEECH JOB
// ============================================================

const processSpeechJob = async (jobId) => {
  if (runningJobs.has(jobId)) return;

  runningJobs.add(jobId);

  const outputDir = path.join(
    process.cwd(),
    "temp",
    "tts"
  );

  const outputPath = path.join(
    outputDir,
    `speech-${jobId}.mp3`
  );

  try {
    // Make sure temp/tts exists
    fs.mkdirSync(outputDir, {
      recursive: true,
    });

    const job = await SpeechJob.findOne({
      jobId,
    });

    if (!job || job.status !== "pending") {
      return;
    }

    const [user, file] = await Promise.all([
      User.findById(job.userId),

      File.findOne({
        _id: job.fileId,
        userId: job.userId,
      }),
    ]);

    if (!user || !file) {
      throw new Error(
        "Speech source file or user was not found"
      );
    }

    const accent =
      user.onboarding?.preferredAccent;

    const gender =
      user.onboarding?.preferredVoiceGender;

    const voiceId = getVoiceModel(
      accent,
      gender
    );

    const text =
      file.extractedText
        ?.trim()
        .replace(/\s+/g, " ");

    if (!text) {
      throw new Error(
        "No extracted text is available for this PDF"
      );
    }

    console.log(
      "Starting ElevenLabs generation",
      {
        jobId,
        fileId: job.fileId,
        textLength: text.length,
        voiceId,
      }
    );

    // ========================================================
    // GENERATE AUDIO
    // ========================================================

    await generateSpeech({
      text,
      accent,
      gender,
      outputPath,
    });

    // ========================================================
    // CHECK GENERATED FILE
    // ========================================================

    if (!fs.existsSync(outputPath)) {
      throw new Error(
        "TTS service did not generate an audio file."
      );
    }

    const stats = fs.statSync(outputPath);

    // ========================================================
    // UPLOAD TO CLOUDINARY
    // ========================================================

    const cloudinaryResult =
      await cloudinary.uploader.upload(
        outputPath,
        {
          resource_type: "video",
          folder: "sonar/audio",
          public_id: `speech-${Date.now()}`,
        }
      );

    // ========================================================
    // SAVE AUDIO
    // ========================================================

    const audio = await Audio.create({
      userId: job.userId,
      fileId: job.fileId,
      textHash: job.textHash,

      originalName:
        `${path.parse(file.originalName).name}.mp3`,

      audioUrl:
        cloudinaryResult.secure_url,

      mimeType: "audio/mpeg",

      fileSize: stats.size,

      accent,
      gender,
      voiceModel: voiceId,
    });

    // ========================================================
    // COMPLETE JOB
    // ========================================================

    await SpeechJob.findOneAndUpdate(
      { jobId },

      {
        status: "completed",

        audio: audioResponse(audio),

        message: null,
      }
    );

    console.log(
      "Speech generation completed:",
      audio._id
    );
  } catch (error) {
    console.error(
      "ElevenLabs speech generation failed:",
      error
    );

    await SpeechJob.findOneAndUpdate(
      { jobId },

      {
        status: "failed",
        message:
          error.message ||
          "Speech generation failed",
      }
    );
  } finally {
    // ========================================================
    // DELETE TEMP FILE
    // ========================================================

    if (fs.existsSync(outputPath)) {
      try {
        fs.unlinkSync(outputPath);
      } catch (deleteError) {
        console.error(
          "Failed to delete temporary audio:",
          deleteError
        );
      }
    }

    runningJobs.delete(jobId);
  }
};

// ============================================================
// GET USER VOICE
// ============================================================

export const getUserVoice = async (req, res) => {
  try {
    const user = await User.findById(
      req.user.id
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const accent =
      user.onboarding?.preferredAccent;

    const gender =
      user.onboarding?.preferredVoiceGender;

    if (!accent || !gender) {
      return res.status(400).json({
        success: false,
        message:
          "Voice preferences are not set",
      });
    }

    return res.status(200).json({
      success: true,

      voice: {
        accent,
        gender,
        model: getVoiceModel(
          accent,
          gender
        ),
      },
    });
  } catch (error) {
    console.error(
      "Get user voice error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Failed to get user voice",
    });
  }
};

// ============================================================
// GET SPEECH JOB
// ============================================================

export const getSpeechJob = async (req, res) => {
  try {
    const job =
      await SpeechJob.findOne({
        jobId: req.params.jobId,
        userId: req.user.id,
      }).lean();

    if (!job) {
      return res.status(404).json({
        success: false,
        message:
          "Speech job not found",
      });
    }

    if (job.status === "pending") {
      void processSpeechJob(
        job.jobId
      );
    }

    return res.status(200).json({
      success:
        job.status !== "failed",

      pending:
        job.status === "pending",

      jobId: job.jobId,

      status: job.status,

      message: job.message,

      audio: job.audio,
    });
  } catch (error) {
    console.error(
      "Get speech job error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Failed to get speech job",
    });
  }
};

// ============================================================
// GENERATE USER SPEECH ASYNC
// ============================================================

export const generateUserSpeechAsync =
  async (req, res) => {
    try {
      const { fileId } = req.body;

      if (
        !fileId ||
        !mongoose.Types.ObjectId.isValid(
          fileId
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "A valid fileId is required",
        });
      }

      const [user, file] =
        await Promise.all([
          User.findById(req.user.id),

          File.findOne({
            _id: fileId,
            userId: req.user.id,
          }),
        ]);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      if (!file) {
        return res.status(404).json({
          success: false,
          message:
            "PDF file not found",
        });
      }

      const text =
        file.extractedText?.trim();

      const accent =
        user.onboarding
          ?.preferredAccent;

      const gender =
        user.onboarding
          ?.preferredVoiceGender;

      if (!text) {
        return res.status(400).json({
          success: false,
          message:
            "No extracted text is available for this PDF",
        });
      }

      if (!accent || !gender) {
        return res.status(400).json({
          success: false,
          message:
            "Voice preferences are not set",
        });
      }

      const voiceId =
        getVoiceModel(
          accent,
          gender
        );

      const normalizedText =
        text.replace(/\s+/g, " ");

      const textHash =
        createHash("sha256")
          .update(normalizedText)
          .digest("hex");

      // ======================================================
      // CHECK EXISTING AUDIO
      // ======================================================

      const existingAudio =
        await Audio.findOne({
          userId: req.user.id,
          fileId,
          voiceModel: voiceId,
          textHash,
        }).sort({
          createdAt: -1,
        });

      if (existingAudio) {
        return res.status(200).json({
          success: true,
          audio:
            audioResponse(
              existingAudio
            ),
        });
      }

      // ======================================================
      // CHECK ACTIVE JOB
      // ======================================================

      const activeJob =
        await SpeechJob.findOne({
          userId: req.user.id,
          fileId,
          textHash,
          status: "pending",
        }).lean();

      if (activeJob) {
        return res.status(202).json({
          success: true,
          pending: true,
          jobId: activeJob.jobId,
        });
      }

      // ======================================================
      // CREATE JOB
      // ======================================================

      const jobId =
        `${Date.now()}-${Math.random()
          .toString(36)
          .slice(2)}`;

      await SpeechJob.create({
        jobId,
        userId: req.user.id,
        fileId,
        textHash,
        status: "pending",
      });

      return res.status(202).json({
        success: true,
        pending: true,
        jobId,
        message:
          "Speech generation started",
      }).end(
        void processSpeechJob(jobId)
      );
    } catch (error) {
      console.error(
        "Start speech job error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          error.message ||
          "Failed to start speech generation",
      });
    }
  };

// ============================================================
// DOWNLOAD AUDIO
// ============================================================

export const downloadAudio = async (
  req,
  res
) => {
  let usageReserved = false;

  try {
    const { audioId } =
      req.params;

    console.log(
      "Download request received:",
      audioId
    );

    // ========================================================
    // VALIDATE AUDIO ID
    // ========================================================

    if (
      !mongoose.Types.ObjectId.isValid(
        audioId
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid audio ID.",
      });
    }

    // ========================================================
    // FIND AUDIO
    // ========================================================

    const audio =
      await Audio.findOne({
        _id: audioId,
        userId: req.user.id,
      });

    if (!audio) {
      console.log(
        "Audio not found:",
        audioId
      );

      return res.status(404).json({
        success: false,
        message:
          "Audio not found.",
      });
    }

    if (!audio.audioUrl) {
      return res.status(404).json({
        success: false,
        message:
          "Audio file URL is missing.",
      });
    }

    // ========================================================
    // RESERVE DOWNLOAD
    // ========================================================

    const usage =
      await reserveUsage({
        userId: req.user.id,
        type: "audioDownload",
      });

    if (!usage.allowed) {
      return res.status(429).json({
        success: false,

        code:
          "DOWNLOAD_LIMIT_REACHED",

        message:
          usage.plan === "premium"
            ? "You've reached your Premium audio download limit for today."
            : "You've reached your free audio download limit for today. Upgrade to Premium for 10 downloads per day.",

        usage: {
          used: usage.used,
          limit: usage.limit,
          remaining:
            usage.remaining,
        },
      });
    }

    usageReserved = true;

    // ========================================================
    // DOWNLOAD FROM CLOUDINARY
    // ========================================================

    console.log(
      "Fetching Cloudinary audio:",
      audio.audioUrl
    );

    const cloudinaryResponse =
      await fetch(
        audio.audioUrl
      );

    if (
      !cloudinaryResponse.ok
    ) {
      throw new Error(
        `Cloudinary returned ${cloudinaryResponse.status}`
      );
    }

    const arrayBuffer =
      await cloudinaryResponse.arrayBuffer();

    const buffer =
      Buffer.from(arrayBuffer);

    // ========================================================
    // DOWNLOAD NAME
    // ========================================================

    const downloadName =
      audio.originalName ||
      "sonar-audio.mp3";

    // ========================================================
    // RESPONSE HEADERS
    // ========================================================

    res.setHeader(
      "Content-Type",
      audio.mimeType ||
        "audio/mpeg"
    );

    res.setHeader(
      "Content-Length",
      buffer.length
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${downloadName.replace(
        /"/g,
        ""
      )}"`
    );

    res.setHeader(
      "Cache-Control",
      "no-cache"
    );

    console.log(
      "Sending audio download:",
      downloadName
    );

    return res.send(buffer);
  } catch (error) {
    console.error(
      "Download audio error:",
      error
    );

    // ========================================================
    // RELEASE USAGE IF DOWNLOAD FAILED
    // ========================================================

    if (usageReserved) {
      try {
        await releaseUsage({
          userId: req.user.id,
          type: "audioDownload",
        });
      } catch (releaseError) {
        console.error(
          "Failed to release audio usage:",
          releaseError
        );
      }
    }

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Failed to download audio.",
    });
  }
};