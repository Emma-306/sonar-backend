import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import authRoutes from "./routes/authRoutes.js";
import onboardingRoutes from "./routes/onboardingRoutes.js";
import fileRoutes from "./routes/fileRoutes.js";
import ttsRoutes from "./routes/ttsRoutes.js";
import usageRoutes from "./routes/usageRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";

const app = express();

// ==========================================
// CORS CONFIGURATION
// ==========================================

const configuredOrigins = (process.env.CLIENT_URLS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowedOrigins = [
  "http://localhost:5173",
  "https://sonartts.onrender.com",
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
app.use("/onboarding", onboardingRoutes);

// ==========================================
// FILE ROUTES
// ==========================================

app.use("/api/files", fileRoutes);
app.use("/files", fileRoutes);

// ==========================================
// TTS ROUTES
// ==========================================

app.use("/api/tts", ttsRoutes);
app.use("/tts", ttsRoutes);

// ==========================================
// USAGE ROUTES
// ==========================================

app.use("/api/usage", usageRoutes);
app.use("/usage", usageRoutes);

// ==========================================
// PAYMENT ROUTES
// POST /api/payments/initialize
// POST /api/payments/verify
// ==========================================

app.use("/api/payments", paymentRoutes);
app.use("/payments", paymentRoutes);

export default app;