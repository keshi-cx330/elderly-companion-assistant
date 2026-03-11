# Linux 部署说明

本文档对应当前项目版本 `1.2.0`，适用于 Ubuntu / Debian 系 Linux 服务器。

## 1. 部署目标
推荐部署形态：
- `Node.js 20`
- `systemd` 常驻
- `Nginx` 反向代理
- `HTTPS`
- `SQLite` 持久化
- `家属 webhook` 通知

## 2. 运行前准备

### 系统依赖
- `node` / `npm`
- `nginx`
- `sqlite3`：仅在启用 SQLite 时需要

### 推荐部署目录
```bash
/opt/elderly-companion-assistant
```

## 3. 安装 Node.js
如果服务器还没有 Node.js，建议安装 Node 20：

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v
npm -v
```

如果要启用 SQLite：
```bash
sudo apt-get install -y sqlite3
sqlite3 --version
```

## 4. 放置项目
```bash
cd /opt
git clone https://github.com/keshi-cx330/elderly-companion-assistant.git
cd elderly-companion-assistant
```

本项目没有第三方 Node 运行时依赖，因此不需要 `npm install`。

## 5. 启动方式

### 最简启动
```bash
cd /opt/elderly-companion-assistant
HOST=0.0.0.0 PORT=3000 npm start
```

### 启用 DeepSeek
```bash
cd /opt/elderly-companion-assistant
HOST=0.0.0.0 \
PORT=3000 \
DEEPSEEK_API_KEY="你的密钥" \
DEEPSEEK_MODEL="deepseek-chat" \
npm start
```

### 启用 DeepSeek + 云端 ASR/TTS
```bash
cd /opt/elderly-companion-assistant
HOST=0.0.0.0 \
PORT=3000 \
DEEPSEEK_API_KEY="你的 DeepSeek 密钥" \
DEEPSEEK_MODEL="deepseek-chat" \
OPENAI_API_KEY="你的语音服务密钥" \
OPENAI_BASE_URL="https://api.openai.com/v1" \
OPENAI_ASR_MODEL="gpt-4o-mini-transcribe" \
OPENAI_TTS_MODEL="gpt-4o-mini-tts" \
OPENAI_TTS_VOICE="alloy" \
npm start
```

### 推荐生产启动
```bash
cd /opt/elderly-companion-assistant
HOST=0.0.0.0 \
PORT=3000 \
DEEPSEEK_API_KEY="你的 DeepSeek 密钥" \
DEEPSEEK_MODEL="deepseek-chat" \
OPENAI_API_KEY="你的语音服务密钥" \
OPENAI_BASE_URL="https://api.openai.com/v1" \
OPENAI_ASR_MODEL="gpt-4o-mini-transcribe" \
OPENAI_TTS_MODEL="gpt-4o-mini-tts" \
OPENAI_TTS_VOICE="alloy" \
STORAGE_DRIVER="sqlite" \
SQLITE_FILE="/opt/elderly-companion-assistant/data/store.db" \
NOTIFY_WEBHOOK_URLS="https://example.com/webhook-a,https://example.com/webhook-b" \
npm start
```

## 6. 环境变量说明

### 核心
- `HOST`
- `PORT`
- `MAX_BODY_SIZE`

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

### 云端语音
- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `OPENAI_ASR_MODEL`
- `OPENAI_TRANSCRIBE_LANGUAGE`
- `OPENAI_TTS_MODEL`
- `OPENAI_TTS_VOICE`
- `OPENAI_TTS_RESPONSE_FORMAT`
- `OPENAI_SPEECH_TIMEOUT_MS`

### 晨间播报 / 实时服务
- `OPEN_METEO_BASE_URL`
- `OPEN_METEO_GEOCODE_URL`
- `WEATHER_TIMEOUT_MS`
- `NEWS_RSS_URL`
- `NEWS_TIMEOUT_MS`
- `BRIEFING_CACHE_TTL_MS`

### 家属通知
- `NOTIFY_WEBHOOK_URLS`
- `NOTIFY_TIMEOUT_MS`

### 存储
- `STORAGE_DRIVER`
- `SQLITE_FILE`
- `SQLITE_BIN`
- `DATA_FILE`

## 7. systemd 部署

### 7.1 创建环境文件
```bash
sudo mkdir -p /etc/elderly-companion-assistant
sudo vim /etc/elderly-companion-assistant/app.env
```

示例：
```bash
NODE_ENV=production
HOST=0.0.0.0
PORT=3000

