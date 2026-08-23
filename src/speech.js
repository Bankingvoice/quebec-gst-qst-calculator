import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const SPEECH_MODEL = "gpt-4o-mini-tts";
export const SPEECH_MAX_CHARACTERS = 4_096;
export const SPEECH_MIME_TYPE = "audio/mpeg";
export const SPEECH_VOICES = ["marin", "cedar", "coral", "alloy"];

const here = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = join(here, "..");

const languageInstructions = {
  en: "Speak in clear, natural Canadian English for a French learner. Use patient pacing, careful pronunciation, and natural pauses.",
  fr: "Parlez en français canadien clair et naturel pour un apprenant. Adoptez un rythme patient, une prononciation soignée et des pauses naturelles.",
};

function decodeEnvValue(value) {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function readEnvFile(filename) {
  try {
    const contents = readFileSync(join(projectRoot, filename), "utf8");
    const values = {};
    for (const line of contents.split(/\r?\n/)) {
      const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
      if (match) values[match[1]] = decodeEnvValue(match[2]);
    }
    return values;
  } catch {
    return {};
  }
}

function getOpenAiApiKey() {
  return process.env.OPENAI_API_KEY || readEnvFile(".env.local").OPENAI_API_KEY || readEnvFile(".env").OPENAI_API_KEY;
}

function normalizeSpeechInput({ text, language = "en", voice = "marin", speed = 0.95 }) {
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("Enter some text to turn into speech.");
  }
  const normalizedText = text.trim();
  if (normalizedText.length > SPEECH_MAX_CHARACTERS) {
    throw new Error(`Text is limited to ${SPEECH_MAX_CHARACTERS.toLocaleString()} characters per audio file.`);
  }
  if (!Object.hasOwn(languageInstructions, language)) {
    throw new Error("Language must be English or French.");
  }
  if (!SPEECH_VOICES.includes(voice)) {
    throw new Error("Choose one of the available voices.");
  }
  const normalizedSpeed = Number(speed);
  if (!Number.isFinite(normalizedSpeed) || normalizedSpeed < 0.7 || normalizedSpeed > 1.3) {
    throw new Error("Speech speed must be between 0.7 and 1.3.");
  }
  return {
    text: normalizedText,
    language,
    voice,
    speed: Math.round(normalizedSpeed * 100) / 100,
  };
}

export async function synthesizeSpeech(input) {
  const normalized = normalizeSpeechInput(input);
  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured. Add it to the local .env.local file.");
  }

  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: SPEECH_MODEL,
      voice: normalized.voice,
      input: normalized.text,
      instructions: languageInstructions[normalized.language],
      response_format: "mp3",
      speed: normalized.speed,
    }),
  });

  if (!response.ok) {
    throw new Error(`The speech service returned an error (${response.status}).`);
  }

  const audioData = Buffer.from(await response.arrayBuffer()).toString("base64");
  return {
    ...normalized,
    model: SPEECH_MODEL,
    mimeType: SPEECH_MIME_TYPE,
    audioData,
  };
}
