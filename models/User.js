import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    googleId: {
      type: String,
      unique: true,
      sparse: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    profilePicture: {
      type: String,
      default: null,
    },

    // ==========================================
    // ONBOARDING
    // ==========================================
    onboarding: {
      displayName: {
        type: String,
        trim: true,
      },

      preferredVoiceGender: {
        type: String,
        enum: ["male", "female"],
      },

      preferredAccent: {
        type: String,
        enum: ["nigerian", "british", "american"],
      },

      brandColor: {
        type: String,
        enum: [
          "purple",
          "blue",
          "beige",
          "maroon",
          "green",
        ],
      },
    },

    onboardingCompleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("User", userSchema);