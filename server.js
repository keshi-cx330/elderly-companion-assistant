const http = require("http");
const fs = require("fs/promises");
const path = require("path");
const { URL } = require("url");

const PORT = Number(process.env.PORT) || 3000;
const ROOT_DIR = __dirname;
const WEB_DIR = path.join(ROOT_DIR, "web");
const DATA_DIR = path.join(ROOT_DIR, "data");
const DATA_FILE = path.join(DATA_DIR, "store.json");
const MAX_BODY_SIZE = 1024 * 1024;

const emergencyKeywords = [
  "胸痛",
  "呼吸困难",
  "喘不过气",
  "晕倒",
  "昏迷",
  "摔倒",
  "出血",
  "剧痛",
  "头晕",
  "心慌",
  "救命",
  "快不行了",
  "紧急",
  "急救",
  "120",
];

const staticTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const defaultStore = {
  profile: {
    name: "王阿姨",
    age: "68",
    preferences: "喜欢聊天、散步、听戏曲",
    notes: "",
    emergencyContactName: "李先生",
    emergencyContactPhone: "13800000000",
  },
  reminders: [],
  conversations: [],
  events: [],
};

let writeQueue = Promise.resolve();

function createId(prefix = "id") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function safeText(value, maxLen = 200) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLen);
}

function trimArray(arr, limit = 300) {
  if (arr.length > limit) arr.length = limit;
}

async function ensureStore() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, JSON.stringify(defaultStore, null, 2), "utf8");
  }
}

async function readStore() {
  await ensureStore();
  const raw = await fs.readFile(DATA_FILE, "utf8");
  try {
    const parsed = JSON.parse(raw);
    return {
      profile: parsed.profile || { ...defaultStore.profile },
      reminders: Array.isArray(parsed.reminders) ? parsed.reminders : [],
      conversations: Array.isArray(parsed.conversations) ? parsed.conversations : [],
      events: Array.isArray(parsed.events) ? parsed.events : [],
    };
  } catch {
    return JSON.parse(JSON.stringify(defaultStore));
  }
}

async function writeStore(store) {
  writeQueue = writeQueue
    .then(() => fs.writeFile(DATA_FILE, JSON.stringify(store, null, 2), "utf8"))
    .catch((err) => {
      console.error("Write store failed:", err);
    });
  return writeQueue;
}

async function mutateStore(mutator) {
  const store = await readStore();
  const result = await mutator(store);
  await writeStore(store);
  return result;
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function sendError(res, statusCode, message) {
  sendJson(res, statusCode, { error: message });
}

function isEmergency(message) {
  return emergencyKeywords.some((k) => message.includes(k));
}

function assistantReply(message, profile, emergency) {
  if (emergency) {
    return "我检测到您可能处于紧急状态。我不是医生，现在请先坐下或保持安全体位，立即联系120和您的紧急联系人。我会继续陪您一步一步操作。";
  }

  const low = message.toLowerCase();
  if (/(你好|在吗|有人吗)/.test(message)) {
    return `我在呢${profile?.name ? `，${profile.name}` : ""}。您想聊聊天、查提醒，还是我帮您做一件小事？`;
  }
  if (/(吃药|喝水|提醒|忘记)/.test(message)) {
    return "我可以帮您安排提醒。您可以直接说“每天早上8点提醒我吃药”，也可以在提醒页手动添加。";
  }
  if (/(孤单|无聊|难过|想聊天)/.test(message)) {
    return "我会一直在这儿陪您。我们可以聊今天的心情、回忆有趣的事，或者一起做个简单呼吸放松。";
  }
  if (/(天气|新闻|时间|日期)/.test(message)) {
    return "这类实时信息我可以帮您整理，但请以官方信息为准。您也可以让我先帮您记下待办。";
  }
  if (/(谢谢|多谢)/.test(message)) {
    return "不用客气，能帮到您就好。";
  }
  return "我听到了。您可以继续说得更具体一点，我会用最简单的步骤陪您完成。";
}

async function parseBody(req) {
  const chunks = [];
  let received = 0;

  for await (const chunk of req) {
    received += chunk.length;
    if (received > MAX_BODY_SIZE) {
      throw new Error("请求体过大");
    }
    chunks.push(chunk);
  }

  if (chunks.length === 0) return {};
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("JSON 格式错误");
  }
}

