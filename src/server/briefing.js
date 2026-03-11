const {
  BRIEFING_CACHE_TTL_MS,
  NEWS_RSS_URL,
  NEWS_TIMEOUT_MS,
  OPEN_METEO_BASE_URL,
  OPEN_METEO_GEOCODE_URL,
  WEATHER_TIMEOUT_MS,
} = require("./config");
const { safeText } = require("./domain");

const briefingCache = new Map();

const weatherCodeLabels = {
  0: "晴朗",
  1: "大致晴朗",
  2: "局部多云",
  3: "阴天",
  45: "有雾",
  48: "有雾",
  51: "毛毛雨",
  53: "小雨",
  55: "中雨",
  61: "小雨",
  63: "中雨",
  65: "大雨",
  66: "冻雨",
  67: "冻雨",
  71: "小雪",
  73: "中雪",
  75: "大雪",
  80: "阵雨",
  81: "阵雨",
  82: "强阵雨",
  95: "雷阵雨",
  96: "雷阵雨伴冰雹",
  99: "雷阵雨伴冰雹",
};

const negativeNewsKeywords = [
  "事故",
  "遇难",
  "坠落",
  "爆炸",
  "诈骗",
  "杀",
  "战争",
  "冲突",
  "枪击",
  "灾害",
  "暴雨",
  "台风",
  "地震",
  "火灾",
  "抢劫",
  "死亡",
  "身亡",
  "通缉",
  "暴力",
];

const fallbackNews = [
  { title: "社区老年课堂新增手机摄影和戏曲欣赏活动", source: "暖心推荐" },
  { title: "不少社区正在增加适老化改造和便民服务", source: "暖心推荐" },
  { title: "给家人发一段语音问候，往往就是今天最好的好消息", source: "暖心推荐" },
];

function cacheKey(prefix, value) {
  return `${prefix}:${value}`;
}

function readCache(key) {
  const found = briefingCache.get(key);
  if (!found) return null;
  if (Date.now() - found.createdAt > BRIEFING_CACHE_TTL_MS) {
    briefingCache.delete(key);
    return null;
  }
  return found.value;
}

function writeCache(key, value) {
  briefingCache.set(key, {
    createdAt: Date.now(),
    value,
  });
  return value;
}

async function fetchWithTimeout(url, timeoutMs, parseAs = "json") {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: parseAs === "json" ? "application/json" : "application/rss+xml, text/xml, text/plain",
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return parseAs === "text" ? response.text() : response.json();
  } finally {
    clearTimeout(timer);
  }
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function weatherLabel(code) {
  return weatherCodeLabels[Number(code)] || "天气平稳";
}

function coarseLocationFromAddress(address) {
  const raw = safeText(address, 80);
  if (!raw) return "";
  const simplified = raw
    .replace(/[0-9０-９]+号.*$/g, "")
    .replace(/[0-9０-９]+弄.*$/g, "")
    .replace(/[0-9０-９]+室.*$/g, "")
    .replace(/[0-9０-９]+单元.*$/g, "")
    .trim();
  const match = simplified.match(/(.{2,20}(?:市|区|县|旗))/);
  return match ? match[1] : simplified.slice(0, 16);
}

function resolveLocationQuery(profile = {}) {
  const explicit = safeText(profile.location || "", 40);
  if (explicit) return explicit;
  return coarseLocationFromAddress(profile.address);
}

async function geocodeLocation(locationQuery) {
  const query = safeText(locationQuery, 40);
  if (!query) {
    return null;
  }

  const key = cacheKey("geo", query);
  const cached = readCache(key);
  if (cached) return cached;

  const url = `${OPEN_METEO_GEOCODE_URL}/v1/search?name=${encodeURIComponent(query)}&count=1&language=zh&format=json`;
  const data = await fetchWithTimeout(url, WEATHER_TIMEOUT_MS, "json");
  const result = Array.isArray(data?.results) ? data.results[0] : null;
  if (!result) return null;

  return writeCache(key, {
    name: [result.name, result.admin2, result.admin1, result.country].filter(Boolean).join(" "),
    latitude: result.latitude,
    longitude: result.longitude,
    timezone: result.timezone || "Asia/Shanghai",
  });
}

