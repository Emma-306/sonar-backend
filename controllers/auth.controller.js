import User from "../models/User.js";
import verifyGoogleCode from "../services/googleAuthService.js";
import generateToken from "../utils/generateToken.js";

export const googleLogin = async (req, res) => {
  try {
    const { code } = req.body;

    // ==========================================
    // CHECK CODE
    // ==========================================

    if (!code) {
      return res.status(400).json({
        success: false,
        message: "Google authorization code is required",
      });
    }

    console.log("Google authorization code received.");

    // ==========================================
    // VERIFY GOOGLE CODE
    // ==========================================

    const googleUser = await verifyGoogleCode(code);

    console.log("Google user:", googleUser);

    const {
      sub: googleId,
      name,
      email,
      picture,
      email_verified,
    } = googleUser;

    // ==========================================
    // MAKE SURE EMAIL IS VERIFIED
    // ==========================================

    if (!email_verified) {
      return res.status(401).json({
        success: false,
        message: "Google email is not verified",
      });
    }

    // ==========================================
    // FIND USER BY GOOGLE ID
    // ==========================================

    let user = await User.findOne({
      googleId,
    });

    // ==========================================
    // GOOGLE USER DOES NOT EXIST
    // ==========================================

    if (!user) {
      // Check if email already exists
      user = await User.findOne({
        email,
      });

      // ========================================
      // EXISTING ACCOUNT
      // ========================================

      if (user) {
        user.googleId = googleId;

        if (!user.profilePicture && picture) {
          user.profilePicture = picture;
        }

        await user.save();

        console.log(
          "Google account linked to existing user:",
          user._id
        );
      }
    }

    // ==========================================
    // COMPLETELY NEW USER
    // ==========================================

    if (!user) {
      user = await User.create({
        googleId,
        name,
        email,
        profilePicture: picture || null,
        onboardingCompleted: false,
      });

      console.log(
        "New Google user created:",
        user._id
      );
    }

    // ==========================================
    // GENERATE JWT
    // ==========================================

    const token = generateToken(
      user._id.toString()
    );

    // ==========================================
    // RESPONSE
    // ==========================================

    return res.status(200).json({
      success: true,
      message: "Google login successful",

      token,

      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        profilePicture: user.profilePicture,

        onboardingCompleted:
          user.onboardingCompleted,

        displayName:
          user.onboarding?.displayName || null,

        voice:
          user.onboarding?.preferredVoiceGender ||
          null,

        accent:
          user.onboarding?.preferredAccent ||
          null,

        brandColor:
          user.onboarding?.brandColor ||
          null,
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