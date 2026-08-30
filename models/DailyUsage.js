import mongoose from "mongoose";

const dailyUsageSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // YYYY-MM-DD in Africa/Lagos timezone
    dateKey: {
      type: String,
      required: true,
    },

    pdfUploads: {
      type: Number,
      default: 0,
    },

    audioDownloads: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

dailyUsageSchema.index(
  {
    userId: 1,
    dateKey: 1,
  },
  {
    unique: true,
  }
);

export default mongoose.model(
  "DailyUsage",
  dailyUsageSchema
);