function buildWeatherSuggestion(current, daily) {
  const wind = Number(current?.wind_speed_10m || 0);
  const maxTemp = Math.round(Number(daily?.temperature_2m_max || current?.temperature_2m || 0));
  const minTemp = Math.round(Number(daily?.temperature_2m_min || current?.temperature_2m || 0));
  const rain = Math.round(Number(daily?.precipitation_probability_max || 0));

  if (rain >= 55) {
    return "今天降水概率偏高，出门记得带伞，地面湿滑要慢一点。";
  }
  if (wind >= 22) {
    return "风有点大，适合在家附近活动，别走太远。";
  }
  if (maxTemp >= 31) {
    return "气温偏高，适合早晚散步，中午尽量少晒太阳。";
  }
  if (minTemp <= 6) {
    return "早晚温差比较明显，出门要多穿一件。";
  }
  return "整体天气比较平稳，适合慢慢散步，记得带上水。";
}

async function fetchWeather(profile = {}) {
  const locationQuery = resolveLocationQuery(profile);
  if (!locationQuery) {
    return {
      available: false,
      reason: "missing_location",
      summary: "还没有设置所在城市或区县，您先在资料页补一下，我就能查实时天气了。",
    };
  }

  const cacheId = cacheKey("weather", locationQuery);
  const cached = readCache(cacheId);
  if (cached) return cached;

  try {
    const place = await geocodeLocation(locationQuery);
    if (!place) {
      return {
        available: false,
        reason: "location_not_found",
        summary: `暂时没找到“${locationQuery}”的天气位置，您可以把城市写得简单一点，比如“上海浦东”或“北京海淀”。`,
      };
    }

    const url =
      `${OPEN_METEO_BASE_URL}/v1/forecast?latitude=${encodeURIComponent(place.latitude)}` +
      `&longitude=${encodeURIComponent(place.longitude)}` +
      "&current=temperature_2m,weather_code,wind_speed_10m" +
      "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max" +
      `&timezone=${encodeURIComponent(place.timezone)}`;

    const data = await fetchWithTimeout(url, WEATHER_TIMEOUT_MS, "json");
    const current = data?.current || {};
    const daily = {
      weather_code: data?.daily?.weather_code?.[0],
      temperature_2m_max: data?.daily?.temperature_2m_max?.[0],
      temperature_2m_min: data?.daily?.temperature_2m_min?.[0],
      precipitation_probability_max: data?.daily?.precipitation_probability_max?.[0],
    };

    const currentTemp = Math.round(Number(current.temperature_2m || 0));
    const summary = `${place.name}现在${weatherLabel(current.weather_code)}，大约 ${currentTemp} 度。今天最高 ${Math.round(
      Number(daily.temperature_2m_max || currentTemp)
    )} 度，最低 ${Math.round(Number(daily.temperature_2m_min || currentTemp))} 度。${buildWeatherSuggestion(current, daily)}`;

    return writeCache(cacheId, {
      available: true,
      provider: "open-meteo",
      location: place.name,
      currentTemp,
      condition: weatherLabel(current.weather_code),
      summary,
      detail: {
        windSpeed: Number(current.wind_speed_10m || 0),
        highTemp: Math.round(Number(daily.temperature_2m_max || currentTemp)),
        lowTemp: Math.round(Number(daily.temperature_2m_min || currentTemp)),
        rainProbability: Math.round(Number(daily.precipitation_probability_max || 0)),
      },
    });
  } catch {
    return {
      available: false,
      reason: "weather_unavailable",
      summary: "实时天气暂时没连上，我稍后可以再帮您查一次。您也可以先去资料页确认一下所在城市。",
    };
  }
}

function parseRssItems(xml) {
  const items = [];
  const matches = String(xml || "").match(/<item>([\s\S]*?)<\/item>/g) || [];
  matches.forEach((rawItem) => {
    const titleMatch = rawItem.match(/<title>([\s\S]*?)<\/title>/i);
    const dateMatch = rawItem.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);
    const sourceMatch = rawItem.match(/<source[^>]*>([\s\S]*?)<\/source>/i);
    const title = decodeHtml(titleMatch?.[1] || "").replace(/\s*-\s*Google 新闻\s*$/i, "");
    if (!title) return;
    items.push({
      title,
      publishedAt: decodeHtml(dateMatch?.[1] || ""),
      source: decodeHtml(sourceMatch?.[1] || "新闻播报"),
    });
  });
  return items;
}

