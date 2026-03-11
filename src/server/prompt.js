const fs = require("fs");
const { AGENT_PROMPT_FILE } = require("./config");
const { buildKnowledgePromptContext } = require("./knowledge");
const { safeText } = require("./domain");

const DEFAULT_PROMPT_PROFILE = {
  version: "1.0.0",
  name: "elder-companion-cn",
  description: "适老化陪伴对话场景 Prompt",
  assistantName: "小孙子/小孙女",
  baseRules: [
    "你是陪伴老人的小孙子或小孙女，面向 60 岁以上老人，用中文回答。",
    "你的回复像耐心的晚辈或照护助手，语气温和、简短、直接，优先使用 2 到 4 句短句。",
    "多用大白话，不堆术语，不长篇大论，不一次性给太多步骤。",
    "不要承诺你已经完成了现实世界动作，除非系统明确告诉你已经执行成功。",
    "如果用户提到提醒、吃药、喝水、复诊、联系家人等动作，请自然回应，但不要自行虚构系统执行结果。",
    "如果用户表达身体不适，不做医疗诊断，不给疾病结论，只给安全、保守、可执行建议。",
  ],
  responseStyle: [
    "先回应情绪，再给下一步建议。",
    "尽量使用一句一意，少用并列长句。",
    "如果用户有称呼，偶尔自然带上称呼，不要每句话都重复。",
  ],
  safetyRules: [
    "涉及胸痛、呼吸困难、晕倒、摔倒、救命等高风险情况时，不要淡化风险，要建议立即求助。",
    "不提供偏方、激进医疗建议、投资建议或法律结论。",
    "如果用户明显焦虑或孤独，先安抚，再鼓励联系可信任的人。",
  ],
  sceneRules: {
    greeting: {
      title: "初次问候",
      keywords: ["你好", "您好", "早上好", "晚上好", "在吗"],
      instructions: [
        "先用爷爷或奶奶称呼对方，再说明你可以陪聊、提醒、联系家人。",
        "首轮回复不要超过 3 句。",
      ],
      suggestions: ["今天天气怎么样？适合出门散步吗？", "我有点闷，能陪我聊聊天吗？", "提醒我待会儿喝水/吃药"],
    },
    loneliness: {
      title: "孤独安抚",
      keywords: ["孤单", "孤独", "寂寞", "难过", "想家", "想孙女", "想儿子", "想女儿"],
      instructions: [
        "先共情，再引导用户继续说想念的人或回忆。",
        "给出一个简单动作建议，例如打电话、发语音、回忆近况。",
      ],
      suggestions: ["我有点闷，能陪我聊聊天吗？", "今天有什么好玩的新闻或笑话吗？", "联系紧急联系人"],
    },
    routine: {
      title: "日常照护",
      keywords: ["吃药", "喝水", "散步", "睡觉", "复诊", "血压", "锻炼"],
      instructions: [
        "保持鼓励语气，建议一步一步做，不要安排过多任务。",
        "如果用户明显想设置提醒，只做口头确认，不要自行捏造提醒结果。",
      ],
      suggestions: ["提醒我待会儿喝水/吃药", "今天天气怎么样？适合出门散步吗？", "我头有点晕/不舒服，该怎么办？"],
    },
    family: {
      title: "家庭联络",
      keywords: ["家人", "儿子", "女儿", "孙女", "孙子", "打电话", "联系家里"],
      instructions: [
        "鼓励用户联系家人，优先建议电话或语音。",
        "不要替用户编造家人近况。",
      ],
      suggestions: ["联系紧急联系人", "我有点闷，能陪我聊聊天吗？", "怎么用手机给儿子打视频？"],
    },
    encouragement: {
      title: "积极鼓励",
      keywords: ["害怕", "担心", "没精神", "不开心", "睡不着", "烦"],
      instructions: [
        "先安抚情绪，再给一个很小、可立即执行的建议。",
        "不要否定用户感受，不要说教。",
      ],
      suggestions: ["我有点闷，能陪我聊聊天吗？", "今天有什么好玩的新闻或笑话吗？", "联系紧急联系人"],
    },
    memory_support: {
      title: "记忆辅助",
      keywords: ["忘了", "记不住", "不记得", "刚才说到哪", "我忘记了"],
      instructions: [
        "帮助用户回到当前话题，重复重点时要简洁。",
        "如果适合，用编号或两步以内提示帮助理解。",
      ],
      suggestions: ["提醒我待会儿喝水/吃药", "今天天气怎么样？适合出门散步吗？", "我有点闷，能陪我聊聊天吗？"],
    },
  },
  suggestionPacks: {
    default: ["今天天气怎么样？适合出门散步吗？", "我有点闷，能陪我聊聊天吗？", "今天有什么好玩的新闻或笑话吗？"],
  },
  tts: {
    instructions: "请用普通话输出，语速稍慢，语气温暖、耐心、清晰，像家人陪伴老人说话。",
  },
};

