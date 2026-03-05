# 🤖 Node Monitor - J.A.R.V.I.S. 节点监控服务

> 实时监控团队节点状态，可视化展示运行情况

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
- ✅ **美观界面** - 现代深色主题，响应式设计
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

### v1.1.0 (2026-03-05)
- 🔧 **修复**：从 openclaw.json 读取真实配置，不再使用模拟数据
- ✨ **新增**：配置状态识别（已配置/未配置）
- ✨ **新增**：agent 目录存在性检测
- ✨ **新增**：配置重载 API (`/api/reload-config`)
- 📝 **文档**：更新配置说明和 API 文档

### v1.0.0 (2026-03-05)
- ✨ 初始版本发布
- ✅ 基础监控功能
- 🎨 美观界面设计
- 📱 响应式支持

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

1. Fork [本项目](https://github.com/Magic-KK/node-monitor)
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 [Pull Request](https://github.com/Magic-KK/node-monitor/pulls)

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
