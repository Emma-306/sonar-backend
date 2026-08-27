import dotenv from "dotenv";

dotenv.config();

const startServer = async () => {
  try {
    // ==========================================
    // CHECK ENVIRONMENT VARIABLES
    // ==========================================

    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI is missing from .env");
    }

    if (!process.env.GOOGLE_CLIENT_ID) {
      throw new Error(
        "GOOGLE_CLIENT_ID is missing from .env"
      );
    }

    if (!process.env.GOOGLE_CLIENT_SECRET) {
      throw new Error(
        "GOOGLE_CLIENT_SECRET is missing from .env"
      );
    }

    if (!process.env.JWT_SECRET) {
      throw new Error(
        "JWT_SECRET is missing from .env"
      );
    }

    console.log("Environment variables loaded.");

    console.log(
      "GOOGLE_CLIENT_ID:",
      process.env.GOOGLE_CLIENT_ID
    );

    console.log(
      "GOOGLE_CLIENT_SECRET exists:",
      !!process.env.GOOGLE_CLIENT_SECRET
    );

    // ==========================================
    // IMPORT APP AFTER DOTENV
    // ==========================================

    const { default: app } = await import("./app.js");

    // ==========================================
    // IMPORT DATABASE
    // ==========================================

    const { default: connectDB } =
      await import("./config/db.js");

    // ==========================================
    // CONNECT DATABASE
    // ==========================================

    await connectDB();

    console.log("Database connected successfully.");

    // ==========================================
    // START SERVER
    // ==========================================

    const PORT = process.env.PORT || 5000;

    app.listen(PORT, () => {
      console.log(
        `Sonar server running on port ${PORT}`
      );
    });
  } catch (error) {
    console.error(
      "Failed to start server:",
      error.message
    );

    process.exit(1);
  }
};

startServer();