let cachedPromptProfile = {
  cacheKey: "",
  profile: DEFAULT_PROMPT_PROFILE,
  source: "default",
  lastError: "",
};

function normalizeStringArray(value, fallback = [], maxItemLen = 200) {
  if (!Array.isArray(value)) return [...fallback];
  const items = value
    .map((item) => safeText(String(item || ""), maxItemLen))
    .filter(Boolean);
  return items.length ? items : [...fallback];
}

function normalizeSceneRule(sceneId, rawRule = {}) {
  const defaultRule = DEFAULT_PROMPT_PROFILE.sceneRules[sceneId] || {
    title: sceneId,
    keywords: [],
    instructions: [],
    suggestions: [],
  };

  return {
    id: sceneId,
    title: safeText(rawRule.title || defaultRule.title || sceneId, 40),
    keywords: normalizeStringArray(rawRule.keywords, defaultRule.keywords, 24),
    instructions: normalizeStringArray(rawRule.instructions, defaultRule.instructions, 200),
    suggestions: normalizeStringArray(rawRule.suggestions, defaultRule.suggestions, 30),
  };
}

function normalizeSuggestionPacks(rawPacks = {}) {
  const normalized = {};
  const source =
    rawPacks && typeof rawPacks === "object" && !Array.isArray(rawPacks)
      ? rawPacks
      : DEFAULT_PROMPT_PROFILE.suggestionPacks;

  Object.entries(source).forEach(([key, value]) => {
    normalized[key] = normalizeStringArray(value, DEFAULT_PROMPT_PROFILE.suggestionPacks.default, 30);
  });

  if (!normalized.default || !normalized.default.length) {
    normalized.default = [...DEFAULT_PROMPT_PROFILE.suggestionPacks.default];
  }

  return normalized;
}

function normalizePromptProfile(rawProfile = {}) {
  const rawScenes =
    rawProfile.sceneRules && typeof rawProfile.sceneRules === "object" && !Array.isArray(rawProfile.sceneRules)
      ? rawProfile.sceneRules
      : DEFAULT_PROMPT_PROFILE.sceneRules;

  const sceneRules = {};
  Object.entries(rawScenes).forEach(([sceneId, rule]) => {
    sceneRules[sceneId] = normalizeSceneRule(sceneId, rule);
  });

  return {
    version: safeText(rawProfile.version || DEFAULT_PROMPT_PROFILE.version, 20),
    name: safeText(rawProfile.name || DEFAULT_PROMPT_PROFILE.name, 40),
    description: safeText(rawProfile.description || DEFAULT_PROMPT_PROFILE.description, 120),
    assistantName: safeText(rawProfile.assistantName || DEFAULT_PROMPT_PROFILE.assistantName, 30),
    baseRules: normalizeStringArray(rawProfile.baseRules, DEFAULT_PROMPT_PROFILE.baseRules, 200),
    responseStyle: normalizeStringArray(rawProfile.responseStyle, DEFAULT_PROMPT_PROFILE.responseStyle, 200),
    safetyRules: normalizeStringArray(rawProfile.safetyRules, DEFAULT_PROMPT_PROFILE.safetyRules, 200),
    sceneRules,
    suggestionPacks: normalizeSuggestionPacks(rawProfile.suggestionPacks),
    tts: {
      instructions: safeText(
        rawProfile?.tts?.instructions || DEFAULT_PROMPT_PROFILE.tts.instructions,
        240
      ),
    },
  };
}

function readPromptProfile() {
  try {
    const stat = fs.statSync(AGENT_PROMPT_FILE);
    const cacheKey = `${AGENT_PROMPT_FILE}:${stat.mtimeMs}:${stat.size}`;
    if (cachedPromptProfile.cacheKey === cacheKey) {
      return cachedPromptProfile;
    }

    const raw = JSON.parse(fs.readFileSync(AGENT_PROMPT_FILE, "utf8"));
    cachedPromptProfile = {
      cacheKey,
      profile: normalizePromptProfile(raw),
      source: "file",
      lastError: "",
    };
    return cachedPromptProfile;
  } catch (error) {
    cachedPromptProfile = {
      cacheKey: "",
      profile: DEFAULT_PROMPT_PROFILE,
      source: "default",
      lastError: error instanceof Error ? error.message : "load_failed",
    };
    return cachedPromptProfile;
  }
}

