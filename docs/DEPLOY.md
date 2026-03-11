# Linux 部署说明

本文档面向 Ubuntu / Debian 系 Linux 服务器。

## 1. 运行环境
- Node.js 18 或 20
- `Nginx`
- `systemd`

## 2. 部署目录
建议放在：
```bash
/opt/elderly-companion-assistant
```

## 3. 安装 Node.js
如果服务器尚未安装 Node.js，可使用官方源或 `nvm`。示例：
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v
npm -v
```

## 4. 启动项目
```bash
cd /opt/elderly-companion-assistant
npm start
```

默认监听 `0.0.0.0:3000`。

## 5. 生产环境启动
```bash
HOST=0.0.0.0 PORT=3000 npm start
```

## 6. systemd 服务
创建文件：
```bash
sudo vim /etc/systemd/system/elderly-companion.service
```

内容如下：
```ini
[Unit]
Description=Elderly Companion Assistant
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/elderly-companion-assistant
Environment=NODE_ENV=production
Environment=HOST=0.0.0.0
Environment=PORT=3000
ExecStart=/usr/bin/node /opt/elderly-companion-assistant/server.js
Restart=always
RestartSec=3
User=root

[Install]
WantedBy=multi-user.target
```

执行：
```bash
sudo systemctl daemon-reload
sudo systemctl enable elderly-companion.service
sudo systemctl start elderly-companion.service
sudo systemctl status elderly-companion.service
```

## 7. Nginx 反向代理
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

启用配置：
```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 8. HTTPS
建议使用 `certbot`：
```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

## 9. 手机访问方式
- 同局域网：`http://服务器IP:3000`
- 正式环境：`https://your-domain.com`

## 10. 运行检查
```bash
curl http://127.0.0.1:3000/api/health
```

返回 `ok: true` 即表示服务可用。

## 11. 数据说明
- 数据保存在 `data/store.json`
- 如 JSON 损坏，服务会自动备份损坏文件并重新生成默认结构

## 12. 安全建议
- 生产环境启用 HTTPS
- 限制服务器安全组，仅开放必要端口
- 定期备份 `data/store.json`
- 如需公网演示，建议绑定域名而不是直接暴露 IP
