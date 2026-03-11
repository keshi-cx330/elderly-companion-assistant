const state = {
  profile: {},
  settings: {
    autoSpeak: true,
    largeText: true,
    reminderVoice: true,
    interfaceMode: "elder",
    reducedMotion: false,
    caregiverDigestEnabled: false,
    caregiverDigestHour: "08:30",
  },
  reminders: [],
  logs: [],
  conversations: [],
  dashboard: {},
  briefing: {
    summary: "正在生成今日晨间播报...",
    weather: null,
    news: {
      items: [],
    },
    reminderSummary: "",
  },
  caregiver: {
    configured: false,
    contact: {},
    webhookCount: 0,
    digestEnabled: false,
    digestHour: "08:30",
    lastDigestDate: "",
  },
  ai: {
    chatConfigured: false,
    chatProviderLabel: "本地规则回复",
    promptProfile: "elder-companion-cn",
    asrLabel: "浏览器语音识别",
    asrConfigured: false,
    ttsLabel: "浏览器语音播报",
    ttsConfigured: false,
  },
  welcomeMessage:
    "爷爷/奶奶，我来陪您聊天啦！您可以叫我小孙子/小孙女。要是想问天气、听个笑话，或者心里闷得慌，直接跟我说就行。比如，今天冷吗？或者给我讲个笑话。",
  quickActions: [
    "今天天气怎么样？适合出门散步吗？",
    "我有点闷，能陪我聊聊天吗？",
    "提醒我待会儿喝水/吃药",
    "我头有点晕/不舒服，该怎么办？",
    "今天有什么好玩的新闻或笑话吗？",
  ],
  activeEmergency: null,
};

const refs = {
  heroStatus: document.querySelector("#hero-status"),
  heroNextReminder: document.querySelector("#hero-next-reminder"),
  heroContactName: document.querySelector("#hero-contact-name"),
  heroAddress: document.querySelector("#hero-address"),
  heroVoiceMode: document.querySelector("#hero-voice-mode"),
  heroSos: document.querySelector("#hero-sos"),
  chatList: document.querySelector("#chat-list"),
  quickActions: document.querySelector("#quick-actions"),
  chatForm: document.querySelector("#chat-form"),
  chatInput: document.querySelector("#chat-input"),
  chatClear: document.querySelector("#chat-clear"),
  voiceBtn: document.querySelector("#voice-btn"),
  voiceStatus: document.querySelector("#voice-status"),
  reminderForm: document.querySelector("#reminder-form"),
  reminderTitle: document.querySelector("#reminder-title"),
  reminderTime: document.querySelector("#reminder-time"),
  reminderRepeat: document.querySelector("#reminder-repeat"),
  reminderDate: document.querySelector("#reminder-date"),
  onceDateWrap: document.querySelector("#once-date-wrap"),
  todayReminders: document.querySelector("#today-reminders"),
  reminderList: document.querySelector("#reminder-list"),
  profileForm: document.querySelector("#profile-form"),
  profileName: document.querySelector("#profile-name"),
  profileAge: document.querySelector("#profile-age"),
  profilePreferences: document.querySelector("#profile-preferences"),
  profileNotes: document.querySelector("#profile-notes"),
  profileAddress: document.querySelector("#profile-address"),
  profileLocation: document.querySelector("#profile-location"),
  profileContactName: document.querySelector("#profile-contact-name"),
  profileContactPhone: document.querySelector("#profile-contact-phone"),
  profileCaregiverRelation: document.querySelector("#profile-caregiver-relation"),
  profileCaregiverName: document.querySelector("#profile-caregiver-name"),
  profileCaregiverPhone: document.querySelector("#profile-caregiver-phone"),
  profileCaregiverWebhook: document.querySelector("#profile-caregiver-webhook"),
  settingsAutoSpeak: document.querySelector("#settings-auto-speak"),
  settingsLargeText: document.querySelector("#settings-large-text"),
  settingsReminderVoice: document.querySelector("#settings-reminder-voice"),
  settingsInterfaceMode: document.querySelector("#settings-interface-mode"),
  settingsReducedMotion: document.querySelector("#settings-reduced-motion"),
  settingsCaregiverDigest: document.querySelector("#settings-caregiver-digest"),
  settingsCaregiverDigestHour: document.querySelector("#settings-caregiver-digest-hour"),
  briefingMeta: document.querySelector("#briefing-meta"),
  briefingSummary: document.querySelector("#briefing-summary"),
  briefingWeather: document.querySelector("#briefing-weather"),
  briefingReminder: document.querySelector("#briefing-reminder"),
  briefingNews: document.querySelector("#briefing-news"),
  briefingPlay: document.querySelector("#briefing-play"),
  briefingRefresh: document.querySelector("#briefing-refresh"),
  caregiverStatus: document.querySelector("#caregiver-status"),
  caregiverDigestTime: document.querySelector("#caregiver-digest-time"),
  caregiverWebhookCount: document.querySelector("#caregiver-webhook-count"),
  caregiverContact: document.querySelector("#caregiver-contact"),
  sendDigest: document.querySelector("#send-digest"),
  testCaregiverNotify: document.querySelector("#test-caregiver-notify"),
  sumChat: document.querySelector("#sum-chat"),
  sumEmergency: document.querySelector("#sum-emergency"),
  sumReminder: document.querySelector("#sum-reminder"),
  sumEnabled: document.querySelector("#sum-enabled"),
  sumNext: document.querySelector("#sum-next"),
  sumLastEmergency: document.querySelector("#sum-last-emergency"),
  familyAlert: document.querySelector("#family-alert"),
  logType: document.querySelector("#log-type"),
  logLevel: document.querySelector("#log-level"),
  logSearch: document.querySelector("#log-search"),
  refreshLogs: document.querySelector("#refresh-logs"),
  logList: document.querySelector("#log-list"),
  navItems: document.querySelectorAll(".nav-item"),
  panels: {
    chat: document.querySelector("#panel-chat"),
    reminder: document.querySelector("#panel-reminder"),
    profile: document.querySelector("#panel-profile"),
    family: document.querySelector("#panel-family"),
  },
  emergencyModal: document.querySelector("#emergency-modal"),
  emergencyTitle: document.querySelector("#emergency-title"),
  emergencySummary: document.querySelector("#emergency-summary"),
  emergencySteps: document.querySelector("#emergency-steps"),
  call120: document.querySelector("#call-120"),
  callContact: document.querySelector("#call-contact"),
  reportEmergency: document.querySelector("#report-emergency"),
  closeEmergency: document.querySelector("#close-emergency"),
};

