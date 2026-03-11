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

function readEnumEnv(name, fallback, allowedValues) {
  const raw = String(process.env[name] || "").trim().toLowerCase();
  return allowedValues.includes(raw) ? raw : fallback;
}

const STORAGE_DRIVER = readEnumEnv("STORAGE_DRIVER", "json", ["json", "sqlite"]);
const DEFAULT_JSON_FILE = path.join(DATA_DIR, "store.json");
const DEFAULT_SQLITE_FILE = path.join(DATA_DIR, "store.db");

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
  STORAGE_DRIVER,
  SQLITE_BIN: process.env.SQLITE_BIN || "sqlite3",
  SQLITE_FILE: process.env.SQLITE_FILE ? path.resolve(process.env.SQLITE_FILE) : DEFAULT_SQLITE_FILE,
  DEFAULT_JSON_FILE,
  DEFAULT_SQLITE_FILE,
  OPEN_METEO_BASE_URL: (process.env.OPEN_METEO_BASE_URL || "https://api.open-meteo.com").replace(/\/+$/, ""),
  OPEN_METEO_GEOCODE_URL: (process.env.OPEN_METEO_GEOCODE_URL || "https://geocoding-api.open-meteo.com").replace(
    /\/+$/,
    ""
  ),
  WEATHER_TIMEOUT_MS: readNumberEnv("WEATHER_TIMEOUT_MS", 7000),
  NEWS_RSS_URL:
    process.env.NEWS_RSS_URL ||
    "https://news.google.com/rss/search?q=%E7%A4%BE%E5%8C%BA%20OR%20%E5%85%BB%E8%80%81%20OR%20%E6%9A%96%E5%BF%83%20when%3A1d&hl=zh-CN&gl=CN&ceid=CN%3Azh-Hans",
  NEWS_TIMEOUT_MS: readNumberEnv("NEWS_TIMEOUT_MS", 7000),
  BRIEFING_CACHE_TTL_MS: readNumberEnv("BRIEFING_CACHE_TTL_MS", 20 * 60 * 1000),
  NOTIFY_TIMEOUT_MS: readNumberEnv("NOTIFY_TIMEOUT_MS", 8000),
  NOTIFY_WEBHOOK_URLS: String(process.env.NOTIFY_WEBHOOK_URLS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean),
  ROOT_DIR,
  CONFIG_DIR,
  WEB_DIR,
  DATA_DIR,
  DEFAULT_DATA_FILE: process.env.DATA_FILE
    ? path.resolve(process.env.DATA_FILE)
    : STORAGE_DRIVER === "sqlite"
      ? DEFAULT_SQLITE_FILE
      : DEFAULT_JSON_FILE,
};
