import User from "../models/User.js";
import verifyGoogleCode from "../services/googleAuthService.js";
import generateToken from "../utils/generateToken.js";

// ==========================================
// GOOGLE LOGIN
// ==========================================

export const googleLogin = async (
  req,
  res
) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({
        success: false,
        message:
          "Google authorization code is required",
      });
    }

    const googleUser =
      await verifyGoogleCode(code);

    const {
      sub: googleId,
      name,
      email,
      picture,
      email_verified,
    } = googleUser;

    if (!email_verified) {
      return res.status(401).json({
        success: false,
        message:
          "Google email is not verified",
      });
    }

    let user =
      await User.findOne({
        googleId,
      });

    if (!user) {
      user =
        await User.findOne({
          email,
        });

      if (user) {
        user.googleId = googleId;

        if (name) {
          user.name = name;
        }

        if (picture) {
          user.profilePicture =
            picture;
        }

        await user.save();
      }
    }

    if (!user) {
      user =
        await User.create({
          googleId,
          name,
          email,
          profilePicture:
            picture || null,
          onboardingCompleted: false,
        });
    }

    const token = generateToken(
      user._id.toString()
    );

    return res.status(200).json({
      success: true,
      message:
        "Google login successful",

      token,

      user: {
        id: user._id,

        // Official Google name
        name: user.name,

        email: user.email,

        profilePicture:
          user.profilePicture,

        onboardingCompleted:
          user.onboardingCompleted,

        // Custom display name
        displayName:
          user.onboarding?.displayName ||
          user.name,

        voice:
          user.onboarding
            ?.preferredVoiceGender ||
          null,

        accent:
          user.onboarding
            ?.preferredAccent ||
          null,

        brandColor:
          user.onboarding?.brandColor ||
          null,

        onboarding:
          user.onboarding,
      },
    });
  } catch (error) {
    console.error(
      "Google login error:",
      error
    );

    return res.status(401).json({
      success: false,
      message:
        error.message ||
        "Google authentication failed",
    });
  }
};

// ==========================================
// GET CURRENT USER
// ==========================================

export const getCurrentUser = async (
  req,
  res
) => {
  try {
    const user =
      await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,

      user: {
        id: user._id,

        // Official Google name
        name: user.name,

        email: user.email,

        profilePicture:
          user.profilePicture,

        onboardingCompleted:
          user.onboardingCompleted,

        // Custom display name
        displayName:
          user.onboarding?.displayName ||
          user.name,

        voice:
          user.onboarding
            ?.preferredVoiceGender ||
          null,

        accent:
          user.onboarding
            ?.preferredAccent ||
          null,

        brandColor:
          user.onboarding?.brandColor ||
          null,

        onboarding:
          user.onboarding,
      },
    });
  } catch (error) {
    console.error(
      "Get current user error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to get current user",
    });
  }
};

// ==========================================
// UPDATE ACCOUNT SETTINGS
// ==========================================

export const updateAccountSettings = async (
  req,
  res
) => {
  try {
    const {
      displayName,
      preferredVoiceGender,
      preferredAccent,
      brandColor,
    } = req.body;

    if (
      !displayName ||
      !displayName.trim()
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Display name is required",
      });
    }

    const validVoices = [
      "male",
      "female",
    ];

    const validAccents = [
      "nigerian",
      "british",
      "american",
    ];

    const validBrandColors = [
      "purple",
      "blue",
      "coral",
      "pink",
      "teal",
    ];

    if (
      !validVoices.includes(
        preferredVoiceGender
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid voice preference",
      });
    }

    if (
      !validAccents.includes(
        preferredAccent
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid accent preference",
      });
    }

    if (
      !validBrandColors.includes(
        brandColor
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid brand color",
      });
    }

    const user =
      await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // IMPORTANT:
    // Only update onboarding preferences.
    // user.name remains unchanged.

    user.onboarding = {
      displayName:
        displayName.trim(),

      preferredVoiceGender,

      preferredAccent,

      brandColor,
    };

    await user.save();

    return res.status(200).json({
      success: true,
      message:
        "Account settings updated successfully",

      user: {
        id: user._id,

        // Official Google name stays unchanged
        name: user.name,

        email: user.email,

        profilePicture:
          user.profilePicture,

        onboardingCompleted:
          user.onboardingCompleted,

        // Updated display name
        displayName:
          user.onboarding.displayName,

        voice:
          user.onboarding
            .preferredVoiceGender,

        accent:
          user.onboarding
            .preferredAccent,

        brandColor:
          user.onboarding
            .brandColor,

        onboarding:
          user.onboarding,
      },
    });
  } catch (error) {
    console.error(
      "Update account settings error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to update account settings",
    });
  }
};