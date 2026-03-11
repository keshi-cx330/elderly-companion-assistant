# 老人陪伴助手

面向老年人的手机 Web 陪伴与照护助手，支持语音对话、提醒管理、紧急求助、晨间播报和家属联动。项目当前版本为 `1.2.0`，已经覆盖“老人端 + 家属端”的核心闭环，并可直接部署到 Linux 服务器。

## 当前版本重点
- 陪伴对话：本地规则、本地知识库、DeepSeek 大模型三层协同。
- 语音链路：浏览器语音、云端 ASR、云端 TTS 自动切换与回退。
- 晨间播报：聚合实时天气、正向资讯和今日提醒，支持一键播报。
- 家属联动：支持家属状态查看、测试通知、安心摘要、紧急事件 webhook 通知。
- 双模式界面：`长辈暖心模式` 与 `家属专业模式`。
- 可选存储：默认 JSON，生产可切换 SQLite。

## 适用场景
- 独居或半独居老人日常陪伴
- 吃药、喝水、复诊、散步等提醒
- 身体不适时的紧急引导
- 家属查看近期互动、提醒和异常事件
- 适老化手机 Web 演示、答辩、课程或比赛项目

## 核心能力
- 语音优先：支持浏览器原生语音识别与播报。
- 陪伴对话：默认“小孙子 / 小孙女”口吻，适配老人交流习惯。
- 本地知识库：优先直出高置信度问答，保证稳定和安全。
- DeepSeek 对话：普通陪伴聊天可切到 DeepSeek，异常时自动回退。
- 场景 Prompt：从 `config/agent-prompt.json` 独立加载，便于后续持续运营。
- 提醒闭环：支持自然语言创建提醒、手动管理、到点播报、留痕追溯。
- 紧急求助：识别胸痛、摔倒、呼吸困难、中风等高风险表达。
- 晨间播报：`GET /api/briefing` 聚合天气、资讯和今日安排。
- 家属通知：支持 webhook 推送、测试通知、每日安心摘要。
- 适老化前端：大字、少层级、大按钮、减少动画、PWA 外壳。
- 可选 SQLite：通过 `sqlite3` 系统命令切换到更稳的持久化方式。

## 技术栈
- 后端：`Node.js 18+` 原生 `http`
- 前端：原生 HTML / CSS / JavaScript
- 存储：JSON 文件，或可选 SQLite
- 部署：Linux + `systemd` + `Nginx`
- 运行依赖：默认无第三方 Node 依赖；启用 SQLite 时依赖系统 `sqlite3`

## 快速启动
```bash
cd /root/kkk/项目
node -v
npm start
```

默认监听：
`http://0.0.0.0:3000`

局域网访问示例：
`http://你的服务器IP:3000`

## 常用启动方式

### 1. 仅本地规则
```bash
cd /root/kkk/项目
HOST=0.0.0.0 PORT=3000 npm start
```

### 2. 启用 DeepSeek
```bash
cd /root/kkk/项目
export DEEPSEEK_API_KEY="你的密钥"
export DEEPSEEK_MODEL="deepseek-chat"
HOST=0.0.0.0 PORT=3000 npm start
```

### 3. 启用 DeepSeek + 云端 ASR/TTS
```bash
cd /root/kkk/项目
export DEEPSEEK_API_KEY="你的 DeepSeek 密钥"
export DEEPSEEK_MODEL="deepseek-chat"
export OPENAI_API_KEY="你的语音服务密钥"
export OPENAI_BASE_URL="https://api.openai.com/v1"
export OPENAI_ASR_MODEL="gpt-4o-mini-transcribe"
export OPENAI_TTS_MODEL="gpt-4o-mini-tts"
export OPENAI_TTS_VOICE="alloy"
HOST=0.0.0.0 PORT=3000 npm start
```

### 4. 启用 SQLite + 家属通知
```bash
cd /root/kkk/项目
export STORAGE_DRIVER="sqlite"
export SQLITE_FILE="/root/kkk/项目/data/store.db"
export NOTIFY_WEBHOOK_URLS="https://example.com/webhook-a,https://example.com/webhook-b"
HOST=0.0.0.0 PORT=3000 npm start
```

## 语音与浏览器说明
- 安卓推荐：`Chrome`
- iPhone / iPad 推荐：`Safari`
- 麦克风权限通常要求 `HTTPS` 或 `localhost`
- 浏览器不支持 `SpeechRecognition` 时，若配置了云端 ASR 且浏览器支持录音，仍可正常语音输入
- 云端 TTS 失败时，会自动回退到浏览器本地播报

## 配置项

### DeepSeek
- `DEEPSEEK_API_KEY`
- `DEEPSEEK_MODEL`
- `DEEPSEEK_BASE_URL`
- `DEEPSEEK_TIMEOUT_MS`
- `DEEPSEEK_MAX_HISTORY`
- `DEEPSEEK_MAX_TOKENS`

