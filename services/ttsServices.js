import path from "path";
import fs from "fs";

// ============================================================
// VOICE MAP
// ============================================================

const getVoiceMap = () => ({
  american: {
    male: process.env.ELEVENLABS_AMERICAN_MALE_VOICE_ID,
    female: process.env.ELEVENLABS_AMERICAN_FEMALE_VOICE_ID,
  },

  nigerian: {
    male: process.env.ELEVENLABS_NIGERIAN_MALE_VOICE_ID,
    female: process.env.ELEVENLABS_NIGERIAN_FEMALE_VOICE_ID,
  },

  british: {
    male: process.env.ELEVENLABS_BRITISH_MALE_VOICE_ID,
    female: process.env.ELEVENLABS_BRITISH_FEMALE_VOICE_ID,
  },
});

const generationQueues = new Map();

// ============================================================
// GET ELEVENLABS VOICE ID
// ============================================================

export const getVoiceModel = (accent, gender) => {
  const normalizedAccent = accent?.toLowerCase();
  const normalizedGender = gender?.toLowerCase();

  const accentVoices = getVoiceMap()[normalizedAccent];

  if (!accentVoices) {
    throw new Error(`Unsupported accent: ${accent}`);
  }

  const voiceId = accentVoices[normalizedGender];

  if (!voiceId) {
    throw new Error(
      `No ElevenLabs voice configured for ${normalizedAccent} ${normalizedGender}`,
    );
  }

  return voiceId;
};

// ============================================================
// GENERATE SPEECH REQUEST
// ============================================================

const generateSpeechRequest = ({ text, accent, gender, outputPath }) => {
  return new Promise((resolve, reject) => {
    try {
      const voiceId = getVoiceModel(accent, gender);

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

      if (!process.env.ELEVENLABS_MODEL_ID) {
        reject(new Error("ELEVENLABS_MODEL_ID is not configured."));
        return;
      }

      fs.mkdirSync(outputDirectory, {
        recursive: true,
      });

      const startedAt = Date.now();

      fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: "POST",

        headers: {
          "xi-api-key": process.env.ELEVENLABS_API_KEY,

          "Content-Type": "application/json",

          Accept: "audio/mpeg",
        },

        body: JSON.stringify({
          text: normalizedText,

          model_id: process.env.ELEVENLABS_MODEL_ID,
        }),
      })
        .then(async (response) => {
          if (!response.ok) {
            const details = await response.text();

            throw new Error(`ElevenLabs error ${response.status}: ${details}`);
          }

          const arrayBuffer = await response.arrayBuffer();

          fs.writeFileSync(outputPath, Buffer.from(arrayBuffer));
        })

        .then(() => {
          resolve({
            model: voiceId,
            outputPath,

            generationTime: Date.now() - startedAt,
          });
        })

        .catch(reject);
    } catch (error) {
      reject(error);
    }
  });
};

// ============================================================
// GENERATE SPEECH WITH QUEUE
// ============================================================

export const generateSpeech = (options) => {
  const voiceId = getVoiceModel(options.accent, options.gender);

  const previous = generationQueues.get(voiceId) || Promise.resolve();

  const current = previous
    .catch(() => {})
    .then(() => generateSpeechRequest(options));

  generationQueues.set(voiceId, current);

  current
    .finally(() => {
      if (generationQueues.get(voiceId) === current) {
        generationQueues.delete(voiceId);
      }
    })
    .catch(() => {});

  return current;
};
