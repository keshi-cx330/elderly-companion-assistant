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
    assert.equal(typeof health.data.ai.promptProfile, "string");

    const bootstrap = await ctx.request("/api/bootstrap");
    assert.equal(bootstrap.response.status, 200);
    assert.ok(bootstrap.data.profile);
    assert.equal(typeof bootstrap.data.experience.welcomeMessage, "string");
    assert.ok(Array.isArray(bootstrap.data.experience.quickActions));
    assert.ok(Array.isArray(bootstrap.data.reminders));
    assert.ok(Array.isArray(bootstrap.data.logs));
    assert.equal(typeof bootstrap.data.ai.promptProfile, "string");
  } finally {
    await ctx.close();
  }
});

test("prompt and speech capability endpoints should be available", async () => {
  const ctx = await startServer();
  try {
    const prompt = await ctx.request("/api/ai/prompt");
    assert.equal(prompt.response.status, 200);
    assert.equal(typeof prompt.data.prompt.meta.name, "string");
    assert.equal(typeof prompt.data.experience.welcomeMessage, "string");
    assert.ok(Array.isArray(prompt.data.prompt.scenes));

    const transcribe = await ctx.request("/api/speech/transcribe", {
      method: "POST",
      body: JSON.stringify({ audioBase64: "ZmFrZQ==" }),
    });
    assert.equal(transcribe.response.status, 503);
    assert.match(transcribe.data.error, /云端语音识别未配置/);

    const speak = await ctx.request("/api/speech/speak", {
      method: "POST",
      body: JSON.stringify({ text: "你好" }),
    });
    assert.equal(speak.response.status, 503);
    assert.match(speak.data.error, /云端语音播报未配置/);
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
      location: "北京海淀",
      emergencyContactName: "张先生",
      emergencyContactPhone: "13900000000",
      caregiverRelation: "儿子",
      caregiverName: "张先生",
      caregiverPhone: "13900000000",
      caregiverWebhookUrl: "",
    };
    const settingsPayload = {
      autoSpeak: false,
      largeText: true,
      reminderVoice: false,
      interfaceMode: "family",
      reducedMotion: true,
      caregiverDigestEnabled: true,
      caregiverDigestHour: "09:00",
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
    assert.equal(bootstrap.data.profile.location, "北京海淀");
    assert.equal(bootstrap.data.settings.autoSpeak, false);
    assert.equal(bootstrap.data.settings.reminderVoice, false);
    assert.equal(bootstrap.data.settings.interfaceMode, "family");
    assert.equal(bootstrap.data.settings.reducedMotion, true);
    assert.equal(bootstrap.data.settings.caregiverDigestEnabled, true);
    assert.equal(bootstrap.data.settings.caregiverDigestHour, "09:00");
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

test("chat endpoint should support creating multiple reminders in one sentence", async () => {
  const ctx = await startServer();
  try {
    const chat = await ctx.request("/api/chat", {
      method: "POST",
      body: JSON.stringify({
        message: "每天早上8点提醒我吃药和喝水",
        source: "voice",
      }),
    });

    assert.equal(chat.response.status, 200);
    assert.equal(chat.data.intent, "reminder_create");
    assert.ok(Array.isArray(chat.data.reminders));
    assert.equal(chat.data.reminders.length, 2);
    assert.match(chat.data.reply, /2 个提醒/);

    const reminders = await ctx.request("/api/reminders");
    assert.equal(reminders.response.status, 200);
    assert.equal(reminders.data.reminders.length, 2);
    assert.deepEqual(
      reminders.data.reminders.map((item) => item.title).sort(),
      ["吃药", "喝水"]
    );
  } finally {
    await ctx.close();
  }
});

test("chat endpoint should detect emergency expressions and leave logs", async () => {
  const ctx = await startServer();
  try {
    await ctx.request("/api/profile", {
      method: "PUT",
      body: JSON.stringify({
        emergencyContactName: "张先生",
        emergencyContactPhone: "13900000000",
        address: "北京市海淀区学院路 1 号",
      }),
    });

    const chat = await ctx.request("/api/chat", {
      method: "POST",
      body: JSON.stringify({
        message: "我现在头很晕，可能不行了",
        source: "text",
      }),
    });

    assert.equal(chat.response.status, 200);
    assert.ok(chat.data.emergency);
    assert.equal(chat.data.intent, "emergency");
    assert.match(chat.data.reply, /我在|先别慌/);
    assert.match(chat.data.reply, /先坐下|躺下/);
    assert.match(chat.data.reply, /已启动 120|联络流程|通知张先生/);
    assert.equal(chat.data.dispatch.mode, "demo_auto_dispatch");
    assert.equal(chat.data.emergency.dispatch.emergencyService.phone, "120");
    assert.equal(chat.data.notification.attempted, false);

    const logs = await ctx.request("/api/logs?type=emergency&level=high&limit=20");
    assert.equal(logs.response.status, 200);
    assert.ok(logs.data.logs.length >= 1);
    assert.ok(logs.data.logs.some((item) => /高风险表达|紧急上报|已启动紧急联络流程/.test(item.message)));
  } finally {
    await ctx.close();
  }
});

test("chat endpoint should provide symptom guidance and leave symptom logs", async () => {
  const ctx = await startServer();
  try {
    await ctx.request("/api/profile", {
      method: "PUT",
      body: JSON.stringify({
        emergencyContactName: "张先生",
        emergencyContactPhone: "13900000000",
      }),
    });

    const chat = await ctx.request("/api/chat", {
      method: "POST",
      body: JSON.stringify({
        message: "我有点头疼，头也很晕",
        source: "text",
      }),
    });

    assert.equal(chat.response.status, 200);
    assert.equal(chat.data.intent, "symptom_guidance");
    assert.ok(chat.data.symptom);
    assert.match(chat.data.reply, /先坐下|躺下/);
    assert.match(chat.data.reply, /跟进流程|告诉张先生|家里人/);
    assert.equal(chat.data.dispatch.mode, "demo_auto_dispatch");
    assert.equal(chat.data.dispatch.caregiver.name, "张先生");
    assert.equal(chat.data.notification.attempted, false);

    const logs = await ctx.request("/api/logs?type=symptom&limit=20");
    assert.equal(logs.response.status, 200);
    assert.ok(logs.data.logs.length >= 1);
    assert.ok(logs.data.logs.some((item) => /照护症状|照护跟进流程/.test(item.message)));
  } finally {
    await ctx.close();
  }
});

test("chat endpoint should treat medication overdose as emergency workflow", async () => {
  const ctx = await startServer();
  try {
    await ctx.request("/api/profile", {
      method: "PUT",
      body: JSON.stringify({
        emergencyContactName: "张先生",
        emergencyContactPhone: "13900000000",
        address: "北京市海淀区学院路 1 号",
      }),
    });

    const chat = await ctx.request("/api/chat", {
      method: "POST",
      body: JSON.stringify({
        message: "我刚刚吃了很多药",
        source: "text",
      }),
    });

    assert.equal(chat.response.status, 200);
    assert.equal(chat.data.intent, "emergency");
    assert.equal(chat.data.emergency.label, "疑似药物过量或误服");
    assert.match(chat.data.reply, /别再继续吃药|不要自己催吐/);
    assert.match(chat.data.reply, /120|张先生/);
  } finally {
    await ctx.close();
  }
});

test("briefing and caregiver endpoints should return fallback-friendly data", async () => {
  const ctx = await startServer();
  try {
    await ctx.request("/api/profile", {
      method: "PUT",
      body: JSON.stringify({
        location: "",
        caregiverName: "李女士",
        caregiverRelation: "女儿",
      }),
    });

    const briefing = await ctx.request("/api/briefing");
    assert.equal(briefing.response.status, 200);
    assert.equal(typeof briefing.data.briefing.summary, "string");
    assert.equal(typeof briefing.data.briefing.reminderSummary, "string");
    assert.equal(typeof briefing.data.caregiver.digestHour, "string");

    const caregiverStatus = await ctx.request("/api/caregiver/status");
    assert.equal(caregiverStatus.response.status, 200);
    assert.equal(caregiverStatus.data.caregiver.contact.name, "李女士");

    const notifyTest = await ctx.request("/api/caregiver/notify-test", {
      method: "POST",
      body: JSON.stringify({}),
    });
    assert.equal(notifyTest.response.status, 200);
    assert.equal(notifyTest.data.result.attempted, false);
  } finally {
    await ctx.close();
  }
});

test("engagement endpoints should persist checkins memories and family notes", async () => {
  const ctx = await startServer();
  try {
    const checkin = await ctx.request("/api/checkins", {
      method: "POST",
      body: JSON.stringify({
        mood: "lonely",
        energy: "low",
        note: "今天有点闷",
      }),
    });
    assert.equal(checkin.response.status, 201);
    assert.equal(checkin.data.checkin.moodLabel, "有点闷");

    const memory = await ctx.request("/api/memories", {
      method: "POST",
      body: JSON.stringify({
        prompt: "小时候最爱吃什么？",
        content: "我小时候最爱吃外婆做的红烧肉。",
      }),
    });
    assert.equal(memory.response.status, 201);
    assert.match(memory.data.memory.content, /红烧肉/);

    const note = await ctx.request("/api/family-notes", {
      method: "POST",
      body: JSON.stringify({
        author: "女儿",
        message: "妈，今天记得多喝温水。",
        pinned: true,
      }),
    });
    assert.equal(note.response.status, 201);
    assert.equal(note.data.familyNote.pinned, true);

    const bootstrap = await ctx.request("/api/bootstrap");
    assert.equal(bootstrap.response.status, 200);
    assert.equal(bootstrap.data.engagement.latestCheckin.moodLabel, "有点闷");
    assert.equal(bootstrap.data.engagement.latestFamilyNote.author, "女儿");
    assert.equal(bootstrap.data.engagement.recentMemories[0].content, "我小时候最爱吃外婆做的红烧肉。");
    assert.equal(bootstrap.data.engagement.wellbeingSummary.lowMoodCount7d, 1);
    assert.equal(bootstrap.data.dashboard.memoryCount, 1);

    const checkinList = await ctx.request("/api/checkins?limit=1");
    assert.equal(checkinList.response.status, 200);
    assert.equal(checkinList.data.checkins.length, 1);

    const noteList = await ctx.request("/api/family-notes?limit=1");
    assert.equal(noteList.response.status, 200);
    assert.equal(noteList.data.familyNotes[0].message, "妈，今天记得多喝温水。");
  } finally {
    await ctx.close();
  }
});

test("chat endpoint should detect scam expressions and expose guard guidance", async () => {
  const ctx = await startServer();
  try {
    const chat = await ctx.request("/api/chat", {
      method: "POST",
      body: JSON.stringify({
        message: "刚才有人让我把验证码发过去，还让我先转账。",
        source: "text",
      }),
    });

    assert.equal(chat.response.status, 200);
    assert.equal(chat.data.intent, "scam_guard");
    assert.equal(chat.data.provider, "local-anti-scam");
    assert.match(chat.data.reply, /诈骗/);
    assert.match(chat.data.guard.label, /诈骗/);
    assert.ok(Array.isArray(chat.data.guard.steps));
    assert.ok(chat.data.guard.steps.length >= 2);

    const logs = await ctx.request("/api/logs?type=safety&level=high&limit=20");
    assert.equal(logs.response.status, 200);
    assert.ok(logs.data.logs.length >= 1);
    assert.match(logs.data.logs[0].message, /疑似诈骗表达/);
  } finally {
    await ctx.close();
  }
});
