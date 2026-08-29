import fs from "fs";
import path from "path";
import os from "os";
import mongoose from "mongoose";
import File from "../models/File.js";
import extractTextFromPDF from "../services/pdfServices.js";

import cloudinary from "../config/cloudinary.js";

// ============================================================
// UPLOAD FILE
// ============================================================

export const uploadFile = async (req, res) => {
  let temporaryFilePath = null;
  let cloudinaryPublicId = null;

  try {
    // ========================================================
    // CHECK FILE
    // ========================================================

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Please upload a PDF file.",
      });
    }

    // ========================================================
    // GET USER
    // ========================================================

    const userId = req.user.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User authentication failed.",
      });
    }

    // ========================================================
    // CREATE TEMPORARY FILE
    // ========================================================

    const tempDirectory = os.tmpdir();

    const temporaryFileName = `sonar-${Date.now()}-${Math.round(
      Math.random() * 1e9,
    )}.pdf`;

    temporaryFilePath = path.join(tempDirectory, temporaryFileName);

    fs.writeFileSync(temporaryFilePath, req.file.buffer);

    console.log("Temporary PDF created:", temporaryFilePath);

    // ========================================================
    // EXTRACT PDF TEXT
    // ========================================================

    console.log("Extracting PDF text...");

    const extractedText = await extractTextFromPDF(temporaryFilePath);

    console.log("PDF text extraction completed.");

    // ========================================================
    // CREATE CLOUDINARY PUBLIC ID
    // ========================================================

    const baseName = path
      .parse(req.file.originalname)
      .name.replace(/[^a-zA-Z0-9_-]/g, "_");

    const publicId = `${Date.now()}-${baseName}`;

    // ========================================================
    // UPLOAD PDF TO CLOUDINARY
    // ========================================================

    console.log("Uploading PDF to Cloudinary...");

    const cloudinaryResult = await cloudinary.uploader.upload(
      temporaryFilePath,
      {
        resource_type: "raw",
        folder: "sonar/pdfs",
        public_id: publicId,
      },
    );

    cloudinaryPublicId = cloudinaryResult.public_id;

    console.log("PDF uploaded to Cloudinary:");

    console.log(cloudinaryResult.secure_url);

    // ========================================================
    // SAVE FILE TO MONGODB
    // ========================================================

    const file = await File.create({
      userId,

      originalName: req.file.originalname,

      cloudinaryUrl: cloudinaryResult.secure_url,

      cloudinaryPublicId: cloudinaryResult.public_id,

      fileSize: req.file.size,

      mimeType: req.file.mimetype,

      extractedText,

      // New files are not pinned by default
      isPinned: false,
    });

    console.log("PDF information saved to MongoDB:", file._id);

    // ========================================================
    // DELETE TEMPORARY FILE
    // ========================================================

    if (temporaryFilePath && fs.existsSync(temporaryFilePath)) {
      fs.unlinkSync(temporaryFilePath);

      console.log("Temporary PDF deleted.");
    }

    // ========================================================
    // RESPONSE
    // ========================================================

    return res.status(201).json({
      success: true,

      message: "PDF uploaded successfully.",

      fileId: file._id,

      file: {
        id: file._id,

        originalName: file.originalName,

        fileUrl: file.cloudinaryUrl,

        isPinned: file.isPinned,
      },
    });
  } catch (error) {
    // ========================================================
    // LOG ERROR
    // ========================================================

    console.error("Upload file error:", error);

    // ========================================================
    // DELETE TEMPORARY FILE
    // ========================================================

    if (temporaryFilePath && fs.existsSync(temporaryFilePath)) {
      try {
        fs.unlinkSync(temporaryFilePath);

        console.log("Temporary PDF deleted after failure.");
      } catch (deleteError) {
        console.error("Failed to delete temporary PDF:", deleteError);
      }
    }

    // ========================================================
    // DELETE CLOUDINARY FILE IF MONGODB SAVE FAILED
    // ========================================================

    if (cloudinaryPublicId) {
      try {
        await cloudinary.uploader.destroy(cloudinaryPublicId, {
          resource_type: "raw",
        });

        console.log("Cloudinary PDF deleted after failure.");
      } catch (cloudinaryDeleteError) {
        console.error(
          "Failed to delete Cloudinary PDF:",
          cloudinaryDeleteError,
        );
      }
    }

    // ========================================================
    // RESPONSE
    // ========================================================

    return res.status(500).json({
      success: false,

      message: "Failed to upload PDF.",

      error: error.message,
    });
  }
};

