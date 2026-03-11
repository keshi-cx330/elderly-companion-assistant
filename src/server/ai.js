const {
  DEEPSEEK_API_KEY,
  DEEPSEEK_BASE_URL,
  DEEPSEEK_MAX_HISTORY,
  DEEPSEEK_MAX_TOKENS,
  DEEPSEEK_MODEL,
  DEEPSEEK_TIMEOUT_MS,
} = require("./config");
const { buildPromptPlan, loadPromptProfile } = require("./prompt");
const { isCloudAsrEnabled, isCloudTtsEnabled } = require("./speech");
const { safeText } = require("./domain");

function isDeepSeekEnabled() {
  return Boolean(DEEPSEEK_API_KEY);
}

function aiCapabilities() {
  const promptProfile = loadPromptProfile();
  return {
    chatProvider: isDeepSeekEnabled() ? "deepseek" : "local-rule",
    chatProviderLabel: isDeepSeekEnabled() ? `DeepSeek (${DEEPSEEK_MODEL})` : "本地规则回复",
    chatConfigured: isDeepSeekEnabled(),
    promptProfile: promptProfile.meta.name,
    promptVersion: promptProfile.meta.version,
    promptSource: promptProfile.meta.source,
    asrProvider: isCloudAsrEnabled() ? "openai-compatible-asr" : "browser-web-speech",
    asrLabel: isCloudAsrEnabled() ? "云端语音识别（OpenAI Compatible）" : "浏览器语音识别",
    asrConfigured: isCloudAsrEnabled(),
    asrFallbackLabel: "浏览器语音识别",
    ttsProvider: isCloudTtsEnabled() ? "openai-compatible-tts" : "browser-speech-synthesis",
    ttsLabel: isCloudTtsEnabled() ? "云端语音播报（OpenAI Compatible）" : "浏览器语音播报",
    ttsConfigured: isCloudTtsEnabled(),
    ttsFallbackLabel: "浏览器语音播报",
  };
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

function buildDeepSeekMessages({ history = [], message, promptPlan }) {
  return [
    {
      role: "system",
      content: promptPlan.systemPrompt,
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

  const promptPlan = buildPromptPlan({ message, profile });
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
        messages: buildDeepSeekMessages({ history, message, promptPlan }),
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
      suggestions: promptPlan.suggestions,
      promptScenes: promptPlan.sceneIds,
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
