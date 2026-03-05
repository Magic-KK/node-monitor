# 🤖 Node Monitor - J.A.R.V.I.S. 节点监控服务

> 实时监控团队节点状态，可视化展示运行情况

![Version](https://img.shields.io/badge/version-v1.28.0-6C63FF.svg?style=flat-square)
[![GitHub stars](https://img.shields.io/github/stars/Magic-KK/node-monitor?style=flat-square)](https://github.com/Magic-KK/node-monitor/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/Magic-KK/node-monitor?style=flat-square)](https://github.com/Magic-KK/node-monitor/network)
[![GitHub issues](https://img.shields.io/github/issues/Magic-KK/node-monitor?style=flat-square)](https://github.com/Magic-KK/node-monitor/issues)
[![License](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](https://github.com/Magic-KK/node-monitor/blob/main/LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D14.0.0-green.svg?style=flat-square)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/express-4.18.2-blue.svg?style=flat-square)](https://expressjs.com/)

[🔗 GitHub 仓库](https://github.com/Magic-KK/node-monitor) | [📖 在线文档](#-api-文档)

---

## 📖 功能介绍

Node Monitor 是一个专为 J.A.R.V.I.S. 专才团队设计的节点状态监控服务，提供：

- ✅ **真实状态检测** - 从 `openclaw.json` 读取真实配置，非模拟数据
- ✅ **团队配置展示** - 清晰展示所有成员信息和职责
- ✅ **实时状态监控** - 在线/离线/未配置状态实时轮询（30 秒间隔）
- ✅ **健康检查** - 手动/自动检测节点可用性（检查 agent 目录）
- ✅ **配置状态识别** - 自动识别已配置/未配置的节点（根据 appId 有效性）
- 🎨 **赛博朋克界面** - 霓虹配色 + 深色主题 + 辉光动画
- 🌐 **动态背景** - 网格动画 + 扫描线效果
- ✨ **炫酷特效** - 悬浮/脉冲/流光/全息卡片
- 📱 **响应式设计** - 桌面/移动端完美适配
- ✅ **API 支持** - RESTful API 方便集成

---

## 🚀 快速开始

### 1. 克隆项目

```bash
git clone https://github.com/Magic-KK/node-monitor.git
cd node-monitor
```

### 2. 安装依赖

```bash
npm install
```

### 2. 启动服务

```bash
# 生产模式
npm start

# 开发模式（自动重载）
npm run dev
```

### 3. 访问界面

打开浏览器访问：

- **主界面**: http://localhost:3000
- **API**: http://localhost:3000/api/status
- **配置**: http://localhost:3000/api/config

---

## 🐳 Docker 部署

### 方式一：使用 Docker Compose（推荐）

```bash
# 启动服务
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

### 方式二：手动构建和运行

```bash
# 构建镜像
docker build -t node-monitor:latest .

# 运行容器
docker run -d \
  -p 3000:3000 \
  --name node-monitor \
  -v $(pwd)/config:/app/config \
  -v $(pwd)/data:/app/data \
  node-monitor:latest

# 查看日志
docker logs -f node-monitor

# 停止并删除容器
docker stop node-monitor && docker rm node-monitor
```

### 方式三：使用 npm 脚本

```bash
# 构建镜像
npm run docker:build

# 运行容器
npm run docker:run

# 查看日志
npm run docker:logs

# 停止容器
npm run docker:stop
```

### 数据持久化

Docker 部署会自动挂载以下目录，确保数据持久化：

- `./config` - 配置文件
- `./data/history` - 历史状态记录
- `./data/logs` - 日志数据
- `./data/reports` - 报告数据
- `./data/alerts` - 告警数据

### 环境变量

可以通过环境变量配置服务：

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `NODE_ENV` | 运行环境 | `production` |
| `PORT` | HTTP 服务端口 | `3000` |
| `HTTPS_PORT` | HTTPS 服务端口 | `3443` |
| `HTTPS_ENABLED` | 是否启用 HTTPS | `false` |
| `SSL_CERT_PATH` | SSL 证书路径 | `./config/ssl/server.crt` |
| `SSL_KEY_PATH` | SSL 私钥路径 | `./config/ssl/server.key` |
| `FEISHU_WEBHOOK` | 飞书 webhook 地址 | 无 |

---

## 🔒 HTTPS 安全连接

### 启用 HTTPS（本地开发）

Node Monitor 支持 HTTPS 安全连接，保护数据传输安全。

#### 步骤 1：生成 SSL 证书

```bash
# 生成自签名证书（开发环境）
npm run generate-certs
```

证书将保存在 `config/ssl/` 目录：
- `server.crt` - SSL 证书
- `server.key` - 私钥

> ⚠️ **注意**：自签名证书在浏览器中会显示安全警告，点击"继续访问"即可。生产环境请使用正式 SSL 证书。

#### 步骤 2：启动 HTTPS 服务

```bash
# 方式 1：使用 npm 脚本
npm start:https

# 方式 2：设置环境变量
HTTPS_ENABLED=true npm start
```

#### 步骤 3：访问 HTTPS 服务

- **主界面**: https://localhost:3443
- **API**: https://localhost:3443/api/status
- **WebSocket**: wss://localhost:3443/ws

### Docker 启用 HTTPS

编辑 `docker-compose.yml`，取消注释以下环境变量：

```yaml
environment:
  - HTTPS_ENABLED=true
  - HTTPS_PORT=3443
  - SSL_CERT_PATH=/app/config/ssl/server.crt
  - SSL_KEY_PATH=/app/config/ssl/server.key
```

然后重启服务：

```bash
docker-compose up -d
```

### 生产环境 HTTPS 配置

生产环境建议使用正式的 SSL 证书（如 Let's Encrypt）：

```bash
# 使用 Let's Encrypt 证书（示例）
cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem ./config/ssl/server.crt
cp /etc/letsencrypt/live/yourdomain.com/privkey.pem ./config/ssl/server.key
```

---

## 📁 项目结构

```
node-monitor/
├── package.json              # 项目配置和依赖
├── .gitignore               # Git 忽略配置
├── README.md                # 使用说明（本文件）
├── server.js                # 主服务器（Express + API）
├── config/
│   └── team-config.json     # 团队节点配置
└── public/
    ├── index.html           # 主页面
    ├── styles.css           # 样式文件
    └── app.js               # 前端逻辑
```

---

## ⚙️ 配置说明

### 配置源

**Node Monitor 从 `openclaw.json` 自动读取真实的 agent 配置**，包括：

- agent 列表（`agents.list`）
- 飞书频道配置（`channels.feishu.accounts`）
- agent 绑定关系（`bindings`）

**状态判断逻辑：**

| 状态 | 条件 |
|------|------|
| 🟢 在线 | 已配置 + agent 目录存在 |
| 🔴 离线 | 已配置 + agent 目录不存在 |
| ⚠️ 未配置 | appId 无效或缺失 |

### team-config.json

`config/team-config.json` 作为备用配置，包含：

- 团队名称
- 节点描述信息（emoji、role、description）
- 健康检查间隔设置

```json
{
  "teamName": "J.A.R.V.I.S. 专才团队",
  "members": [
    {
      "id": "coder-bot",
      "name": "牛开发",
      "role": "代码专家",
      "emoji": "🐮💻",
      "description": "编程、代码审查、技术架构",
      "host": "niuniu 的 Mac mini",
      "port": 3001,
      "healthEndpoint": "/status"
    }
  ],
  "checkInterval": 30000,  // 健康检查间隔（毫秒）
  "timeout": 5000          // 请求超时时间（毫秒）
}
```

### 环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| PORT | 3000 | 服务端口 |
| NODE_ENV | development | 运行环境 |

---

## 🌐 API 文档

### GET /api/config

获取团队配置信息

**响应示例：**
```json
{
  "success": true,
  "data": {
    "teamName": "J.A.R.V.I.S. 专才团队",
    "members": [...],
    "checkInterval": 30000
  }
}
```

### GET /api/status

获取所有节点当前状态

**响应示例：**
```json
{
  "success": true,
  "data": {
    "nodes": [...],
    "totalNodes": 5,
    "onlineCount": 2,
    "configuredCount": 2,
    "lastUpdate": "2026-03-05T03:00:00.000Z",
    "source": "openclaw.json"
  }
}
```

**字段说明：**

- `totalNodes` - 总 agent 数量
- `onlineCount` - 在线数量
- `configuredCount` - 已配置数量（有有效 appId）
- `source` - 配置来源

### POST /api/health-check

手动触发健康检查

**响应示例：**
```json
{
  "success": true,
  "data": {
    "nodes": [...],
    "totalNodes": 4,
    "onlineCount": 3,
    "checkTime": "2026-03-05T03:00:00.000Z"
  }
}
```

### GET /api/node/:id

获取单个节点状态

**参数：**
- `id` - 节点 ID

**响应示例：**
```json
{
  "success": true,
  "data": {
    "id": "coder-bot",
    "name": "牛开发",
    "online": true,
    "responseTime": 45,
    "lastCheck": "2026-03-05T03:00:00.000Z"
  }
}
```

---

## 🎨 界面特性

- **深色主题** - 护眼设计，适合长时间监控
- **响应式布局** - 适配桌面和移动设备
- **状态动画** - 在线状态脉动效果
- **自动刷新** - 可开关的自动状态更新
- **通知支持** - 浏览器桌面通知（需授权）

---

## 🛠️ 开发指南

### 添加新节点

1. 编辑 `config/team-config.json`
2. 在 `members` 数组中添加新成员配置
3. 重启服务

### 修改健康检查逻辑

编辑 `server.js` 中的 `checkNodeHealth()` 函数：

```javascript
async function checkNodeHealth(member) {
  // 实际部署时替换为真实 HTTP 请求
  // 例如：await fetch(`http://${member.host}:${member.port}${member.healthEndpoint}`)
}
```

### 自定义样式

编辑 `public/styles.css`，修改 CSS 变量：

```css
:root {
  --accent-primary: #00d9ff;  /* 主色调 */
  --success: #00ff88;         /* 在线颜色 */
  --danger: #ff4757;          /* 离线颜色 */
}
```

---

## 📦 部署建议

### 本地开发

```bash
npm run dev  # 自动重载
```

### 生产环境

```bash
# 使用 PM2
pm2 start server.js --name node-monitor

# 或使用 Docker
docker build -t node-monitor .
docker run -p 3000:3000 node-monitor
```

### 部署到 GitHub

本项目已开源在 GitHub：

**👉 https://github.com/Magic-KK/node-monitor**

```bash
# 克隆项目
git clone https://github.com/Magic-KK/node-monitor.git
cd node-monitor

# 安装依赖
npm install

# 启动服务
npm start
```

---

## 🧪 测试

### 手动测试

1. 访问 http://localhost:3000
2. 点击"刷新状态"按钮
3. 点击"健康检查"按钮
4. 观察节点状态变化

### API 测试

```bash
# 获取状态
curl http://localhost:3000/api/status

# 健康检查
curl -X POST http://localhost:3000/api/health-check
```

---

## 📝 更新日志

### v1.8.0 (2026-03-05) - CSV 导出报告功能 📊
- ✨ **新增** `/api/export/csv` API 端点
- 📄 **支持** 一键导出所有节点状态为 CSV 格式
- 📥 **自动** 触发浏览器下载，文件名包含时间戳
- 📋 **字段** ID、名称、角色、状态、响应时间、最后检查、工作空间、描述
- 💾 **兼容** Excel/Numbers 等表格软件

### v1.7.0 (2026-03-05) - 配置管理 UI 🔧
- 🎛️ **新增** 配置管理弹窗界面（基础设置/节点管理/添加节点）
- 🔌 **实现** 设置 API：GET/POST `/api/settings`
- 📝 **实现** 节点管理 API：POST/PUT/DELETE `/api/nodes`
- ✅ **支持** 表单验证和错误提示
- 🗑️ **支持** 节点增删改查操作
- 🎨 **优化** UI 样式，支持亮色/暗色模式自适应

### v1.6.0 (2026-03-05) - 音效反馈系统 🔊
- 🔊 **新增** Web Audio API 音效系统（无需外部文件）
- 🎵 **实现** 5 种场景音效：刷新完成、节点上线、节点离线、错误、成功
- 🔇 **支持** 音效开关控制，localStorage 持久化
- ⚡ **优化** 音量包络避免爆音

### v1.5.0 (2026-03-05) - 3D 卡片效果 🎴
- 🎴 **新增** 鼠标悬停 3D 倾斜效果（最大 15 度）
- 💫 **实现** 动态光晕跟随鼠标移动
- ✨ **支持** 内容层浮起效果（translateZ）
- 🎨 **优化** 悬停阴影增强深度感

### v1.4.0 (2026-03-05) - 节点连接线路图 🕸️
- 🕸️ **新增** canvas 连线可视化图层
- 🔗 **实现** 主脑节点自动连接到所有专才节点
- ✨ **支持** 虚线连线效果 + 端点圆圈装饰
- 🌟 **优化** 在线节点连线带霓虹光晕效果

### v1.3.0 (2026-03-05) - 主题切换 🌓
- 🌓 **新增** 暗色/亮色模式切换功能
- 💾 **支持** localStorage 持久化用户偏好
- 🎨 **优化** CSS 变量支持双主题
- 🔄 **支持** 平滑过渡动画效果

### v1.2.0 (2026-03-05) - 赛博朋克界面 🎨
- 🎨 **新增** 赛博朋克风格界面（霓虹配色 + 深色主题）
- 🌐 **实现** 动态网格背景 + 扫描线效果
- ✨ **支持** 辉光/悬浮/脉冲/流光等多种动画效果
- 📱 **优化** 响应式布局，移动端完美适配

### v1.1.0 (2026-03-05) - 真实状态检测 ✅
- ✅ **新增** 从 openclaw.json 读取真实配置
- 📋 **实现** 配置状态识别（已配置/未配置）
- 🔍 **支持** agent 目录存在性检测
- 🚨 **新增** 健康检查功能（手动/自动）

### v1.0.0 (2026-03-05) - 初始版本 🚀
- ✨ 初始版本发布
- ✅ 基础监控功能
- 🎨 美观界面设计
- 📱 响应式支持

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

### 贡献流程

1. Fork [本项目](https://github.com/Magic-KK/node-monitor)
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改（遵循下方的[提交规范](#-提交规范)）
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 [Pull Request](https://github.com/Magic-KK/node-monitor/pulls)

### 📏 提交规范

本项目遵循统一的 Git 提交格式，确保提交历史清晰可读：

**基本格式：**
```
<emoji> <类型>: <简短描述>
```

**常用提交类型：**

| Emoji | 类型 | 用途 | 示例 |
|-------|------|------|------|
| ✨ | feat | 新增功能 | `✨ feat: 新增节点响应时间图表` |
| 🐛 | fix | 修复 bug | `🐛 fix: 修复离线状态显示错误` |
| 🎨 | style | 样式优化 | `🎨 style(ui): 优化卡片悬浮动画` |
| ⚡ | perf | 性能优化 | `⚡ perf: 优化健康检查接口性能` |
| 📝 | docs | 文档更新 | `📝 docs: 更新安装说明` |
| 🔧 | config | 配置修改 | `🔧 config: 更新飞书配置` |
| ♻️ | refactor | 代码重构 | `♻️ refactor: 重构健康检查逻辑` |
| 🚀 | init | 初始提交 | `🚀 init: 项目初始化` |
| 📦 | deps | 依赖更新 | `📦 deps: 更新 express 版本` |
| 🎉 | merge | 合并分支 | `🎉 merge: 合并 feature 分支` |

**完整示例：**
```bash
# 新功能
git commit -m "✨ feat: 新增暗色/亮色模式切换功能"

# 修复 bug
git commit -m "🐛 fix: 修复节点状态显示错误"

# 界面优化
git commit -m "🎨 style(ui): 优化卡片边框效果"

# 性能优化
git commit -m "⚡ perf: 优化接口响应速度"

# 文档更新
git commit -m "📝 docs: 更新 API 文档"
```

详细规范请查看 [CONTRIBUTING.md](CONTRIBUTING.md)。

---

## 📄 许可证

MIT License - 详见 [LICENSE](LICENSE)

---

## 👨‍💻 作者

**牛开发** 🐮💻  
J.A.R.V.I.S. 专才团队 - 代码专家

---

## 🙏 致谢

- [Express.js](https://expressjs.com/) - Web 框架
- [J.A.R.V.I.S. Team](https://github.com/jarvis-team) - 团队支持

---

<div align="center">

**Made with ❤️ by 牛开发** 🐮💻

[⬆ 返回顶部](#-node-monitor---jarvis-节点监控服务)

---

[🌟 Star 这个项目](https://github.com/Magic-KK/node-monitor/stargazers) | [🍴 Fork 这个项目](https://github.com/Magic-KK/node-monitor/network/members) | [📧 联系作者](https://github.com/Magic-KK)

</div>