### Prompt / 知识库
- `AGENT_PROMPT_FILE`
- `KNOWLEDGE_BASE_FILE`

### 云端 ASR / TTS
- `OPENAI_API_KEY` 或 `SPEECH_API_KEY`
- `OPENAI_BASE_URL` 或 `SPEECH_BASE_URL`
- `OPENAI_ASR_MODEL`
- `OPENAI_TRANSCRIBE_LANGUAGE`
- `OPENAI_TTS_MODEL`
- `OPENAI_TTS_VOICE`
- `OPENAI_TTS_RESPONSE_FORMAT`
- `OPENAI_SPEECH_TIMEOUT_MS`

### 实时天气 / 晨间播报
- `OPEN_METEO_BASE_URL`
- `OPEN_METEO_GEOCODE_URL`
- `WEATHER_TIMEOUT_MS`
- `NEWS_RSS_URL`
- `NEWS_TIMEOUT_MS`
- `BRIEFING_CACHE_TTL_MS`

说明：
- 天气默认使用 `Open-Meteo`
- 正向资讯默认使用 `Google News RSS`
- 外部源不可用时会自动回退，不影响主流程

### 家属通知
- `NOTIFY_WEBHOOK_URLS`
- `NOTIFY_TIMEOUT_MS`

说明：
- 支持多个 webhook，逗号分隔
- 可对接企业微信机器人、钉钉机器人、n8n、Zapier、Make 或自建通知服务
- 前端资料页还支持单独配置某位老人的专属 webhook

### 存储
- `STORAGE_DRIVER`：`json` 或 `sqlite`
- `SQLITE_FILE`
- `SQLITE_BIN`
- `DATA_FILE`

说明：
- 默认是 JSON 文件
- 选择 SQLite 时，服务会调用系统 `sqlite3`

## 运行策略
- 紧急识别、提醒创建优先走本地确定性逻辑。
- 天气、新闻、晨间播报优先走实时服务。
- 普通陪伴聊天在未命中本地知识库和实时服务时，再走 DeepSeek。
- DeepSeek 不可用时自动回退本地回复。
- 家属 webhook 未配置时，通知接口仍返回成功，但会明确提示“未实际送达”。

## 项目结构
```text
.
├─ server.js
├─ src/server/
│  ├─ app.js
│  ├─ ai.js
│  ├─ briefing.js
│  ├─ config.js
│  ├─ domain.js
│  ├─ knowledge.js
│  ├─ notifications.js
│  ├─ prompt.js
│  ├─ speech.js
│  └─ store.js
├─ config/
│  ├─ agent-prompt.json
│  └─ elder-knowledge-base.json
├─ web/
│  ├─ index.html
│  ├─ app.js
│  ├─ styles.css
│  ├─ sw.js
│  ├─ manifest.webmanifest
│  └─ icon.svg
├─ data/
│  └─ store.json
├─ docs/
│  ├─ PRD.md
│  └─ DEPLOY.md
└─ test/
   └─ api.test.js
```

## 主要接口
- `GET /api/health`
- `GET /api/bootstrap`
- `GET /api/ai/prompt`
- `GET /api/profile`
- `PUT /api/profile`
- `GET /api/settings`
- `PUT /api/settings`
- `GET /api/reminders`
- `POST /api/reminders`
- `PATCH /api/reminders/:id`
- `DELETE /api/reminders/:id`
- `POST /api/reminders/trigger`
- `POST /api/chat`
- `POST /api/speech/transcribe`
- `POST /api/speech/speak`
- `POST /api/emergency/report`
- `GET /api/briefing`
- `GET /api/caregiver/status`
- `POST /api/caregiver/notify-test`
- `POST /api/caregiver/digest`
- `GET /api/dashboard`
- `GET /api/logs`

## 测试
```bash
cd /root/kkk/项目
npm test
```

当前自动化覆盖：
- 健康检查与初始化接口
- Prompt / Speech 能力接口
- 资料与设置持久化
- 自然语言提醒创建
- 紧急表达识别与日志留痕
- 晨间播报与家属通知接口

## Linux 部署
正式部署请看 [docs/DEPLOY.md](./docs/DEPLOY.md)。

建议组合：
- `systemd` 常驻
- `Nginx` 反向代理
- `HTTPS`
- `SQLite`
- `家属 webhook`

## 合规边界
- 不提供医疗诊断和处方建议
- 高风险场景只做求助引导，不替代医生
- 仅保存最小必要信息
- 正式环境建议启用 HTTPS、备份和访问控制

## 仓库地址
GitHub：
`https://github.com/keshi-cx330/elderly-companion-assistant`
