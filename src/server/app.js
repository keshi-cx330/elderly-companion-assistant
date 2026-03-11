const http = require("http");
const fs = require("fs/promises");
const path = require("path");
const { URL } = require("url");
const { aiCapabilities, createDeepSeekReply, isDeepSeekEnabled } = require("./ai");
const { buildLiveReply, getDailyBriefing } = require("./briefing");
const { APP_NAME, APP_VERSION, DEFAULT_DATA_FILE, MAX_BODY_SIZE, WEB_DIR } = require("./config");
const { findBestKnowledgeMatch, getAssistantExperience, knowledgeReply } = require("./knowledge");
const {
  buildCaregiverDigest,
  buildCaregiverStatus,
  notifyCaregiver,
  shouldSendDailyDigest,
} = require("./notifications");
const { getPromptProfileView } = require("./prompt");
const { isCloudAsrEnabled, isCloudTtsEnabled, synthesizeSpeech, transcribeAudio } = require("./speech");
const {
  addEvent,
  buildAssistantResponse,
  buildDashboard,
  createId,
  decorateReminder,
  detectEmergency,
  isValidDate,
  isValidTime,
  parseReminderIntent,
  recentConversations,
  safeBoolean,
  safePhone,
  safeText,
  timelineFromStore,
  trimArray,
} = require("./domain");
const { readStore, mutateStore, storeCapabilities } = require("./store");

const staticTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
};

const baseSecurityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
};

const contentSecurityPolicy = [
  "default-src 'self'",
  "connect-src 'self'",
  "img-src 'self' data:",
  "manifest-src 'self'",
  "media-src 'self' blob:",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
].join("; ");

function contentTypeByFile(filePath) {
  return staticTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

function sendJson(res, statusCode, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    ...baseSecurityHeaders,
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    "Content-Security-Policy": contentSecurityPolicy,
    ...extraHeaders,
  });
  res.end(body);
}

function sendBuffer(res, statusCode, buffer, contentType, extraHeaders = {}) {
  res.writeHead(statusCode, {
    ...baseSecurityHeaders,
    "Content-Type": contentType,
    "Content-Length": buffer.length,
    "Cache-Control": "no-store",
    "Content-Security-Policy": contentSecurityPolicy,
    ...extraHeaders,
  });
  res.end(buffer);
}

