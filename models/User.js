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
    // SUBSCRIPTION
    // ==========================================

    plan: {
      type: String,
      enum: ["free", "premium"],
      default: "free",
    },

    subscription: {
      status: {
        type: String,
        enum: [
          "inactive",
          "active",
          "not_renewing",
          "cancelled",
          "expired",
        ],
        default: "inactive",
      },

      paystackCustomerCode: {
        type: String,
        default: null,
      },

      paystackSubscriptionCode: {
        type: String,
        default: null,
      },

      authorizationCode: {
        type: String,
        default: null,
      },

      startDate: {
        type: Date,
        default: null,
      },

      endDate: {
        type: Date,
        default: null,
      },
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
          "coral",
          "pink",
          "teal",
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