function isPositiveNewsItem(item) {
  const title = String(item?.title || "");
  if (!title) return false;
  return !negativeNewsKeywords.some((keyword) => title.includes(keyword));
}

async function fetchPositiveNews() {
  const cached = readCache("news:rss");
  if (cached) return cached;

  try {
    const xml = await fetchWithTimeout(NEWS_RSS_URL, NEWS_TIMEOUT_MS, "text");
    const items = parseRssItems(xml).filter(isPositiveNewsItem).slice(0, 3);
    const result = {
      available: Boolean(items.length),
      provider: "rss",
      items: items.length ? items : fallbackNews,
      summary: items.length
        ? `今天挑了几条相对轻松的消息，比如${items[0].title}。`
        : "今天先给您准备了几条暖心话题，适合轻松看看。",
    };
    return writeCache("news:rss", result);
  } catch {
    return writeCache("news:rss", {
      available: false,
      provider: "fallback",
      items: fallbackNews,
      summary: "今天先给您准备几条暖心消息，内容会比突发新闻更轻松一些。",
    });
  }
}

function nextReminderLine(reminders = []) {
  const item = reminders.find((entry) => entry?.nextDueAt || entry?.enabled);
  if (!item) return "今天暂时没有待办提醒。";
  if (item.repeat === "daily") {
    return `下一条提醒是每天 ${item.time} 的“${item.title}”。`;
  }
  return `下一条提醒是 ${item.scheduleDate || "今天"} ${item.time} 的“${item.title}”。`;
}

async function getDailyBriefing({ profile = {}, reminders = [], now = new Date() } = {}) {
  const [weather, news] = await Promise.all([fetchWeather(profile), fetchPositiveNews()]);
  const greeting = now.getHours() < 11 ? "早上好" : now.getHours() < 18 ? "下午好" : "晚上好";
  const reminderSummary = nextReminderLine(reminders);
  const summary = [
    `${greeting}${profile?.name ? `，${profile.name}` : ""}。`,
    weather.summary,
    reminderSummary,
    news.summary,
  ]
    .filter(Boolean)
    .join("");

  return {
    generatedAt: now.toISOString(),
    weather,
    news,
    reminderSummary,
    summary,
    suggestions: ["今天天气怎么样？适合出门散步吗？", "今天有什么好玩的新闻或笑话吗？", "查看今日安排"],
  };
}

function isWeatherIntent(text) {
  return /(天气|气温|冷不冷|下雨|风大|空气|散步|晒被子|穿什么|出门)/.test(text);
}

function isNewsIntent(text) {
  return /(新闻|新鲜事|有什么好玩的)/.test(text) && !/笑话|段子/.test(text);
}

function isBriefingIntent(text) {
  return /(晨间播报|早报|早晨播报|今天有什么安排|今日安排|今天怎么样)/.test(text);
}

async function buildLiveReply({ message, profile = {}, reminders = [], now = new Date() }) {
  const text = safeText(message, 120);
  if (!text) return null;

  if (isBriefingIntent(text)) {
    const briefing = await getDailyBriefing({ profile, reminders, now });
    return {
      provider: "live-briefing",
      reply: briefing.summary,
      suggestions: briefing.suggestions,
      intent: "daily_briefing",
      briefing,
    };
  }

  if (isWeatherIntent(text)) {
    const weather = await fetchWeather(profile);
    return {
      provider: weather.available ? "live-weather" : "weather-fallback",
      reply: weather.summary,
      suggestions: weather.available
        ? ["今天冷不冷？", "适合出门散步吗？", "查看今日安排"]
        : ["到资料页设置所在城市", "今天有什么好玩的新闻吗？", "查看今日安排"],
      intent: "live_weather",
      briefing: {
        weather,
      },
    };
  }

  if (isNewsIntent(text)) {
    const news = await fetchPositiveNews();
    const topItems = news.items.slice(0, 3).map((item, index) => `第 ${index + 1} 条，${item.title}`);
    return {
      provider: news.available ? "live-news" : "news-fallback",
      reply: [`我给您挑了几条偏轻松、偏正向的消息。`, ...topItems].join(""),
      suggestions: ["再说一条新闻", "给我讲个笑话吧！", "今天适合出门散步吗？"],
      intent: "live_news",
      briefing: {
        news,
      },
    };
  }

  return null;
}

module.exports = {
  buildLiveReply,
  fetchPositiveNews,
  fetchWeather,
  getDailyBriefing,
};
