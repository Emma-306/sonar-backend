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
    try {
      // ========================================================
      // VALIDATE TEXT
      // ========================================================

      if (!text || !text.trim()) {
        return reject(new Error("Text is required."));
      }

      // ========================================================
      // GET MODEL
      // ========================================================

      const modelName = getVoiceModel(accent, gender);

      console.log("=================================");
      console.log("Speech request");
      console.log("Accent:", accent);
      console.log("Gender:", gender);
      console.log("Model:", modelName);
      console.log("=================================");

      // ========================================================
      // OUTPUT DIRECTORY
      // ========================================================

      const outputDirectory = path.dirname(outputPath);

      if (!fs.existsSync(outputDirectory)) {
        fs.mkdirSync(outputDirectory, {
          recursive: true,
        });
      }

      // ========================================================
      // START / GET PERSISTENT PIPER
      // ========================================================

      const piper = startPiper(modelName);

      // ========================================================
      // REQUEST ID
      // ========================================================

      const requestId = createRequestId();

      // ========================================================
      // PIPER OUTPUT DIRECTORY
      // ========================================================

      const generatedDirectory = path.join(process.cwd(), "tts", "output");

      if (!fs.existsSync(generatedDirectory)) {
        fs.mkdirSync(generatedDirectory, {
          recursive: true,
        });
      }

      // ========================================================
      // PIPER GENERATES TIMESTAMP FILES
      // ========================================================
      //
      // Piper's --output-dir generates files using a
      // timestamp-based filename.
      //
      // We record the directory contents before sending
      // the request, then find the newly generated file.
      //
      // ========================================================

      const beforeFiles = new Set(
        fs
          .readdirSync(generatedDirectory)
          .filter((file) => file.endsWith(".wav")),
      );

      // ========================================================
      // STORE REQUEST
      // ========================================================

      pendingRequests.set(requestId, {
        modelName,
        outputPath,
        resolve,
        reject,
        generatedDirectory,
        beforeFiles,
        startedAt: Date.now(),
      });

      // ========================================================
      // SEND JSON REQUEST TO PIPER
      // ========================================================

      const payload = text.trim();

      console.log(`Sending request ${requestId} to Piper...`);

      piper.process.stdin.write(`${payload}\n`);

      console.log(`Request ${requestId} sent.`);

      // ========================================================
      // WAIT FOR GENERATED FILE
      // ========================================================

      const checkForOutput = () => {
        const request = pendingRequests.get(requestId);

        if (!request) {
          return;
        }

        let files = [];

        try {
          files = fs
            .readdirSync(generatedDirectory)
            .filter((file) => file.endsWith(".wav"));
        } catch (error) {
          request.reject(error);
          pendingRequests.delete(requestId);
          return;
        }

        // ------------------------------------------------------
        // FIND NEW FILE
        // ------------------------------------------------------

        const newFiles = files.filter((file) => !request.beforeFiles.has(file));

        if (newFiles.length === 0) {
          setTimeout(checkForOutput, 25);
          return;
        }

        // ------------------------------------------------------
        // GET MOST RECENT FILE
        // ------------------------------------------------------

        const generatedFile = newFiles
          .map((file) => ({
            file,
            fullPath: path.join(generatedDirectory, file),
          }))
          .sort((a, b) => {
            return (
              fs.statSync(b.fullPath).mtimeMs - fs.statSync(a.fullPath).mtimeMs
            );
          })[0];

        // ------------------------------------------------------
        // CHECK FILE
        // ------------------------------------------------------

        if (!fs.existsSync(generatedFile.fullPath)) {
          setTimeout(checkForOutput, 25);
          return;
        }

        const stats = fs.statSync(generatedFile.fullPath);

        if (stats.size === 0) {
          setTimeout(checkForOutput, 25);
          return;
        }

        // ------------------------------------------------------
        // MOVE TO REQUESTED OUTPUT PATH
        // ------------------------------------------------------

        try {
          fs.renameSync(generatedFile.fullPath, outputPath);
        } catch (error) {
          request.reject(error);
          pendingRequests.delete(requestId);
          return;
        }

        // ------------------------------------------------------
        // DONE
        // ------------------------------------------------------

        const generationTime = Date.now() - request.startedAt;

        console.log(`Speech generated in ${generationTime}ms`);

        console.log("Output:", outputPath);

        console.log("File size:", stats.size, "bytes");

        pendingRequests.delete(requestId);

        request.resolve({
          model: modelName,
          outputPath,
          generationTime,
        });
      };

      checkForOutput();

      // ========================================================
      // SAFETY TIMEOUT
      // ========================================================

      setTimeout(() => {
        const request = pendingRequests.get(requestId);

        if (!request) {
          return;
        }

        pendingRequests.delete(requestId);

        reject(new Error("Piper speech generation timed out."));
      }, 120000);
    } catch (error) {
      console.error("Piper generation error:", error);

      reject(error);
    }
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
