function createId(prefix = "id") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function safeText(value, maxLen = 200) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, maxLen);
}

function safePhone(value) {
  return safeText(value, 20).replace(/[^\d+()-\s]/g, "");
}

function safeBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  return fallback;
}

function trimArray(arr, limit = 300) {
  if (arr.length > limit) arr.length = limit;
}

function isValidTime(value) {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}

function isValidDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function formatTime(hour, minute) {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function normalizeClock(period, hourRaw, minuteRaw) {
  let hour = Number(hourRaw);
  let minute = minuteRaw == null || minuteRaw === "" ? 0 : Number(minuteRaw);

  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }

  if (period === "凌晨" && hour === 12) hour = 0;
  if ((period === "下午" || period === "傍晚" || period === "晚上" || period === "今晚") && hour < 12) hour += 12;
  if (period === "中午" && hour < 11) hour += 12;

  if (hour > 23) return null;
  return formatTime(hour, minute);
}

function shiftDate(baseDate, days) {
  const copy = new Date(baseDate);
  copy.setDate(copy.getDate() + days);
  return copy.toISOString().slice(0, 10);
}

function parseReminderIntent(message, now = new Date()) {
  const text = safeText(message, 200);
  if (!text || !/(提醒|叫我|记得|帮我记得)/.test(text)) return null;

  const patterns = [
    /^(?:(每天|每日|今天|明天)\s*)?(?:(早上|上午|中午|下午|傍晚|晚上|凌晨|今晚)\s*)?(\d{1,2})(?:(?:\s*[:：]\s*(\d{1,2}))|(?:\s*[点时]\s*(\d{1,2})?))?(?:\s*分)?\s*(?:提醒我|叫我|记得|帮我记得)\s*(.+)$/,
    /^(?:提醒我|叫我|记得|帮我记得)\s*(?:(每天|每日|今天|明天)\s*)?(?:(早上|上午|中午|下午|傍晚|晚上|凌晨|今晚)\s*)?(\d{1,2})(?:(?:\s*[:：]\s*(\d{1,2}))|(?:\s*[点时]\s*(\d{1,2})?))?(?:\s*分)?\s*(.+)$/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;

    const [, dayWordRaw = "", period = "", hourRaw = "", minuteRaw = "", minuteAltRaw = "", titleRaw = ""] = match;
    const time = normalizeClock(period, hourRaw, minuteRaw || minuteAltRaw);
    const title = safeText(titleRaw.replace(/^(一下|一声|我|去|要)\s*/g, ""), 40);
    if (!time || !title) return null;

    const dayWord = dayWordRaw || "";
    const repeat = dayWord === "每天" || dayWord === "每日" ? "daily" : "once";
    let scheduleDate = "";

    if (repeat === "once") {
      if (dayWord === "明天") {
        scheduleDate = shiftDate(now, 1);
      } else if (dayWord === "今天") {
        scheduleDate = shiftDate(now, 0);
      } else {
        const today = shiftDate(now, 0);
        scheduleDate = time > formatTime(now.getHours(), now.getMinutes()) ? today : shiftDate(now, 1);
      }
    }

    return {
      title,
      time,
      repeat,
      scheduleDate,
      sourceText: text,
    };
  }

  return null;
}

const emergencyRules = [
  {
    type: "emergency_cardio",
    label: "疑似胸痛或呼吸困难",
    regex: /(胸痛|胸口痛|胸闷|喘不过气|呼吸困难|心慌|心悸|气短)/,
    steps: ["立即拨打 120 并说明地址与症状", "保持坐姿或半卧位，不要独自走动", "联系紧急联系人尽快到场"],
  },
  {
    type: "emergency_fall",
    label: "疑似跌倒或外伤",
    regex: /(摔倒|跌倒|出血|撞到头|骨折|起不来|流血)/,
    steps: ["先判断是否还能安全移动，避免强行站起", "拨打 120 或请邻居协助", "联系紧急联系人并说明受伤部位"],
  },
  {
    type: "emergency_neuro",
    label: "疑似意识或神经风险",
    regex: /(晕倒|昏迷|抽搐|意识不清|中风|口齿不清|半边无力)/,
    steps: ["立即拨打 120", "让周围人协助保持呼吸通畅", "准备门牌地址和既往病史信息"],
  },
  {
    type: "emergency_general",
    label: "疑似高风险紧急表达",
    regex: /(救命|快不行了|紧急|急救|剧痛|疼得厉害|头晕厉害|肚子很痛)/,
    steps: ["立即拨打 120", "联系紧急联系人", "保持电话畅通，等待救援到达"],
  },
];