let recognition = null;
let recognitionActive = false;
let voiceButtonBound = false;
let logSearchTimer = null;
let mediaRecorder = null;
let mediaRecorderStream = null;
let mediaRecorderChunks = [];
let mediaRecorderMimeType = "";
let cloudRecordingActive = false;
let cloudRecordingTimer = null;
let cloudSpeechAudio = null;
let cloudSpeechAudioUrl = "";
const reminderMarks = new Map();

const CLOUD_RECORD_LIMIT_MS = 9000;
const CLOUD_RECORD_AUDIO_BITS_PER_SEC = 24000;

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(
    2,
    "0"
  )} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function createTextNode(tag, text, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = text;
  return node;
}

function showToast(text) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}

async function readErrorMessage(response, fallback = "请求失败") {
  const data = await response.json().catch(() => ({}));
  return data.error || fallback;
}

function browserSpeechRecognitionSupported() {
  return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

function browserTtsSupported() {
  return Boolean(window.speechSynthesis && window.SpeechSynthesisUtterance);
}

function mediaRecorderSupported() {
  return Boolean(window.MediaRecorder && navigator.mediaDevices?.getUserMedia);
}

function clearCloudSpeechAudio() {
  if (cloudSpeechAudio) {
    cloudSpeechAudio.pause();
    cloudSpeechAudio.src = "";
    cloudSpeechAudio = null;
  }
  if (cloudSpeechAudioUrl) {
    URL.revokeObjectURL(cloudSpeechAudioUrl);
    cloudSpeechAudioUrl = "";
  }
}

function stopSpeechPlayback() {
  if (browserTtsSupported()) {
    window.speechSynthesis.cancel();
  }
  clearCloudSpeechAudio();
}

function speakWithBrowser(text) {
  if (!browserTtsSupported() || !text) return;
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "zh-CN";
  utter.rate = 0.94;
  utter.pitch = 1;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utter);
}

async function speakWithCloud(text) {
  const response = await fetch("/api/speech/speak", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "语音播报失败"));
  }

  const blob = await response.blob();
  if (!blob.size) {
    throw new Error("语音播报内容为空");
  }

  stopSpeechPlayback();
  cloudSpeechAudioUrl = URL.createObjectURL(blob);
  cloudSpeechAudio = new Audio(cloudSpeechAudioUrl);
  cloudSpeechAudio.onended = () => clearCloudSpeechAudio();
  cloudSpeechAudio.onerror = () => clearCloudSpeechAudio();
  await cloudSpeechAudio.play();
}

async function speak(text, mode = "reply") {
  if (!text) return;
  if (mode === "reply" && !state.settings.autoSpeak) return;
  if (mode === "reminder" && !state.settings.reminderVoice) return;

  if (state.ai.ttsConfigured) {
    try {
      await speakWithCloud(text);
      return;
    } catch (error) {
      if (!browserTtsSupported()) {
        showToast(error.message);
        return;
      }
      showToast("云端播报失败，已回退本地播报");
    }
  }

  speakWithBrowser(text);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
    },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "请求失败");
  }
  return data;
}

function setHeroStatus(text, isError = false) {
  refs.heroStatus.textContent = text;
  refs.heroStatus.style.color = isError ? "#ffd4db" : "#dff6ff";
}

function setPanel(target) {
  Object.entries(refs.panels).forEach(([key, panel]) => {
    panel.classList.toggle("active", key === target);
  });
  refs.navItems.forEach((item) => item.classList.toggle("active", item.dataset.target === target));
}

