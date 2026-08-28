import multer from "multer";
import path from "path";

// ============================================================
// MEMORY STORAGE
// ============================================================

const storage = multer.memoryStorage();

// ============================================================
// PDF-ONLY FILTER
// ============================================================

const fileFilter = (req, file, cb) => {
  const isPdf =
    file.mimetype === "application/pdf" &&
    path.extname(file.originalname).toLowerCase() === ".pdf";

  if (isPdf) {
    cb(null, true);
  } else {
    cb(new Error("Only PDF files are allowed."), false);
  }
};

// ============================================================
// MULTER CONFIGURATION
// ============================================================

const uploadMiddleware = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 25 * 1024 * 1024,
  },
});

export default uploadMiddleware;