import express from "express";
import uploadMiddleware from "../middleware/uploadMiddleware.js";

import authMiddleware from "../middleware/authMiddleware.js";
import { getFile, uploadFile } from "../controllers/fileControllers.js";

const router = express.Router();

router.post(
  "/upload",
  authMiddleware,
  uploadMiddleware.single("file"),
  uploadFile
);

router.get(
  "/:fileId",
  authMiddleware,
  getFile
);


export default router;