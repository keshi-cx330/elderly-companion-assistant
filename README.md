# 老人陪伴助手

面向老年人的手机 Web 端陪伴、提醒与紧急求助助手。项目支持语音优先的对话交互、日常提醒管理、紧急风险识别、家属追溯日志，以及可直接部署到 Linux 服务器的无依赖 Node.js 服务端。

## 核心能力
- 语音优先：浏览器语音识别 + 语音播报，老人打开手机浏览器即可使用。
- 陪伴对话：围绕问候、孤独情绪、提醒需求、联系家人等常见场景给出简短回复。
- 大模型对话：支持通过环境变量接入 DeepSeek，对普通闲聊和陪伴对话优先走大模型，异常时自动回退本地规则。
- Prompt 工程化：内置独立的场景 Prompt 配置文件，可按老人陪伴、日常照护、家属联系等场景直接调整。
- 本地知识库：内置老人陪伴问答知识库，支持预置问题、天气问法、健康提醒、娱乐问答、应急引导等内容直出。
- 提醒闭环：支持手动创建提醒，也支持自然语言直接创建，例如“每天早上 8 点提醒我吃药”。
- 紧急求助：识别胸痛、摔倒、救命、昏迷等高风险表达，自动弹出求助流程并留痕。
- 家属视图：提供统计概览、筛选日志、最近高风险事件提示。
- 老人友好：大字模式、按钮大、操作少、单屏核心动作明确。
- PWA 化：支持加到手机桌面，缓存页面外壳，弱网下仍可保留基础界面。
- 云端语音：支持通过 OpenAI 兼容语音接口接入云端 ASR + TTS，浏览器能力不可用时可自动回退。

## 技术栈
- 后端：`Node.js 18+` 原生 `http`，无第三方依赖
- 前端：原生 HTML / CSS / JavaScript
- 存储：本地 JSON 文件持久化
- 部署：Linux + `systemd` + `Nginx` 推荐

## 快速启动
```bash
node -v
# 建议 >= 18

npm start
```

默认监听：`http://0.0.0.0:3000`

如果你希望手机同局域网访问，请确认：
1. 服务器与手机在同一网络。
2. 使用服务器 IP 访问，例如 `http://192.168.1.20:3000`。
3. 云服务器需开放对应安全组端口。

## DeepSeek 接入
不需要改代码，只需要在启动前设置环境变量：

```bash
cd /root/kkk/项目
export DEEPSEEK_API_KEY="你的密钥"
export DEEPSEEK_MODEL="deepseek-chat"
npm start
```

可选环境变量：
- `DEEPSEEK_API_KEY`：DeepSeek API Key
- `DEEPSEEK_MODEL`：默认 `deepseek-chat`
- `DEEPSEEK_BASE_URL`：默认 `https://api.deepseek.com`
- `DEEPSEEK_TIMEOUT_MS`：默认 `15000`

接入后：
- 普通陪伴聊天优先走 DeepSeek
- 提醒创建、紧急识别仍由本地规则优先处理，保证稳定性和安全性
- 如果 DeepSeek 接口异常，系统会自动回退到本地回复

## 场景 Prompt 工程化
项目现在会从 [config/agent-prompt.json](./config/agent-prompt.json) 读取陪伴 Agent 的配置，并按当前消息自动匹配场景规则，例如：
- 初次问候
- 孤独安抚
- 日常照护
- 家庭联络
- 记忆辅助

你可以直接修改这个文件来调整：
- 助手身份设定
- 回复风格
- 安全边界
- 不同场景下的附加提示词
- 大模型回复后的快捷建议词
- 云端 TTS 说话风格

运行时可观察接口：
```bash
curl http://127.0.0.1:3000/api/ai/prompt
```

可选环境变量：
- `AGENT_PROMPT_FILE`：自定义 Prompt 配置文件路径

## 本地知识库
项目会从 [config/elder-knowledge-base.json](./config/elder-knowledge-base.json) 读取开场白、预置问题和本地问答知识：
- 手机首页开场白
- 5 个预置问题
- 陪伴、天气、健康、娱乐、应急、数字生活、家庭关系等问答

当前策略：
- 高置信度命中的知识库问题会直接返回本地答案
- 低置信度命中会作为参考资料注入大模型 Prompt
- 前端开场白和预置问题与这份知识库共用同一配置

## 云端 ASR / TTS 接入
项目已新增服务端语音网关：
- `POST /api/speech/transcribe`：云端语音转文字
- `POST /api/speech/speak`：云端文字转语音

接入方式基于 OpenAI 兼容语音接口，因此既可直接使用 OpenAI，也可切到兼容协议的语音服务：

