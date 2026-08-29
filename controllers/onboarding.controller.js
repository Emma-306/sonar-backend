import User from "../models/User.js";

// ============================================================
// SAVE ONBOARDING PREFERENCES
// ============================================================

export const completeOnboarding = async (req, res) => {
  try {
    const { name, preferredVoiceGender, preferredAccent, brandColor } =
      req.body;

    // ==========================================
    // VALIDATION
    // ==========================================

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Preferred name is required",
      });
    }

    if (!preferredVoiceGender) {
      return res.status(400).json({
        success: false,
        message: "Voice preference is required",
      });
    }

    if (!preferredAccent) {
      return res.status(400).json({
        success: false,
        message: "Accent preference is required",
      });
    }

    if (!brandColor) {
      return res.status(400).json({
        success: false,
        message: "Brand color is required",
      });
    }

    // ==========================================
    // VALIDATE VALUES
    // ==========================================

    const validVoices = ["male", "female"];

    const validAccents = ["nigerian", "british", "american"];

    const validBrandColors = ["purple", "blue", "coral", "pink", "teal"];

    if (!validVoices.includes(preferredVoiceGender)) {
      return res.status(400).json({
        success: false,
        message: "Invalid voice preference",
      });
    }

    if (!validAccents.includes(preferredAccent)) {
      return res.status(400).json({
        success: false,
        message: "Invalid accent preference",
      });
    }

    if (!validBrandColors.includes(brandColor)) {
      return res.status(400).json({
        success: false,
        message: "Invalid brand color",
      });
    }

    // ==========================================
    // FIND USER
    // ==========================================

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // ==========================================
    // SAVE ONBOARDING
    // ==========================================

    user.onboarding = {
      displayName: name.trim(),
      preferredVoiceGender,
      preferredAccent,
      brandColor,
    };

    user.onboardingCompleted = true;

    await user.save();

    // ==========================================
    // RESPONSE
    // ==========================================

    return res.status(200).json({
      success: true,
      message: "Onboarding completed successfully",

      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        profilePicture: user.profilePicture,

        onboardingCompleted: user.onboardingCompleted,

        displayName: user.onboarding.displayName,

        voice: user.onboarding.preferredVoiceGender,

        accent: user.onboarding.preferredAccent,

        brandColor: user.onboarding.brandColor,

        onboarding: user.onboarding,
      },
    });
  } catch (error) {
    console.error("Complete onboarding error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to complete onboarding",
    });
  }
};
