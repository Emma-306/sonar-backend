import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import authRoutes from "./routes/authRoutes.js";
import onboardingRoutes from "./routes/onboardingRoutes.js";
import fileRoutes from "./routes/fileRoutes.js";
import ttsRoutes from "./routes/ttsRoutes.js";

const app = express();

const allowedOrigins = (
  process.env.CLIENT_URLS ||
  "http://localhost:5173,https://sonar-1-iop9.onrender.com"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  }),
);

app.use(express.json());

app.use(cookieParser());

// ==========================================
// AUTH ROUTES
// ==========================================

app.use("/api/auth", authRoutes);

// ==========================================
// ONBOARDING ROUTES
// ==========================================

app.use("/api/onboarding", onboardingRoutes);

// ==========================================
// FILE ROUTES
// ==========================================

app.use("/api/files", fileRoutes);

// ==========================================
// TTS ROUTES
// ==========================================

app.use("/api/tts", ttsRoutes);

export default app;
