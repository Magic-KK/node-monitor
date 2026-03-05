# 自动任务执行说明

## 任务名称
node-monitor-auto-improve

## 执行频率
每 30 分钟自动执行

## 执行流程

1. 读取 `/Users/niuniu/.openclaw/workspace-main/memory/node-monitor-improvements.md` 查看已完成的功能
2. 从改进点子池中选择一个未实现的功能
3. 让牛开发实现该功能
4. 完善代码后提交 Git
5. 推送到 GitHub
6. 重启本地服务
7. 更新改进记录

---

## ⚠️ Git 提交规范（必须遵守）

### 提交格式
```
<emoji> <类型>: <描述>
```

### 常用类型

| Emoji | 类型 | 用途 | 示例 |
|-------|------|------|------|
| ✨ | feat | 新增功能 | `✨ feat: 新增粒子背景动画` |
| 🐛 | fix | 修复 bug | `🐛 fix: 修复节点状态显示错误` |
| 🎨 | style | 样式优化 | `🎨 style(ui): 优化卡片边框效果` |
| ⚡ | perf | 性能优化 | `⚡ perf: 优化接口响应速度` |
| 📝 | docs | 文档更新 | `📝 docs: 更新 API 文档` |
| 🔧 | config | 配置修改 | `🔧 config: 更新飞书配置` |
| ♻️ | refactor | 代码重构 | `♻️ refactor: 重构健康检查逻辑` |
| 🚀 | init | 初始提交 | `🚀 init: 项目初始化` |
| 📦 | deps | 依赖更新 | `📦 deps: 更新 express 到最新版` |
| 🎉 | merge | 合并分支 | `🎉 merge: 合并 feature 分支` |

### 完整示例

```bash
# 新功能
git commit -m "✨ feat: 新增节点响应时间图表"

# 修复 bug
git commit -m "🐛 fix: 修复离线状态显示错误"

# 界面优化
git commit -m "🎨 style(ui): 优化卡片悬浮动画"

# 性能优化
git commit -m "⚡ perf: 优化健康检查接口性能"

# 文档更新
git commit -m "📝 docs: 更新安装说明"
```

---

## 🔄 本地服务重启

```bash
# 停止旧服务
pkill -f "node.*server.js" || true

# 启动新服务
cd /Users/niuniu/.openclaw/workspace-team-a/node-monitor && npm start
```

---

## 📊 改进点子池

详见 `node-monitor-improvements.md`
