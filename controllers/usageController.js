import { getUserUsage } from "../services/usageService.js";

export const getUsage = async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const usage = await getUserUsage(req.user.id);

    return res.status(200).json({
      success: true,
      usage,
    });
  } catch (error) {
    console.error("Get usage error:", error);

    if (error.message === "User not found") {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to get usage information.",
    });
  }
};
