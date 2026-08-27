import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import { completeOnboarding } from "../controllers/onboarding.controller.js";
const router = express.Router();

router.post(
  "/",
  authMiddleware,
  completeOnboarding
);

export default router;