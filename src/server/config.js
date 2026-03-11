const path = require("path");
const packageJson = require("../../package.json");

const ROOT_DIR = path.resolve(__dirname, "../..");
const WEB_DIR = path.join(ROOT_DIR, "web");
const DATA_DIR = path.join(ROOT_DIR, "data");

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
  DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY || "",
  DEEPSEEK_BASE_URL: (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/+$/, ""),
  DEEPSEEK_MODEL: process.env.DEEPSEEK_MODEL || "deepseek-chat",
  DEEPSEEK_TIMEOUT_MS: readNumberEnv("DEEPSEEK_TIMEOUT_MS", 15000),
  DEEPSEEK_MAX_HISTORY: readNumberEnv("DEEPSEEK_MAX_HISTORY", 10),
  DEEPSEEK_MAX_TOKENS: readNumberEnv("DEEPSEEK_MAX_TOKENS", 320),
  ROOT_DIR,
  WEB_DIR,
  DATA_DIR,
  DEFAULT_DATA_FILE: process.env.DATA_FILE
    ? path.resolve(process.env.DATA_FILE)
    : path.join(DATA_DIR, "store.json"),
};
