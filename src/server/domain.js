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

const reminderPatterns = [
  /^(?:(每天|每日|今天|明天)\s*)?(?:(早上|上午|中午|下午|傍晚|晚上|凌晨|今晚)\s*)?(\d{1,2})(?:(?:\s*[:：]\s*(\d{1,2}))|(?:\s*[点时]\s*(\d{1,2})?))?(?:\s*分)?\s*(?:提醒我|叫我|记得|帮我记得)\s*(.+)$/,
  /^(?:提醒我|叫我|记得|帮我记得)\s*(?:(每天|每日|今天|明天)\s*)?(?:(早上|上午|中午|下午|傍晚|晚上|凌晨|今晚)\s*)?(\d{1,2})(?:(?:\s*[:：]\s*(\d{1,2}))|(?:\s*[点时]\s*(\d{1,2})?))?(?:\s*分)?\s*(.+)$/,
];

function splitReminderTitles(titleRaw) {
  const title = safeText(String(titleRaw || "").replace(/^(一下|一声|我|去|要)\s*/g, ""), 120);
  if (!title) return [];

  const items = title
    .split(/\s*(?:、|\/|和|以及|还有|并且|并|同时|,|，)\s*/g)
    .map((item) => safeText(item, 40))
    .filter(Boolean);

  return [...new Set(items)].slice(0, 6);
}

function parseReminderClause(message, now = new Date(), inheritedDayWord = "") {
  const text = safeText(message, 200);
  if (!text || !/(提醒|叫我|记得|帮我记得)/.test(text)) return null;

  for (const pattern of reminderPatterns) {
    const match = text.match(pattern);
    if (!match) continue;

    const [, dayWordRaw = "", period = "", hourRaw = "", minuteRaw = "", minuteAltRaw = "", titleRaw = ""] = match;
    const time = normalizeClock(period, hourRaw, minuteRaw || minuteAltRaw);
    const title = safeText(titleRaw.replace(/^(一下|一声|我|去|要)\s*/g, ""), 120);
    if (!time || !title) return null;

    const dayWord = dayWordRaw || inheritedDayWord || "";
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
      dayWord,
    };
  }

  return null;
}

