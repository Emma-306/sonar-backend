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

  british: {
    male: "en_GB-alan-medium",
    female: "en_GB-cori-medium",
  },

  nigerian: {
    male: "en_GB-alan-medium",
    female: "en_GB-cori-medium",
  },
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
// GENERATE SPEECH
// ============================================================

export const generateSpeech = ({
  text,
  accent,
  gender,
  outputPath,
}) => {
  return new Promise((resolve, reject) => {
    try {
      // ========================================================
      // GET MODEL
      // ========================================================

      const modelName = getVoiceModel(accent, gender);

      console.log("=================================");
      console.log("Accent:", accent);
      console.log("Gender:", gender);
      console.log("Piper model:", modelName);
      console.log("=================================");

      // ========================================================
      // MODEL PATH
      // ========================================================

      const modelPath = path.join(
        process.cwd(),
        "tts",
        "models",
        `${modelName}.onnx`
      );

      console.log("Piper model path:", modelPath);

      // ========================================================
      // CHECK MODEL
      // ========================================================

      if (!fs.existsSync(modelPath)) {
        return reject(
          new Error(
            `Piper model not found: ${modelPath}`
          )
        );
      }

      console.log("Piper model exists.");

      // ========================================================
      // OUTPUT DIRECTORY
      // ========================================================

      const outputDirectory = path.dirname(outputPath);

      if (!fs.existsSync(outputDirectory)) {
        fs.mkdirSync(outputDirectory, {
          recursive: true,
        });
      }

      console.log(
        "Output directory:",
        outputDirectory
      );

      console.log(
        "Output file:",
        outputPath
      );

      // ========================================================
      // START PIPER
      // ========================================================

      console.log("Starting Piper...");

      const piper = spawn(
        "python",
        [
          "-m",
          "piper",
          "--model",
          modelPath,
          "--output_file",
          outputPath,
        ],
        {
          stdio: ["pipe", "pipe", "pipe"],
        }
      );

      // ========================================================
      // PIPER STDOUT
      // ========================================================

      piper.stdout.on("data", (data) => {
        console.log(
          "Piper:",
          data.toString()
        );
      });

      // ========================================================
      // PIPER STDERR
      // ========================================================

      piper.stderr.on("data", (data) => {
        console.error(
          "Piper stderr:",
          data.toString()
        );
      });

      // ========================================================
      // PROCESS ERROR
      // ========================================================

      piper.on("error", (error) => {
        console.error(
          "Failed to start Piper:",
          error
        );

        reject(error);
      });

      // ========================================================
      // PROCESS FINISHED
      // ========================================================

      piper.on("close", (code) => {
        console.log(
          "Piper process exited with code:",
          code
        );

        // ------------------------------------------------------
        // PIPER FAILED
        // ------------------------------------------------------

        if (code !== 0) {
          return reject(
            new Error(
              `Piper exited with code ${code}`
            )
          );
        }

        // ------------------------------------------------------
        // CHECK OUTPUT FILE
        // ------------------------------------------------------

        if (!fs.existsSync(outputPath)) {
          return reject(
            new Error(
              "Piper finished but no audio file was created."
            )
          );
        }

        const stats = fs.statSync(outputPath);

        console.log(
          "Generated audio file size:",
          stats.size,
          "bytes"
        );

        if (stats.size === 0) {
          return reject(
            new Error(
              "Generated audio file is empty."
            )
          );
        }

        console.log(
          "Speech generation completed successfully."
        );

        resolve({
          model: modelName,
          outputPath,
        });
      });

      // ========================================================
      // SEND TEXT TO PIPER
      // ========================================================

      console.log("Sending text to Piper...");

      piper.stdin.write(text);

      // IMPORTANT:
      // Closing stdin tells Piper that there is no more text.
      // Piper can then finish generating the WAV file.
      piper.stdin.end();

      console.log("Text sent to Piper.");
    } catch (error) {
      console.error(
        "Piper generation error:",
        error
      );

      reject(error);
    }
  });
};