function sendError(res, statusCode, message, details) {
  sendJson(res, statusCode, {
    error: message,
    ...(details ? { details } : {}),
  });
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

function sortedReminders(reminders, now = new Date()) {
  return reminders
    .map((item) => decorateReminder(item, now))
    .sort((a, b) => {
      const aDue = a.nextDueAt ? new Date(a.nextDueAt).getTime() : Number.MAX_SAFE_INTEGER;
      const bDue = b.nextDueAt ? new Date(b.nextDueAt).getTime() : Number.MAX_SAFE_INTEGER;
      return aDue - bDue;
    });
}

function buildBootstrapPayload(store, now = new Date()) {
  const dashboard = buildDashboard(store, now);
  return {
    ai: aiCapabilities(),
    experience: getAssistantExperience(),
    caregiver: buildCaregiverStatus(store),
    profile: store.profile,
    settings: store.settings,
    reminders: sortedReminders(store.reminders, now),
    conversations: recentConversations(store, 18),
    logs: timelineFromStore(store).slice(0, 80),
    dashboard: dashboard.summary,
    upcomingReminders: dashboard.reminders,
  };
}

async function recordCaregiverNotificationResult(dataFile, payload, result, now = new Date()) {
  await mutateStore(
    async (store) => {
      if (payload.markDigestDate) {
        store.settings.lastDigestDate = payload.markDigestDate;
      }
      addEvent(
        store,
        "caregiver_notification",
        result.delivered
          ? `家属通知已发送：${payload.title}`
          : result.attempted
            ? `家属通知发送失败：${payload.title}`
            : `家属通知未配置：${payload.title}`,
        {
          type: payload.type,
          delivered: result.delivered,
          attempted: result.attempted,
          results: result.results || [],
        },
        result.delivered ? "info" : "normal"
      );
    },
    dataFile
  );
}

async function sendCaregiverNotification(dataFile, payload) {
  const store = await readStore(dataFile);
  const result = await notifyCaregiver({
    store,
    type: payload.type,
    title: payload.title,
    message: payload.message,
    meta: payload.meta,
  });
  await recordCaregiverNotificationResult(dataFile, payload, result);
  return result;
}

async function maybeSendCaregiverDigest(dataFile, store, now = new Date()) {
  const caregiver = buildCaregiverStatus(store);
  if (!caregiver.webhookCount || !shouldSendDailyDigest(store, now)) {
    return null;
  }

  const digest = buildCaregiverDigest(store, now);
  const result = await notifyCaregiver({
    store,
    type: "daily_digest",
    title: digest.title,
    message: digest.message,
    meta: digest.meta,
  });
  if (result.attempted) {
    await recordCaregiverNotificationResult(
      dataFile,
      {
        type: "daily_digest",
        title: digest.title,
        markDigestDate: now.toISOString().slice(0, 10),
      },
      result,
      now
    );
  }
  return {
    digest,
    result,
  };
}

async function serveStatic(reqPath, res, webDir) {
  const requestedPath = reqPath === "/" ? "/index.html" : reqPath;
  const normalized = path.normalize(path.join(webDir, decodeURIComponent(requestedPath)));
  const targetPath = normalized.startsWith(webDir) ? normalized : null;
  if (!targetPath) {
    sendError(res, 403, "禁止访问");
    return true;
  }

  try {
    const file = await fs.readFile(targetPath);
    const ext = path.extname(targetPath).toLowerCase();
    const isHtml = ext === ".html";
    res.writeHead(200, {
      ...baseSecurityHeaders,
      "Content-Type": contentTypeByFile(targetPath),
      "Content-Length": file.length,
      "Cache-Control": isHtml ? "no-cache" : "public, max-age=3600",
      "Content-Security-Policy": contentSecurityPolicy,
    });
    res.end(file);
    return true;
  } catch {
    if (!path.extname(reqPath)) {
      const fallbackPath = path.join(webDir, "index.html");
      try {
        const fallback = await fs.readFile(fallbackPath);
        res.writeHead(200, {
          ...baseSecurityHeaders,
          "Content-Type": "text/html; charset=utf-8",
          "Content-Length": fallback.length,
          "Cache-Control": "no-cache",
          "Content-Security-Policy": contentSecurityPolicy,
        });
        res.end(fallback);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
}

async function handleApi(req, res, urlObj, options) {
  const pathname = urlObj.pathname;
  const method = req.method || "GET";
  const dataFile = options.dataFile;

  if (method === "GET" && pathname === "/api/health") {
    sendJson(res, 200, {
      ok: true,
      app: APP_NAME,
      version: APP_VERSION,
      ai: aiCapabilities(),
      storage: storeCapabilities(),
      now: new Date().toISOString(),
      uptimeSec: Math.round(process.uptime()),
    });
    return true;
  }

  if (method === "GET" && pathname === "/api/bootstrap") {
    let store = await readStore(dataFile);
    const digestResult = await maybeSendCaregiverDigest(dataFile, store);
    if (digestResult?.result?.attempted) {
      store = await readStore(dataFile);
    }
    sendJson(res, 200, buildBootstrapPayload(store));
    return true;
  }

  if (method === "GET" && pathname === "/api/briefing") {
    const store = await readStore(dataFile);
    const reminders = sortedReminders(store.reminders);
    const briefing = await getDailyBriefing({
      profile: store.profile,
      reminders,
    });
    sendJson(res, 200, {
      briefing,
      caregiver: buildCaregiverStatus(store),
    });
    return true;
  }

  if (method === "GET" && pathname === "/api/ai/prompt") {
    sendJson(res, 200, {
      prompt: getPromptProfileView(),
      experience: getAssistantExperience(),
      ai: aiCapabilities(),
    });
    return true;
  }

  if (method === "POST" && pathname === "/api/speech/transcribe") {
    if (!isCloudAsrEnabled()) {
      sendError(res, 503, "云端语音识别未配置");
      return true;
    }
    const body = await parseBody(req);
    const result = await transcribeAudio({
      audioBase64: body.audioBase64,
      mimeType: body.mimeType,
      fileName: body.fileName,
    });
    sendJson(res, 200, result);
    return true;
  }

  if (method === "POST" && pathname === "/api/speech/speak") {
    if (!isCloudTtsEnabled()) {
      sendError(res, 503, "云端语音播报未配置");
      return true;
    }
    const body = await parseBody(req);
    const speech = await synthesizeSpeech(body.text);
    sendBuffer(res, 200, speech.buffer, speech.contentType, {
      "Content-Disposition": `inline; filename="${speech.fileName}"`,
      "X-Speech-Provider": speech.provider,
      "X-Speech-Model": speech.model,
    });
    return true;
  }

  if (method === "GET" && pathname === "/api/profile") {
    const store = await readStore(dataFile);
    sendJson(res, 200, { profile: store.profile, caregiver: buildCaregiverStatus(store) });
    return true;
  }

  if (method === "PUT" && pathname === "/api/profile") {
    const body = await parseBody(req);
    const profilePayload = {
      name: safeText(body.name, 30),
      age: safeText(body.age, 10),
      preferences: safeText(body.preferences, 200),
      notes: safeText(body.notes, 300),
      address: safeText(body.address, 120),
      location: safeText(body.location, 40),
      emergencyContactName: safeText(body.emergencyContactName, 30),
      emergencyContactPhone: safePhone(body.emergencyContactPhone),
      caregiverName: safeText(body.caregiverName, 30),
      caregiverPhone: safePhone(body.caregiverPhone),
      caregiverRelation: safeText(body.caregiverRelation, 20),
      caregiverWebhookUrl: safeText(body.caregiverWebhookUrl, 300),
    };
    let profile = null;

    await mutateStore(
      async (store) => {
        store.profile = {
          ...store.profile,
          ...profilePayload,
        };
        profile = store.profile;
        addEvent(store, "profile_updated", "用户更新了个人资料", { profile: store.profile });
      },
      dataFile
    );

    sendJson(res, 200, { profile });
    return true;
  }

  if (method === "GET" && pathname === "/api/settings") {
    const store = await readStore(dataFile);
    sendJson(res, 200, { settings: store.settings });
    return true;
  }

  if (method === "PUT" && pathname === "/api/settings") {
    const body = await parseBody(req);
    let settings;

    await mutateStore(
      async (store) => {
        store.settings = {
          ...store.settings,
          autoSpeak: safeBoolean(body.autoSpeak, store.settings.autoSpeak),
          largeText: safeBoolean(body.largeText, store.settings.largeText),
          reminderVoice: safeBoolean(body.reminderVoice, store.settings.reminderVoice),
          interfaceMode: body.interfaceMode === "family" ? "family" : "elder",
          reducedMotion: safeBoolean(body.reducedMotion, store.settings.reducedMotion),
          caregiverDigestEnabled: safeBoolean(body.caregiverDigestEnabled, store.settings.caregiverDigestEnabled),
          caregiverDigestHour: isValidTime(safeText(body.caregiverDigestHour, 5))
            ? safeText(body.caregiverDigestHour, 5)
            : store.settings.caregiverDigestHour,
        };
        settings = store.settings;
        addEvent(store, "settings_updated", "用户更新了可访问性设置", { settings });
      },
      dataFile
    );

    sendJson(res, 200, { settings });
    return true;
  }

  if (method === "GET" && pathname === "/api/caregiver/status") {
    const store = await readStore(dataFile);
    sendJson(res, 200, {
      caregiver: buildCaregiverStatus(store),
      digestPreview: buildCaregiverDigest(store),
      dashboard: buildDashboard(store).summary,
    });
    return true;
  }

  if (method === "POST" && pathname === "/api/caregiver/notify-test") {
    const store = await readStore(dataFile);
    const payload = {
      type: "caregiver_test",
      title: "老人陪伴助手通知测试",
      message: `${store.profile.name || "老人"} 的家属通知链路测试成功，后续紧急事件会从这里发出。`,
      meta: {
        test: true,
      },
    };
    const result = await notifyCaregiver({
      store,
      type: payload.type,
      title: payload.title,
      message: payload.message,
      meta: payload.meta,
    });
    await recordCaregiverNotificationResult(dataFile, payload, result);
    sendJson(res, 200, {
      ok: true,
      caregiver: buildCaregiverStatus(store),
      result,
    });
    return true;
  }

  if (method === "POST" && pathname === "/api/caregiver/digest") {
    const store = await readStore(dataFile);
    const digest = buildCaregiverDigest(store);
    const today = new Date().toISOString().slice(0, 10);
    const result = await notifyCaregiver({
      store,
      type: "daily_digest",
      title: digest.title,
      message: digest.message,
      meta: digest.meta,
    });
    await recordCaregiverNotificationResult(
      dataFile,
      {
        type: "daily_digest",
        title: digest.title,
        markDigestDate: result.attempted ? today : "",
      },
      result
    );
    sendJson(res, 200, {
      ok: true,
      digest,
      result,
    });
    return true;
  }

  if (method === "GET" && pathname === "/api/reminders") {
    const store = await readStore(dataFile);
    sendJson(res, 200, { reminders: sortedReminders(store.reminders) });
    return true;
  }

  if (method === "POST" && pathname === "/api/reminders") {
    const body = await parseBody(req);
    const title = safeText(body.title, 40);
    const time = safeText(body.time, 5);
    const repeat = body.repeat === "once" ? "once" : "daily";
    const scheduleDate = repeat === "once" ? safeText(body.scheduleDate, 10) || new Date().toISOString().slice(0, 10) : "";

    if (!title || !isValidTime(time)) {
      sendError(res, 400, "提醒标题或时间格式不正确");
      return true;
    }
    if (repeat === "once" && scheduleDate && !isValidDate(scheduleDate)) {
      sendError(res, 400, "单次提醒日期格式不正确");
      return true;
    }

    const reminder = {
      id: createId("rem"),
      title,
      time,
      repeat,
      scheduleDate,
      enabled: true,
      lastTriggeredAt: "",
      lastTriggeredDate: "",
      createdAt: new Date().toISOString(),
    };

    await mutateStore(
      async (store) => {
        store.reminders.unshift(reminder);
        trimArray(store.reminders, 120);
        addEvent(store, "reminder_created", `新增提醒：${title}`, {
          reminderId: reminder.id,
          time,
          repeat,
          scheduleDate,
        });
      },
      dataFile
    );

    sendJson(res, 201, { reminder: decorateReminder(reminder) });
    return true;
  }

  if (method === "POST" && pathname === "/api/reminders/trigger") {
    const body = await parseBody(req);
    const reminderId = safeText(body.reminderId, 80);
    if (!reminderId) {
      sendError(res, 400, "缺少 reminderId");
      return true;
    }

    let reminder = null;
    await mutateStore(
      async (store) => {
        const found = store.reminders.find((item) => item.id === reminderId);
        if (!found) return;

        const now = new Date();
        found.lastTriggeredAt = now.toISOString();
        found.lastTriggeredDate = now.toISOString().slice(0, 10);
        if (found.repeat === "once") found.enabled = false;
        reminder = { ...found };

        addEvent(store, "reminder_triggered", `提醒触发：${found.title}`, {
          reminderId: found.id,
          repeat: found.repeat,
        });
      },
      dataFile
    );

    if (!reminder) {
      sendError(res, 404, "提醒不存在");
      return true;
    }

    sendJson(res, 200, { reminder: decorateReminder(reminder) });
    return true;
  }

  const reminderMatch = pathname.match(/^\/api\/reminders\/([^/]+)$/);
  if (reminderMatch && method === "PATCH") {
    const reminderId = decodeURIComponent(reminderMatch[1]);
    const body = await parseBody(req);
    let reminder = null;

    await mutateStore(
      async (store) => {
        const found = store.reminders.find((item) => item.id === reminderId);
        if (!found) return;
        found.enabled = safeBoolean(body.enabled, found.enabled);
        reminder = { ...found };
        addEvent(store, "reminder_updated", `${found.enabled ? "启用" : "停用"}提醒：${found.title}`, {
          reminderId: found.id,
          enabled: found.enabled,
        });
      },
      dataFile
    );

    if (!reminder) {
      sendError(res, 404, "提醒不存在");
      return true;
    }

    sendJson(res, 200, { reminder: decorateReminder(reminder) });
    return true;
  }

  if (reminderMatch && method === "DELETE") {
    const reminderId = decodeURIComponent(reminderMatch[1]);
    let deleted = false;

    await mutateStore(
      async (store) => {
        const index = store.reminders.findIndex((item) => item.id === reminderId);
        if (index < 0) return;
        const [removed] = store.reminders.splice(index, 1);
        deleted = true;
        addEvent(store, "reminder_deleted", `删除提醒：${removed.title}`, { reminderId: removed.id });
      },
      dataFile
    );

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

    let responsePayload = null;
    let notificationPlan = null;

    await mutateStore(
      async (store) => {
        const emergency = detectEmergency(message);
        const reminderIntent = emergency ? null : parseReminderIntent(message);
        const liveAssistant = emergency || reminderIntent
          ? null
          : await buildLiveReply({
              message,
              profile: store.profile,
              reminders: sortedReminders(store.reminders),
            });
        const bestKnowledgeMatch = emergency || reminderIntent ? null : findBestKnowledgeMatch(message);
        const knowledgeAssistant = knowledgeReply(bestKnowledgeMatch);
        const fallbackAssistant =
          liveAssistant ||
          knowledgeAssistant ||
          buildAssistantResponse({
            message,
            profile: store.profile,
            reminderIntent,
            emergency,
          });
        let assistant = fallbackAssistant;
        let replyProvider = liveAssistant
          ? liveAssistant.provider
          : knowledgeAssistant
            ? "local-knowledge"
            : "local-rule";

        const userMessage = {
          id: createId("chat"),
          role: "user",
          content: message,
          source,
          createdAt: new Date().toISOString(),
        };

        let createdReminder = null;
        if (reminderIntent) {
          createdReminder = {
            id: createId("rem"),
            title: reminderIntent.title,
            time: reminderIntent.time,
            repeat: reminderIntent.repeat,
            scheduleDate: reminderIntent.scheduleDate,
            enabled: true,
            lastTriggeredAt: "",
            lastTriggeredDate: "",
            createdAt: new Date().toISOString(),
          };
          store.reminders.unshift(createdReminder);
          trimArray(store.reminders, 120);
          addEvent(store, "reminder_created", `语音创建提醒：${createdReminder.title}`, {
            reminderId: createdReminder.id,
            source,
            time: createdReminder.time,
            repeat: createdReminder.repeat,
            scheduleDate: createdReminder.scheduleDate,
          });
        }

        if (emergency) {
          addEvent(
            store,
            emergency.type,
            `系统识别到高风险表达：${message.slice(0, 60)}`,
            {
              source,
              label: emergency.label,
              steps: emergency.steps,
            },
            "high"
          );
          notificationPlan = {
            type: "emergency_alert",
            title: `${store.profile.name || "老人"}触发紧急告警`,
            message: `${message.slice(0, 80)}。请尽快联系${store.profile.name || "老人"}，必要时直接拨打 120。`,
            meta: {
              label: emergency.label,
              address: store.profile.address,
              contactPhone: store.profile.emergencyContactPhone,
            },
          };
        } else if (!reminderIntent && !knowledgeAssistant && !liveAssistant && isDeepSeekEnabled()) {
          try {
            const aiReply = await createDeepSeekReply({
              history: recentConversations(store, 10),
              message,
              profile: store.profile,
            });

            if (aiReply?.reply) {
              assistant = {
                ...fallbackAssistant,
                reply: aiReply.reply,
                intent: "llm_chat",
                suggestions:
                  Array.isArray(aiReply.suggestions) && aiReply.suggestions.length
                    ? aiReply.suggestions
                    : ["继续聊聊天", "帮我设置提醒", "联系紧急联系人"],
              };
              replyProvider = aiReply.provider || "deepseek";
            }
          } catch (error) {
            addEvent(
              store,
              "ai_fallback",
              "DeepSeek 暂时不可用，已自动回退到本地回复",
              {
                provider: "deepseek",
                reason: error instanceof Error ? error.message.slice(0, 160) : "unknown",
              },
              "info"
            );
          }
        }

        const assistantMessage = {
          id: createId("chat"),
          role: "assistant",
          content: assistant.reply,
          source: replyProvider,
          createdAt: new Date().toISOString(),
        };

        store.conversations.push(userMessage, assistantMessage);
        if (store.conversations.length > 400) {
          store.conversations.splice(0, store.conversations.length - 400);
        }

        responsePayload = {
          provider: replyProvider,
          reply: assistant.reply,
          intent: assistant.intent,
          suggestions: assistant.suggestions,
          emergency: emergency
            ? {
                label: emergency.label,
                steps: emergency.steps,
                contactName: store.profile.emergencyContactName,
                contactPhone: store.profile.emergencyContactPhone,
                address: store.profile.address,
              }
            : null,
          reminder: createdReminder ? decorateReminder(createdReminder) : null,
          ai: aiCapabilities(),
          briefing: liveAssistant?.briefing || null,
        };
      },
      dataFile
    );

    if (notificationPlan) {
      await sendCaregiverNotification(dataFile, notificationPlan);
    }

    sendJson(res, 200, responsePayload);
    return true;
  }

  if (method === "POST" && pathname === "/api/emergency/report") {
    const body = await parseBody(req);
    const symptom = safeText(body.symptom, 120);
    const action = safeText(body.action, 80) || "用户手动上报";

    await mutateStore(
      async (store) => {
        addEvent(store, "emergency_reported", `紧急上报：${action}`, { symptom }, "high");
      },
      dataFile
    );

    await sendCaregiverNotification(dataFile, {
      type: "manual_sos",
      title: "收到一键求助上报",
      message: `${action}。症状描述：${symptom || "手动求助"}。请尽快电话确认。`,
      meta: {
        symptom,
      },
    });

    sendJson(res, 201, { ok: true });
    return true;
  }

  if (method === "GET" && pathname === "/api/dashboard") {
    const store = await readStore(dataFile);
    sendJson(res, 200, buildDashboard(store));
    return true;
  }

  if (method === "GET" && pathname === "/api/logs") {
    const store = await readStore(dataFile);
    const type = safeText(urlObj.searchParams.get("type") || "all", 30) || "all";
    const q = safeText(urlObj.searchParams.get("q") || "", 80);
    const level = safeText(urlObj.searchParams.get("level") || "all", 20) || "all";
    const limitRaw = Number(urlObj.searchParams.get("limit") || 80);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 80;

    const logs = timelineFromStore(store)
      .filter((item) => {
        if (type === "conversation" && item.type !== "conversation") return false;
        if (type === "emergency" && !item.type.startsWith("emergency")) return false;
        if (type === "reminder" && !item.type.startsWith("reminder")) return false;
        if (type === "profile" && !item.type.startsWith("profile") && !item.type.startsWith("settings")) return false;
        if (level !== "all" && item.level !== level) return false;
        if (q && !item.message.includes(q)) return false;
        return true;
      })
      .slice(0, limit);

    sendJson(res, 200, { logs });
    return true;
  }

  return false;
}

function createAppServer(options = {}) {
  const resolvedOptions = {
    dataFile: options.dataFile || DEFAULT_DATA_FILE,
    webDir: options.webDir || WEB_DIR,
    logger: options.logger || console,
  };

  const server = http.createServer(async (req, res) => {
    if (!req.url) {
      sendError(res, 400, "无效请求");
      return;
    }

    try {
      const urlObj = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      if (urlObj.pathname.startsWith("/api/")) {
        const handled = await handleApi(req, res, urlObj, resolvedOptions);
        if (!handled) sendError(res, 404, "接口不存在");
        return;
      }

      const served = await serveStatic(urlObj.pathname, res, resolvedOptions.webDir);
      if (!served) sendError(res, 404, "页面不存在");
    } catch (error) {
      const message = error instanceof Error ? error.message : "服务异常";
      resolvedOptions.logger.error("Request failed:", error);
      sendError(res, 500, message);
    }
  });

  server.on("clientError", (error, socket) => {
    resolvedOptions.logger.error("Client error:", error.message);
    socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
  });

  return server;
}

module.exports = {
  createAppServer,
};
