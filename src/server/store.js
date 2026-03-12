const fs = require("fs/promises");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");
const {
  DEFAULT_DATA_FILE,
  DEFAULT_JSON_FILE,
  SQLITE_BIN,
  SQLITE_FILE,
  STORAGE_DRIVER,
} = require("./config");

const defaultStore = {
  version: 4,
  profile: {
    name: "王阿姨",
    age: "68",
    preferences: "喜欢聊天、散步、听戏曲",
    notes: "有高血压史，外出会携带常用药。",
    address: "上海市浦东新区示例路 18 号 2 单元",
    location: "上海浦东新区",
    emergencyContactName: "李先生",
    emergencyContactPhone: "13800000000",
    caregiverName: "李先生",
    caregiverPhone: "13800000000",
    caregiverRelation: "儿子",
    caregiverWebhookUrl: "",
  },
  settings: {
    autoSpeak: true,
    largeText: true,
    reminderVoice: true,
    interfaceMode: "elder",
    reducedMotion: false,
    caregiverDigestEnabled: false,
    caregiverDigestHour: "08:30",
    lastDigestDate: "",
  },
  reminders: [],
  conversations: [],
  events: [],
  checkins: [],
  familyNotes: [],
  memoryNotes: [],
};

const writeQueues = new Map();
const execFileAsync = promisify(execFile);

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

function normalizeCheckin(item) {
  return {
    id: String(item?.id || ""),
    mood: String(item?.mood || "calm").slice(0, 20),
    energy: String(item?.energy || "medium").slice(0, 20),
    note: String(item?.note || "").slice(0, 140),
    source: String(item?.source || "manual").slice(0, 20),
    createdAt: String(item?.createdAt || ""),
  };
}

function normalizeFamilyNote(item) {
  return {
    id: String(item?.id || ""),
    author: String(item?.author || "").slice(0, 30),
    message: String(item?.message || "").slice(0, 180),
    pinned: Boolean(item?.pinned),
    createdAt: String(item?.createdAt || ""),
  };
}

function normalizeMemoryNote(item) {
  return {
    id: String(item?.id || ""),
    prompt: String(item?.prompt || "").slice(0, 120),
    content: String(item?.content || "").slice(0, 320),
    source: String(item?.source || "manual").slice(0, 20),
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
    checkins: Array.isArray(input?.checkins) ? input.checkins.map(normalizeCheckin) : [],
    familyNotes: Array.isArray(input?.familyNotes) ? input.familyNotes.map(normalizeFamilyNote) : [],
    memoryNotes: Array.isArray(input?.memoryNotes) ? input.memoryNotes.map(normalizeMemoryNote) : [],
  };
}

async function ensureStore(dataFile = DEFAULT_DATA_FILE) {
  if (STORAGE_DRIVER === "sqlite") {
    await ensureSqliteStore(dataFile);
    return;
  }
  await fs.mkdir(path.dirname(dataFile), { recursive: true });
  try {
    await fs.access(dataFile);
  } catch {
    await fs.writeFile(dataFile, JSON.stringify(defaultStore, null, 2), "utf8");
  }
}

async function readStore(dataFile = DEFAULT_DATA_FILE) {
  if (STORAGE_DRIVER === "sqlite") {
    return readSqliteStore(dataFile);
  }
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
  if (STORAGE_DRIVER === "sqlite") {
    await writeSqliteStore(store, dataFile);
    return;
  }
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
  storeCapabilities,
};

