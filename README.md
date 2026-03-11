# 老人陪伴助手（手机 Web）

基于 `Node.js` 构建的移动端 Web MVP，支持：
- 语音/文字陪伴对话
- 日常提醒管理
- 高风险表达识别与紧急求助引导
- 家属查看关键日志与概览数据

## 1. 本地运行
```bash
node -v
# 建议 >= 18

npm start
```

默认地址：`http://localhost:3000`

## 2. 项目结构
```text
.
├─ server.js          # 后端服务与 API
├─ web/
│  ├─ index.html      # 前端页面
│  ├─ styles.css      # 移动端样式
│  └─ app.js          # 前端业务逻辑
├─ data/store.json    # 本地持久化数据
└─ docs/PRD.md        # 产品需求文档
```

## 3. 主要接口
- `GET /api/health`：服务健康检查
- `POST /api/chat`：对话与紧急识别
- `POST /api/reminders`：新增提醒
- `POST /api/reminders/trigger`：提醒触发上报
- `GET /api/dashboard`：家属概览
- `GET /api/logs`：日志查询

## 4. 部署建议（服务器）
### 4.1 直接运行
```bash
PORT=3000 npm start
```

### 4.2 反向代理（Nginx 示例）
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

### 4.3 进程守护（可选）
- 可使用 `pm2` 或系统服务守护 `node server.js`。

## 5. 合规说明
- 本项目不提供医疗诊断结论。
- 对高风险表达优先触发求助流程（120 + 紧急联系人）。
- 建议部署时启用 HTTPS，保护隐私数据传输。
