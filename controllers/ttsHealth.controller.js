import fs from "fs";
import path from "path";
import { spawn } from "child_process";

const python =
  process.env.PIPER_PYTHON ||
  (process.platform === "win32" ? "python" : "python3");

export const getTtsHealth = (req, res) => {
  const modelPath = path.join(
    process.cwd(),
    "tts",
    "models",
    "en_GB-alan-medium.onnx",
  );

  const piper = spawn(python, ["-m", "piper", "--help"], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  let error = "";
  piper.stderr.on("data", (data) => {
    error += data.toString();
  });

  piper.on("error", (spawnError) => {
    res.status(503).json({
      success: false,
      python,
      modelExists: fs.existsSync(modelPath),
      error: spawnError.message,
    });
  });

  piper.on("close", (code) => {
    if (res.headersSent) return;

    res.status(code === 0 ? 200 : 503).json({
      success: code === 0,
      python,
      modelExists: fs.existsSync(modelPath),
      modelPath,
      piperExitCode: code,
      error: error.trim() || null,
    });
  });
};
