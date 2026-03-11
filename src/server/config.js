const path = require("path");
const packageJson = require("../../package.json");

const ROOT_DIR = path.resolve(__dirname, "../..");
const WEB_DIR = path.join(ROOT_DIR, "web");
const DATA_DIR = path.join(ROOT_DIR, "data");
const CONFIG_DIR = path.join(ROOT_DIR, "config");

function readNumberEnv(name, fallback) {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

module.exports = {
  APP_NAME: "老人陪伴助手",
  APP_VERSION: packageJson.version,
  HOST: process.env.HOST || "0.0.0.0",
  PORT: readNumberEnv("PORT", 3000),
  MAX_BODY_SIZE: readNumberEnv("MAX_BODY_SIZE", 1024 * 1024),
  AGENT_PROMPT_FILE: process.env.AGENT_PROMPT_FILE
    ? path.resolve(process.env.AGENT_PROMPT_FILE)
    : path.join(CONFIG_DIR, "agent-prompt.json"),
  KNOWLEDGE_BASE_FILE: process.env.KNOWLEDGE_BASE_FILE
    ? path.resolve(process.env.KNOWLEDGE_BASE_FILE)
    : path.join(CONFIG_DIR, "elder-knowledge-base.json"),
  DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY || "",
  DEEPSEEK_BASE_URL: (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/+$/, ""),
  DEEPSEEK_MODEL: process.env.DEEPSEEK_MODEL || "deepseek-chat",
  DEEPSEEK_TIMEOUT_MS: readNumberEnv("DEEPSEEK_TIMEOUT_MS", 15000),
  DEEPSEEK_MAX_HISTORY: readNumberEnv("DEEPSEEK_MAX_HISTORY", 10),
  DEEPSEEK_MAX_TOKENS: readNumberEnv("DEEPSEEK_MAX_TOKENS", 320),
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || process.env.SPEECH_API_KEY || "",
  OPENAI_BASE_URL: (process.env.OPENAI_BASE_URL || process.env.SPEECH_BASE_URL || "https://api.openai.com/v1").replace(
    /\/+$/,
    ""
  ),
  OPENAI_ASR_MODEL: process.env.OPENAI_ASR_MODEL || "gpt-4o-mini-transcribe",
  OPENAI_TRANSCRIBE_LANGUAGE: process.env.OPENAI_TRANSCRIBE_LANGUAGE || "zh",
  OPENAI_TTS_MODEL: process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts",
  OPENAI_TTS_VOICE: process.env.OPENAI_TTS_VOICE || "alloy",
  OPENAI_TTS_RESPONSE_FORMAT: process.env.OPENAI_TTS_RESPONSE_FORMAT || "mp3",
  OPENAI_SPEECH_TIMEOUT_MS: readNumberEnv("OPENAI_SPEECH_TIMEOUT_MS", 20000),
  ROOT_DIR,
  CONFIG_DIR,
  WEB_DIR,
  DATA_DIR,
  DEFAULT_DATA_FILE: process.env.DATA_FILE
    ? path.resolve(process.env.DATA_FILE)
    : path.join(DATA_DIR, "store.json"),
};