function detectEmergency(message) {
  const text = safeText(message, 500);
  const matched = emergencyRules.find((rule) => rule.regex.test(text));
  if (!matched) return null;

  return {
    type: matched.type,
    label: matched.label,
    level: "high",
    steps: matched.steps,
  };
}

function addEvent(store, type, message, meta = {}, level = "normal") {
  store.events.unshift({
    id: createId("evt"),
    type,
    level,
    message,
    meta,
    createdAt: new Date().toISOString(),
  });
  trimArray(store.events, 500);
}

function buildReminderLabel(reminder) {
  if (!reminder) return "暂无提醒";
  if (reminder.repeat === "daily") {
    return `每天 ${reminder.time} · ${reminder.title}`;
  }
  if (reminder.scheduleDate) {
    return `${reminder.scheduleDate} ${reminder.time} · ${reminder.title}`;
  }
  return `单次 ${reminder.time} · ${reminder.title}`;
}

function reminderNextDueAt(reminder, now = new Date()) {
  if (!reminder.enabled || !isValidTime(reminder.time)) return null;
  const [hour, minute] = reminder.time.split(":").map(Number);
  const candidate = new Date(now);
  candidate.setSeconds(0, 0);
  candidate.setHours(hour, minute, 0, 0);

  if (reminder.repeat === "daily") {
    if (candidate.getTime() < now.getTime()) {
      candidate.setDate(candidate.getDate() + 1);
    }
    return candidate.toISOString();
  }

  const scheduleDate = isValidDate(reminder.scheduleDate) ? reminder.scheduleDate : now.toISOString().slice(0, 10);
  const scheduled = new Date(`${scheduleDate}T${reminder.time}:00`);
  if (Number.isNaN(scheduled.getTime()) || scheduled.getTime() < now.getTime()) return null;
  return scheduled.toISOString();
}

function decorateReminder(reminder, now = new Date()) {
  return {
    ...reminder,
    label: buildReminderLabel(reminder),
    nextDueAt: reminderNextDueAt(reminder, now),
  };
}

function sortReminders(reminders) {
  return [...reminders].sort((a, b) => {
    const aDue = a.nextDueAt ? new Date(a.nextDueAt).getTime() : Number.MAX_SAFE_INTEGER;
    const bDue = b.nextDueAt ? new Date(b.nextDueAt).getTime() : Number.MAX_SAFE_INTEGER;
    return aDue - bDue;
  });
}

