import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import authRoutes from "./routes/authRoutes.js";
import onboardingRoutes from "./routes/onboardingRoutes.js";
import fileRoutes from "./routes/fileRoutes.js";
import ttsRoutes from "./routes/ttsRoutes.js";

const app = express();

// ==========================================
// CORS CONFIGURATION
// ==========================================

const configuredOrigins = (process.env.CLIENT_URLS || "")
  .split(",")
  .filter(Boolean);

const allowedOrigins = [
  "http://localhost:5173",
  "https://sonar-1-iop9.onrender.com",
  ...configuredOrigins,
]
  .map((origin) => origin.trim())
  .filter(Boolean)
  .filter(
    (origin, index, origins) =>
      origins.indexOf(origin) === index
  );

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);

// ==========================================
// MIDDLEWARE
// ==========================================

app.use(express.json());

app.use(cookieParser());

// ==========================================
// AUTH ROUTES
// ==========================================

app.use("/api/auth", authRoutes);

// Backward-compatible alias for older frontend builds without /api.
app.use("/auth", authRoutes);

// ==========================================
// ONBOARDING ROUTES
// ==========================================

app.use("/api/onboarding", onboardingRoutes);

// ==========================================
// FILE ROUTES
// Includes:
// POST /api/files/upload
// GET  /api/files/recent
// GET  /api/files/:fileId
// ==========================================

app.use("/api/files", fileRoutes);

// ==========================================
// TTS ROUTES
// ==========================================

app.use("/api/tts", ttsRoutes);

export default app;