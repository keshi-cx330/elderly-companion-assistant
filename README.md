# 老人陪伴助手

面向老年人的手机 Web 端陪伴、提醒与紧急求助助手。项目支持语音优先的对话交互、日常提醒管理、紧急风险识别、家属追溯日志，以及可直接部署到 Linux 服务器的无依赖 Node.js 服务端。

## 核心能力
- 语音优先：浏览器语音识别 + 语音播报，老人打开手机浏览器即可使用。
- 陪伴对话：围绕问候、孤独情绪、提醒需求、联系家人等常见场景给出简短回复。
- 提醒闭环：支持手动创建提醒，也支持自然语言直接创建，例如“每天早上 8 点提醒我吃药”。
- 紧急求助：识别胸痛、摔倒、救命、昏迷等高风险表达，自动弹出求助流程并留痕。
- 家属视图：提供统计概览、筛选日志、最近高风险事件提示。
- 老人友好：大字模式、按钮大、操作少、单屏核心动作明确。
- PWA 化：支持加到手机桌面，缓存页面外壳，弱网下仍可保留基础界面。

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
│  ├─ config.js           # 运行配置
│  ├─ domain.js           # 业务规则、提醒解析、紧急识别
│  └─ store.js            # JSON 存储与原子写入
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
- `GET /api/profile` / `PUT /api/profile`
- `GET /api/settings` / `PUT /api/settings`
- `GET /api/reminders` / `POST /api/reminders`
- `PATCH /api/reminders/:id` / `DELETE /api/reminders/:id`
- `POST /api/reminders/trigger`
- `POST /api/chat`
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
