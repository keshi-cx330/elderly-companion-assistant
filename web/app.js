const state = {
  profile: null,
  reminders: [],
  logs: [],
  speechEnabled: false,
  lastUserMessage: "",
};

const refs = {
  heroStatus: document.querySelector("#hero-status"),
  chatList: document.querySelector("#chat-list"),
  chatForm: document.querySelector("#chat-form"),
  chatInput: document.querySelector("#chat-input"),
  voiceBtn: document.querySelector("#voice-btn"),
  voiceStatus: document.querySelector("#voice-status"),
  reminderForm: document.querySelector("#reminder-form"),
  reminderTitle: document.querySelector("#reminder-title"),
  reminderTime: document.querySelector("#reminder-time"),
  reminderRepeat: document.querySelector("#reminder-repeat"),
  reminderList: document.querySelector("#reminder-list"),
  profileForm: document.querySelector("#profile-form"),
  profileName: document.querySelector("#profile-name"),
  profileAge: document.querySelector("#profile-age"),
  profilePreferences: document.querySelector("#profile-preferences"),
  profileNotes: document.querySelector("#profile-notes"),
  profileContactName: document.querySelector("#profile-contact-name"),
  profileContactPhone: document.querySelector("#profile-contact-phone"),
  sumChat: document.querySelector("#sum-chat"),
  sumEmergency: document.querySelector("#sum-emergency"),
  sumReminder: document.querySelector("#sum-reminder"),
  sumEnabled: document.querySelector("#sum-enabled"),
  logType: document.querySelector("#log-type"),
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
  call120: document.querySelector("#call-120"),
  callContact: document.querySelector("#call-contact"),
  closeEmergency: document.querySelector("#close-emergency"),
};

let recognition = null;
let recognitionActive = false;
const reminderMark = new Map();

function speak(text) {
  if (!window.speechSynthesis || !text) return;
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "zh-CN";
  utter.rate = 0.95;
  utter.pitch = 1;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utter);
}

function showToast(text) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
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
  refs.heroStatus.style.color = isError ? "#ffd3d3" : "#eafffa";
}

function addChatBubble(role, text) {
  const node = document.createElement("div");
  node.className = `chat-msg ${role}`;
  node.textContent = text;
  refs.chatList.appendChild(node);
  refs.chatList.scrollTop = refs.chatList.scrollHeight;
}

function setPanel(target) {
  Object.entries(refs.panels).forEach(([key, panel]) => {
    panel.classList.toggle("active", key === target);
  });
  refs.navItems.forEach((btn) => btn.classList.toggle("active", btn.dataset.target === target));
}

function bindNavigation() {
  refs.navItems.forEach((btn) => {
    btn.addEventListener("click", () => {
      setPanel(btn.dataset.target);
      if (btn.dataset.target === "family") {
        void loadDashboard();
        void loadLogs();
      }
    });
  });
}

function fillProfileForm(profile) {
  refs.profileName.value = profile?.name || "";
  refs.profileAge.value = profile?.age || "";
  refs.profilePreferences.value = profile?.preferences || "";
  refs.profileNotes.value = profile?.notes || "";
  refs.profileContactName.value = profile?.emergencyContactName || "";
  refs.profileContactPhone.value = profile?.emergencyContactPhone || "";
  updateEmergencyContactLink();
}

function updateEmergencyContactLink() {
  const phone = state.profile?.emergencyContactPhone?.trim() || "";
  if (phone) {
    refs.callContact.setAttribute("href", `tel:${phone}`);
    refs.callContact.textContent = `联系 ${state.profile?.emergencyContactName || "紧急联系人"}`;
  } else {
    refs.callContact.setAttribute("href", "#");
    refs.callContact.textContent = "未设置联系人电话";
  }
}

async function loadProfile() {
  const data = await api("/api/profile");
  state.profile = data.profile;
  fillProfileForm(state.profile);
}