function loadPromptProfile() {
  const loaded = readPromptProfile();
  return {
    ...loaded.profile,
    meta: {
      filePath: AGENT_PROMPT_FILE,
      source: loaded.source,
      lastError: loaded.lastError,
      version: loaded.profile.version,
      name: loaded.profile.name,
    },
  };
}

function buildProfileSummary(profile = {}) {
  const items = [
    profile.name ? `称呼：${profile.name}` : "",
    profile.age ? `年龄：${profile.age}` : "",
    profile.preferences ? `偏好：${profile.preferences}` : "",
    profile.notes ? `备注：${profile.notes}` : "",
    profile.address ? `地址：${profile.address}` : "",
    profile.emergencyContactName ? `紧急联系人：${profile.emergencyContactName}` : "",
  ].filter(Boolean);
  return items.join("；");
}

function matchPromptScenes(message, promptProfile = loadPromptProfile()) {
  const text = safeText(message, 500).toLowerCase();
  if (!text) return [];

  return Object.values(promptProfile.sceneRules)
    .filter((scene) => scene.keywords.some((keyword) => text.includes(keyword.toLowerCase())))
    .slice(0, 3);
}

function dedupeSuggestions(list = []) {
  const seen = new Set();
  const result = [];
  list.forEach((item) => {
    const value = safeText(item, 30);
    if (!value || seen.has(value)) return;
    seen.add(value);
    result.push(value);
  });
  return result.slice(0, 4);
}

function buildPromptPlan({ message, profile = {} }) {
  const promptProfile = loadPromptProfile();
  const matchedScenes = matchPromptScenes(message, promptProfile);
  const profileSummary = buildProfileSummary(profile);
  const suggestions = dedupeSuggestions([
    ...matchedScenes.flatMap((scene) => scene.suggestions),
    ...(promptProfile.suggestionPacks.default || []),
  ]);

  const sections = [
    `你是“${promptProfile.assistantName}”。`,
    "基础规则：",
    ...promptProfile.baseRules.map((item) => `- ${item}`),
    "回复风格：",
    ...promptProfile.responseStyle.map((item) => `- ${item}`),
    "安全边界：",
    ...promptProfile.safetyRules.map((item) => `- ${item}`),
  ];

  if (profileSummary) {
    sections.push(`当前用户资料：${profileSummary}`);
  }

  if (matchedScenes.length) {
    sections.push(`当前会话场景：${matchedScenes.map((scene) => scene.title).join("、")}`);
    matchedScenes.forEach((scene) => {
      sections.push(`[${scene.title}]`);
      scene.instructions.forEach((item) => sections.push(`- ${item}`));
    });
  }

  const knowledgeContext = buildKnowledgePromptContext(message, 3);
  if (knowledgeContext) {
    sections.push("以下是系统知识库中的参考回答，请优先保持这些风格和事实边界，不要胡乱发挥：");
    sections.push(knowledgeContext);
  }

  return {
    promptProfile,
    systemPrompt: sections.join("\n"),
    sceneIds: matchedScenes.map((scene) => scene.id),
    sceneTitles: matchedScenes.map((scene) => scene.title),
    suggestions: suggestions.length ? suggestions : [...DEFAULT_PROMPT_PROFILE.suggestionPacks.default],
  };
}

function getPromptProfileView() {
  const promptProfile = loadPromptProfile();
  return {
    meta: promptProfile.meta,
    assistantName: promptProfile.assistantName,
    description: promptProfile.description,
    baseRules: promptProfile.baseRules,
    responseStyle: promptProfile.responseStyle,
    safetyRules: promptProfile.safetyRules,
    tts: promptProfile.tts,
    scenes: Object.values(promptProfile.sceneRules).map((scene) => ({
      id: scene.id,
      title: scene.title,
      keywords: scene.keywords,
      instructions: scene.instructions,
      suggestions: scene.suggestions,
    })),
    suggestionPacks: promptProfile.suggestionPacks,
  };
}

module.exports = {
  buildPromptPlan,
  buildProfileSummary,
  getPromptProfileView,
  loadPromptProfile,
  matchPromptScenes,
};
