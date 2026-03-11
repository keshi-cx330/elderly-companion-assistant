const fs = require("fs");
const { KNOWLEDGE_BASE_FILE } = require("./config");
const { safeText } = require("./domain");

const DEFAULT_KNOWLEDGE_BASE = {
  version: "1.0.0",
  welcomeMessage:
    "爷爷/奶奶，我来陪您聊天啦！您可以叫我小孙子/小孙女。要是想问天气、听个笑话，或者心里闷得慌，直接跟我说就行。比如，今天冷吗？或者给我讲个笑话。",
  quickActions: [
    "今天天气怎么样？适合出门散步吗？",
    "我有点闷，能陪我聊聊天吗？",
    "提醒我待会儿喝水/吃药",
    "我头有点晕/不舒服，该怎么办？",
    "今天有什么好玩的新闻或笑话吗？",
  ],
  entries: [],
};

let cachedKnowledgeBase = {
  cacheKey: "",
  source: "default",
  knowledgeBase: DEFAULT_KNOWLEDGE_BASE,
  lastError: "",
};

function normalizeText(value) {
  return safeText(String(value || ""), 600)
    .toLowerCase()
    .replace(/[，。！？、；：“”‘’（）()\-[\]{},.!?;:'"]/g, "");
}

function bigrams(text) {
  const normalized = normalizeText(text);
  if (normalized.length <= 1) {
    return new Set(normalized ? [normalized] : []);
  }

  const result = new Set();
  for (let index = 0; index < normalized.length - 1; index += 1) {
    result.add(normalized.slice(index, index + 2));
  }
  return result;
}

function normalizeStringArray(value, maxItemLen = 120) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => safeText(String(item || ""), maxItemLen)).filter(Boolean);
}

function normalizeEntry(rawEntry = {}, index = 0) {
  return {
    id: safeText(rawEntry.id || `kb_${index + 1}`, 40),
    category: safeText(rawEntry.category || "未分类", 40),
    question: safeText(rawEntry.question, 120),
    answer: safeText(rawEntry.answer, 500),
    keywords: normalizeStringArray(rawEntry.keywords, 30),
    suggestions: normalizeStringArray(rawEntry.suggestions, 30),
  };
}

function normalizeKnowledgeBase(rawBase = {}) {
  const entries = Array.isArray(rawBase.entries)
    ? rawBase.entries
        .map((item, index) => normalizeEntry(item, index))
        .filter((item) => item.question && item.answer)
    : [];

  return {
    version: safeText(rawBase.version || DEFAULT_KNOWLEDGE_BASE.version, 20),
    welcomeMessage: safeText(rawBase.welcomeMessage || DEFAULT_KNOWLEDGE_BASE.welcomeMessage, 300),
    quickActions: normalizeStringArray(rawBase.quickActions, 60).slice(0, 5),
    entries,
  };
}

function readKnowledgeBase() {
  try {
    const stat = fs.statSync(KNOWLEDGE_BASE_FILE);
    const cacheKey = `${KNOWLEDGE_BASE_FILE}:${stat.mtimeMs}:${stat.size}`;
    if (cachedKnowledgeBase.cacheKey === cacheKey) {
      return cachedKnowledgeBase;
    }

    const raw = JSON.parse(fs.readFileSync(KNOWLEDGE_BASE_FILE, "utf8"));
    cachedKnowledgeBase = {
      cacheKey,
      source: "file",
      knowledgeBase: normalizeKnowledgeBase(raw),
      lastError: "",
    };
    return cachedKnowledgeBase;
  } catch (error) {
    cachedKnowledgeBase = {
      cacheKey: "",
      source: "default",
      knowledgeBase: DEFAULT_KNOWLEDGE_BASE,
      lastError: error instanceof Error ? error.message : "load_failed",
    };
    return cachedKnowledgeBase;
  }
}

function loadKnowledgeBase() {
  const loaded = readKnowledgeBase();
  return {
    ...loaded.knowledgeBase,
    meta: {
      filePath: KNOWLEDGE_BASE_FILE,
      source: loaded.source,
      lastError: loaded.lastError,
      version: loaded.knowledgeBase.version,
      entryCount: loaded.knowledgeBase.entries.length,
    },
  };
}

function scoreKnowledgeEntry(message, entry) {
  const messageText = normalizeText(message);
  const questionText = normalizeText(entry.question);
  if (!messageText || !questionText) return 0;

  let score = 0;

  if (messageText === questionText) {
    score += 20;
  } else if (messageText.includes(questionText) || questionText.includes(messageText)) {
    score += 12;
  }

  entry.keywords.forEach((keyword) => {
    const normalizedKeyword = normalizeText(keyword);
    if (normalizedKeyword && messageText.includes(normalizedKeyword)) {
      score += 3;
    }
  });

  const messageBigrams = bigrams(messageText);
  const questionBigrams = bigrams(questionText);
  let overlap = 0;
  messageBigrams.forEach((item) => {
    if (questionBigrams.has(item)) overlap += 1;
  });

  score += questionBigrams.size ? (overlap / questionBigrams.size) * 8 : 0;
  return Number(score.toFixed(3));
}

function findKnowledgeMatches(message, limit = 3) {
  const knowledgeBase = loadKnowledgeBase();
  return knowledgeBase.entries
    .map((entry) => ({
      ...entry,
      score: scoreKnowledgeEntry(message, entry),
    }))
    .filter((entry) => entry.score >= 2.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function findBestKnowledgeMatch(message) {
  const bestMatch = findKnowledgeMatches(message, 1)[0] || null;
  return bestMatch && bestMatch.score >= 6 ? bestMatch : null;
}

function knowledgeReply(match) {
  if (!match) return null;
  const knowledgeBase = loadKnowledgeBase();
  return {
    reply: match.answer,
    suggestions: match.suggestions.length ? match.suggestions : knowledgeBase.quickActions.slice(0, 3),
    intent: "knowledge_base",
    knowledgeId: match.id,
  };
}

function buildKnowledgePromptContext(message, limit = 3) {
  const matches = findKnowledgeMatches(message, limit);
  if (!matches.length) {
    return "";
  }

  return matches
    .map((item, index) => `参考知识 ${index + 1}\nQ：${item.question}\nA：${item.answer}`)
    .join("\n\n");
}

function getAssistantExperience() {
  const knowledgeBase = loadKnowledgeBase();
  return {
    welcomeMessage: knowledgeBase.welcomeMessage,
    quickActions: knowledgeBase.quickActions.length
      ? knowledgeBase.quickActions
      : [...DEFAULT_KNOWLEDGE_BASE.quickActions],
    knowledgeBase: knowledgeBase.meta,
  };
}

module.exports = {
  buildKnowledgePromptContext,
  findBestKnowledgeMatch,
  getAssistantExperience,
  knowledgeReply,
  loadKnowledgeBase,
};