function applySettingsToUi() {
  document.body.classList.toggle("large-text", Boolean(state.settings.largeText));
  document.body.classList.toggle("mode-elder", (state.settings.interfaceMode || "elder") === "elder");
  document.body.classList.toggle("mode-family", (state.settings.interfaceMode || "elder") === "family");
  document.body.classList.toggle("reduced-motion", Boolean(state.settings.reducedMotion));
  refs.heroVoiceMode.textContent = state.settings.autoSpeak ? "已开启" : "已关闭";
  refs.settingsAutoSpeak.checked = Boolean(state.settings.autoSpeak);
  refs.settingsLargeText.checked = Boolean(state.settings.largeText);
  refs.settingsReminderVoice.checked = Boolean(state.settings.reminderVoice);
  refs.settingsInterfaceMode.value = state.settings.interfaceMode || "elder";
  refs.settingsReducedMotion.checked = Boolean(state.settings.reducedMotion);
  refs.settingsCaregiverDigest.checked = Boolean(state.settings.caregiverDigestEnabled);
  refs.settingsCaregiverDigestHour.value = state.settings.caregiverDigestHour || "08:30";
}

function fillProfileForm() {
  refs.profileName.value = state.profile.name || "";
  refs.profileAge.value = state.profile.age || "";
  refs.profilePreferences.value = state.profile.preferences || "";
  refs.profileNotes.value = state.profile.notes || "";
  refs.profileAddress.value = state.profile.address || "";
  refs.profileLocation.value = state.profile.location || "";
  refs.profileContactName.value = state.profile.emergencyContactName || "";
  refs.profileContactPhone.value = state.profile.emergencyContactPhone || "";
  refs.profileCaregiverRelation.value = state.profile.caregiverRelation || "";
  refs.profileCaregiverName.value = state.profile.caregiverName || "";
  refs.profileCaregiverPhone.value = state.profile.caregiverPhone || "";
  refs.profileCaregiverWebhook.value = state.profile.caregiverWebhookUrl || "";
}

function updateHero() {
  refs.heroNextReminder.textContent = state.dashboard.nextReminderLabel || "暂无已启用提醒";
  refs.heroContactName.textContent = state.profile.emergencyContactName || "未设置";
  refs.heroAddress.textContent = state.profile.address || "未设置";
  refs.heroVoiceMode.textContent = state.settings.autoSpeak ? "已开启" : "已关闭";
}

function renderBriefing() {
  const briefing = state.briefing || {};
  refs.briefingMeta.textContent =
    briefing.generatedAt ? `更新于 ${formatDateTime(briefing.generatedAt)}` : "整理今天天气、安排和暖心资讯";
  refs.briefingSummary.textContent = briefing.summary || "今天先慢一点，我来帮您整理安排。";
  refs.briefingWeather.textContent = briefing.weather?.summary || "还没查到天气";
  refs.briefingReminder.textContent = briefing.reminderSummary || "今天暂时没有待办提醒";
  refs.briefingNews.innerHTML = "";

  const items = Array.isArray(briefing.news?.items) ? briefing.news.items.slice(0, 3) : [];
  if (!items.length) {
    refs.briefingNews.innerHTML = '<article class="news-item">还没有新的暖心资讯，稍后刷新试试。</article>';
    return;
  }

  items.forEach((item) => {
    const article = document.createElement("article");
    article.className = "news-item";
    article.appendChild(createTextNode("strong", item.title || "暖心资讯"));
    article.appendChild(createTextNode("span", item.source || "晨间播报"));
    refs.briefingNews.appendChild(article);
  });
}

function renderCaregiverStatus() {
  const caregiver = state.caregiver || {};
  refs.caregiverStatus.textContent = caregiver.configured
    ? caregiver.webhookCount
      ? "已接通自动通知"
      : "已设置家属联系人，尚未接 webhook"
    : "尚未配置家属通知";
  refs.caregiverDigestTime.textContent = caregiver.digestEnabled
    ? `${caregiver.digestHour || "08:30"} 自动准备摘要`
    : "当前未开启每日摘要";
  refs.caregiverWebhookCount.textContent = String(caregiver.webhookCount || 0);
  const contactParts = [caregiver.contact?.relation, caregiver.contact?.name, caregiver.contact?.phone].filter(Boolean);
  refs.caregiverContact.textContent = contactParts.length ? contactParts.join(" · ") : "未设置";
}

function renderQuickActions(actions = state.quickActions) {
  refs.quickActions.innerHTML = "";
  actions.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "quick-chip";
    button.textContent = item;
    button.addEventListener("click", () => {
      if (item === "查看今日安排") {
        setPanel("reminder");
        return;
      }
      if (item === "更新紧急联系人") {
        setPanel("profile");
        refs.profileContactName.focus();
        return;
      }
      if (item === "查看家属记录") {
        setPanel("family");
        void loadLogs();
        return;
      }
      if (item === "联系紧急联系人") {
        openEmergencyModal();
        return;
      }
      refs.chatInput.value = item;
      void submitChat(item, "text");
      refs.chatInput.value = "";
    });
    refs.quickActions.appendChild(button);
  });
}

function chatBubble(item) {
  const wrapper = document.createElement("article");
  wrapper.className = `chat-msg ${item.role}`;
  wrapper.appendChild(createTextNode("div", item.content));
  wrapper.appendChild(createTextNode("time", formatDateTime(item.createdAt).slice(11), ""));
  return wrapper;
}

