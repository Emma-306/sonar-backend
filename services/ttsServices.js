import path from "path";
import fs from "fs";

// ============================================================
// VOICE MAP
// ============================================================

const voiceMap = {
  american: {
    male:
      process.env.ELEVENLABS_AMERICAN_MALE_VOICE_ID || "pNInz6obpgDQGcFmaJgB",
    female:
      process.env.ELEVENLABS_AMERICAN_FEMALE_VOICE_ID || "21m00Tcm4TlvDq8ikWAM",
  },

  nigerian: {
    male:
      process.env.ELEVENLABS_NIGERIAN_MALE_VOICE_ID || "pNInz6obpgDQGcFmaJgB",
    female:
      process.env.ELEVENLABS_NIGERIAN_FEMALE_VOICE_ID || "21m00Tcm4TlvDq8ikWAM",
  },
  british: {
    male:
      process.env.ELEVENLABS_BRITISH_MALE_VOICE_ID || "pNInz6obpgDQGcFmaJgB",
    female:
      process.env.ELEVENLABS_BRITISH_FEMALE_VOICE_ID || "21m00Tcm4TlvDq8ikWAM",
  },
};

const generationQueues = new Map();

// ============================================================
// GET ELEVENLABS VOICE ID
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

const generateSpeechRequest = ({ text, accent, gender, outputPath }) => {
  return new Promise((resolve, reject) => {
    const modelName = getVoiceModel(accent, gender);
    const normalizedText = text.trim().replace(/\s+/g, " ");
    const outputDirectory = path.dirname(outputPath);

    if (!normalizedText) {
      reject(new Error("Text is required."));
      return;
    }

    if (!process.env.ELEVENLABS_API_KEY) {
      reject(new Error("ELEVENLABS_API_KEY is not configured."));
      return;
    }

    fs.mkdirSync(outputDirectory, { recursive: true });

    const startedAt = Date.now();
    fetch(`https://api.elevenlabs.io/v1/text-to-speech/${modelName}`, {
      method: "POST",
      headers: {
        "xi-api-key": process.env.ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: normalizedText,
        model_id: process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2",
        output_format: "mp3_44100_128",
      }),
    })
      .then(async (response) => {
        if (!response.ok) {
          const details = await response.text();
          throw new Error(`ElevenLabs error ${response.status}: ${details}`);
        }

        fs.writeFileSync(outputPath, Buffer.from(await response.arrayBuffer()));
      })
      .then(() => {
        resolve({
          model: modelName,
          outputPath,
          generationTime: Date.now() - startedAt,
        });
      })
      .catch(reject);
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
