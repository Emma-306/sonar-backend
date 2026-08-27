import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import authRoutes from "./routes/authRoutes.js";
import onboardingRoutes from "./routes/onboardingRoutes.js";

const app = express();

app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://sonartts.onrender.com",
    ],
    credentials: true,
  })
);

app.use(express.json());

app.use(cookieParser());

// ==========================================
// AUTH ROUTES
// ==========================================

app.use(
  "/api/auth",
  authRoutes
);

// ==========================================
// ONBOARDING ROUTES
// ==========================================

app.use(
  "/api/onboarding",
  onboardingRoutes
);

export default app;