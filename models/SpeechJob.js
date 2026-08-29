import mongoose from "mongoose";

const speechJobSchema = new mongoose.Schema(
  {
    jobId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    fileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "File",
      required: true,
    },

    textHash: {
      type: String,
      required: true,
    },

    status: {
      type: String,
      enum: ["pending", "completed", "failed"],
      default: "pending",
    },

    message: {
      type: String,
      default: null,
    },

    audio: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

speechJobSchema.index({ userId: 1, fileId: 1, textHash: 1, status: 1 });

export default mongoose.model("SpeechJob", speechJobSchema);
