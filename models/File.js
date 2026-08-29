import mongoose from "mongoose";

const fileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    originalName: {
      type: String,
      required: true,
      trim: true,
    },

    // Cloudinary URL of the uploaded PDF
    cloudinaryUrl: {
      type: String,
      required: true,
    },

    // Cloudinary public ID - useful if you later want to delete the file
    cloudinaryPublicId: {
      type: String,
      required: true,
    },

    fileSize: {
      type: Number,
      required: true,
    },

    mimeType: {
      type: String,
      required: true,
    },

    extractedText: {
      type: String,
      default: "",
    },

    // ========================================================
    // PINNED FILE
    // ========================================================

    isPinned: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

const File = mongoose.model("File", fileSchema);

export default File;