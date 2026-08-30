import DailyUsage from "../models/DailyUsage.js";
import User from "../models/User.js";

export const FREE_LIMIT = 3;
export const PREMIUM_LIMIT = 10;

export const getDateKey = () => {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
  }).format(new Date());
};

export const getEffectivePlan = (user) => {
  if (!user) {
    return "free";
  }

  if (user.plan !== "premium") {
    return "free";
  }

  if (user.subscription?.status !== "active") {
    return "free";
  }

  if (
    user.subscription?.endDate &&
    new Date(user.subscription.endDate) <= new Date()
  ) {
    return "free";
  }

  return "premium";
};

export const getLimitForUser = (user) => {
  return getEffectivePlan(user) === "premium"
    ? PREMIUM_LIMIT
    : FREE_LIMIT;
};

const getFieldForType = (type) => {
  if (type === "pdfUpload") {
    return "pdfUploads";
  }

  if (type === "audioDownload") {
    return "audioDownloads";
  }

  throw new Error(`Unknown usage type: ${type}`);
};

// Atomically reserve one usage slot.
// This prevents two simultaneous requests from bypassing the limit.
export const reserveUsage = async ({
  userId,
  type,
}) => {
  const user = await User.findById(userId);

  if (!user) {
    return {
      allowed: false,
      reason: "USER_NOT_FOUND",
    };
  }

  const field = getFieldForType(type);
  const limit = getLimitForUser(user);
  const dateKey = getDateKey();

  try {
    let usage = await DailyUsage.findOneAndUpdate(
      {
        userId,
        dateKey,
        [field]: {
          $lt: limit,
        },
      },
      {
        $inc: {
          [field]: 1,
        },
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      }
    );

    if (!usage) {
      usage = await DailyUsage.findOne({
        userId,
        dateKey,
      });
    }

    if (!usage) {
      return {
        allowed: false,
        reason: "USAGE_ERROR",
      };
    }

    const used = usage[field];

    if (used > limit) {
      await DailyUsage.findOneAndUpdate(
        {
          userId,
          dateKey,
        },
        {
          $inc: {
            [field]: -1,
          },
        }
      );

      return {
        allowed: false,
        reason: "LIMIT_REACHED",
        plan: getEffectivePlan(user),
        used: limit,
        limit,
        remaining: 0,
      };
    }

    return {
      allowed: true,
      plan: getEffectivePlan(user),
      used,
      limit,
      remaining: Math.max(0, limit - used),
    };
  } catch (error) {
    // A concurrent first request can race on the unique index.
    if (error?.code === 11000) {
      const usage = await DailyUsage.findOneAndUpdate(
        {
          userId,
          dateKey,
          [field]: {
            $lt: limit,
          },
        },
        {
          $inc: {
            [field]: 1,
          },
        },
        {
          new: true,
        }
      );

      if (!usage) {
        return {
          allowed: false,
          reason: "LIMIT_REACHED",
          plan: getEffectivePlan(user),
          used: limit,
          limit,
          remaining: 0,
        };
      }

      return {
        allowed: true,
        plan: getEffectivePlan(user),
        used: usage[field],
        limit,
        remaining: Math.max(
          0,
          limit - usage[field]
        ),
      };
    }

    throw error;
  }
};

// Give a reserved slot back when the operation fails.
export const releaseUsage = async ({
  userId,
  type,
}) => {
  const field = getFieldForType(type);
  const dateKey = getDateKey();

  await DailyUsage.findOneAndUpdate(
    {
      userId,
      dateKey,
      [field]: {
        $gt: 0,
      },
    },
    {
      $inc: {
        [field]: -1,
      },
    }
  );
};

export const getUserUsage = async (userId) => {
  const [user, usage] = await Promise.all([
    User.findById(userId),
    DailyUsage.findOne({
      userId,
      dateKey: getDateKey(),
    }),
  ]);

  if (!user) {
    throw new Error("User not found");
  }

  const plan = getEffectivePlan(user);
  const limit =
    plan === "premium"
      ? PREMIUM_LIMIT
      : FREE_LIMIT;

  return {
    plan,

    uploads: {
      used: usage?.pdfUploads || 0,
      limit,
      remaining: Math.max(
        0,
        limit - (usage?.pdfUploads || 0)
      ),
    },

    downloads: {
      used: usage?.audioDownloads || 0,
      limit,
      remaining: Math.max(
        0,
        limit - (usage?.audioDownloads || 0)
      ),
    },

    subscription: {
      status:
        user.subscription?.status || "inactive",

      startDate:
        user.subscription?.startDate || null,

      endDate:
        user.subscription?.endDate || null,
    },
  };
};