import { getUserUsage } from "../services/usageService.js";

export const getUsage = async (req, res) => {
  try {
    const usage = await getUserUsage(req.user.id);

    return res.status(200).json({
      success: true,
      usage,
    });
  } catch (error) {
    console.error("Get usage error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get usage information.",
    });
  }
};