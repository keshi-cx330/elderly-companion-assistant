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
  ROOT_DIR,
  WEB_DIR,
  DATA_DIR,
  DEFAULT_DATA_FILE: process.env.DATA_FILE
    ? path.resolve(process.env.DATA_FILE)
    : path.join(DATA_DIR, "store.json"),
};
