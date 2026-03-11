const {
  OPENAI_API_KEY,
  OPENAI_ASR_MODEL,
  OPENAI_BASE_URL,
  OPENAI_SPEECH_TIMEOUT_MS,
  OPENAI_TRANSCRIBE_LANGUAGE,
  OPENAI_TTS_MODEL,
  OPENAI_TTS_RESPONSE_FORMAT,
  OPENAI_TTS_VOICE,
} = require("./config");
const { safeText } = require("./domain");
const { loadPromptProfile } = require("./prompt");

const MAX_AUDIO_BYTES = 768 * 1024;

function isCloudAsrEnabled() {
  return Boolean(OPENAI_API_KEY && OPENAI_ASR_MODEL);
}

function isCloudTtsEnabled() {
  return Boolean(OPENAI_API_KEY && OPENAI_TTS_MODEL);
}

function speechProviderLabel() {
  return OPENAI_BASE_URL.includes("openai.com") ? "OpenAI Speech" : "OpenAI-Compatible Speech";
}

function normalizeMimeType(value) {
  const mimeType = safeText(value, 80).toLowerCase();
  return /^audio\/[a-z0-9.+-]+(?:;[a-z0-9=.+-]+)?$/i.test(mimeType) ? mimeType : "audio/webm";
}

function fileExtensionFromMime(mimeType) {
  if (mimeType.includes("mpeg")) return "mp3";
  if (mimeType.includes("mp4")) return "m4a";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("wav")) return "wav";
  return "webm";
}

function decodeAudioBase64(audioBase64) {
  const normalized = safeText(audioBase64, MAX_AUDIO_BYTES * 2).replace(/^data:[^,]+,/, "");
  if (!normalized) {
    throw new Error("音频内容不能为空");
  }

  const buffer = Buffer.from(normalized, "base64");
  if (!buffer.length) {
    throw new Error("音频内容解析失败");
  }
  if (buffer.length > MAX_AUDIO_BYTES) {
    throw new Error("音频文件过大，请缩短录音时长");
  }
  return buffer;
}

function buildMultipartBody({ fields, fileField, fileName, mimeType, fileBuffer }) {
  const boundary = `----elderly-companion-${Date.now().toString(16)}`;
  const chunks = [];

  Object.entries(fields).forEach(([name, value]) => {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${String(value)}\r\n`,
        "utf8"
      )
    );
  });

  chunks.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${fileField}"; filename="${fileName}"\r\nContent-Type: ${mimeType}\r\n\r\n`,
      "utf8"
    )
  );
  chunks.push(fileBuffer);
  chunks.push(Buffer.from(`\r\n--${boundary}--\r\n`, "utf8"));

  return {
    boundary,
    body: Buffer.concat(chunks),
  };
}

async function parseJsonOrText(response) {
  const raw = await response.text();
  let data = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = null;
  }
  return {
    raw,
    data,
  };
}

async function transcribeAudio({ audioBase64, mimeType = "audio/webm", fileName = "" }) {
  if (!isCloudAsrEnabled()) {
    throw new Error("云端语音识别未配置");
  }

  const fileBuffer = decodeAudioBase64(audioBase64);
  const normalizedMimeType = normalizeMimeType(mimeType);
  const resolvedFileName =
    safeText(fileName, 60) || `voice.${fileExtensionFromMime(normalizedMimeType)}`;

  const { boundary, body } = buildMultipartBody({
    fields: {
      model: OPENAI_ASR_MODEL,
      language: OPENAI_TRANSCRIBE_LANGUAGE,
      response_format: "json",
      temperature: "0",
    },
    fileField: "file",
    fileName: resolvedFileName,
    mimeType: normalizedMimeType,
    fileBuffer,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENAI_SPEECH_TIMEOUT_MS);

  try {
    const response = await fetch(`${OPENAI_BASE_URL}/audio/transcriptions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      body,
      signal: controller.signal,
    });

    const { raw, data } = await parseJsonOrText(response);
    if (!response.ok) {
      const detail =
        data?.error?.message || data?.error?.code || data?.message || raw.slice(0, 200) || `HTTP ${response.status}`;
      throw new Error(`语音转写失败：${detail}`);
    }

    const transcript = safeText(data?.text || raw || "", 500);
    if (!transcript) {
      throw new Error("语音转写结果为空");
    }

    return {
      provider: "openai-compatible-asr",
      providerLabel: speechProviderLabel(),
      model: OPENAI_ASR_MODEL,
      transcript,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function synthesizeSpeech(text) {
  if (!isCloudTtsEnabled()) {
    throw new Error("云端语音播报未配置");
  }

  const input = safeText(text, 700);
  if (!input) {
    throw new Error("播报内容不能为空");
  }

  const promptProfile = loadPromptProfile();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENAI_SPEECH_TIMEOUT_MS);

  try {
    const response = await fetch(`${OPENAI_BASE_URL}/audio/speech`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_TTS_MODEL,
        voice: OPENAI_TTS_VOICE,
        input,
        response_format: OPENAI_TTS_RESPONSE_FORMAT,
        instructions: promptProfile.tts.instructions,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const { raw, data } = await parseJsonOrText(response);
      const detail =
        data?.error?.message || data?.error?.code || data?.message || raw.slice(0, 200) || `HTTP ${response.status}`;
      throw new Error(`语音播报失败：${detail}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return {
      provider: "openai-compatible-tts",
      providerLabel: speechProviderLabel(),
      model: OPENAI_TTS_MODEL,
      contentType: response.headers.get("content-type") || "audio/mpeg",
      fileName: `reply.${OPENAI_TTS_RESPONSE_FORMAT}`,
      buffer: Buffer.from(arrayBuffer),
    };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  isCloudAsrEnabled,
  isCloudTtsEnabled,
  speechProviderLabel,
  synthesizeSpeech,
  transcribeAudio,
};
