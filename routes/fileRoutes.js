import express from "express";

import uploadMiddleware from "../middleware/uploadMiddleware.js";
import authMiddleware from "../middleware/authMiddleware.js";

import {
  getFile,
  uploadFile,
  getRecentFiles,
  getPinnedFiles,
  togglePinFile,
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
// GET PINNED FILES
// ============================================================

router.get(
  "/pinned",
  authMiddleware,
  getPinnedFiles
);

// ============================================================
// PIN / UNPIN FILE
// ============================================================

router.patch(
  "/:fileId/pin",
  authMiddleware,
  togglePinFile
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