// ============================================================
// GET FILE
// ============================================================

export const getFile = async (req, res) => {
  try {
    const { fileId } = req.params;

    const userId = req.user.id;
    if (!mongoose.Types.ObjectId.isValid(fileId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid file ID.",
      });
    }

    // ========================================================
    // FIND FILE BELONGING TO USER
    // ========================================================

    const file = await File.findOne({
      _id: fileId,
      userId,
    });

    if (!file) {
      return res.status(404).json({
        success: false,
        message: "File not found.",
      });
    }

    // ========================================================
    // RESPONSE
    // ========================================================

    return res.status(200).json({
      success: true,

      file: {
        id: file._id,

        originalName: file.originalName,

        fileUrl: file.cloudinaryUrl,

        extractedText: file.extractedText,

        isPinned: file.isPinned,
      },
    });
  } catch (error) {
    console.error("Get file error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get file.",
    });
  }
};

// ============================================================
// GET RECENT FILES
// ============================================================

export const getRecentFiles = async (req, res) => {
  try {
    const userId = req.user.id;

    // ========================================================
    // FIND USER'S 5 MOST RECENT FILES
    // ========================================================

    const files = await File.find({
      userId,
    })
      .sort({
        createdAt: -1,
      })
      .limit(5)
      .select("_id originalName createdAt isPinned");

    // ========================================================
    // RESPONSE
    // ========================================================

    return res.status(200).json({
      success: true,

      files: files.map((file) => ({
        id: file._id,

        originalName: file.originalName,

        createdAt: file.createdAt,

        isPinned: file.isPinned,
      })),
    });
  } catch (error) {
    console.error("Get recent files error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get recent files.",
    });
  }
};

// ============================================================
// GET PINNED FILES
// ============================================================

export const getPinnedFiles = async (req, res) => {
  try {
    const userId = req.user.id;

    // ========================================================
    // FIND USER'S PINNED FILES
    // ========================================================

    const files = await File.find({
      userId,
      isPinned: true,
    })
      .sort({
        updatedAt: -1,
      })
      .select("_id originalName createdAt updatedAt isPinned");

    // ========================================================
    // RESPONSE
    // ========================================================

    return res.status(200).json({
      success: true,

      files: files.map((file) => ({
        id: file._id,

        originalName: file.originalName,

        createdAt: file.createdAt,

        updatedAt: file.updatedAt,

        isPinned: file.isPinned,
      })),
    });
  } catch (error) {
    console.error("Get pinned files error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get pinned files.",
    });
  }
};

// ============================================================
// TOGGLE PIN FILE
// ============================================================

// ============================================================
// TOGGLE PIN FILE
// ============================================================

export const togglePinFile = async (req, res) => {
  try {
    const { fileId } = req.params;

    const userId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(fileId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid file ID.",
      });
    }

    // ========================================================
    // FIND FILE BELONGING TO CURRENT USER
    // ========================================================

    const file = await File.findOne({
      _id: fileId,
      userId,
    });

    if (!file) {
      return res.status(404).json({
        success: false,
        message: "File not found.",
      });
    }

    // ========================================================
    // TOGGLE PIN STATUS
    // ========================================================

    file.isPinned = !file.isPinned;

    await file.save();

    // ========================================================
    // RESPONSE
    // ========================================================

    return res.status(200).json({
      success: true,

      message: file.isPinned
        ? "File pinned successfully."
        : "File unpinned successfully.",

      isPinned: file.isPinned,

      file: {
        id: file._id,
        originalName: file.originalName,
        createdAt: file.createdAt,
        updatedAt: file.updatedAt,
        isPinned: file.isPinned,
      },
    });
  } catch (error) {
    console.error("Toggle pin file error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update pinned file.",
    });
  }
};
