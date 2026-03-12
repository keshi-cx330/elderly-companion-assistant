const { NOTIFY_TIMEOUT_MS, NOTIFY_WEBHOOK_URLS } = require("./config");
const { safeText } = require("./domain");
const { energyInfo, moodInfo } = require("./engagement");

function caregiverWebhookTargets(store = {}) {
  const storeWebhook = safeText(store?.profile?.caregiverWebhookUrl || "", 300);
  const targets = [...NOTIFY_WEBHOOK_URLS, ...(storeWebhook ? [storeWebhook] : [])];
  return [...new Set(targets)].filter(Boolean);
}

function caregiverContactSummary(store = {}) {
  const relation = safeText(store?.profile?.caregiverRelation || "", 20);
  const name = safeText(store?.profile?.caregiverName || store?.profile?.emergencyContactName || "", 30);
  const phone = safeText(store?.profile?.caregiverPhone || store?.profile?.emergencyContactPhone || "", 20);
  return {
    name,
    phone,
    relation,
  };
}

function buildCaregiverStatus(store = {}) {
  const contact = caregiverContactSummary(store);
  const webhooks = caregiverWebhookTargets(store);
  return {
    configured: Boolean(contact.name || contact.phone || webhooks.length),
    contact,
    webhookCount: webhooks.length,
    digestEnabled: Boolean(store?.settings?.caregiverDigestEnabled),
    digestHour: safeText(store?.settings?.caregiverDigestHour || "08:30", 5) || "08:30",
    lastDigestDate: safeText(store?.settings?.lastDigestDate || "", 10),
  };
}

async function postJson(url, payload) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NOTIFY_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    return {
      ok: response.ok,
      status: response.status,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error instanceof Error ? error.message : "notify_failed",
    };
  } finally {
    clearTimeout(timer);
  }
}

async function notifyCaregiver({ store, type, title, message, meta = {} }) {
  const webhooks = caregiverWebhookTargets(store);
  if (!webhooks.length) {
    return {
      attempted: false,
      delivered: false,
      results: [],
      reason: "no_webhook",
    };
  }

  const payload = {
    app: "老人陪伴助手",
    type,
    title,
    message,
    createdAt: new Date().toISOString(),
    elder: {
      name: safeText(store?.profile?.name || "", 30),
      address: safeText(store?.profile?.address || "", 120),
      location: safeText(store?.profile?.location || "", 40),
    },
    caregiver: caregiverContactSummary(store),
    meta,
  };

  const results = await Promise.all(
    webhooks.map(async (url) => ({
      url,
      ...(await postJson(url, payload)),
    }))
  );

  return {
    attempted: true,
    delivered: results.some((item) => item.ok),
    results,
  };
}

function buildCaregiverDigest(store = {}, now = new Date()) {
  const recentHighEvents = (store.events || [])
    .filter((event) => event.level === "high")
    .slice(0, 3)
    .map((event) => event.message);
  const scamAlerts7d = (store.events || []).filter((event) => {
    if (!String(event.type || "").startsWith("safety_scam")) return false;
    const createdAt = new Date(event.createdAt).getTime();
    return Number.isFinite(createdAt) && now.getTime() - createdAt <= 7 * 24 * 60 * 60 * 1000;
  }).length;
  const enabledReminders = (store.reminders || []).filter((item) => item.enabled);
  const nextReminder = enabledReminders[0] || null;
  const latestCheckin = Array.isArray(store.checkins) && store.checkins.length ? store.checkins[0] : null;
  const latestMemory = Array.isArray(store.memoryNotes) && store.memoryNotes.length ? store.memoryNotes[0] : null;
  const title = `${safeText(store?.profile?.name || "老人", 30)}今日安心摘要`;
  const lines = [
    `今日时间：${now.toISOString().slice(0, 10)}`,
    nextReminder
      ? `下一条提醒：${nextReminder.repeat === "daily" ? "每天" : nextReminder.scheduleDate || "今天"} ${nextReminder.time} · ${nextReminder.title}`
      : "下一条提醒：今天暂无待办提醒",
    latestCheckin
      ? `最近状态打卡：${moodInfo(latestCheckin.mood).label} / ${energyInfo(latestCheckin.energy).label}${latestCheckin.note ? `，备注：${latestCheckin.note}` : ""}`
      : "最近状态打卡：今天还没有新的报平安记录",
    latestMemory
      ? `最新时光回忆：${safeText(latestMemory.content || "", 60)}`
      : "最新时光回忆：今天还没有新的回忆记录",
    `近 7 天高风险事件：${recentHighEvents.length} 次`,
    `近 7 天防诈骗提醒：${scamAlerts7d} 次`,
    recentHighEvents.length ? `最近一次：${recentHighEvents[0]}` : "最近没有新的高风险事件",
  ];

  return {
    title,
    message: lines.join("\n"),
    meta: {
      highRiskCount: recentHighEvents.length,
      reminderEnabledCount: enabledReminders.length,
      scamAlerts7d,
      latestCheckinAt: latestCheckin?.createdAt || "",
      latestMemoryAt: latestMemory?.createdAt || "",
    },
  };
}

function shouldSendDailyDigest(store = {}, now = new Date()) {
  if (!store?.settings?.caregiverDigestEnabled) return false;
  const today = now.toISOString().slice(0, 10);
  return safeText(store?.settings?.lastDigestDate || "", 10) !== today;
}

module.exports = {
  buildCaregiverDigest,
  buildCaregiverStatus,
  notifyCaregiver,
  shouldSendDailyDigest,
};