```bash
cd /root/kkk/项目
export DEEPSEEK_API_KEY="你的 DeepSeek Key"
export DEEPSEEK_MODEL="deepseek-chat"

export OPENAI_API_KEY="你的语音服务 Key"
export OPENAI_BASE_URL="https://api.openai.com/v1"
export OPENAI_ASR_MODEL="gpt-4o-mini-transcribe"
export OPENAI_TTS_MODEL="gpt-4o-mini-tts"
export OPENAI_TTS_VOICE="alloy"

npm start
```

可选环境变量：
- `OPENAI_API_KEY`：语音服务 Key，也支持别名 `SPEECH_API_KEY`
- `OPENAI_BASE_URL`：默认 `https://api.openai.com/v1`，也支持别名 `SPEECH_BASE_URL`
- `OPENAI_ASR_MODEL`：默认 `gpt-4o-mini-transcribe`
- `OPENAI_TRANSCRIBE_LANGUAGE`：默认 `zh`
- `OPENAI_TTS_MODEL`：默认 `gpt-4o-mini-tts`
- `OPENAI_TTS_VOICE`：默认 `alloy`
- `OPENAI_TTS_RESPONSE_FORMAT`：默认 `mp3`
- `OPENAI_SPEECH_TIMEOUT_MS`：默认 `20000`

## TTS / ASR 说明
当前项目已经具备：
- `ASR`：浏览器 Web Speech API 语音识别
- `TTS`：浏览器 Speech Synthesis 语音播报
- `云端 ASR/TTS`：OpenAI 兼容语音接口，由后端代理调用，不在前端暴露密钥

当前策略：
- 如果配置了云端 ASR，并且浏览器支持麦克风录音，语音输入优先走云端转写
- 如果配置了云端 TTS，回复播报优先走云端语音合成
- 云端失败时，自动回退到浏览器本地播报
- 未配置云端语音时，项目仍可继续使用浏览器原生语音能力

## 常用脚本
```bash
npm start
npm test
```

## 目录结构
```text
.
├─ server.js              # 启动入口
├─ src/server/
│  ├─ app.js              # HTTP 路由与响应
│  ├─ prompt.js           # 场景 Prompt 加载与编排
│  ├─ speech.js           # 云端 ASR / TTS 网关
│  ├─ config.js           # 运行配置
│  ├─ domain.js           # 业务规则、提醒解析、紧急识别
│  └─ store.js            # JSON 存储与原子写入
├─ config/
│  └─ agent-prompt.json   # 可配置 Agent Prompt
├─ web/
│  ├─ index.html          # 手机 Web 页面
│  ├─ styles.css          # 移动端视觉样式
│  ├─ app.js              # 前端交互逻辑
│  ├─ sw.js               # Service Worker
│  ├─ manifest.webmanifest
│  └─ icon.svg
├─ data/store.json        # 本地数据
├─ docs/PRD.md            # 完整 PRD
├─ docs/DEPLOY.md         # Linux 部署说明
└─ test/api.test.js       # 接口自动化测试
```

## 主要接口
- `GET /api/health`：健康检查、版本信息
- `GET /api/bootstrap`：前端初始化所需聚合数据
- `GET /api/ai/prompt`
- `GET /api/profile` / `PUT /api/profile`
- `GET /api/settings` / `PUT /api/settings`
- `GET /api/reminders` / `POST /api/reminders`
- `PATCH /api/reminders/:id` / `DELETE /api/reminders/:id`
- `POST /api/reminders/trigger`
- `POST /api/chat`
- `POST /api/speech/transcribe`
- `POST /api/speech/speak`
- `POST /api/emergency/report`
- `GET /api/dashboard`
- `GET /api/logs`

## 交付亮点
- 支持通过对话直接创建提醒，贴近“开口就能用”的产品目标。
- 服务端使用原子写入和数据归一化，减少 JSON 存储损坏风险。
- 紧急流程会带出地址与紧急联系人信息，便于真实求助。
- 家属面板支持类型、等级、关键词筛选，便于回溯重点事件。

## Linux 部署
详细说明见 [docs/DEPLOY.md](./docs/DEPLOY.md)。

最简方式：
```bash
HOST=0.0.0.0 PORT=3000 npm start
```

推荐正式环境：
1. `systemd` 常驻进程
2. `Nginx` 反向代理
3. HTTPS
4. 域名 + 手机浏览器访问

## 合规边界
- 本项目不做医疗诊断，不输出病情结论。
- 对高风险内容优先引导拨打 `120` 和联系家属。
- 只保存最小必要信息，建议线上环境启用 HTTPS 保护隐私。
