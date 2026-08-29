export const getTtsHealth = (req, res) => {
  res.status(process.env.ELEVENLABS_API_KEY ? 200 : 503).json({
    success: Boolean(process.env.ELEVENLABS_API_KEY),
    provider: "elevenlabs",
    apiKeyConfigured: Boolean(process.env.ELEVENLABS_API_KEY),
    message: process.env.ELEVENLABS_API_KEY
      ? "ElevenLabs is configured"
      : "ELEVENLABS_API_KEY is missing",
  });
};
