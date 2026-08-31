import crypto from "crypto";
import User from "../models/User.js";
import { getEffectivePlan } from "../services/usageService.js";

const PAYSTACK_API = "https://api.paystack.co";

const PREMIUM_AMOUNT = 450000;

const getFrontendCallbackUrl = () => {
  const candidates = [
    process.env.FRONTEND_URL,
    ...(process.env.CLIENT_URLS || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    "http://localhost:5173",
  ].filter(Boolean);

  const preferredUrl =
    candidates.find(
      (url) => !/localhost|127\.0\.0\.1/i.test(url) && !url.includes("0.0.0.0"),
    ) ||
    candidates[0] ||
    "http://localhost:5173";

  return `${preferredUrl.replace(/\/$/, "")}/#/payment-success`;
};

const getPaystackHeaders = () => ({
  Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,

  "Content-Type": "application/json",
});

const addOneMonth = (date = new Date()) => {
  const result = new Date(date);

  result.setMonth(result.getMonth() + 1);

  return result;
};

// ============================================================
// INITIALIZE PREMIUM SUBSCRIPTION
// ============================================================

export const initializePremiumPayment = async (req, res) => {
  try {
    if (!process.env.PAYSTACK_SECRET_KEY) {
      return res.status(500).json({
        success: false,
        message: "Paystack secret key is not configured.",
      });
    }

    if (!process.env.PAYSTACK_PLAN_CODE) {
      return res.status(500).json({
        success: false,
        message: "Paystack Premium plan code is not configured.",
      });
    }

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    if (getEffectivePlan(user) === "premium") {
      return res.status(400).json({
        success: false,
        message: "You already have an active Premium subscription.",
      });
    }

    const reference = `SONAR_PREMIUM_${Date.now()}_${crypto
      .randomBytes(5)
      .toString("hex")}`;

    const response = await fetch(`${PAYSTACK_API}/transaction/initialize`, {
      method: "POST",
      headers: getPaystackHeaders(),

      body: JSON.stringify({
        email: user.email,

        // Paystack expects the amount in kobo.
        amount: String(PREMIUM_AMOUNT),

        currency: "NGN",

        reference,

        callback_url: getFrontendCallbackUrl(),

        // IMPORTANT:
        // This plan code controls the
        // recurring monthly subscription.
        plan: process.env.PAYSTACK_PLAN_CODE,

        metadata: {
          userId: user._id.toString(),
          plan: "premium",
          product: "sonar_premium",
        },
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.status) {
      console.error("Paystack initialize failed:", data);

      return res.status(400).json({
        success: false,
        message: data.message || "Unable to initialize Paystack payment.",
      });
    }

    return res.status(200).json({
      success: true,

      authorizationUrl: data.data.authorization_url,

      accessCode: data.data.access_code,

      reference: data.data.reference,
    });
  } catch (error) {
    console.error("Initialize Premium payment error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to initialize Premium payment.",
    });
  }
};

// ============================================================
// VERIFY PAYMENT
// ============================================================

export const verifyPremiumPayment = async (req, res) => {
  try {
    const { reference } = req.body;

    if (!reference) {
      return res.status(400).json({
        success: false,
        message: "Payment reference is required.",
      });
    }

    const response = await fetch(
      `${PAYSTACK_API}/transaction/verify/${encodeURIComponent(reference)}`,
      {
        method: "GET",
        headers: getPaystackHeaders(),
      },
    );

    const result = await response.json();

    if (!response.ok || !result.status) {
      return res.status(400).json({
        success: false,
        message: "Unable to verify payment.",
      });
    }

    const payment = result.data;

    if (payment.status !== "success") {
      return res.status(400).json({
        success: false,
        message: "Payment was not successful.",
      });
    }

    if (payment.currency !== "NGN") {
      return res.status(400).json({
        success: false,
        message: "Invalid payment currency.",
      });
    }

    if (Number(payment.amount) !== PREMIUM_AMOUNT) {
      return res.status(400).json({
        success: false,
        message: "Invalid Premium payment amount.",
      });
    }

    const metadataUserId = payment.metadata?.userId;

    let user = null;

    if (metadataUserId) {
      user = await User.findById(metadataUserId);
    }

    if (!user) {
      user = await User.findOne({
        email: payment.customer?.email?.toLowerCase(),
      });
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Payment user could not be found.",
      });
    }

    const startDate = payment.paidAt ? new Date(payment.paidAt) : new Date();

    user.plan = "premium";

    user.subscription = {
      status: "active",

      paystackCustomerCode: payment.customer?.customer_code || null,

      paystackSubscriptionCode:
        user.subscription?.paystackSubscriptionCode || null,

      authorizationCode: payment.authorization?.authorization_code || null,

      startDate,

      endDate: addOneMonth(startDate),
    };

    await user.save();

    return res.status(200).json({
      success: true,

      message: "Premium activated successfully.",

      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        profilePicture: user.profilePicture,
        onboardingCompleted: user.onboardingCompleted,
        displayName: user.onboarding?.displayName || user.name,
        voice: user.onboarding?.preferredVoiceGender || null,
        accent: user.onboarding?.preferredAccent || null,
        brandColor: user.onboarding?.brandColor || null,
        plan: user.plan,
        subscription: user.subscription,
        onboarding: user.onboarding,
      },
    });
  } catch (error) {
    console.error("Verify Premium payment error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to verify Premium payment.",
    });
  }
};