function parseReminderIntents(message, now = new Date()) {
  const text = safeText(message, 240);
  if (!text || !/(提醒|叫我|记得|帮我记得)/.test(text)) return [];

  const clauses = text
    .split(/\s*(?:，|,|；|;|。|然后|接着|再)\s*/g)
    .map((item) => safeText(item, 120))
    .filter(Boolean);
  const hasMultipleClauses = clauses.length > 1;

  function expandIntent(intent) {
    const titles = splitReminderTitles(intent.title);
    if (!titles.length) return [];
    return titles.map((title) => ({
      title,
      time: intent.time,
      repeat: intent.repeat,
      scheduleDate: intent.scheduleDate,
      sourceText: intent.sourceText,
      dayWord: intent.dayWord,
    }));
  }

  if (!hasMultipleClauses) {
    const parsed = parseReminderClause(text, now);
    return parsed ? expandIntent(parsed) : [];
  }

  let inheritedDayWord = "";
  const reminders = [];

  clauses.forEach((clause) => {
    let candidate = clause;
    if (!/(提醒我|叫我|记得|帮我记得)/.test(candidate)) {
      const hasTimeExpression = /(?:(每天|每日|今天|明天)\s*)?(?:(早上|上午|中午|下午|傍晚|晚上|凌晨|今晚)\s*)?\d{1,2}(?:(?:\s*[:：]\s*\d{1,2})|(?:\s*[点时]\s*\d{0,2}))?/.test(
        candidate
      );
      if (!hasTimeExpression) return;
      const inheritedPrefix = inheritedDayWord && !/^(每天|每日|今天|明天)/.test(candidate) ? `${inheritedDayWord} ` : "";
      candidate = `提醒我 ${inheritedPrefix}${candidate}`;
    }

    const parsed = parseReminderClause(candidate, now, inheritedDayWord);
    if (!parsed) return;
    if (parsed.dayWord) inheritedDayWord = parsed.dayWord;
    reminders.push(...expandIntent(parsed));
  });

  const seen = new Set();
  return reminders.filter((item) => {
    const key = `${item.title}|${item.time}|${item.repeat}|${item.scheduleDate}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseReminderIntent(message, now = new Date()) {
  return parseReminderIntents(message, now)[0] || null;
}

const emergencyRules = [
  {
    type: "emergency_cardio",
    label: "疑似胸痛或呼吸困难",
    regex: /(胸痛|胸口(?:很)?痛|胸口疼|胸闷|像被压住|喘不过气|呼吸困难|心慌|心悸|气短)/,
    steps: ["保持坐姿或半卧位，不要独自走动", "尽量少说话，慢一点呼吸", "让手机保持畅通，方便救援或家人回拨"],
    lead: "我在，先别硬撑。请马上坐下或半躺，尽量少走动，慢一点呼吸。",
    followup: "胸痛和喘不过气不能拖，我先按急救流程继续处理。",
  },
  {
    type: "emergency_overdose",
    label: "疑似药物过量或误服",
    regex: /(吃了很多药|药吃多了|吃错药|吞了很多药|药物过量|刚刚吃了很多药|误服|多吃了药)/,
    steps: ["先别再继续吃药，也不要自己催吐", "把药盒、药名或剩余药片放在手边", "保持清醒和电话畅通，等待救援或家人回拨"],
    lead: "我在，先别再继续吃药，也不要自己催吐。把刚才吃的药盒或药名放在手边，我来按药物过量流程处理。",
    followup: "药物过量有危险，我先按急救流程继续处理。",
  },
  {
    type: "emergency_bleeding",
    label: "疑似大量出血",
    regex: /(流了很多血|一直流血|大出血|血止不住|出血很多)/,
    steps: ["立刻用干净毛巾、衣物或纸巾持续按住伤口", "如果不是骨折或剧痛，可以适当抬高受伤部位", "尽量原地等待救援或家人回拨，不要反复走动"],
    lead: "我在，先用干净毛巾、衣物或者纸巾持续按住出血处，先别松手。",
    followup: "大量出血风险很高，我先按急救流程继续处理。",
  },
  {
    type: "emergency_fall",
    label: "疑似跌倒或外伤",
    regex: /(摔倒|跌倒|出血|撞到头|骨折|起不来|流血)/,
    steps: ["先判断是否还能安全移动，避免强行站起", "如果撞到头、腰腿剧痛或怀疑骨折，先别乱动", "尽量把手机放在手边，等待救援或家人回拨"],
    lead: "我在，先别急着起身，避免再次受伤。",
    followup: "如果起不来、出血明显或者撞到头，风险会很高，我先按急救流程继续处理。",
  },
  {
    type: "emergency_neuro",
    label: "疑似意识或神经风险",
    regex: /(晕倒|昏迷|抽搐|意识不清|中风|口齿不清|半边无力)/,
    steps: ["保持当前体位，不要自己走动", "尽量保持呼吸顺畅，先不要进食喝水", "如果旁边有人，请示意对方留在身边"],
    lead: "我在，先不要自己走动，也不要硬撑着站起来。",
    followup: "这种情况有中风或意识风险，我先按急救流程继续处理。",
  },
  {
    type: "emergency_general",
    label: "疑似高风险紧急表达",
    regex: /(救命|(?:快|像是|可能)?不行了|紧急|急救|剧痛|疼得厉害|头晕厉害|肚子很痛)/,
    steps: ["先坐下或躺下，别自己走动", "让手机保持畅通，方便救援或家人回拨", "如果身边有人，立刻请对方过来帮忙"],
    lead: "我在，先别慌，先坐下或躺下，别自己走动。",
    followup: "这种情况不能硬撑，我先按紧急流程继续处理。",
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
    lead: matched.lead,
    followup: matched.followup,
  };
}

const symptomRules = [
  {
    type: "symptom_dizzy",
    label: "头晕头痛需要先稳住状态",
    regex: /(头很晕|头晕|头疼|头痛|头昏|头晕眼花|脑袋晕|有点晕|站不稳)/,
    steps: [
      "先坐下或躺下，别自己走动",
      "如果身边有温水，可以小口喝几口",
      "如果方便，量一下血压或血糖",
      "如果越来越重、说话不清、胸闷或手脚没力，马上拨打 120",
    ],
    reply:
      "我在。您先别急，先坐下或者躺下，别自己走动。要是身边有温水，可以小口喝几口；如果方便，量一下血压或血糖。我会把这次情况记下来，并尽快提醒家里人。如果一会儿还在加重，或者出现胸闷、说话不清、手脚没力，请马上打120。",
    suggestions: ["联系紧急联系人", "我现在胸痛，快不行了", "提醒我半小时后再看看状态"],
  },
  {
    type: "symptom_abdominal",
    label: "肚子疼先别硬撑",
    regex: /(肚子疼|肚子痛|腹痛|胃疼|胃痛|胃不舒服|肚子不舒服)/,
    steps: [
      "先坐下或侧躺休息，别硬撑着活动",
      "先别吃生冷、油腻食物，也不要自己乱吃药",
      "如果不恶心不呕吐，可以小口喝一点温水",
      "如果越来越疼、反复呕吐、发热或冒冷汗，马上联系家人并拨打 120",
    ],
    reply:
      "我在。您先坐下或者侧躺休息一下，别硬撑着活动。先不要吃生冷油腻的东西，也别急着乱吃药；如果这会儿不恶心、不想吐，可以小口喝一点温水。我会把这次情况记下来，也会提醒家里人留意。如果疼得越来越厉害，或者开始发热、冒冷汗、一直吐，就别拖，马上打120。",
    suggestions: ["联系紧急联系人", "提醒我一小时后再看看", "我现在胸痛，快不行了"],
  },
];

function detectSymptomAlert(message) {
  const text = safeText(message, 500);
  const matched = symptomRules.find((rule) => rule.regex.test(text));
  if (!matched) return null;

  return {
    type: matched.type,
    label: matched.label,
    level: "normal",
    steps: matched.steps,
    reply: matched.reply,
    suggestions: matched.suggestions,
  };
}

function summarizeSteps(steps = [], limit = 3) {
  return steps
    .filter(Boolean)
    .slice(0, limit)
    .map((item) => safeText(item, 80))
    .join("；");
}

function buildEscalationWorkflow({
  profile,
  label,
  caregiverName = "",
  canNotifyCaregiver = false,
  mode = "emergency",
}) {
  const elderName = safeText(profile?.name || "老人", 30) || "老人";
  const address = safeText(profile?.address || "", 120);
  const phone = safePhone(profile?.caregiverPhone || profile?.emergencyContactPhone || "");
  const contactName = safeText(caregiverName || profile?.caregiverName || profile?.emergencyContactName || "", 30);
  const caregiverStatusLabel = contactName
    ? canNotifyCaregiver
      ? `正在同步通知${contactName}`
      : `已整理给${contactName}的联络内容`
    : "";

  const emergencyService =
    mode === "emergency"
      ? {
          label: "120 急救中心",
          phone: "120",
          status: "initiated",
          statusLabel: "已启动 120 紧急联络流程",
          message: address
            ? `会把“${label}”和登记地址 ${address} 一并同步给 120。`
            : `会把“${label}”和老人当前情况先同步给 120。`,
        }
      : null;

  const caregiver = contactName
    ? {
        name: contactName,
        phone,
        status: canNotifyCaregiver ? "syncing" : "prepared",
        statusLabel: caregiverStatusLabel,
        message: address ? `会把当前情况和地址 ${address} 一并告诉${contactName}。` : `会把当前情况整理后告诉${contactName}。`,
      }
    : null;

  const summaryParts = [emergencyService?.statusLabel, caregiver?.statusLabel].filter(Boolean);

  return {
    mode: "demo_auto_dispatch",
    started: summaryParts.length > 0,
    address,
    summary: summaryParts.length ? `${summaryParts.join("，")}。` : "已启动紧急留痕流程。",
    emergencyService,
    caregiver,
    script:
      mode === "emergency"
        ? address
          ? `${elderName}出现“${label}”，地址是 ${address}。`
          : `${elderName}出现“${label}”，请尽快回拨确认。`
        : address
          ? `${elderName}出现“${label}”，地址是 ${address}，请尽快回拨确认。`
          : `${elderName}出现“${label}”，请尽快回拨确认。`,
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
  const latestCheckin = Array.isArray(store.checkins) && store.checkins.length ? store.checkins[0] : null;

  return {
    summary: {
      chatCount: store.conversations.filter((item) => item.role === "user").length,
      emergencyCount7d: recentEvents.filter((item) => item.type.startsWith("emergency")).length,
      scamAlertCount7d: recentEvents.filter((item) => item.type.startsWith("safety_scam")).length,
      reminderEventCount7d: recentEvents.filter((item) => item.type.startsWith("reminder")).length,
      reminderEnabled: store.reminders.filter((item) => item.enabled).length,
      activeReminderCount: store.reminders.filter((item) => item.enabled).length,
      memoryCount: Array.isArray(store.memoryNotes) ? store.memoryNotes.length : 0,
      lowMoodCount7d: Array.isArray(store.checkins)
        ? store.checkins.filter((item) => {
            const createdAt = new Date(item.createdAt).getTime();
            if (!Number.isFinite(createdAt) || nowMs - createdAt > sevenDaysMs) return false;
            return ["lonely", "anxious", "unwell"].includes(String(item.mood || ""));
          }).length
        : 0,
      latestCheckinMood: latestCheckin?.mood || "",
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

function buildAssistantResponse({
  message,
  profile,
  reminderIntent,
  reminderIntents = [],
  emergency,
  symptomAlert,
  canNotifyCaregiver = false,
  caregiverName = "",
  now = new Date(),
}) {
  const text = safeText(message, 500);
  const preferences = safeText(profile?.preferences || "", 80);
  const fallbackContactName = safeText(caregiverName || profile?.caregiverName || profile?.emergencyContactName || "", 30);

  if (emergency) {
    const dispatch = buildEscalationWorkflow({
      profile,
      label: emergency.label,
      caregiverName: fallbackContactName,
      canNotifyCaregiver,
      mode: "emergency",
    });
    const actionLine = summarizeSteps(emergency.steps, 3);
    return {
      reply: `${emergency.lead || "我在，先别慌。"}${emergency.followup || "我先按急救流程继续处理。"}${dispatch.summary}${
        dispatch.emergencyService?.message || "我会先把当前情况整理进紧急联络流程。"
      }${dispatch.caregiver?.message || "如果身边有人，我也建议您先请对方留在旁边。"}${
        actionLine ? `您先按我说的做：${actionLine}。` : ""
      }我会继续陪着您。`,
      suggestions: ["联系紧急联系人", "重复我的地址", "我身边有人"],
      intent: "emergency",
      dispatch,
    };
  }

  if (symptomAlert) {
    const dispatch = buildEscalationWorkflow({
      profile,
      label: symptomAlert.label,
      caregiverName: fallbackContactName,
      canNotifyCaregiver,
      mode: "symptom",
    });
    const notifyLine = dispatch.caregiver?.message || "如果身边有人，先请他陪着您。";
    return {
      reply: `${symptomAlert.reply}${dispatch.summary}${notifyLine}`,
      suggestions: symptomAlert.suggestions || ["联系紧急联系人", "提醒我半小时后再看看", "立即拨打 120"],
      intent: "symptom_guidance",
      dispatch,
    };
  }

  const reminderList = reminderIntents.length ? reminderIntents : reminderIntent ? [reminderIntent] : [];
  if (reminderList.length) {
    if (reminderList.length === 1) {
      const scheduleText =
        reminderList[0].repeat === "daily"
          ? `每天 ${reminderList[0].time}`
          : `${reminderList[0].scheduleDate} ${reminderList[0].time}`;
      return {
        reply: `好的，我已经为您设置提醒：${scheduleText} 提醒您${reminderList[0].title}。到点后我会主动播报。`,
        suggestions: ["继续添加提醒", "查看今日安排", "更新紧急联系人"],
        intent: "reminder_create",
      };
    }

    const reminderLines = reminderList
      .slice(0, 4)
      .map((item) =>
        item.repeat === "daily" ? `每天 ${item.time} 提醒${item.title}` : `${item.scheduleDate} ${item.time} 提醒${item.title}`
      )
      .join("；");
    return {
      reply: `好的，这次我帮您记住了 ${reminderList.length} 个提醒：${reminderLines}。到时间我会按条播报，不会只记住一项。`,
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
  detectSymptomAlert,
  isValidDate,
  isValidTime,
  parseReminderIntent,
  parseReminderIntents,
  recentConversations,
  safeBoolean,
  safePhone,
  safeText,
  timelineFromStore,
  trimArray,
};
