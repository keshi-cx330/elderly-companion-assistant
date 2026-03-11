const {
  DEEPSEEK_API_KEY,
  DEEPSEEK_BASE_URL,
  DEEPSEEK_MAX_HISTORY,
  DEEPSEEK_MAX_TOKENS,
  DEEPSEEK_MODEL,
  DEEPSEEK_TIMEOUT_MS,
} = require("./config");
const { safeText } = require("./domain");

function isDeepSeekEnabled() {
  return Boolean(DEEPSEEK_API_KEY);
}

function aiCapabilities() {
  return {
    chatProvider: isDeepSeekEnabled() ? "deepseek" : "local-rule",
    chatProviderLabel: isDeepSeekEnabled() ? `DeepSeek (${DEEPSEEK_MODEL})` : "本地规则回复",
    chatConfigured: isDeepSeekEnabled(),
    asrProvider: "browser-web-speech",
    asrLabel: "浏览器语音识别",
    ttsProvider: "browser-speech-synthesis",
    ttsLabel: "浏览器语音播报",
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

function buildSystemPrompt(profile = {}) {
  const profileSummary = buildProfileSummary(profile);
  const baseRules = [
    "你是“老人陪伴助手”，面向 60 岁以上老人，用中文回答。",
    "你的回复要像耐心的晚辈或照护助手，语气温和、简短、直接，优先使用 2 到 4 句短句。",
    "不要输出复杂术语，不要长篇大论，不要堆叠很多选项。",
    "如涉及健康不适，不做医疗诊断，不给出疾病结论，只给出安全、保守、可执行建议。",
    "如果用户表达孤独、焦虑、难过，先安抚，再引导他继续说。",
    "如果用户要提醒、吃药、喝水、复诊相关内容，不要自己虚构提醒结果，因为系统会单独处理提醒创建；你只需自然确认和安抚即可。",
    "如果用户想联系家人，鼓励其使用紧急联系人按钮或直接拨打电话。",
    "保持适老化表达：大白话、短句、一步一步说。",
  ];

  if (profileSummary) {
    baseRules.push(`当前用户资料：${profileSummary}`);
  }

  return baseRules.join("\n");
}

function trimConversationHistory(history = []) {
  return history
    .filter((item) => item && (item.role === "user" || item.role === "assistant") && item.content)
    .slice(-DEEPSEEK_MAX_HISTORY)
    .map((item) => ({
      role: item.role,
      content: safeText(item.content, 500),
    }));
}

function buildDeepSeekMessages({ history = [], message, profile }) {
  return [
    {
      role: "system",
      content: buildSystemPrompt(profile),
    },
    ...trimConversationHistory(history),
    {
      role: "user",
      content: safeText(message, 500),
    },
  ];
}

async function createDeepSeekReply({ history = [], message, profile }) {
  if (!isDeepSeekEnabled()) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEEPSEEK_TIMEOUT_MS);

  try {
    const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        stream: false,
        temperature: 0.6,
        max_tokens: DEEPSEEK_MAX_TOKENS,
        messages: buildDeepSeekMessages({ history, message, profile }),
      }),
      signal: controller.signal,
    });

    const rawText = await response.text();
    let data = null;
    try {
      data = rawText ? JSON.parse(rawText) : null;
    } catch {
      data = null;
    }

    if (!response.ok) {
      const detail =
        data?.error?.message || data?.error?.code || data?.message || rawText.slice(0, 200) || `HTTP ${response.status}`;
      throw new Error(`DeepSeek API ${response.status}: ${detail}`);
    }

    const reply = safeText(data?.choices?.[0]?.message?.content || "", 800);
    if (!reply) {
      throw new Error("DeepSeek 返回内容为空");
    }

    return {
      provider: "deepseek",
      model: data?.model || DEEPSEEK_MODEL,
      reply,
      usage: data?.usage || null,
    };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  aiCapabilities,
  createDeepSeekReply,
  isDeepSeekEnabled,
};
