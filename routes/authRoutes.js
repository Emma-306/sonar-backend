import express from "express";

import {
  googleLogin,
} from "../controllers/auth.controller.js";

const router = express.Router();

// POST /api/auth/google
router.post(
  "/google",
  googleLogin
);

export default router;