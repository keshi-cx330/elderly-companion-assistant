const { safeText } = require("./domain");

const MEMORY_PROMPTS = [
  "您小时候最爱吃的一道家常菜是什么？谁做得最好吃？",
  "年轻时最难忘的一次旅行或探亲经历是什么？",
  "有没有一首歌，一听就会想到以前的日子？",
  "您刚参加工作时，第一份工作是什么样的？",
  "家里以前过年最热闹的一件事是什么？",
  "小时候住的地方，最让您怀念的声音是什么？",
  "年轻时最喜欢穿的一件衣服或者最爱的一张照片是什么样？",
  "以前邻里之间最暖心的一次帮忙，您还记得吗？",
];

const CHECKIN_MOODS = {
  happy: { label: "心情不错", tone: "开心", summary: "今天心情不错，状态比较轻松。" },
  calm: { label: "挺平稳", tone: "平静", summary: "今天整体比较平稳，情绪还算安稳。" },
  lonely: { label: "有点闷", tone: "孤单", summary: "今天有点闷，适合多陪聊或联系家人。" },
  anxious: { label: "有点担心", tone: "焦虑", summary: "今天有些担心，建议多安抚和确认近况。" },
  unwell: { label: "不太舒服", tone: "不适", summary: "今天状态不太舒服，建议尽快关注和确认。" },
};

const ENERGY_LEVELS = {
  high: { label: "精神足" },
  medium: { label: "还行" },
  low: { label: "没劲" },
};

const SCAM_RULES = [
  {
    type: "safety_scam_transfer",
    label: "疑似转账诈骗",
    regex: /(转账|汇款|打钱|银行卡冻结|刷流水|账户异常|退款到卡|先垫付)/,
    steps: ["先不要转账", "马上挂断电话或停止聊天", "联系家人或银行官方电话核实"],
  },
  {
    type: "safety_scam_code",
    label: "疑似验证码诈骗",
    regex: /(验证码|动态码|短信码|授权码|支付码|共享屏幕|远程协助)/,
    steps: ["验证码绝不能告诉陌生人", "不要共享屏幕", "联系家人核实对方身份"],
  },
  {
    type: "safety_scam_authority",
    label: "疑似冒充公检法诈骗",
    regex: /(公安|警察|法院|检察院|涉案|洗钱|冻结账户|安全账户)/,
    steps: ["真正办案不会要求私下转账", "不要提供身份证或银行卡信息", "先联系家人再拨打官方电话核实"],
  },
  {
    type: "safety_scam_marketing",
    label: "疑似保健品或中奖诱导",
    regex: /(中奖了|领奖|保健品|神药|包治百病|内部投资|稳赚不赔|高收益)/,
    steps: ["先不要付款", "保留宣传内容或电话信息", "和家人商量后再决定"],
  },
];

function normalizeMood(value) {
  const key = safeText(String(value || ""), 20).toLowerCase();
  return CHECKIN_MOODS[key] ? key : "calm";
}

function normalizeEnergy(value) {
  const key = safeText(String(value || ""), 20).toLowerCase();
  return ENERGY_LEVELS[key] ? key : "medium";
}

function moodInfo(mood) {
  return CHECKIN_MOODS[normalizeMood(mood)] || CHECKIN_MOODS.calm;
}

function energyInfo(energy) {
  return ENERGY_LEVELS[normalizeEnergy(energy)] || ENERGY_LEVELS.medium;
}

function latestItem(items = []) {
  return Array.isArray(items) && items.length ? items[0] : null;
}

function todayMemoryPrompt(now = new Date()) {
  const dayKey = now.toISOString().slice(0, 10).replace(/-/g, "");
  const seed = Number(dayKey) || 0;
  const index = seed % MEMORY_PROMPTS.length;
  return {
    id: `memory_prompt_${index + 1}`,
    prompt: MEMORY_PROMPTS[index],
    allPrompts: MEMORY_PROMPTS,
  };
}

function latestFamilyNote(familyNotes = []) {
  if (!Array.isArray(familyNotes) || !familyNotes.length) return null;
  const pinned = familyNotes.find((item) => item.pinned);
  return pinned || familyNotes[0];
}

function latestCheckinLabel(checkins = []) {
  const latest = latestItem(checkins);
  if (!latest) return "今天还没有报平安";
  return `${moodInfo(latest.mood).label} · ${energyInfo(latest.energy).label}`;
}

function lowMoodCount7d(checkins = [], now = new Date()) {
  const threshold = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  return checkins.filter((item) => {
    const createdAt = new Date(item.createdAt).getTime();
    if (!Number.isFinite(createdAt) || createdAt < threshold) return false;
    return ["lonely", "anxious", "unwell"].includes(normalizeMood(item.mood));
  }).length;
}

function buildEngagementSnapshot(store = {}, now = new Date()) {
  const latestCheckin = latestItem(store.checkins);
  const latestNote = latestFamilyNote(store.familyNotes);
  const prompt = todayMemoryPrompt(now);

  return {
    memoryPrompt: prompt,
    checkinOptions: Object.entries(CHECKIN_MOODS).map(([id, item]) => ({
      id,
      label: item.label,
      tone: item.tone,
    })),
    energyOptions: Object.entries(ENERGY_LEVELS).map(([id, item]) => ({
      id,
      label: item.label,
    })),
    latestCheckin: latestCheckin
      ? {
          ...latestCheckin,
          moodLabel: moodInfo(latestCheckin.mood).label,
          energyLabel: energyInfo(latestCheckin.energy).label,
        }
      : null,
    latestFamilyNote: latestNote,
    recentMemories: Array.isArray(store.memoryNotes) ? store.memoryNotes.slice(0, 6) : [],
    recentCheckins: Array.isArray(store.checkins)
      ? store.checkins.slice(0, 6).map((item) => ({
          ...item,
          moodLabel: moodInfo(item.mood).label,
          energyLabel: energyInfo(item.energy).label,
        }))
      : [],
    recentFamilyNotes: Array.isArray(store.familyNotes) ? store.familyNotes.slice(0, 6) : [],
    wellbeingSummary: {
      latestLabel: latestCheckinLabel(store.checkins),
      lowMoodCount7d: lowMoodCount7d(store.checkins, now),
      memoryCount: Array.isArray(store.memoryNotes) ? store.memoryNotes.length : 0,
    },
  };
}

function detectScamRisk(message) {
  const text = safeText(message, 500);
  if (!text) return null;
  const matched = SCAM_RULES.find((rule) => rule.regex.test(text));
  if (!matched) return null;

  return {
    type: matched.type,
    label: matched.label,
    level: "high",
    steps: matched.steps,
    reply:
      "这听起来像诈骗套路，您先别转账，也别告诉对方验证码。我建议您马上挂断电话，先联系家人或者银行官方电话核实，我也会把防骗步骤放在页面上。",
    suggestions: ["联系家人核实", "不要透露验证码", "查看防诈骗提示"],
  };
}

module.exports = {
  buildEngagementSnapshot,
  detectScamRisk,
  energyInfo,
  latestFamilyNote,
  moodInfo,
  normalizeEnergy,
  normalizeMood,
  todayMemoryPrompt,
};
