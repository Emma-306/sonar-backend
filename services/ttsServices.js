import path from "path";
import fs from "fs";
import { spawn } from "child_process";

// ============================================================
// VOICE MAP
// ============================================================

const voiceMap = {
  american: {
    male: "en_US-ryan-medium",
    female: "en_US-lessac-medium",
  },

  nigerian: {
    male: "en_GB-alan-medium",
    female: "en_GB-cori-medium",
  },
  british: {
    male: "en_GB-alan-medium",
    female: "en_GB-cori-medium",
  },
};

// ============================================================
// PIPER PROCESSES
// ============================================================
//
// One persistent Piper process per model.
//
// Instead of:
//
// request -> Python -> Piper -> load model -> generate -> exit
//
// We do:
//
// Node -> already-running Piper -> generate
//
// ============================================================

const piperProcesses = new Map();

// ============================================================
// PENDING REQUESTS
// ============================================================

const pendingRequests = new Map();

const generationQueues = new Map();

const piperPython =
  process.env.PIPER_PYTHON ||
  (process.platform === "win32" ? "python" : "python3");

// ============================================================
// REQUEST ID
// ============================================================

let requestCounter = 0;

const createRequestId = () => {
  requestCounter += 1;

  return `${Date.now()}-${requestCounter}`;
};

// ============================================================
// GET PIPER MODEL
// ============================================================

export const getVoiceModel = (accent, gender) => {
  const normalizedAccent = accent?.toLowerCase();
  const normalizedGender = gender?.toLowerCase();

  const accentVoices = voiceMap[normalizedAccent];

  if (!accentVoices) {
    throw new Error(`Unsupported accent: ${accent}`);
  }

  const model = accentVoices[normalizedGender];

  if (!model) {
    throw new Error(`Unsupported gender: ${gender}`);
  }

  return model;
};

// ============================================================
// GET MODEL PATH
// ============================================================

const getModelPath = (modelName) => {
  return path.join(process.cwd(), "tts", "models", `${modelName}.onnx`);
};

// ============================================================
// START PERSISTENT PIPER
// ============================================================

const startPiper = (modelName) => {
  // ----------------------------------------------------------
  // RETURN EXISTING PROCESS
  // ----------------------------------------------------------

  if (piperProcesses.has(modelName)) {
    const existing = piperProcesses.get(modelName);

    if (!existing.process.killed) {
      return existing;
    }

    piperProcesses.delete(modelName);
  }

  // ----------------------------------------------------------
  // MODEL PATH
  // ----------------------------------------------------------

  const modelPath = getModelPath(modelName);

  console.log("=================================");
  console.log("Starting persistent Piper");
  console.log("Model:", modelName);
  console.log("Path:", modelPath);
  console.log("=================================");

  // ----------------------------------------------------------
  // CHECK MODEL
  // ----------------------------------------------------------

  if (!fs.existsSync(modelPath)) {
    throw new Error(`Piper model not found: ${modelPath}`);
  }

  // ----------------------------------------------------------
  // START PIPER
  // ----------------------------------------------------------

  const piper = spawn(
    "python",
    [
      "-m",
      "piper",
      "--model",
      modelPath,
      "--output-dir",
      path.join(process.cwd(), "tts", "output"),
    ],
    {
      stdio: ["pipe", "pipe", "pipe"],
    },
  );

  // ----------------------------------------------------------
  // PROCESS OBJECT
  // ----------------------------------------------------------

  const processData = {
    process: piper,
    modelName,
    buffer: "",
    ready: true,
  };

  piperProcesses.set(modelName, processData);

  // ----------------------------------------------------------
  // STDOUT
  // ----------------------------------------------------------

  piper.stdout.on("data", (data) => {
    const output = data.toString();

    console.log(`[Piper ${modelName}]`, output.trim());
  });

  // ----------------------------------------------------------
  // STDERR
  // ----------------------------------------------------------

  piper.stderr.on("data", (data) => {
    const output = data.toString().trim();

    if (output) {
      console.log(`[Piper ${modelName}]`, output);
    }
  });

  // ----------------------------------------------------------
  // PROCESS ERROR
  // ----------------------------------------------------------

  piper.on("error", (error) => {
    console.error(`Piper ${modelName} error:`, error);

    piperProcesses.delete(modelName);

    // Reject requests waiting for this process
    for (const [requestId, request] of pendingRequests) {
      if (request.modelName === modelName) {
        request.reject(error);
        pendingRequests.delete(requestId);
      }
    }
  });

  // ----------------------------------------------------------
  // PROCESS CLOSED
  // ----------------------------------------------------------

  piper.on("close", (code) => {
    console.log(`Piper ${modelName} exited with code:`, code);

    piperProcesses.delete(modelName);

    const error =
      code === 0
        ? new Error("Piper process closed unexpectedly.")
        : new Error(`Piper exited with code ${code}`);

    for (const [requestId, request] of pendingRequests) {
      if (request.modelName === modelName) {
        request.reject(error);
        pendingRequests.delete(requestId);
      }
    }
  });

  console.log(`Persistent Piper started for ${modelName}`);

  return processData;
};

// ============================================================
// GENERATE SPEECH
// ============================================================

const generateSpeechRequest = ({ text, accent, gender, outputPath }) => {
  return new Promise((resolve, reject) => {
    const modelName = getVoiceModel(accent, gender);
    const modelPath = getModelPath(modelName);
    const normalizedText = text.trim().replace(/\s+/g, " ");
    const outputDirectory = path.dirname(outputPath);

    if (!normalizedText) {
      reject(new Error("Text is required."));
      return;
    }

    if (!fs.existsSync(modelPath)) {
      reject(new Error(`Piper model not found: ${modelPath}`));
      return;
    }

    fs.mkdirSync(outputDirectory, { recursive: true });

    const startedAt = Date.now();
    const piper = spawn(
      piperPython,
      ["-m", "piper", "--model", modelPath, "--output-file", outputPath],
      { stdio: ["pipe", "pipe", "pipe"] },
    );

    let errorOutput = "";

    piper.stderr.on("data", (data) => {
      errorOutput += data.toString();
    });

    piper.on("error", reject);

    piper.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(`Piper exited with code ${code}: ${errorOutput.trim()}`),
        );
        return;
      }

      if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
        reject(new Error("Piper did not create a valid audio file."));
        return;
      }

      resolve({
        model: modelName,
        outputPath,
        generationTime: Date.now() - startedAt,
      });
    });

    piper.stdin.end(`${normalizedText}\n`);
  });
};

export const generateSpeech = (options) => {
  const modelName = getVoiceModel(options.accent, options.gender);

  const previous = generationQueues.get(modelName) || Promise.resolve();

  const current = previous
    .catch(() => {})
    .then(() => generateSpeechRequest(options));

  generationQueues.set(modelName, current);

  current
    .finally(() => {
      if (generationQueues.get(modelName) === current) {
        generationQueues.delete(modelName);
      }
    })
    .catch(() => {});

  return current;
};

// ============================================================
// CLEANUP
// ============================================================

export const shutdownPiper = () => {
  console.log("Shutting down persistent Piper processes...");

  for (const [modelName, processData] of piperProcesses) {
    console.log(`Stopping Piper: ${modelName}`);

    processData.process.kill("SIGTERM");
  }

  piperProcesses.clear();
};

// ============================================================
// SERVER SHUTDOWN
// ============================================================

process.on("SIGTERM", shutdownPiper);
process.on("SIGINT", shutdownPiper);
