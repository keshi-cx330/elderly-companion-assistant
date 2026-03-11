const state = {
  profile: {},
  settings: {
    autoSpeak: true,
    largeText: true,
    reminderVoice: true,
  },
  reminders: [],
  logs: [],
  conversations: [],
  dashboard: {},
  quickActions: ["陪我聊聊天", "每天早上 8 点提醒我吃药", "查看今日安排", "联系紧急联系人"],
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
  profileContactName: document.querySelector("#profile-contact-name"),
  profileContactPhone: document.querySelector("#profile-contact-phone"),
  settingsAutoSpeak: document.querySelector("#settings-auto-speak"),
  settingsLargeText: document.querySelector("#settings-large-text"),
  settingsReminderVoice: document.querySelector("#settings-reminder-voice"),
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
let logSearchTimer = null;
const reminderMarks = new Map();

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

function formatShortTime(value) {
  if (!value) return "--:--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
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

function speak(text, mode = "reply") {
  if (!window.speechSynthesis || !text) return;
  if (mode === "reply" && !state.settings.autoSpeak) return;
  if (mode === "reminder" && !state.settings.reminderVoice) return;
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "zh-CN";
  utter.rate = 0.94;
  utter.pitch = 1;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utter);
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
    },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || "请求失败");
  }
  return data;
}

function setHeroStatus(text, isError = false) {
  refs.heroStatus.textContent = text;
  refs.heroStatus.style.color = isError ? "#ffd9d4" : "#e4fff1";
}

function setPanel(target) {
  Object.entries(refs.panels).forEach(([key, panel]) => {
    panel.classList.toggle("active", key === target);
  });
  refs.navItems.forEach((item) => item.classList.toggle("active", item.dataset.target === target));
}

function applySettingsToUi() {
  document.body.classList.toggle("large-text", Boolean(state.settings.largeText));
  refs.heroVoiceMode.textContent = state.settings.autoSpeak ? "已开启" : "已关闭";
  refs.settingsAutoSpeak.checked = Boolean(state.settings.autoSpeak);
  refs.settingsLargeText.checked = Boolean(state.settings.largeText);
  refs.settingsReminderVoice.checked = Boolean(state.settings.reminderVoice);
}

function fillProfileForm() {
  refs.profileName.value = state.profile.name || "";
  refs.profileAge.value = state.profile.age || "";
  refs.profilePreferences.value = state.profile.preferences || "";
  refs.profileNotes.value = state.profile.notes || "";
  refs.profileAddress.value = state.profile.address || "";
  refs.profileContactName.value = state.profile.emergencyContactName || "";
  refs.profileContactPhone.value = state.profile.emergencyContactPhone || "";
}

function updateHero() {
  refs.heroNextReminder.textContent = state.dashboard.nextReminderLabel || "暂无已启用提醒";
  refs.heroContactName.textContent = state.profile.emergencyContactName || "未设置";
  refs.heroAddress.textContent = state.profile.address || "未设置";
  refs.heroVoiceMode.textContent = state.settings.autoSpeak ? "已开启" : "已关闭";
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
    const starter = {
      role: "assistant",
      content: "您好，我是您的陪伴助手。您可以直接说话，也可以让我帮您设置提醒。",
      createdAt: new Date().toISOString(),
    };
    refs.chatList.appendChild(chatBubble(starter));
    return;
  }

  state.conversations.forEach((item) => {
    refs.chatList.appendChild(chatBubble(item));
  });
  refs.chatList.scrollTop = refs.chatList.scrollHeight;
}

function appendChatBubble(role, text) {
  const item = {
    role,
    content: text,
    createdAt: new Date().toISOString(),
  };
  refs.chatList.appendChild(chatBubble(item));
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
    refs.todayReminders.innerHTML = '<article class="agenda-item"><strong>今天暂无安排</strong><span>可以通过语音说“每天早上 8 点提醒我吃药”。</span></article>';
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
    refs.reminderList.innerHTML = '<article class="reminder-item"><strong class="reminder-title">暂无提醒</strong><p class="reminder-meta">先添加一个吃药、喝水或复诊提醒吧。</p></article>';
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

async function refreshOverview() {
  const data = await api("/api/bootstrap");
  state.profile = data.profile || {};
  state.settings = {
    ...state.settings,
    ...(data.settings || {}),
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
  renderLogs();
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
    speak(data.reply || "", "reply");

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

function initVoice() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    refs.voiceBtn.disabled = true;
    refs.voiceStatus.textContent = "当前浏览器不支持语音识别，请改用文字输入。";
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = "zh-CN";
  recognition.interimResults = false;
  recognition.continuous = false;

  recognition.onstart = () => {
    recognitionActive = true;
    refs.voiceBtn.classList.add("recording");
    refs.voiceBtn.textContent = "正在听，请直接说话";
    refs.voiceStatus.textContent = "识别中";
  };

  recognition.onend = () => {
    recognitionActive = false;
    refs.voiceBtn.classList.remove("recording");
    refs.voiceBtn.textContent = "按此开始语音";
    refs.voiceStatus.textContent = "语音待命";
  };

  recognition.onerror = () => {
    refs.voiceStatus.textContent = "语音识别失败，请重试";
  };

  recognition.onresult = (event) => {
    const transcript = event.results?.[0]?.[0]?.transcript?.trim() || "";
    if (!transcript) return;
    refs.chatInput.value = transcript;
    void submitChat(transcript, "voice");
    refs.chatInput.value = "";
  };

  refs.voiceBtn.addEventListener("click", () => {
    if (!recognition) return;
    if (recognitionActive) {
      recognition.stop();
      return;
    }
    recognition.start();
  });
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
        emergencyContactName: refs.profileContactName.value,
        emergencyContactPhone: refs.profileContactPhone.value,
      };
      const settingsPayload = {
        autoSpeak: refs.settingsAutoSpeak.checked,
        largeText: refs.settingsLargeText.checked,
        reminderVoice: refs.settingsReminderVoice.checked,
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
      speak(`提醒您，${reminder.title}`, "reminder");

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

async function boot() {
  bindNavigation();
  bindForms();
  initVoice();
  registerServiceWorker();
  updateRepeatDateVisibility();

  try {
    await api("/api/health");
    setHeroStatus("服务已连接，可直接开始使用");
  } catch {
    setHeroStatus("服务不可用，请检查后端是否已启动", true);
  }

  try {
    await refreshOverview();
    renderQuickActions(state.quickActions);
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