function contentTypeByFile(filePath) {
  return staticTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

async function serveStatic(reqPath, res) {
  const cleanPath = reqPath === "/" ? "/index.html" : reqPath;
  const fullPath = path.normalize(path.join(WEB_DIR, decodeURIComponent(cleanPath)));

  if (!fullPath.startsWith(WEB_DIR)) {
    sendError(res, 403, "禁止访问");
    return true;
  }

  try {
    const file = await fs.readFile(fullPath);
    res.writeHead(200, {
      "Content-Type": contentTypeByFile(fullPath),
      "Content-Length": file.length,
      "Cache-Control": "no-cache",
    });
    res.end(file);
    return true;
  } catch {
    return false;
  }
}

function timelineFromStore(store) {
  const conversations = store.conversations.map((c) => ({
    id: c.id,
    type: "conversation",
    level: c.role === "assistant" ? "info" : "normal",
    message: `${c.role === "assistant" ? "助手" : "用户"}：${c.content}`,
    createdAt: c.createdAt,
  }));
  const events = store.events.map((e) => ({
    id: e.id,
    type: e.type,
    level: e.level || "normal",
    message: e.message,
    createdAt: e.createdAt,
    meta: e.meta || {},
  }));

  return [...events, ...conversations].sort((a, b) => {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

function addEvent(store, type, message, meta = {}, level = "normal") {
  store.events.unshift({
    id: createId("evt"),
    type,
    message,
    meta,
    level,
    createdAt: new Date().toISOString(),
  });
  trimArray(store.events, 400);
}

async function handleApi(req, res, urlObj) {
  const { pathname, searchParams } = urlObj;
  const method = req.method || "GET";

  if (method === "GET" && pathname === "/api/health") {
    sendJson(res, 200, { ok: true, now: new Date().toISOString() });
    return true;
  }

  if (method === "GET" && pathname === "/api/profile") {
    const store = await readStore();
    sendJson(res, 200, { profile: store.profile });
    return true;
  }

  if (method === "PUT" && pathname === "/api/profile") {
    const body = await parseBody(req);
    const profile = {
      name: safeText(body.name, 30),
      age: safeText(body.age, 10),
      preferences: safeText(body.preferences, 200),
      notes: safeText(body.notes, 300),
      emergencyContactName: safeText(body.emergencyContactName, 30),
      emergencyContactPhone: safeText(body.emergencyContactPhone, 20),
    };

    await mutateStore(async (store) => {
      store.profile = profile;
      addEvent(store, "profile_updated", "用户更新了个人资料", { profile });
    });

    sendJson(res, 200, { profile });
    return true;
  }

  if (method === "GET" && pathname === "/api/reminders") {
    const store = await readStore();
    sendJson(res, 200, { reminders: store.reminders });
    return true;
  }

  if (method === "POST" && pathname === "/api/reminders") {
    const body = await parseBody(req);
    const title = safeText(body.title, 40);
    const time = safeText(body.time, 5);
    const repeat = body.repeat === "once" ? "once" : "daily";
    const validTime = /^([01]\d|2[0-3]):([0-5]\d)$/.test(time);
    if (!title || !validTime) {
      sendError(res, 400, "提醒标题或时间格式不正确");
      return true;
    }

    const reminder = {
      id: createId("rem"),
      title,
      time,
      repeat,
      enabled: true,
      lastTriggeredDate: "",
      createdAt: new Date().toISOString(),
    };

    await mutateStore(async (store) => {
      store.reminders.unshift(reminder);
      trimArray(store.reminders, 100);
      addEvent(store, "reminder_created", `新增提醒：${title}（${time}）`, { reminderId: reminder.id });
    });

    sendJson(res, 201, { reminder });
    return true;
  }

  if (method === "POST" && pathname === "/api/reminders/trigger") {
    const body = await parseBody(req);
    const reminderId = safeText(body.reminderId, 80);
    if (!reminderId) {
      sendError(res, 400, "缺少 reminderId");
      return true;
    }

    let changedReminder = null;
    await mutateStore(async (store) => {
      const reminder = store.reminders.find((r) => r.id === reminderId);
      if (!reminder) return;
      const today = new Date().toISOString().slice(0, 10);
      reminder.lastTriggeredDate = today;
      if (reminder.repeat === "once") reminder.enabled = false;
      changedReminder = reminder;
      addEvent(store, "reminder_triggered", `提醒触发：${reminder.title}`, { reminderId: reminder.id });
    });

    if (!changedReminder) {
      sendError(res, 404, "提醒不存在");
      return true;
    }
    sendJson(res, 200, { reminder: changedReminder });
    return true;
  }

  const reminderPatchMatch = pathname.match(/^\/api\/reminders\/([^/]+)$/);
  if (reminderPatchMatch && method === "PATCH") {
    const reminderId = decodeURIComponent(reminderPatchMatch[1]);
    const body = await parseBody(req);
    const enabled = Boolean(body.enabled);
    let found = null;

    await mutateStore(async (store) => {
      const reminder = store.reminders.find((r) => r.id === reminderId);
      if (!reminder) return;
      reminder.enabled = enabled;
      found = reminder;
      addEvent(
        store,
        "reminder_updated",
        `${enabled ? "启用" : "停用"}提醒：${reminder.title}`,
        { reminderId: reminder.id, enabled }
      );
    });

    if (!found) {
      sendError(res, 404, "提醒不存在");
      return true;
    }
    sendJson(res, 200, { reminder: found });
    return true;
  }

  const reminderDeleteMatch = pathname.match(/^\/api\/reminders\/([^/]+)$/);
  if (reminderDeleteMatch && method === "DELETE") {
    const reminderId = decodeURIComponent(reminderDeleteMatch[1]);
    let deleted = false;
    await mutateStore(async (store) => {
      const index = store.reminders.findIndex((r) => r.id === reminderId);
      if (index < 0) return;
      const [removed] = store.reminders.splice(index, 1);
      deleted = true;
      addEvent(store, "reminder_deleted", `删除提醒：${removed.title}`, { reminderId });
    });
    if (!deleted) {
      sendError(res, 404, "提醒不存在");
      return true;
    }
    sendJson(res, 200, { ok: true });
    return true;
  }

  if (method === "POST" && pathname === "/api/chat") {
    const body = await parseBody(req);
    const message = safeText(body.message, 500);
    const source = body.source === "voice" ? "voice" : "text";
    if (!message) {
      sendError(res, 400, "消息不能为空");
      return true;
    }

    let payload = null;
    await mutateStore(async (store) => {
      const emergency = isEmergency(message);
      const reply = assistantReply(message, store.profile, emergency);

      const userMsg = {
        id: createId("chat"),
        role: "user",
        content: message,
        source,
        createdAt: new Date().toISOString(),
      };
      const assistantMsg = {
        id: createId("chat"),
        role: "assistant",
        content: reply,
        source: "system",
        createdAt: new Date().toISOString(),
      };
      store.conversations.unshift(assistantMsg);
      store.conversations.unshift(userMsg);
      trimArray(store.conversations, 400);

      if (emergency) {
        addEvent(
          store,
          "emergency_detected",
          `系统识别到高风险表达：${message.slice(0, 30)}`,
          { source, message },
          "high"
        );
      }
      payload = {
        reply,
        emergency,
        suggestions: emergency
          ? ["立即拨打 120", "联系紧急联系人", "保持通话并说明地址"]
          : ["继续聊天", "新增提醒", "更新紧急联系人"],
      };
    });

    sendJson(res, 200, payload);
    return true;
  }

  if (method === "POST" && pathname === "/api/emergency/report") {
    const body = await parseBody(req);
    const symptom = safeText(body.symptom, 120);
    const action = safeText(body.action, 80) || "用户手动上报";

    await mutateStore(async (store) => {
      addEvent(store, "emergency_reported", `紧急上报：${action}`, { symptom }, "high");
    });

    sendJson(res, 201, { ok: true });
    return true;
  }

  if (method === "GET" && pathname === "/api/logs") {
    const store = await readStore();
    const type = safeText(searchParams.get("type") || "all", 30) || "all";
    const limitRaw = Number(searchParams.get("limit") || 50);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;

    const timeline = timelineFromStore(store).filter((item) => {
      if (type === "all") return true;
      if (type === "conversation") return item.type === "conversation";
      if (type === "emergency") return item.type.startsWith("emergency");
      if (type === "reminder") return item.type.startsWith("reminder");
      return true;
    });

    sendJson(res, 200, { logs: timeline.slice(0, limit) });
    return true;
  }

  if (method === "GET" && pathname === "/api/dashboard") {
    const store = await readStore();
    const now = Date.now();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const recentEvents = store.events.filter((e) => now - new Date(e.createdAt).getTime() <= sevenDaysMs);
    const emergencyCount = recentEvents.filter((e) => e.type.startsWith("emergency")).length;
    const reminderCount = recentEvents.filter((e) => e.type.startsWith("reminder")).length;
    const chatCount = store.conversations.filter((c) => c.role === "user").length;
    const lastEmergency = store.events.find((e) => e.type.startsWith("emergency")) || null;

    sendJson(res, 200, {
      summary: {
        chatCount,
        emergencyCount7d: emergencyCount,
        reminderEventCount7d: reminderCount,
        reminderEnabled: store.reminders.filter((r) => r.enabled).length,
        lastEmergencyAt: lastEmergency?.createdAt || "",
      },
    });
    return true;
  }

  return false;
}

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    sendError(res, 400, "无效请求");
    return;
  }

  try {
    const urlObj = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (urlObj.pathname.startsWith("/api/")) {
      const handled = await handleApi(req, res, urlObj);
      if (!handled) sendError(res, 404, "接口不存在");
      return;
    }

    const served = await serveStatic(urlObj.pathname, res);
    if (!served) sendError(res, 404, "页面不存在");
  } catch (err) {
    const message = err instanceof Error ? err.message : "服务异常";
    console.error("Request failed:", err);
    sendError(res, 500, message);
  }
});

ensureStore()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Elder Companion Assistant running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to start server:", err);
    process.exit(1);
  });
