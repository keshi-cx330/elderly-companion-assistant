# 老人陪伴助手

面向老年人的手机 Web 陪伴与照护助手，支持语音对话、提醒管理、紧急求助、晨间播报、家属联动、心情报平安、时光记忆卡和防诈骗守护。项目当前版本为 `1.3.0`，已经覆盖“老人端 + 家属端”的核心闭环，并具备更强的情感价值与照护差异化。

## 当前版本重点
- 陪伴对话：本地规则、本地知识库、DeepSeek 大模型三层协同。
- 语音链路：浏览器语音、云端 ASR、云端 TTS 自动切换与回退。
- 晨间播报：聚合实时天气、正向资讯和今日提醒，支持一键播报。
- 家属联动：支持家属状态查看、测试通知、安心摘要、紧急事件 webhook 通知。
- 心情报平安：老人一键打卡心情和精神状态，家属端可看到最近趋势。
- 时光记忆卡：每天自动生成一个回忆话题，把聊天沉淀成可保存的家庭记忆。
- 防诈骗守护：识别转账、验证码、公检法、保健品诱导等高风险表达，并同步提醒家属。
- 双模式界面：`长辈暖心模式` 与 `家属专业模式`。
- 可选存储：默认 JSON，生产可切换 SQLite。

## 差异化亮点
- 不是普通聊天机器人，而是把“陪伴、照护、情绪、家属协同”做成同一个闭环。
- 把老人说过的话沉淀成“时光回忆册”，更容易形成传播和情感记忆点。
- 不只做紧急求助，还覆盖老年人高频但常被忽视的“防诈骗守护”场景。
- 家属端不只是日志面板，还能看到状态打卡、回忆内容和暖心便签，价值更直观。

## 适用场景
- 独居或半独居老人日常陪伴
- 吃药、喝水、复诊、散步等提醒
- 身体不适时的紧急引导
- 老人日常心情报平安与低落状态预警
- 老人家庭故事沉淀与家属情感连接
- 日常诈骗风险识别与家属二次确认
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
- 心情打卡：支持老人自助记录心情与精神状态，异常时可触发家属提醒。
- 时光记忆卡：提供每日回忆话题，并将回忆内容沉淀到家属页。
- 防诈骗守护：识别高风险话术，页面给出阻断步骤并写入安全日志。
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
├─ server.js                         # 服务启动入口，负责读取配置并启动 HTTP 服务
├─ src/server/
│  ├─ app.js                         # 主接口层，负责路由、参数校验、响应组装和静态资源分发
│  ├─ ai.js                          # DeepSeek 对话接入层，负责构造消息、请求模型和能力状态输出
│  ├─ briefing.js                    # 晨间播报与实时服务层，负责天气、正向资讯和每日摘要生成
│  ├─ config.js                      # 环境变量与运行配置集中定义
│  ├─ domain.js                      # 业务规则层，负责提醒解析、紧急识别、仪表盘统计等纯业务逻辑
│  ├─ engagement.js                  # 差异化体验层，负责心情打卡、时光记忆卡和防诈骗守护规则
│  ├─ knowledge.js                   # 本地知识库加载与问答匹配逻辑
│  ├─ notifications.js               # 家属通知能力，负责 webhook 发送、摘要生成和通知状态
│  ├─ prompt.js                      # Prompt 配置加载、场景匹配和系统提示词编排
│  ├─ speech.js                      # 云端 ASR / TTS 网关，负责语音转写与语音合成请求
│  └─ store.js                       # 存储抽象层，负责 JSON / SQLite 读写、归一化和原子更新
├─ config/
│  ├─ agent-prompt.json              # 陪伴 Agent 的角色、语气、安全边界和场景 Prompt 配置
│  └─ elder-knowledge-base.json      # 开场白、预置问题和本地问答知识库
├─ web/
│  ├─ index.html                     # 前端页面骨架，定义四个主要面板和核心交互区域
│  ├─ app.js                         # 前端交互逻辑，负责状态管理、语音交互、接口调用和渲染
│  ├─ styles.css                     # 移动端视觉样式与适老化界面主题
│  ├─ sw.js                          # Service Worker，负责缓存页面外壳和 PWA 资源
│  ├─ manifest.webmanifest           # PWA 安装清单，定义名称、图标和主题色
│  └─ icon.svg                       # 应用图标资源
├─ data/
│  └─ store.json                     # 默认本地数据文件，JSON 模式下保存资料、提醒、打卡、回忆、便签和事件
├─ docs/
│  ├─ PRD.md                         # 产品需求文档，描述目标用户、范围、流程、数据模型和验收标准
│  └─ DEPLOY.md                      # Linux 部署文档，覆盖 systemd、Nginx、HTTPS、SQLite 和 webhook
└─ test/
   └─ api.test.js                    # 接口自动化测试，覆盖健康检查、提醒、紧急、播报和家属通知
```

## 主要接口
- `GET /api/health`
- `GET /api/bootstrap`
- `GET /api/ai/prompt`
- `GET /api/engagement`
- `GET /api/profile`
- `PUT /api/profile`
- `GET /api/settings`
- `PUT /api/settings`
- `GET /api/checkins`
- `POST /api/checkins`
- `GET /api/memories`
- `POST /api/memories`
- `GET /api/family-notes`
- `POST /api/family-notes`
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
- 心情打卡、时光回忆与家人便签持久化
- 防诈骗守护识别与安全日志

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