// ============================================================
// PAYSTACK WEBHOOK
// ============================================================

export const paystackWebhook = async (req, res) => {
  try {
    const signature = req.headers["x-paystack-signature"];

    if (!signature) {
      return res.status(401).send("Missing signature");
    }

    const rawBody = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(JSON.stringify(req.body));

    const hash = crypto
      .createHmac("sha512", process.env.PAYSTACK_SECRET_KEY)
      .update(rawBody)
      .digest("hex");

    if (!crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature))) {
      return res.status(401).send("Invalid signature");
    }

    const event = JSON.parse(rawBody.toString("utf8"));

    // Acknowledge immediately.
    res.status(200).send("OK");

    const data = event.data;

    let user = null;

    const metadataUserId = data?.metadata?.userId;

    if (metadataUserId) {
      user = await User.findById(metadataUserId);
    }

    if (!user) {
      const email = data?.customer?.email || data?.customer?.customer_email;

      if (email) {
        user = await User.findOne({
          email: email.toLowerCase(),
        });
      }
    }

    if (!user) {
      console.warn("Paystack webhook user not found:", event.event);

      return;
    }

    // ======================================================
    // SUBSCRIPTION CREATED
    // ======================================================

    if (event.event === "subscription.create") {
      const startDate = data.start ? new Date(data.start * 1000) : new Date();

      const endDate = data.next_payment_date
        ? new Date(data.next_payment_date)
        : addOneMonth(startDate);

      user.plan = "premium";

      user.subscription = {
        status: "active",

        paystackCustomerCode:
          data.customer?.customer_code ||
          user.subscription?.paystackCustomerCode ||
          null,

        paystackSubscriptionCode: data.subscription_code || null,

        authorizationCode:
          data.authorization?.authorization_code ||
          user.subscription?.authorizationCode ||
          null,

        startDate,

        endDate,
      };

      await user.save();
    }

    // ======================================================
    // SUCCESSFUL MONTHLY PAYMENT
    // ======================================================

    if (event.event === "charge.success") {
      if (data.metadata?.product === "sonar_premium" || data.plan) {
        user.plan = "premium";

        user.subscription.status = "active";

        if (data.customer?.customer_code) {
          user.subscription.paystackCustomerCode = data.customer.customer_code;
        }

        if (data.authorization?.authorization_code) {
          user.subscription.authorizationCode =
            data.authorization.authorization_code;
        }

        user.subscription.endDate = addOneMonth(
          data.paidAt ? new Date(data.paidAt) : new Date(),
        );

        await user.save();
      }
    }

    // ======================================================
    // SUBSCRIPTION NOT RENEWING
    // ======================================================

    if (event.event === "subscription.not_renew") {
      user.subscription.status = "not_renewing";

      if (data.next_payment_date) {
        user.subscription.endDate = new Date(data.next_payment_date);
      }

      await user.save();
    }

    // ======================================================
    // SUBSCRIPTION DISABLED
    // ======================================================

    if (event.event === "subscription.disable") {
      user.plan = "free";

      user.subscription.status = "expired";

      user.subscription.endDate = new Date();

      await user.save();
    }
  } catch (error) {
    console.error("Paystack webhook error:", error);

    // Don't send another response because
    // successful requests were already acknowledged.
  }
};
