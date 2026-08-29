import express from "express";

import uploadMiddleware from "../middleware/uploadMiddleware.js";

import authMiddleware from "../middleware/authMiddleware.js";

import {
  getFile,
  uploadFile,
  getRecentFiles,
} from "../controllers/fileControllers.js";

const router = express.Router();

// ============================================================
// UPLOAD FILE
// ============================================================

router.post(
  "/upload",
  authMiddleware,
  uploadMiddleware.single("file"),
  uploadFile
);

// ============================================================
// GET RECENT FILES
// ============================================================

router.get(
  "/recent",
  authMiddleware,
  getRecentFiles
);

// ============================================================
// GET SINGLE FILE
// ============================================================

router.get(
  "/:fileId",
  authMiddleware,
  getFile
);

export default router;