function renderChatHistory() {
  refs.chatList.innerHTML = "";
  if (!state.conversations.length) {
    refs.chatList.appendChild(
      chatBubble({
        role: "assistant",
        content: state.welcomeMessage,
        createdAt: new Date().toISOString(),
      })
    );
    return;
  }

  state.conversations.forEach((item) => {
    refs.chatList.appendChild(chatBubble(item));
  });
  refs.chatList.scrollTop = refs.chatList.scrollHeight;
}

function appendChatBubble(role, text) {
  refs.chatList.appendChild(
    chatBubble({
      role,
      content: text,
      createdAt: new Date().toISOString(),
    })
  );
  refs.chatList.scrollTop = refs.chatList.scrollHeight;
}

function updateRepeatDateVisibility() {
  const isOnce = refs.reminderRepeat.value === "once";
  refs.onceDateWrap.classList.toggle("hidden", !isOnce);
  refs.reminderDate.required = isOnce;
  if (isOnce && !refs.reminderDate.value) {
    refs.reminderDate.value = todayDate();
  }
}

function reminderDueText(reminder) {
  if (reminder.repeat === "daily") {
    return `每天 ${reminder.time}`;
  }
  return `${reminder.scheduleDate || "今天"} ${reminder.time}`;
}

function reminderCard(reminder) {
  const card = document.createElement("article");
  card.className = "reminder-item";

  const top = document.createElement("div");
  top.className = "reminder-top";
  top.appendChild(createTextNode("strong", reminder.title, "reminder-title"));
  top.appendChild(createTextNode("span", reminder.enabled ? "已启用" : "已停用"));

  const meta = document.createElement("p");
  meta.className = "reminder-meta";
  meta.textContent = `${reminderDueText(reminder)}${reminder.nextDueAt ? `，下次 ${formatDateTime(reminder.nextDueAt)}` : ""}`;

  const actions = document.createElement("div");
  actions.className = "reminder-actions";

  const toggleBtn = document.createElement("button");
  toggleBtn.type = "button";
  toggleBtn.className = "text-btn";
  toggleBtn.textContent = reminder.enabled ? "停用" : "启用";
  toggleBtn.addEventListener("click", async () => {
    try {
      await api(`/api/reminders/${encodeURIComponent(reminder.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !reminder.enabled }),
      });
      await refreshOverview();
      showToast(reminder.enabled ? "提醒已停用" : "提醒已启用");
    } catch (error) {
      showToast(error.message);
    }
  });

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "text-btn danger-outline";
  deleteBtn.textContent = "删除";
  deleteBtn.addEventListener("click", async () => {
    try {
      await api(`/api/reminders/${encodeURIComponent(reminder.id)}`, { method: "DELETE" });
      await refreshOverview();
      showToast("提醒已删除");
    } catch (error) {
      showToast(error.message);
    }
  });

  actions.append(toggleBtn, deleteBtn);
  card.append(top, meta, actions);
  return card;
}

function renderAgenda() {
  refs.todayReminders.innerHTML = "";
  const items = state.reminders.filter((item) => item.enabled).slice(0, 3);
  if (!items.length) {
    refs.todayReminders.innerHTML =
      '<article class="agenda-item"><strong>今天暂无安排</strong><span>可以通过语音说“每天早上 8 点提醒我吃药”。</span></article>';
    return;
  }

  items.forEach((item) => {
    const article = document.createElement("article");
    article.className = "agenda-item";
    article.appendChild(createTextNode("strong", item.title));
    article.appendChild(createTextNode("span", reminderDueText(item)));
    refs.todayReminders.appendChild(article);
  });
}

function renderReminders() {
  refs.reminderList.innerHTML = "";
  if (!state.reminders.length) {
    refs.reminderList.innerHTML =
      '<article class="reminder-item"><strong class="reminder-title">暂无提醒</strong><p class="reminder-meta">先添加一个吃药、喝水或复诊提醒吧。</p></article>';
    return;
  }
  state.reminders.forEach((item) => refs.reminderList.appendChild(reminderCard(item)));
}

function renderDashboard() {
  refs.sumChat.textContent = String(state.dashboard.chatCount ?? 0);
  refs.sumEmergency.textContent = String(state.dashboard.emergencyCount7d ?? 0);
  refs.sumReminder.textContent = String(state.dashboard.reminderEventCount7d ?? 0);
  refs.sumEnabled.textContent = String(state.dashboard.reminderEnabled ?? 0);
  refs.sumNext.textContent = state.dashboard.nextReminderLabel || "暂无已启用提醒";
  refs.sumLastEmergency.textContent = state.dashboard.lastEmergencyAt
    ? formatDateTime(state.dashboard.lastEmergencyAt)
    : "最近 7 天暂无高风险事件";

  const hasEmergency = Boolean(state.dashboard.lastEmergencyAt);
  refs.familyAlert.innerHTML = "";
  refs.familyAlert.appendChild(createTextNode("p", "照护提示", "alert-kicker"));
  refs.familyAlert.appendChild(
    createTextNode("h3", hasEmergency ? "最近出现过高风险表达" : "暂无高风险告警")
  );
  refs.familyAlert.appendChild(
    createTextNode(
      "p",
      hasEmergency
        ? `${state.dashboard.lastEmergencyLabel || "系统已记录紧急事件"}，发生时间：${formatDateTime(state.dashboard.lastEmergencyAt)}`
        : "如果检测到胸痛、摔倒、救命等表达，这里会优先显示。"
    )
  );
}

function logTypeLabel(log) {
  if (log.type === "conversation") return "对话";
  if (log.type.startsWith("emergency")) return "紧急";
  if (log.type.startsWith("reminder")) return "提醒";
  return "资料";
}

function logCard(log) {
  const item = document.createElement("article");
  item.className = "log-item";

  const top = document.createElement("div");
  top.className = "log-top";
  top.appendChild(createTextNode("span", logTypeLabel(log), `log-tag ${log.level === "high" ? "high" : ""}`));
  top.appendChild(createTextNode("span", formatDateTime(log.createdAt), "log-time"));
  item.appendChild(top);
  item.appendChild(createTextNode("div", log.message || ""));
  return item;
}

function renderLogs() {
  refs.logList.innerHTML = "";
  if (!state.logs.length) {
    refs.logList.innerHTML = '<article class="log-item">暂无记录。</article>';
    return;
  }
  state.logs.forEach((log) => refs.logList.appendChild(logCard(log)));
}

function openEmergencyModal(payload = null) {
  const emergency = payload || state.activeEmergency || {
    label: "请立刻进行紧急求助",
    steps: ["立即拨打 120", "联系紧急联系人", "保持电话畅通，等待帮助到达"],
    contactName: state.profile.emergencyContactName,
    contactPhone: state.profile.emergencyContactPhone,
    address: state.profile.address,
  };

  state.activeEmergency = emergency;
  refs.emergencyTitle.textContent = emergency.label || "检测到高风险表达";
  refs.emergencySummary.textContent = emergency.address
    ? `请优先说明地址：${emergency.address}。如果无法完整表达，请先拨打 120，再联系家属。`
    : "请先拨打 120，然后联系紧急联系人，并保持电话畅通。";
  refs.emergencySteps.innerHTML = "";
  (emergency.steps || []).forEach((step) => {
    refs.emergencySteps.appendChild(createTextNode("li", step));
  });
  refs.callContact.setAttribute("href", emergency.contactPhone ? `tel:${emergency.contactPhone}` : "#");
  refs.callContact.textContent = emergency.contactName ? `联系 ${emergency.contactName}` : "联系紧急联系人";
  refs.emergencyModal.classList.remove("hidden");
}

function closeEmergencyModal() {
  refs.emergencyModal.classList.add("hidden");
}

function getEffectiveAsrMode() {
  if (state.ai.asrConfigured && mediaRecorderSupported()) return "cloud";
  if (browserSpeechRecognitionSupported()) return "browser";
  if (state.ai.asrConfigured) return "cloud_unavailable";
  return "unavailable";
}

function setVoiceStatusText(text) {
  refs.voiceStatus.textContent = text;
}

function updateVoiceUi() {
  const mode = getEffectiveAsrMode();
  refs.voiceBtn.classList.toggle("recording", recognitionActive || cloudRecordingActive);

  if (recognitionActive) {
    refs.voiceBtn.disabled = false;
    refs.voiceBtn.textContent = "正在听，请直接说话";
    setVoiceStatusText("识别中");
    return;
  }

  if (cloudRecordingActive) {
    refs.voiceBtn.disabled = false;
    refs.voiceBtn.textContent = "结束录音并发送";
    setVoiceStatusText(`录音中，${state.ai.asrLabel}`);
    return;
  }

  refs.voiceBtn.textContent = "按此开始语音";

  if (mode === "cloud") {
    refs.voiceBtn.disabled = false;
    setVoiceStatusText(`语音待命，${state.ai.asrLabel}`);
    return;
  }

  if (mode === "browser") {
    refs.voiceBtn.disabled = false;
    setVoiceStatusText("语音待命，浏览器语音识别");
    return;
  }

  refs.voiceBtn.disabled = true;
  setVoiceStatusText(
    mode === "cloud_unavailable"
      ? "云端语音已配置，但当前浏览器不支持录音，请改用文字输入。"
      : "当前浏览器不支持语音识别，请改用文字输入。"
  );
}

function ensureRecognition() {
  if (recognition || !browserSpeechRecognitionSupported()) {
    return recognition;
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.lang = "zh-CN";
  recognition.interimResults = false;
  recognition.continuous = false;

  recognition.onstart = () => {
    recognitionActive = true;
    updateVoiceUi();
  };

  recognition.onend = () => {
    recognitionActive = false;
    updateVoiceUi();
  };

  recognition.onerror = () => {
    recognitionActive = false;
    showToast("语音识别失败，请重试");
    updateVoiceUi();
  };

  recognition.onresult = (event) => {
    const transcript = event.results?.[0]?.[0]?.transcript?.trim() || "";
    if (!transcript) return;
    refs.chatInput.value = transcript;
    void submitChat(transcript, "voice");
    refs.chatInput.value = "";
  };

  return recognition;
}

function releaseMediaRecorderStream() {
  if (mediaRecorderStream) {
    mediaRecorderStream.getTracks().forEach((track) => track.stop());
    mediaRecorderStream = null;
  }
}

function resetCloudRecorderState() {
  clearTimeout(cloudRecordingTimer);
  cloudRecordingTimer = null;
  cloudRecordingActive = false;
  mediaRecorder = null;
  mediaRecorderChunks = [];
  mediaRecorderMimeType = "";
  releaseMediaRecorderStream();
}

function preferredRecordingMimeType() {
  if (!window.MediaRecorder?.isTypeSupported) return "";
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return candidates.find((item) => window.MediaRecorder.isTypeSupported(item)) || "";
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const [, base64 = ""] = result.split(",", 2);
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("音频读取失败"));
    reader.readAsDataURL(blob);
  });
}

async function transcribeAudioBlob(blob) {
  const audioBase64 = await blobToBase64(blob);
  const data = await api("/api/speech/transcribe", {
    method: "POST",
    body: JSON.stringify({
      audioBase64,
      mimeType: blob.type || mediaRecorderMimeType || "audio/webm",
      fileName: `voice.${(blob.type || "audio/webm").includes("mp4") ? "m4a" : "webm"}`,
    }),
  });
  return data.transcript || "";
}

async function handleCloudRecorderStop(chunks, mimeType) {
  resetCloudRecorderState();
  updateVoiceUi();

  if (!chunks.length) {
    setVoiceStatusText("没有收到录音，请重试");
    return;
  }

  refs.voiceBtn.disabled = true;
  setVoiceStatusText("正在转写，请稍候");

  try {
    const blob = new Blob(chunks, { type: mimeType || "audio/webm" });
    const transcript = await transcribeAudioBlob(blob);
    if (!transcript) {
      throw new Error("没有识别到清晰语音，请再说一次");
    }
    refs.chatInput.value = transcript;
    await submitChat(transcript, "voice");
    refs.chatInput.value = "";
  } catch (error) {
    showToast(error.message);
  } finally {
    refs.voiceBtn.disabled = false;
    updateVoiceUi();
  }
}

async function startCloudRecording() {
  if (!mediaRecorderSupported()) {
    showToast("当前浏览器不支持录音");
    updateVoiceUi();
    return;
  }

  stopSpeechPlayback();

  try {
    mediaRecorderStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });
    mediaRecorderMimeType = preferredRecordingMimeType();
    mediaRecorderChunks = [];
    mediaRecorder = mediaRecorderMimeType
      ? new MediaRecorder(mediaRecorderStream, {
          mimeType: mediaRecorderMimeType,
          audioBitsPerSecond: CLOUD_RECORD_AUDIO_BITS_PER_SEC,
        })
      : new MediaRecorder(mediaRecorderStream);

    mediaRecorder.ondataavailable = (event) => {
      if (event.data?.size) {
        mediaRecorderChunks.push(event.data);
      }
    };

    mediaRecorder.onerror = () => {
      resetCloudRecorderState();
      showToast("录音失败，请重试");
      updateVoiceUi();
    };

    mediaRecorder.onstop = () => {
      const chunks = [...mediaRecorderChunks];
      const mimeType = mediaRecorder?.mimeType || mediaRecorderMimeType;
      void handleCloudRecorderStop(chunks, mimeType);
    };

    mediaRecorder.start();
    cloudRecordingActive = true;
    updateVoiceUi();
    cloudRecordingTimer = setTimeout(() => {
      if (mediaRecorder?.state === "recording") {
        mediaRecorder.stop();
      }
    }, CLOUD_RECORD_LIMIT_MS);
  } catch {
    resetCloudRecorderState();
    showToast("无法打开麦克风，请检查浏览器权限");
    updateVoiceUi();
  }
}

function stopCloudRecording() {
  if (!mediaRecorder) return;
  clearTimeout(cloudRecordingTimer);
  cloudRecordingTimer = null;
  cloudRecordingActive = false;
  if (mediaRecorder.state === "recording") {
    mediaRecorder.stop();
  } else {
    resetCloudRecorderState();
    updateVoiceUi();
  }
}

async function handleVoiceButtonClick() {
  const mode = getEffectiveAsrMode();
  if (mode === "cloud") {
    if (cloudRecordingActive) {
      stopCloudRecording();
      return;
    }
    await startCloudRecording();
    return;
  }

  if (mode === "browser") {
    const speechRecognition = ensureRecognition();
    if (!speechRecognition) {
      updateVoiceUi();
      return;
    }
    stopSpeechPlayback();
    if (recognitionActive) {
      speechRecognition.stop();
      return;
    }
    try {
      speechRecognition.start();
    } catch {
      setVoiceStatusText("语音识别启动失败，请重试");
    }
    return;
  }

  showToast("当前设备不支持语音输入，请改用文字输入");
  updateVoiceUi();
}

function initVoice() {
  if (!voiceButtonBound) {
    refs.voiceBtn.addEventListener("click", () => {
      void handleVoiceButtonClick();
    });
    voiceButtonBound = true;
  }
  updateVoiceUi();
}

async function refreshOverview() {
  const data = await api("/api/bootstrap");
  state.ai = {
    ...state.ai,
    ...(data.ai || {}),
  };
  state.welcomeMessage = data.experience?.welcomeMessage || state.welcomeMessage;
  if (Array.isArray(data.experience?.quickActions) && data.experience.quickActions.length) {
    state.quickActions = data.experience.quickActions;
  }
  state.profile = data.profile || {};
  state.settings = {
    ...state.settings,
    ...(data.settings || {}),
  };
  state.caregiver = {
    ...state.caregiver,
    ...(data.caregiver || {}),
  };
  state.reminders = data.reminders || [];
  state.conversations = data.conversations || [];
  state.dashboard = data.dashboard || {};
  if (Array.isArray(data.logs) && refs.logType.value === "all" && refs.logLevel.value === "all" && !refs.logSearch.value.trim()) {
    state.logs = data.logs;
  }
  fillProfileForm();
  applySettingsToUi();
  updateHero();
  renderChatHistory();
  renderAgenda();
  renderReminders();
  renderDashboard();
  renderCaregiverStatus();
  renderLogs();
  updateVoiceUi();
}

async function loadBriefing() {
  const data = await api("/api/briefing");
  state.briefing = {
    ...state.briefing,
    ...(data.briefing || {}),
  };
  state.caregiver = {
    ...state.caregiver,
    ...(data.caregiver || {}),
  };
  renderBriefing();
  renderCaregiverStatus();
}

async function loadLogs() {
  const query = new URLSearchParams({
    type: refs.logType.value,
    level: refs.logLevel.value,
    q: refs.logSearch.value.trim(),
    limit: "120",
  });
  const data = await api(`/api/logs?${query.toString()}`);
  state.logs = data.logs || [];
  renderLogs();
}

async function submitChat(message, source = "text") {
  const clean = message.trim();
  if (!clean) return;
  appendChatBubble("user", clean);

  try {
    const data = await api("/api/chat", {
      method: "POST",
      body: JSON.stringify({ message: clean, source }),
    });
    appendChatBubble("assistant", data.reply || "我收到啦。");
    state.quickActions = Array.isArray(data.suggestions) && data.suggestions.length ? data.suggestions : state.quickActions;
    renderQuickActions(state.quickActions);
    if (data.briefing) {
      state.briefing = {
        ...state.briefing,
        ...(data.briefing.weather ? { weather: data.briefing.weather } : {}),
        ...(data.briefing.news ? { news: data.briefing.news } : {}),
      };
      if (data.intent === "daily_briefing" && data.briefing.summary) {
        state.briefing = {
          ...state.briefing,
          ...data.briefing,
        };
      }
      renderBriefing();
    }
    void speak(data.reply || "", "reply");

    if (data.reminder) {
      showToast("提醒已创建");
    }
    if (data.emergency) {
      openEmergencyModal(data.emergency);
    }

    await refreshOverview();
    if (refs.logType.value !== "all" || refs.logLevel.value !== "all" || refs.logSearch.value.trim()) {
      await loadLogs();
    }
  } catch (error) {
    showToast(error.message);
  }
}

function bindNavigation() {
  refs.navItems.forEach((item) => {
    item.addEventListener("click", () => {
      setPanel(item.dataset.target);
      if (item.dataset.target === "family") {
        void loadLogs();
      }
    });
  });
}

function bindForms() {
  refs.chatForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const message = refs.chatInput.value.trim();
    if (!message) return;
    refs.chatInput.value = "";
    void submitChat(message, "text");
  });

  refs.chatClear.addEventListener("click", () => {
    refs.chatInput.value = "";
    refs.chatInput.focus();
  });

  refs.reminderRepeat.addEventListener("change", updateRepeatDateVisibility);

  refs.reminderForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await api("/api/reminders", {
        method: "POST",
        body: JSON.stringify({
          title: refs.reminderTitle.value,
          time: refs.reminderTime.value,
          repeat: refs.reminderRepeat.value,
          scheduleDate: refs.reminderRepeat.value === "once" ? refs.reminderDate.value : "",
        }),
      });
      refs.reminderForm.reset();
      refs.reminderRepeat.value = "daily";
      updateRepeatDateVisibility();
      await refreshOverview();
      showToast("提醒已添加");
    } catch (error) {
      showToast(error.message);
    }
  });

  refs.profileForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const profilePayload = {
        name: refs.profileName.value,
        age: refs.profileAge.value,
        preferences: refs.profilePreferences.value,
        notes: refs.profileNotes.value,
        address: refs.profileAddress.value,
        location: refs.profileLocation.value,
        emergencyContactName: refs.profileContactName.value,
        emergencyContactPhone: refs.profileContactPhone.value,
        caregiverRelation: refs.profileCaregiverRelation.value,
        caregiverName: refs.profileCaregiverName.value,
        caregiverPhone: refs.profileCaregiverPhone.value,
        caregiverWebhookUrl: refs.profileCaregiverWebhook.value,
      };
      const settingsPayload = {
        autoSpeak: refs.settingsAutoSpeak.checked,
        largeText: refs.settingsLargeText.checked,
        reminderVoice: refs.settingsReminderVoice.checked,
        interfaceMode: refs.settingsInterfaceMode.value,
        reducedMotion: refs.settingsReducedMotion.checked,
        caregiverDigestEnabled: refs.settingsCaregiverDigest.checked,
        caregiverDigestHour: refs.settingsCaregiverDigestHour.value,
      };

      await api("/api/profile", {
        method: "PUT",
        body: JSON.stringify(profilePayload),
      });
      await api("/api/settings", {
        method: "PUT",
        body: JSON.stringify(settingsPayload),
      });
      await refreshOverview();
      showToast("资料与设置已保存");
      await loadBriefing();
    } catch (error) {
      showToast(error.message);
    }
  });

  refs.refreshLogs.addEventListener("click", () => {
    void loadLogs();
  });

  refs.logType.addEventListener("change", () => {
    void loadLogs();
  });

  refs.logLevel.addEventListener("change", () => {
    void loadLogs();
  });

  refs.logSearch.addEventListener("input", () => {
    clearTimeout(logSearchTimer);
    logSearchTimer = setTimeout(() => {
      void loadLogs();
    }, 260);
  });

  refs.heroSos.addEventListener("click", async () => {
    openEmergencyModal();
    try {
      await api("/api/emergency/report", {
        method: "POST",
        body: JSON.stringify({ action: "用户点击一键求助", symptom: "手动求助" }),
      });
      await refreshOverview();
      await loadLogs();
    } catch (error) {
      showToast(error.message);
    }
  });

  refs.reportEmergency.addEventListener("click", async () => {
    try {
      await api("/api/emergency/report", {
        method: "POST",
        body: JSON.stringify({
          action: "用户确认已向家人求助",
          symptom: state.activeEmergency?.label || "紧急求助",
        }),
      });
      closeEmergencyModal();
      await refreshOverview();
      await loadLogs();
      showToast("已记录紧急求助");
    } catch (error) {
      showToast(error.message);
    }
  });

  refs.closeEmergency.addEventListener("click", closeEmergencyModal);

  refs.briefingPlay.addEventListener("click", () => {
    void speak(state.briefing.summary || "我来陪您慢慢看今天的安排。", "reply");
  });

  refs.briefingRefresh.addEventListener("click", async () => {
    try {
      await loadBriefing();
      showToast("今日播报已更新");
    } catch (error) {
      showToast(error.message);
    }
  });

  refs.sendDigest.addEventListener("click", async () => {
    try {
      const data = await api("/api/caregiver/digest", {
        method: "POST",
        body: JSON.stringify({}),
      });
      await refreshOverview();
      showToast(data.result?.delivered ? "安心摘要已发送" : "没有可用 webhook，摘要未实际送出");
    } catch (error) {
      showToast(error.message);
    }
  });

  refs.testCaregiverNotify.addEventListener("click", async () => {
    try {
      const data = await api("/api/caregiver/notify-test", {
        method: "POST",
        body: JSON.stringify({}),
      });
      await refreshOverview();
      showToast(data.result?.delivered ? "家属通知测试成功" : "通知测试已记录，但没有实际送达");
    } catch (error) {
      showToast(error.message);
    }
  });
}

function shouldTriggerReminder(reminder, now) {
  if (!reminder.enabled || !reminder.time) return false;
  const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  if (reminder.time !== currentTime) return false;
  const today = todayDate();
  if (reminder.repeat === "once" && reminder.scheduleDate && reminder.scheduleDate !== today) {
    return false;
  }
  const markKey = `${reminder.id}:${today}:${currentTime}`;
  if (reminderMarks.get(markKey)) return false;
  reminderMarks.set(markKey, true);
  return true;
}

function startReminderTicker() {
  setInterval(() => {
    const now = new Date();
    state.reminders.forEach(async (reminder) => {
      if (!shouldTriggerReminder(reminder, now)) return;
      appendChatBubble("assistant", `提醒您：${reminder.title}`);
      showToast(`提醒：${reminder.title}`);
      void speak(`提醒您，${reminder.title}`, "reminder");

      try {
        await api("/api/reminders/trigger", {
          method: "POST",
          body: JSON.stringify({ reminderId: reminder.id }),
        });
        await refreshOverview();
      } catch (error) {
        showToast(error.message);
      }
    });
  }, 15000);
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

function currentSpeechSummary() {
  const chatLabel = state.ai.chatConfigured ? `${state.ai.chatProviderLabel} 已启用` : "当前使用本地对话回复";
  return `${chatLabel}，ASR：${state.ai.asrLabel}，TTS：${state.ai.ttsLabel}`;
}

async function boot() {
  bindNavigation();
  bindForms();
  initVoice();
  registerServiceWorker();
  updateRepeatDateVisibility();

  try {
    const health = await api("/api/health");
    state.ai = {
      ...state.ai,
      ...(health.ai || {}),
    };
    updateVoiceUi();
    setHeroStatus(currentSpeechSummary());
  } catch {
    setHeroStatus("服务不可用，请检查后端是否已启动", true);
  }

  try {
    await refreshOverview();
    await loadBriefing();
    renderQuickActions(state.quickActions);
    setHeroStatus(currentSpeechSummary());
  } catch (error) {
    showToast(error.message || "初始化失败");
  }

  startReminderTicker();

  window.addEventListener("online", () => {
    setHeroStatus("网络已恢复，可继续使用");
  });

  window.addEventListener("offline", () => {
    setHeroStatus("当前网络不可用，已保留本地页面外壳", true);
  });
}

void boot();