function timelineFromStore(store) {
  const conversations = store.conversations.map((item) => ({
    id: item.id,
    type: "conversation",
    level: item.role === "assistant" ? "info" : "normal",
    message: `${item.role === "assistant" ? "助手" : "用户"}：${item.content}`,
    createdAt: item.createdAt,
    meta: { role: item.role, source: item.source },
  }));

  const events = store.events.map((item) => ({
    id: item.id,
    type: item.type,
    level: item.level || "normal",
    message: item.message,
    createdAt: item.createdAt,
    meta: item.meta || {},
  }));

  return [...events, ...conversations].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

function recentConversations(store, limit = 12) {
  return [...store.conversations]
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .slice(-limit);
}

function buildDashboard(store, now = new Date()) {
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const nowMs = now.getTime();
  const recentEvents = store.events.filter((event) => nowMs - new Date(event.createdAt).getTime() <= sevenDaysMs);
  const decoratedReminders = sortReminders(store.reminders.map((item) => decorateReminder(item, now)));
  const nextReminder = decoratedReminders.find((item) => item.nextDueAt) || null;
  const lastEmergency = store.events.find((item) => item.type.startsWith("emergency")) || null;

  return {
    summary: {
      chatCount: store.conversations.filter((item) => item.role === "user").length,
      emergencyCount7d: recentEvents.filter((item) => item.type.startsWith("emergency")).length,
      reminderEventCount7d: recentEvents.filter((item) => item.type.startsWith("reminder")).length,
      reminderEnabled: store.reminders.filter((item) => item.enabled).length,
      activeReminderCount: store.reminders.filter((item) => item.enabled).length,
      nextReminderLabel: nextReminder ? nextReminder.label : "暂无已启用提醒",
      nextReminderAt: nextReminder?.nextDueAt || "",
      lastEmergencyAt: lastEmergency?.createdAt || "",
      lastEmergencyLabel: lastEmergency?.message || "",
    },
    reminders: decoratedReminders.slice(0, 5),
  };
}

function timeGreeting(now = new Date()) {
  const hour = now.getHours();
  if (hour < 11) return "上午好";
  if (hour < 14) return "中午好";
  if (hour < 18) return "下午好";
  return "晚上好";
}

function buildAssistantResponse({ message, profile, reminderIntent, emergency, now = new Date() }) {
  const text = safeText(message, 500);
  const preferences = safeText(profile?.preferences || "", 80);

  if (emergency) {
    const contact = profile?.emergencyContactName ? `，并联系${profile.emergencyContactName}` : "";
    const address = profile?.address ? ` 您现在的登记地址是 ${profile.address}。` : "";
    return {
      reply: `我检测到您可能正处于紧急状态，请立刻拨打 120${contact}。${address}我会把求助步骤放在屏幕上，您按顺序操作即可。`,
      suggestions: ["立即拨打 120", "联系紧急联系人", "大声呼叫附近的人"],
      intent: "emergency",
    };
  }

  if (reminderIntent) {
    const scheduleText =
      reminderIntent.repeat === "daily"
        ? `每天 ${reminderIntent.time}`
        : `${reminderIntent.scheduleDate} ${reminderIntent.time}`;
    return {
      reply: `好的，我已经为您设置提醒：${scheduleText} 提醒您${reminderIntent.title}。到点后我会主动播报。`,
      suggestions: ["继续添加提醒", "查看今日安排", "更新紧急联系人"],
      intent: "reminder_create",
    };
  }

  if (/(你好|在吗|有人吗|早上好|下午好|晚上好)/.test(text)) {
    return {
      reply: `${timeGreeting(now)}${profile?.name ? `，${profile.name}` : ""}。爷爷奶奶，我来陪您聊天啦！您可以叫我小孙子或小孙女。要是想问天气、听个笑话，或者心里闷得慌，直接跟我说就行。`,
      suggestions: ["今天天气怎么样？适合出门散步吗？", "我有点闷，能陪我聊聊天吗？", "今天有什么好玩的新闻或笑话吗？"],
      intent: "greeting",
    };
  }

  if (/(孤单|无聊|难过|心情不好|想聊天)/.test(text)) {
    return {
      reply: `我会一直陪着您。我们可以先聊聊今天过得怎么样${preferences ? `，也可以聊聊您喜欢的${preferences}` : ""}。您愿意先说一句今天最想分享的事情吗？`,
      suggestions: ["我有点闷，能陪我聊聊天吗？", "今天有什么好玩的新闻或笑话吗？", "联系紧急联系人"],
      intent: "companionship",
    };
  }

  if (/(提醒|吃药|喝水|复诊|散步)/.test(text)) {
    return {
      reply: "我可以直接帮您创建提醒。您可以这样说：每天早上 8 点提醒我吃药，或者明天下午 3 点提醒我复诊。",
      suggestions: ["提醒我待会儿喝水/吃药", "每天 8 点提醒我吃药", "明天下午 3 点提醒我复诊"],
      intent: "reminder_help",
    };
  }

  if (/(家人|儿子|女儿|孙子|孙女|联系)/.test(text)) {
    return {
      reply: "如果您想联系家人，可以点开紧急联系人按钮直接拨打；如果只是想说说话，我也可以先陪您整理要说的内容。",
      suggestions: ["联系紧急联系人", "帮我想想说什么", "继续聊天"],
      intent: "family",
    };
  }

  if (/(谢谢|多谢|麻烦你了)/.test(text)) {
    return {
      reply: "不用客气，我会一直把步骤说得简单一点，陪您慢慢来。",
      suggestions: ["继续聊天", "查看提醒", "更新资料"],
      intent: "gratitude",
    };
  }

  return {
    reply: "我听到了。您可以继续多说一点，我会尽量用最简单、最直接的方式帮您。",
    suggestions: ["今天天气怎么样？适合出门散步吗？", "我有点闷，能陪我聊聊天吗？", "今天有什么好玩的新闻或笑话吗？"],
    intent: "general",
  };
}

module.exports = {
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
};
