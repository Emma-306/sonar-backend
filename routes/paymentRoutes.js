import express from "express";

import authMiddleware from "../middleware/authMiddleware.js";

import {
  initializePremiumPayment,
  verifyPremiumPayment,
} from "../controllers/paymentController.js";

const router = express.Router();

router.post(
  "/initialize",
  authMiddleware,
  initializePremiumPayment
);

router.post(
  "/verify",
  authMiddleware,
  verifyPremiumPayment
);

export default router;