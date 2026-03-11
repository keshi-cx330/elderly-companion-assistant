const fs = require("fs/promises");
const path = require("path");
const { DEFAULT_DATA_FILE } = require("./config");

const defaultStore = {
  version: 2,
  profile: {
    name: "王阿姨",
    age: "68",
    preferences: "喜欢聊天、散步、听戏曲",
    notes: "有高血压史，外出会携带常用药。",
    address: "上海市浦东新区示例路 18 号 2 单元",
    emergencyContactName: "李先生",
    emergencyContactPhone: "13800000000",
  },
  settings: {
    autoSpeak: true,
    largeText: true,
    reminderVoice: true,
  },
  reminders: [],
  conversations: [],
  events: [],
};

const writeQueues = new Map();

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeReminder(reminder) {
  return {
    id: String(reminder?.id || ""),
    title: String(reminder?.title || "").slice(0, 40),
    time: String(reminder?.time || "").slice(0, 5),
    repeat: reminder?.repeat === "once" ? "once" : "daily",
    scheduleDate: String(reminder?.scheduleDate || "").slice(0, 10),
    enabled: Boolean(reminder?.enabled),
    lastTriggeredAt: String(reminder?.lastTriggeredAt || ""),
    lastTriggeredDate: String(reminder?.lastTriggeredDate || "").slice(0, 10),
    createdAt: String(reminder?.createdAt || ""),
  };
}

function normalizeConversation(item) {
  return {
    id: String(item?.id || ""),
    role: item?.role === "assistant" ? "assistant" : "user",
    content: String(item?.content || "").slice(0, 500),
    source: String(item?.source || "text").slice(0, 20),
    createdAt: String(item?.createdAt || ""),
  };
}

function normalizeEvent(item) {
  return {
    id: String(item?.id || ""),
    type: String(item?.type || "system").slice(0, 60),
    level: item?.level === "high" ? "high" : item?.level === "info" ? "info" : "normal",
    message: String(item?.message || "").slice(0, 400),
    meta: item?.meta && typeof item.meta === "object" ? item.meta : {},
    createdAt: String(item?.createdAt || ""),
  };
}

function normalizeStore(input = {}) {
  return {
    version: Number(input?.version) || defaultStore.version,
    profile: {
      ...defaultStore.profile,
      ...(input?.profile && typeof input.profile === "object" ? input.profile : {}),
    },
    settings: {
      ...defaultStore.settings,
      ...(input?.settings && typeof input.settings === "object" ? input.settings : {}),
    },
    reminders: Array.isArray(input?.reminders) ? input.reminders.map(normalizeReminder) : [],
    conversations: Array.isArray(input?.conversations)
      ? input.conversations.map(normalizeConversation)
      : [],
    events: Array.isArray(input?.events) ? input.events.map(normalizeEvent) : [],
  };
}

async function ensureStore(dataFile = DEFAULT_DATA_FILE) {
  await fs.mkdir(path.dirname(dataFile), { recursive: true });
  try {
    await fs.access(dataFile);
  } catch {
    await fs.writeFile(dataFile, JSON.stringify(defaultStore, null, 2), "utf8");
  }
}

async function readStore(dataFile = DEFAULT_DATA_FILE) {
  await ensureStore(dataFile);
  const raw = await fs.readFile(dataFile, "utf8");

  try {
    return normalizeStore(JSON.parse(raw));
  } catch {
    const backupFile = `${dataFile}.broken-${Date.now()}`;
    await fs.writeFile(backupFile, raw, "utf8").catch(() => {});
    const fresh = clone(defaultStore);
    await writeStore(fresh, dataFile);
    return fresh;
  }
}

async function writeStore(store, dataFile = DEFAULT_DATA_FILE) {
  await fs.mkdir(path.dirname(dataFile), { recursive: true });
  const normalized = normalizeStore(store);
  const tempFile = `${dataFile}.tmp`;
  await fs.writeFile(tempFile, JSON.stringify(normalized, null, 2), "utf8");
  await fs.rename(tempFile, dataFile);
}

function mutateStore(mutator, dataFile = DEFAULT_DATA_FILE) {
  const queue = writeQueues.get(dataFile) || Promise.resolve();
  const task = queue.then(async () => {
    const store = await readStore(dataFile);
    const result = await mutator(store);
    await writeStore(store, dataFile);
    return result;
  });

  writeQueues.set(
    dataFile,
    task.catch(() => {})
  );

  return task;
}

module.exports = {
  defaultStore,
  ensureStore,
  normalizeStore,
  readStore,
  writeStore,
  mutateStore,
};