function reminderCard(reminder) {
  const wrapper = document.createElement("article");
  wrapper.className = "reminder-item";
  wrapper.innerHTML = `
    <div class="reminder-top">
      <span class="reminder-title">${escapeHtml(reminder.title)}</span>
      <span>${reminder.enabled ? "已启用" : "已停用"}</span>
    </div>
    <p class="reminder-meta">${reminder.repeat === "daily" ? "每天" : "仅一次"} ${escapeHtml(reminder.time)}</p>
    <div class="reminder-actions">
      <button class="text-btn toggle-btn">${reminder.enabled ? "停用" : "启用"}</button>
      <button class="text-btn delete-btn">删除</button>
    </div>
  `;
  wrapper.querySelector(".toggle-btn").addEventListener("click", async () => {
    try {
      await api(`/api/reminders/${encodeURIComponent(reminder.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !reminder.enabled }),
      });
      await loadReminders();
    } catch (err) {
      showToast(err.message);
    }
  });
  wrapper.querySelector(".delete-btn").addEventListener("click", async () => {
    try {
      await api(`/api/reminders/${encodeURIComponent(reminder.id)}`, { method: "DELETE" });
      await loadReminders();
    } catch (err) {
      showToast(err.message);
    }
  });
  return wrapper;
}

async function loadReminders() {
  const data = await api("/api/reminders");
  state.reminders = data.reminders || [];
  refs.reminderList.innerHTML = "";
  if (state.reminders.length === 0) {
    refs.reminderList.innerHTML = '<p class="reminder-item">暂无提醒，先添加一个吧。</p>';
    return;
  }
  state.reminders.forEach((r) => refs.reminderList.appendChild(reminderCard(r)));
}

function summaryValue(el, value) {
  el.textContent = String(value ?? 0);
}

async function loadDashboard() {
  const data = await api("/api/dashboard");
  const sum = data.summary || {};
  summaryValue(refs.sumChat, sum.chatCount);
  summaryValue(refs.sumEmergency, sum.emergencyCount7d);
  summaryValue(refs.sumReminder, sum.reminderEventCount7d);
  summaryValue(refs.sumEnabled, sum.reminderEnabled);
}

function formatTime(iso) {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "-";
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(
    2,
    "0"
  )} ${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
}

function logCard(log) {
  const el = document.createElement("article");
  el.className = "log-item";
  const tagHigh = log.level === "high" ? "high" : "";
  const label = log.type.startsWith("emergency")
    ? "紧急"
    : log.type.startsWith("reminder")
    ? "提醒"
    : "对话";
  el.innerHTML = `
    <div class="log-top">
      <span class="log-tag ${tagHigh}">${label}</span>
      <span class="log-time">${formatTime(log.createdAt)}</span>
    </div>
    <div>${escapeHtml(log.message || "")}</div>
  `;
  return el;
}

async function loadLogs() {
  const type = refs.logType.value;
  const data = await api(`/api/logs?type=${encodeURIComponent(type)}&limit=80`);
  state.logs = data.logs || [];
  refs.logList.innerHTML = "";
  if (state.logs.length === 0) {
    refs.logList.innerHTML = '<p class="log-item">暂无记录。</p>';
    return;
  }
  state.logs.forEach((log) => refs.logList.appendChild(logCard(log)));
}

function openEmergencyModal() {
  refs.emergencyModal.classList.remove("hidden");
}

function closeEmergencyModal() {
  refs.emergencyModal.classList.add("hidden");
}

async function submitChat(message, source = "text") {
  const clean = message.trim();
  if (!clean) return;
  state.lastUserMessage = clean;
  addChatBubble("user", clean);
  try {
    const data = await api("/api/chat", {
      method: "POST",
      body: JSON.stringify({ message: clean, source }),
    });
    addChatBubble("assistant", data.reply || "我收到啦。");
    speak(data.reply || "");
    if (data.emergency) {
      openEmergencyModal();
      await api("/api/emergency/report", {
        method: "POST",
        body: JSON.stringify({ symptom: clean, action: "系统识别后用户触发紧急模式" }),
      }).catch(() => {});
      await loadDashboard().catch(() => {});
      await loadLogs().catch(() => {});
    }
  } catch (err) {
    showToast(err.message);
  }
}

function initVoice() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    refs.voiceStatus.textContent = "当前浏览器不支持语音识别，请改用文字输入。";
    refs.voiceBtn.disabled = true;
    return;
  }

  recognition = new SR();
  recognition.lang = "zh-CN";
  recognition.continuous = false;
  recognition.interimResults = false;

  recognition.onstart = () => {
    recognitionActive = true;
    refs.voiceBtn.classList.add("recording");
    refs.voiceBtn.textContent = "正在听，请说话...";
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
    } else {
      recognition.start();
    }
  });
}

function bindForms() {
  refs.chatForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = refs.chatInput.value.trim();
    if (!text) return;
    refs.chatInput.value = "";
    void submitChat(text, "text");
  });

  refs.reminderForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await api("/api/reminders", {
        method: "POST",
        body: JSON.stringify({
          title: refs.reminderTitle.value,
          time: refs.reminderTime.value,
          repeat: refs.reminderRepeat.value,
        }),
      });
      refs.reminderForm.reset();
      await loadReminders();
      await loadDashboard();
      showToast("提醒已添加");
    } catch (err) {
      showToast(err.message);
    }
  });

  refs.profileForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const payload = {
        name: refs.profileName.value,
        age: refs.profileAge.value,
        preferences: refs.profilePreferences.value,
        notes: refs.profileNotes.value,
        emergencyContactName: refs.profileContactName.value,
        emergencyContactPhone: refs.profileContactPhone.value,
      };
      const data = await api("/api/profile", {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      state.profile = data.profile;
      updateEmergencyContactLink();
      showToast("资料已保存");
    } catch (err) {
      showToast(err.message);
    }
  });

  refs.refreshLogs.addEventListener("click", () => {
    void loadDashboard();
    void loadLogs();
  });

  refs.logType.addEventListener("change", () => {
    void loadLogs();
  });

  refs.closeEmergency.addEventListener("click", () => {
    closeEmergencyModal();
  });
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function boot() {
  bindNavigation();
  bindForms();
  initVoice();

  try {
    await api("/api/health");
    setHeroStatus("已连接服务");
  } catch {
    setHeroStatus("服务不可用，请检查后端", true);
  }

  try {
    await Promise.all([loadProfile(), loadReminders(), loadDashboard(), loadLogs()]);
    addChatBubble("assistant", "您好，我是您的陪伴助手。您可以语音聊天，也可以让我设置提醒。");
  } catch (err) {
    showToast(err.message || "初始化失败");
  }

  setInterval(() => {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    state.reminders
      .filter((r) => r.enabled && r.time === hhmm)
      .forEach(async (r) => {
        const markKey = `${r.id}:${today}`;
        if (reminderMark.get(markKey)) return;
        reminderMark.set(markKey, true);
        addChatBubble("assistant", `提醒您：${r.title}`);
        speak(`提醒您，${r.title}`);
        showToast(`提醒：${r.title}`);
        await api("/api/reminders/trigger", {
          method: "POST",
          body: JSON.stringify({ reminderId: r.id }),
        }).catch(() => {});
        await loadReminders().catch(() => {});
        await loadDashboard().catch(() => {});
      });
  }, 30000);
}

void boot();
