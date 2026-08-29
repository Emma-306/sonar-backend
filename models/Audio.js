import mongoose from "mongoose";

const audioSchema = new mongoose.Schema(
  {
    // ==========================================
    // USER
    // ==========================================

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // ==========================================
    // SOURCE PDF
    // ==========================================

    fileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "File",
      required: true,
    },

    // ==========================================
    // AUDIO INFORMATION
    // ==========================================

    originalName: {
      type: String,
      required: true,
      trim: true,
    },

    audioUrl: {
      type: String,
      required: true,
    },

    mimeType: {
      type: String,
      default: "audio/wav",
    },

    fileSize: {
      type: Number,
      default: 0,
    },

    // ==========================================
    // VOICE INFORMATION
    // ==========================================

    accent: {
      type: String,
      required: true,
    },

    gender: {
      type: String,
      required: true,
    },

    voiceModel: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

audioSchema.index({
  userId: 1,
  fileId: 1,
  voiceModel: 1,
});

const Audio = mongoose.model("Audio", audioSchema);

export default Audio;