function sqlQuote(value) {
  if (value == null) return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlBool(value) {
  return value ? 1 : 0;
}

function sqliteEnabled() {
  return STORAGE_DRIVER === "sqlite";
}

function storeCapabilities() {
  return {
    driver: sqliteEnabled() ? "sqlite" : "json",
    driverLabel: sqliteEnabled() ? "SQLite" : "JSON 文件存储",
    dataFile: sqliteEnabled() ? SQLITE_FILE : DEFAULT_JSON_FILE,
    sqliteBin: SQLITE_BIN,
  };
}

async function sqliteExec(dbFile, sql, { json = false } = {}) {
  const args = [];
  if (json) args.push("-json");
  args.push(dbFile, sql);
  const { stdout } = await execFileAsync(SQLITE_BIN, args, {
    maxBuffer: 8 * 1024 * 1024,
  });
  return stdout.trim();
}

async function sqliteJson(dbFile, sql) {
  const output = await sqliteExec(dbFile, sql, { json: true });
  if (!output) return [];
  try {
    return JSON.parse(output);
  } catch {
    return [];
  }
}

async function sqliteRun(dbFile, sql) {
  await sqliteExec(dbFile, sql);
}

async function ensureSqliteStore(dbFile = SQLITE_FILE) {
  await fs.mkdir(path.dirname(dbFile), { recursive: true });

  await sqliteRun(
    dbFile,
    [
      "PRAGMA journal_mode=WAL;",
      "PRAGMA synchronous=NORMAL;",
      "CREATE TABLE IF NOT EXISTS profile (",
      "  id INTEGER PRIMARY KEY CHECK (id = 1),",
      "  name TEXT NOT NULL DEFAULT '',",
      "  age TEXT NOT NULL DEFAULT '',",
      "  preferences TEXT NOT NULL DEFAULT '',",
      "  notes TEXT NOT NULL DEFAULT '',",
      "  address TEXT NOT NULL DEFAULT '',",
      "  location TEXT NOT NULL DEFAULT '',",
      "  emergency_contact_name TEXT NOT NULL DEFAULT '',",
      "  emergency_contact_phone TEXT NOT NULL DEFAULT '',",
      "  caregiver_name TEXT NOT NULL DEFAULT '',",
      "  caregiver_phone TEXT NOT NULL DEFAULT '',",
      "  caregiver_relation TEXT NOT NULL DEFAULT '',",
      "  caregiver_webhook_url TEXT NOT NULL DEFAULT ''",
      ");",
      "CREATE TABLE IF NOT EXISTS settings (",
      "  id INTEGER PRIMARY KEY CHECK (id = 1),",
      "  auto_speak INTEGER NOT NULL DEFAULT 1,",
      "  large_text INTEGER NOT NULL DEFAULT 1,",
      "  reminder_voice INTEGER NOT NULL DEFAULT 1,",
      "  interface_mode TEXT NOT NULL DEFAULT 'elder',",
      "  reduced_motion INTEGER NOT NULL DEFAULT 0,",
      "  caregiver_digest_enabled INTEGER NOT NULL DEFAULT 0,",
      "  caregiver_digest_hour TEXT NOT NULL DEFAULT '08:30',",
      "  last_digest_date TEXT NOT NULL DEFAULT ''",
      ");",
      "CREATE TABLE IF NOT EXISTS reminders (",
      "  id TEXT PRIMARY KEY,",
      "  title TEXT NOT NULL,",
      "  time TEXT NOT NULL,",
      "  repeat TEXT NOT NULL,",
      "  schedule_date TEXT NOT NULL DEFAULT '',",
      "  enabled INTEGER NOT NULL DEFAULT 1,",
      "  last_triggered_at TEXT NOT NULL DEFAULT '',",
      "  last_triggered_date TEXT NOT NULL DEFAULT '',",
      "  created_at TEXT NOT NULL DEFAULT ''",
      ");",
      "CREATE TABLE IF NOT EXISTS conversations (",
      "  id TEXT PRIMARY KEY,",
      "  role TEXT NOT NULL,",
      "  content TEXT NOT NULL,",
      "  source TEXT NOT NULL DEFAULT 'text',",
      "  created_at TEXT NOT NULL DEFAULT ''",
      ");",
      "CREATE TABLE IF NOT EXISTS events (",
      "  id TEXT PRIMARY KEY,",
      "  type TEXT NOT NULL,",
      "  level TEXT NOT NULL DEFAULT 'normal',",
      "  message TEXT NOT NULL,",
      "  meta TEXT NOT NULL DEFAULT '{}',",
      "  created_at TEXT NOT NULL DEFAULT ''",
      ");",
      "CREATE TABLE IF NOT EXISTS checkins (",
      "  id TEXT PRIMARY KEY,",
      "  mood TEXT NOT NULL DEFAULT 'calm',",
      "  energy TEXT NOT NULL DEFAULT 'medium',",
      "  note TEXT NOT NULL DEFAULT '',",
      "  source TEXT NOT NULL DEFAULT 'manual',",
      "  created_at TEXT NOT NULL DEFAULT ''",
      ");",
      "CREATE TABLE IF NOT EXISTS family_notes (",
      "  id TEXT PRIMARY KEY,",
      "  author TEXT NOT NULL DEFAULT '',",
      "  message TEXT NOT NULL DEFAULT '',",
      "  pinned INTEGER NOT NULL DEFAULT 0,",
      "  created_at TEXT NOT NULL DEFAULT ''",
      ");",
      "CREATE TABLE IF NOT EXISTS memory_notes (",
      "  id TEXT PRIMARY KEY,",
      "  prompt TEXT NOT NULL DEFAULT '',",
      "  content TEXT NOT NULL DEFAULT '',",
      "  source TEXT NOT NULL DEFAULT 'manual',",
      "  created_at TEXT NOT NULL DEFAULT ''",
      ");",
      "CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at DESC);",
      "CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON conversations(created_at DESC);",
      "CREATE INDEX IF NOT EXISTS idx_reminders_enabled ON reminders(enabled, time);",
      "CREATE INDEX IF NOT EXISTS idx_checkins_created_at ON checkins(created_at DESC);",
      "CREATE INDEX IF NOT EXISTS idx_family_notes_created_at ON family_notes(created_at DESC);",
      "CREATE INDEX IF NOT EXISTS idx_memory_notes_created_at ON memory_notes(created_at DESC);",
    ].join("\n")
  );

  const rows = await sqliteJson(dbFile, "SELECT COUNT(*) AS count FROM profile;");
  if (Number(rows[0]?.count || 0) > 0) {
    return;
  }

  let seed = clone(defaultStore);
  if (dbFile !== DEFAULT_JSON_FILE) {
    try {
      const raw = await fs.readFile(DEFAULT_JSON_FILE, "utf8");
      seed = normalizeStore(JSON.parse(raw));
    } catch {
      seed = clone(defaultStore);
    }
  }
  await persistSqliteStore(seed, dbFile);
}

async function readSqliteStore(dbFile = SQLITE_FILE) {
  await ensureSqliteStore(dbFile);

  const [profileRows, settingsRows, reminderRows, conversationRows, eventRows, checkinRows, familyNoteRows, memoryRows] = await Promise.all([
    sqliteJson(
      dbFile,
      [
        "SELECT",
        "  name,",
        "  age,",
        "  preferences,",
        "  notes,",
        "  address,",
        "  location,",
        "  emergency_contact_name AS emergencyContactName,",
        "  emergency_contact_phone AS emergencyContactPhone,",
        "  caregiver_name AS caregiverName,",
        "  caregiver_phone AS caregiverPhone,",
        "  caregiver_relation AS caregiverRelation,",
        "  caregiver_webhook_url AS caregiverWebhookUrl",
        "FROM profile",
        "LIMIT 1;",
      ].join("\n")
    ),
    sqliteJson(
      dbFile,
      [
        "SELECT",
        "  auto_speak AS autoSpeak,",
        "  large_text AS largeText,",
        "  reminder_voice AS reminderVoice,",
        "  interface_mode AS interfaceMode,",
        "  reduced_motion AS reducedMotion,",
        "  caregiver_digest_enabled AS caregiverDigestEnabled,",
        "  caregiver_digest_hour AS caregiverDigestHour,",
        "  last_digest_date AS lastDigestDate",
        "FROM settings",
        "LIMIT 1;",
      ].join("\n")
    ),
    sqliteJson(
      dbFile,
      [
        "SELECT",
        "  id,",
        "  title,",
        "  time,",
        "  repeat,",
        "  schedule_date AS scheduleDate,",
        "  enabled,",
        "  last_triggered_at AS lastTriggeredAt,",
        "  last_triggered_date AS lastTriggeredDate,",
        "  created_at AS createdAt",
        "FROM reminders",
        "ORDER BY created_at DESC;",
      ].join("\n")
    ),
    sqliteJson(
      dbFile,
      [
        "SELECT",
        "  id,",
        "  role,",
        "  content,",
        "  source,",
        "  created_at AS createdAt",
        "FROM conversations",
        "ORDER BY created_at ASC;",
      ].join("\n")
    ),
    sqliteJson(
      dbFile,
      [
        "SELECT",
        "  id,",
        "  type,",
        "  level,",
        "  message,",
        "  meta,",
        "  created_at AS createdAt",
        "FROM events",
        "ORDER BY created_at DESC;",
      ].join("\n")
    ),
    sqliteJson(
      dbFile,
      [
        "SELECT",
        "  id,",
        "  mood,",
        "  energy,",
        "  note,",
        "  source,",
        "  created_at AS createdAt",
        "FROM checkins",
        "ORDER BY created_at DESC;",
      ].join("\n")
    ),
    sqliteJson(
      dbFile,
      [
        "SELECT",
        "  id,",
        "  author,",
        "  message,",
        "  pinned,",
        "  created_at AS createdAt",
        "FROM family_notes",
        "ORDER BY pinned DESC, created_at DESC;",
      ].join("\n")
    ),
    sqliteJson(
      dbFile,
      [
        "SELECT",
        "  id,",
        "  prompt,",
        "  content,",
        "  source,",
        "  created_at AS createdAt",
        "FROM memory_notes",
        "ORDER BY created_at DESC;",
      ].join("\n")
    ),
  ]);

  return normalizeStore({
    version: 4,
    profile: profileRows[0] || {},
    settings: {
      ...(settingsRows[0] || {}),
      autoSpeak: Boolean(Number(settingsRows[0]?.autoSpeak)),
      largeText: Boolean(Number(settingsRows[0]?.largeText)),
      reminderVoice: Boolean(Number(settingsRows[0]?.reminderVoice)),
      reducedMotion: Boolean(Number(settingsRows[0]?.reducedMotion)),
      caregiverDigestEnabled: Boolean(Number(settingsRows[0]?.caregiverDigestEnabled)),
    },
    reminders: reminderRows.map((item) => ({
      ...item,
      enabled: Boolean(Number(item.enabled)),
    })),
    conversations: conversationRows,
    events: eventRows.map((item) => ({
      ...item,
      meta: (() => {
        try {
          return item.meta ? JSON.parse(item.meta) : {};
        } catch {
          return {};
        }
      })(),
    })),
    checkins: checkinRows,
    familyNotes: familyNoteRows.map((item) => ({
      ...item,
      pinned: Boolean(Number(item.pinned)),
    })),
    memoryNotes: memoryRows,
  });
}

async function writeSqliteStore(store, dbFile = SQLITE_FILE) {
  await ensureSqliteStore(dbFile);
  await persistSqliteStore(store, dbFile);
}

async function persistSqliteStore(store, dbFile = SQLITE_FILE) {
  const normalized = normalizeStore(store);

  const reminderStatements = normalized.reminders.map(
    (item) =>
      [
        "INSERT INTO reminders (id, title, time, repeat, schedule_date, enabled, last_triggered_at, last_triggered_date, created_at) VALUES (",
        [
          sqlQuote(item.id),
          sqlQuote(item.title),
          sqlQuote(item.time),
          sqlQuote(item.repeat),
          sqlQuote(item.scheduleDate),
          sqlBool(item.enabled),
          sqlQuote(item.lastTriggeredAt),
          sqlQuote(item.lastTriggeredDate),
          sqlQuote(item.createdAt),
        ].join(", "),
        ");",
      ].join("")
  );

  const conversationStatements = normalized.conversations.map(
    (item) =>
      [
        "INSERT INTO conversations (id, role, content, source, created_at) VALUES (",
        [
          sqlQuote(item.id),
          sqlQuote(item.role),
          sqlQuote(item.content),
          sqlQuote(item.source),
          sqlQuote(item.createdAt),
        ].join(", "),
        ");",
      ].join("")
  );

  const eventStatements = normalized.events.map(
    (item) =>
      [
        "INSERT INTO events (id, type, level, message, meta, created_at) VALUES (",
        [
          sqlQuote(item.id),
          sqlQuote(item.type),
          sqlQuote(item.level),
          sqlQuote(item.message),
          sqlQuote(JSON.stringify(item.meta || {})),
          sqlQuote(item.createdAt),
        ].join(", "),
        ");",
      ].join("")
  );

  const checkinStatements = normalized.checkins.map(
    (item) =>
      [
        "INSERT INTO checkins (id, mood, energy, note, source, created_at) VALUES (",
        [
          sqlQuote(item.id),
          sqlQuote(item.mood),
          sqlQuote(item.energy),
          sqlQuote(item.note),
          sqlQuote(item.source),
          sqlQuote(item.createdAt),
        ].join(", "),
        ");",
      ].join("")
  );

  const familyNoteStatements = normalized.familyNotes.map(
    (item) =>
      [
        "INSERT INTO family_notes (id, author, message, pinned, created_at) VALUES (",
        [
          sqlQuote(item.id),
          sqlQuote(item.author),
          sqlQuote(item.message),
          sqlBool(item.pinned),
          sqlQuote(item.createdAt),
        ].join(", "),
        ");",
      ].join("")
  );

  const memoryStatements = normalized.memoryNotes.map(
    (item) =>
      [
        "INSERT INTO memory_notes (id, prompt, content, source, created_at) VALUES (",
        [
          sqlQuote(item.id),
          sqlQuote(item.prompt),
          sqlQuote(item.content),
          sqlQuote(item.source),
          sqlQuote(item.createdAt),
        ].join(", "),
        ");",
      ].join("")
  );

  const sql = [
    "BEGIN IMMEDIATE;",
    "DELETE FROM profile;",
    [
      "INSERT INTO profile (id, name, age, preferences, notes, address, location, emergency_contact_name, emergency_contact_phone, caregiver_name, caregiver_phone, caregiver_relation, caregiver_webhook_url) VALUES (1,",
      [
        sqlQuote(normalized.profile.name),
        sqlQuote(normalized.profile.age),
        sqlQuote(normalized.profile.preferences),
        sqlQuote(normalized.profile.notes),
        sqlQuote(normalized.profile.address),
        sqlQuote(normalized.profile.location),
        sqlQuote(normalized.profile.emergencyContactName),
        sqlQuote(normalized.profile.emergencyContactPhone),
        sqlQuote(normalized.profile.caregiverName),
        sqlQuote(normalized.profile.caregiverPhone),
        sqlQuote(normalized.profile.caregiverRelation),
        sqlQuote(normalized.profile.caregiverWebhookUrl),
      ].join(", "),
      ");",
    ].join(""),
    "DELETE FROM settings;",
    [
      "INSERT INTO settings (id, auto_speak, large_text, reminder_voice, interface_mode, reduced_motion, caregiver_digest_enabled, caregiver_digest_hour, last_digest_date) VALUES (1,",
      [
        sqlBool(normalized.settings.autoSpeak),
        sqlBool(normalized.settings.largeText),
        sqlBool(normalized.settings.reminderVoice),
        sqlQuote(normalized.settings.interfaceMode || "elder"),
        sqlBool(normalized.settings.reducedMotion),
        sqlBool(normalized.settings.caregiverDigestEnabled),
        sqlQuote(normalized.settings.caregiverDigestHour || "08:30"),
        sqlQuote(normalized.settings.lastDigestDate || ""),
      ].join(", "),
      ");",
    ].join(""),
    "DELETE FROM reminders;",
    ...reminderStatements,
    "DELETE FROM conversations;",
    ...conversationStatements,
    "DELETE FROM events;",
    ...eventStatements,
    "DELETE FROM checkins;",
    ...checkinStatements,
    "DELETE FROM family_notes;",
    ...familyNoteStatements,
    "DELETE FROM memory_notes;",
    ...memoryStatements,
    "COMMIT;",
  ].join("\n");

  await sqliteRun(dbFile, sql);
}
