const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createAppServer } = require("../src/server/app");

async function startServer() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "elderly-companion-"));
  const dataFile = path.join(tempDir, "store.json");
  const server = createAppServer({
    dataFile,
    logger: {
      error() {},
      log() {},
    },
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;

  async function request(urlPath, options = {}) {
    const response = await fetch(`http://127.0.0.1:${port}${urlPath}`, {
      headers: {
        "Content-Type": "application/json",
      },
      ...options,
    });
    const data = await response.json().catch(() => ({}));
    return { response, data };
  }

  async function close() {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(tempDir, { recursive: true, force: true });
  }

  return { request, close };
}

test("health and bootstrap endpoints should be available", async () => {
  const ctx = await startServer();
  try {
    const health = await ctx.request("/api/health");
    assert.equal(health.response.status, 200);
    assert.equal(health.data.ok, true);

    const bootstrap = await ctx.request("/api/bootstrap");
    assert.equal(bootstrap.response.status, 200);
    assert.ok(bootstrap.data.profile);
    assert.ok(Array.isArray(bootstrap.data.reminders));
    assert.ok(Array.isArray(bootstrap.data.logs));
  } finally {
    await ctx.close();
  }
});

test("profile and settings should persist", async () => {
  const ctx = await startServer();
  try {
    const profilePayload = {
      name: "张阿姨",
      age: "72",
      preferences: "听戏、散步",
      notes: "糖尿病患者",
      address: "北京市海淀区学院路 1 号",
      emergencyContactName: "张先生",
      emergencyContactPhone: "13900000000",
    };
    const settingsPayload = {
      autoSpeak: false,
      largeText: true,
      reminderVoice: false,
    };

    const profileRes = await ctx.request("/api/profile", {
      method: "PUT",
      body: JSON.stringify(profilePayload),
    });
    assert.equal(profileRes.response.status, 200);

    const settingsRes = await ctx.request("/api/settings", {
      method: "PUT",
      body: JSON.stringify(settingsPayload),
    });
    assert.equal(settingsRes.response.status, 200);

    const bootstrap = await ctx.request("/api/bootstrap");
    assert.equal(bootstrap.data.profile.name, "张阿姨");
    assert.equal(bootstrap.data.profile.address, "北京市海淀区学院路 1 号");
    assert.equal(bootstrap.data.settings.autoSpeak, false);
    assert.equal(bootstrap.data.settings.reminderVoice, false);
  } finally {
    await ctx.close();
  }
});

test("chat endpoint should support natural language reminder creation", async () => {
  const ctx = await startServer();
  try {
    const chat = await ctx.request("/api/chat", {
      method: "POST",
      body: JSON.stringify({
        message: "每天早上 8 点提醒我吃药",
        source: "voice",
      }),
    });

    assert.equal(chat.response.status, 200);
    assert.equal(chat.data.intent, "reminder_create");
    assert.ok(chat.data.reminder);
    assert.equal(chat.data.reminder.repeat, "daily");
    assert.equal(chat.data.reminder.time, "08:00");

    const reminders = await ctx.request("/api/reminders");
    assert.equal(reminders.response.status, 200);
    assert.equal(reminders.data.reminders.length, 1);
    assert.equal(reminders.data.reminders[0].title, "吃药");
  } finally {
    await ctx.close();
  }
});

test("chat endpoint should detect emergency expressions and leave logs", async () => {
  const ctx = await startServer();
  try {
    const chat = await ctx.request("/api/chat", {
      method: "POST",
      body: JSON.stringify({
        message: "我现在胸痛，快不行了",
        source: "text",
      }),
    });

    assert.equal(chat.response.status, 200);
    assert.ok(chat.data.emergency);
    assert.equal(chat.data.intent, "emergency");

    const logs = await ctx.request("/api/logs?type=emergency&level=high&limit=20");
    assert.equal(logs.response.status, 200);
    assert.ok(logs.data.logs.length >= 1);
    assert.match(logs.data.logs[0].message, /高风险表达|紧急上报/);
  } finally {
    await ctx.close();
  }
});
