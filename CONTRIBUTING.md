# Git 提交规范

## 提交格式

```
<类型>: <简短描述>
```

## 提交类型

### 🎨 界面相关
- `feat(ui)` - 新增界面功能
- `style(ui)` - 界面样式调整
- `perf(ui)` - 界面性能优化

### 📊 功能相关
- `feat` - 新增功能
- `fix` - 修复 bug
- `update` - 功能更新/改进
- `remove` - 删除功能

### 🔧 技术相关
- `refactor` - 代码重构
- `perf` - 性能优化
- `config` - 配置文件修改
- `deps` - 依赖更新

### 📝 文档相关
- `docs` - 文档更新
- `readme` - README 更新

### 🚀 其他
- `init` - 初始提交
- `merge` - 合并分支
- `chore` - 其他不改变代码逻辑的改动

## 示例

```
✨ feat: 新增暗色/亮色模式切换功能
🐛 fix: 修复节点状态显示错误
🎨 style(ui): 优化卡片边框效果
⚡ perf: 优化健康检查性能
📝 docs: 更新 API 文档
🔧 config: 更新 OpenClaw 配置
🚀 init: 初始提交 - J.A.R.V.I.S. 节点监控服务
```

## Emoji 前缀（可选但推荐）

- ✨ `feat` - 新功能
- 🐛 `fix` - 修复
- 🎨 `style` - 样式
- ⚡ `perf` - 性能
- 📝 `docs` - 文档
- 🔧 `config` - 配置
- 🚀 `init` - 初始
- ♻️ `refactor` - 重构
- 📦 `deps` - 依赖
- 🎉 `merge` - 合并

## 完整提交示例

```bash
# 新功能
git commit -m "✨ feat: 新增节点响应时间图表"

# 修复 bug
git commit -m "🐛 fix: 修复离线状态显示错误"

# 界面优化
git commit -m "🎨 style(ui): 优化卡片悬浮动画效果"

# 性能优化
git commit -m "⚡ perf: 优化健康检查接口响应速度"

# 文档更新
git commit -m "📝 docs: 更新安装说明和 API 文档"

# 配置修改
git commit -m "🔧 config: 更新飞书应用配置"
```

## 提交信息结构

```
<emoji> <类型>: <简短描述>

[可选：详细描述]
[可选：关联 issue]
```

### 示例

```
✨ feat: 新增主题切换功能

- 添加暗色/亮色模式支持
- 实现主题切换按钮
- 支持 localStorage 持久化

Closes #12
```