DEEPSEEK_API_KEY=your_deepseek_key
DEEPSEEK_MODEL=deepseek-chat

OPENAI_API_KEY=your_speech_key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_ASR_MODEL=gpt-4o-mini-transcribe
OPENAI_TTS_MODEL=gpt-4o-mini-tts
OPENAI_TTS_VOICE=alloy

STORAGE_DRIVER=sqlite
SQLITE_FILE=/opt/elderly-companion-assistant/data/store.db

NOTIFY_WEBHOOK_URLS=https://example.com/caregiver-webhook
```

### 7.2 创建服务文件
```bash
sudo vim /etc/systemd/system/elderly-companion.service
```

内容：
```ini
[Unit]
Description=Elderly Companion Assistant
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/elderly-companion-assistant
EnvironmentFile=/etc/elderly-companion-assistant/app.env
ExecStart=/usr/bin/node /opt/elderly-companion-assistant/server.js
Restart=always
RestartSec=3
User=root

[Install]
WantedBy=multi-user.target
```

### 7.3 启动服务
```bash
sudo systemctl daemon-reload
sudo systemctl enable elderly-companion.service
sudo systemctl start elderly-companion.service
sudo systemctl status elderly-companion.service
```

查看日志：
```bash
sudo journalctl -u elderly-companion.service -f
```

## 8. Nginx 反向代理
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

检查并重载：
```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 9. HTTPS
麦克风和部分语音能力在手机端通常要求 `HTTPS` 或 `localhost`，正式环境建议强制开启 HTTPS。

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

## 10. 运行检查
```bash
curl http://127.0.0.1:3000/api/health
curl http://127.0.0.1:3000/api/ai/prompt
curl http://127.0.0.1:3000/api/briefing
curl http://127.0.0.1:3000/api/caregiver/status
```

关键检查点：
- `/api/health` 返回 `ok: true`
- `storage.driver` 符合你的预期
- `/api/briefing` 能返回 `summary`
- `/api/caregiver/status` 能看到家属配置状态

## 11. 手机访问建议
- 安卓：优先 `Chrome`
- iPhone / iPad：优先 `Safari`
- 同局域网：`http://服务器IP:3000`
- 正式环境：`https://your-domain.com`

## 12. 数据与备份

### JSON 模式
- 数据文件：`data/store.json`
- 适合演示、单机、快速验收

### SQLite 模式
- 数据文件：`data/store.db`
- 更适合长期运行、备份和稳定性要求更高的环境

### 备份示例
```bash
cp /opt/elderly-companion-assistant/data/store.json /backup/store-$(date +%F).json
cp /opt/elderly-companion-assistant/data/store.db /backup/store-$(date +%F).db
```

## 13. 家属通知对接建议
优先推荐三类 webhook 目标：
- 企业微信机器人
- 钉钉机器人
- n8n / Zapier / Make 自动化工作流

项目当前会发送：
- 紧急事件告警
- 手动一键求助
- 测试通知
- 每日安心摘要

## 14. 已知边界
- 当前没有正式登录鉴权和角色权限系统
- 当前没有真实短信 / 自动外呼网关
- 实时天气和新闻依赖外部服务，异常时会自动降级
- 医疗相关内容只做求助引导，不做诊断

## 15. 建议的正式上线顺序
1. 先启用 HTTPS
2. 再启用 SQLite
3. 接入家属 webhook
4. 最后对外演示或开放访问
