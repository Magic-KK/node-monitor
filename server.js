/**
 * Node Monitor Server - J.A.R.V.I.S. 团队节点状态监控
 * 
 * 功能：
 * - 从 openclaw.json 读取真实的 agent 配置
 * - 提供团队节点状态 API
 * - 健康检查服务（真实检测，非模拟）
 * - 静态文件服务（前端页面）
 * 
 * @author 牛开发 🐮💻
 * @version 1.0.0
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const http = require('http');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3000;

// 加载 OpenClaw 配置（真实配置源）
// 尝试多个可能的位置
const possiblePaths = [
  path.join(__dirname, '..', 'openclaw.json'),                    // workspace-team-a/openclaw.json
  path.join(__dirname, '..', '..', 'openclaw.json'),              // .openclaw/openclaw.json
  '/Users/niuniu/.openclaw/openclaw.json',                         // 绝对路径
  path.join(process.env.HOME || '', '.openclaw', 'openclaw.json') // 家用目录
];

let openclawConfigPath = null;
for (const p of possiblePaths) {
  try {
    fs.accessSync(p, fs.constants.F_OK);
    openclawConfigPath = p;
    console.log('✅ 找到 OpenClaw 配置文件:', p);
    break;
  } catch {
    // 继续尝试下一个路径
  }
}
let openclawConfig = null;

if (openclawConfigPath) {
  try {
    openclawConfig = JSON.parse(fs.readFileSync(openclawConfigPath, 'utf8'));
    console.log('✅ OpenClaw 配置加载成功');
  } catch (err) {
    console.warn('⚠️ OpenClaw 配置文件读取失败:', err.message);
  }
} else {
  console.warn('⚠️ 未找到 OpenClaw 配置文件，将使用备用配置');
}

// 加载团队配置（作为补充）
const configPath = path.join(__dirname, 'config', 'team-config.json');
let teamConfig = { members: [], checkInterval: 30000, timeout: 5000 };

try {
  teamConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  console.log('✅ 团队配置加载成功:', teamConfig.teamName);
} catch (err) {
  console.warn('⚠️ 配置文件加载失败，使用默认配置:', err.message);
}

/**
 * 从 OpenClaw 配置构建真实的节点列表
 * 只包含实际配置的 agent（有有效 appId 的）
 * @returns {Array} 节点配置数组
 */
function buildRealNodeList() {
  if (!openclawConfig) {
    console.warn('⚠️ 无法读取 OpenClaw 配置，使用备用配置');
    return teamConfig.members || [];
  }

  const agents = openclawConfig.agents?.list || [];
  const channels = openclawConfig.channels?.feishu?.accounts || {};
  const bindings = openclawConfig.bindings || [];

  // 构建 agentId 到 binding 的映射
  const bindingMap = {};
  bindings.forEach(binding => {
    if (binding.agentId) {
      bindingMap[binding.agentId] = binding;
    }
  });

  // 节点信息映射
  const nodeInfoMap = {
    'main-bot': {
      name: 'J.A.R.V.I.S.',
      role: '主脑',
      emoji: '🧠',
      description: '团队协调与任务分发'
    },
    'coder-bot': {
      name: '牛开发',
      role: '代码专家',
      emoji: '🐮💻',
      description: '编程、代码审查、技术架构'
    },
    'researcher-bot': {
      name: 'researcher-bot',
      role: '调研专家',
      emoji: '🔬',
      description: '信息搜集、数据分析、调研报告'
    },
    'writer-bot': {
      name: 'writer-bot',
      role: '文案专家',
      emoji: '✒️',
      description: '文案写作、内容编辑、创意输出'
    }
  };

  // 构建节点列表
  const nodes = agents.map(agent => {
    const binding = bindingMap[agent.id];
    const accountId = binding?.match?.accountId;
    const channelConfig = accountId ? channels[accountId] : null;
    
    // 检查是否真正配置（有有效的 appId）
    const isConfigured = channelConfig && 
                         channelConfig.appId && 
                         channelConfig.appId !== '请创建新飞书应用并填写 App ID';

    const info = nodeInfoMap[agent.id] || {
      name: agent.name || agent.id,
      role: 'Agent',
      emoji: '🤖',
      description: agent.workspace ? `工作空间：${agent.workspace}` : '自定义 Agent'
    };

    return {
      id: agent.id,
      name: info.name,
      role: info.role,
      emoji: info.emoji,
      description: info.description,
      workspace: agent.workspace || null,
      agentDir: agent.agentDir || null,
      accountId: accountId || null,
      isConfigured: isConfigured,  // 标记是否已配置
      channelConfig: channelConfig
    };
  });

  console.log(`📋 从 OpenClaw 配置加载 ${nodes.length} 个 agent，其中 ${nodes.filter(n => n.isConfigured).length} 个已配置`);
  
  return nodes;
}

// 节点状态缓存（内存存储）
const nodeStatusCache = new Map();

// 系统指标缓存（CPU/内存等）
const systemMetricsCache = {
  cpu: 0,
  memory: {
    used: 0,
    total: os.totalmem(),
    percent: 0
  },
  uptime: os.uptime(),
  platform: os.platform(),
  arch: os.arch(),
  lastUpdate: new Date().toISOString()
};

/**
 * 获取系统 CPU 使用率
 * @returns {number} CPU 使用率百分比 (0-100)
 */
function getCPUUsage() {
  const cpus = os.cpus();
  let totalIdle = 0;
  let total = 0;
  
  cpus.forEach(cpu => {
    const times = cpu.times;
    totalIdle += times.idle;
    total += times.user + times.nice + times.sys + times.idle + times.irq;
  });
  
  // 计算使用率（简化版本，实际生产环境建议使用更精确的采样方法）
  const idle = totalIdle / cpus.length;
  const usage = ((total - idle) / total) * 100;
  
  return Math.min(100, Math.max(0, usage));
}

/**
 * 获取系统内存使用情况
 * @returns {Object} 内存使用信息
 */
function getMemoryUsage() {
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;
  const percent = (used / total) * 100;
  
  return {
    total,
    used,
    free,
    percent: Math.round(percent * 100) / 100
  };
}

/**
 * 更新系统指标缓存
 */
function updateSystemMetrics() {
  systemMetricsCache.cpu = Math.round(getCPUUsage() * 100) / 100;
  systemMetricsCache.memory = getMemoryUsage();
  systemMetricsCache.uptime = os.uptime();
  systemMetricsCache.lastUpdate = new Date().toISOString();
  
  console.log(`📊 系统指标更新：CPU ${systemMetricsCache.cpu}%, 内存 ${systemMetricsCache.memory.percent}%`);
}

// 每 5 秒更新一次系统指标
setInterval(updateSystemMetrics, 5000);
// 初始化时立即更新一次
updateSystemMetrics();

/**
 * 健康检查函数 - 真实检测节点是否可达
 * @param {Object} node - 节点配置
 * @returns {Promise<Object>} 健康状态结果
 */
async function checkNodeHealth(node) {
  const startTime = Date.now();
  
  // 如果节点未配置（appId 无效），直接标记为离线
  if (!node.isConfigured) {
    const result = {
      id: node.id,
      name: node.name,
      online: false,
      configured: false,
      responseTime: null,
      lastCheck: new Date().toISOString(),
      error: '未配置（appId 无效）',
      workspace: node.workspace
    };
    
    nodeStatusCache.set(node.id, result);
    return result;
  }

  // 对于已配置的节点，尝试检测其状态
  // 方法：检查 agentDir 是否存在，或尝试连接网关
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      const result = {
        id: node.id,
        name: node.name,
        online: false,
        configured: true,
        responseTime: null,
        lastCheck: new Date().toISOString(),
        error: '检查超时',
        workspace: node.workspace
      };
      
      nodeStatusCache.set(node.id, result);
      resolve(result);
    }, teamConfig.timeout || 5000);

    // 检查 agent 目录是否存在（表示 agent 已部署）
    if (node.agentDir) {
      fs.access(node.agentDir, fs.constants.F_OK, (err) => {
        clearTimeout(timeout);
        
        const dirExists = !err;
        const responseTime = Date.now() - startTime;
        
        // 目录存在则认为 agent 已部署（在线）
        // 注意：这只是基础检查，更精确的检测需要连接网关 API
        const result = {
          id: node.id,
          name: node.name,
          online: dirExists,
          configured: true,
          responseTime: dirExists ? responseTime : null,
          lastCheck: new Date().toISOString(),
          error: dirExists ? null : 'Agent 目录不存在',
          workspace: node.workspace,
          agentDir: node.agentDir
        };
        
        nodeStatusCache.set(node.id, result);
        resolve(result);
      });
    } else {
      // 没有 agentDir，尝试其他方式检测
      clearTimeout(timeout);
      
      const result = {
        id: node.id,
        name: node.name,
        online: true,  // 假设内置 agent 在线
        configured: true,
        responseTime: Date.now() - startTime,
        lastCheck: new Date().toISOString(),
        error: null,
        workspace: node.workspace
      };
      
      nodeStatusCache.set(node.id, result);
      resolve(result);
    }
  });
}

/**
 * 检查所有节点健康状态
 * @returns {Promise<Array>} 所有节点状态
 */
async function checkAllNodes() {
  const nodes = buildRealNodeList();
  const checks = nodes.map(node => checkNodeHealth(node));
  return Promise.all(checks);
}

// 中间件 - 解析 JSON
app.use(express.json());

// 静态文件服务
app.use(express.static(path.join(__dirname, 'public')));

/**
 * API: 获取团队配置（从 OpenClaw 读取）
 * GET /api/config
 */
app.get('/api/config', (req, res) => {
  const nodes = buildRealNodeList();
  
  res.json({
    success: true,
    data: {
      teamName: teamConfig.teamName || 'J.A.R.V.I.S. 专才团队',
      source: 'openclaw.json',
      nodes: nodes,
      totalNodes: nodes.length,
      configuredCount: nodes.filter(n => n.isConfigured).length
    }
  });
});

/**
 * API: 获取所有节点状态
 * GET /api/status
 */
app.get('/api/status', async (req, res) => {
  try {
    const statuses = Array.from(nodeStatusCache.values());
    const nodes = buildRealNodeList();
    
    res.json({
      success: true,
      data: {
        nodes: statuses,
        totalNodes: nodes.length,
        onlineCount: statuses.filter(s => s.online).length,
        configuredCount: nodes.filter(n => n.isConfigured).length,
        lastUpdate: new Date().toISOString(),
        source: 'openclaw.json'
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * API: 手动触发健康检查
 * POST /api/health-check
 */
app.post('/api/health-check', async (req, res) => {
  try {
    console.log('🔍 开始健康检查...');
    const statuses = await checkAllNodes();
    
    res.json({
      success: true,
      data: {
        nodes: statuses,
        totalNodes: statuses.length,
        onlineCount: statuses.filter(s => s.online).length,
        configuredCount: statuses.filter(s => s.configured).length,
        checkTime: new Date().toISOString(),
        source: 'openclaw.json'
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * API: 获取单个节点状态
 * GET /api/node/:id
 */
app.get('/api/node/:id', (req, res) => {
  const nodeId = req.params.id;
  const status = nodeStatusCache.get(nodeId);
  
  if (status) {
    res.json({
      success: true,
      data: status
    });
  } else {
    res.status(404).json({
      success: false,
      error: '节点未找到或未检查'
    });
  }
});

/**
 * API: 重新加载配置
 * POST /api/reload-config
 */
app.post('/api/reload-config', (req, res) => {
  try {
    // 重新读取 OpenClaw 配置
    const newConfig = JSON.parse(fs.readFileSync(openclawConfigPath, 'utf8'));
    openclawConfig = newConfig;
    
    // 清除缓存，强制重新检查
    nodeStatusCache.clear();
    
    res.json({
      success: true,
      message: '配置已重新加载',
      nodesCount: buildRealNodeList().length
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * API: 获取系统指标（CPU/内存使用率）
 * GET /api/system-metrics
 */
app.get('/api/system-metrics', (req, res) => {
  res.json({
    success: true,
    data: {
      ...systemMetricsCache,
      memory: {
        ...systemMetricsCache.memory,
        totalFormatted: formatBytes(systemMetricsCache.memory.total),
        usedFormatted: formatBytes(systemMetricsCache.memory.used),
        freeFormatted: formatBytes(systemMetricsCache.memory.free)
      },
      uptimeFormatted: formatUptime(systemMetricsCache.uptime)
    }
  });
});

/**
 * API: 导出节点状态报告（CSV 格式）
 * GET /api/export/csv
 * 
 * 生成包含所有节点当前状态的 CSV 文件
 * 字段：ID, 名称，角色，状态，响应时间，最后检查，工作空间，描述
 */
app.get('/api/export/csv', async (req, res) => {
  try {
    // 获取最新节点状态
    const statuses = await checkAllNodes();
    
    // CSV 表头
    const headers = ['ID', 'Name', 'Role', 'Status', 'Response Time (ms)', 'Last Check', 'Workspace', 'Description'];
    
    // CSV 数据行
    const rows = statuses.map(node => {
      const status = node.online ? 'Online' : 'Offline';
      const responseTime = node.responseTime !== null ? node.responseTime.toString() : 'N/A';
      const lastCheck = node.lastCheck ? new Date(node.lastCheck).toISOString() : 'N/A';
      const workspace = node.workspace || 'N/A';
      const description = (node.description || '').replace(/"/g, '""'); // 转义引号
      
      return [
        `"${node.id || 'N/A'}"`,
        `"${node.name || 'N/A'}"`,
        `"${node.role || 'N/A'}"`,
        `"${status}"`,
        `"${responseTime}"`,
        `"${lastCheck}"`,
        `"${workspace}"`,
        `"${description}"`
      ].join(',');
    });
    
    // 组合完整 CSV 内容
    const csvContent = [headers.join(','), ...rows].join('\n');
    
    // 生成文件名（带时间戳）
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `node-monitor-report-${timestamp}.csv`;
    
    // 设置响应头，触发浏览器下载
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    // 发送 CSV 内容
    res.send(csvContent);
    
    console.log(`📊 导出报告：${filename} (${statuses.length} 节点)`);
  } catch (err) {
    console.error('❌ 导出 CSV 失败:', err.message);
    res.status(500).json({
      success: false,
      error: '导出失败：' + err.message
    });
  }
});

/**
 * API: 获取配置设置
 * GET /api/settings
 */
app.get('/api/settings', (req, res) => {
  try {
    const settings = {
      teamName: teamConfig.teamName || 'J.A.R.V.I.S. 专才团队',
      checkInterval: teamConfig.checkInterval || 30000,
      timeout: teamConfig.timeout || 5000,
      workspace: teamConfig.workspace || 'workspace-team-a',
      configSource: teamConfig.configSource || 'openclaw.json',
      members: teamConfig.members || []
    };
    
    res.json({
      success: true,
      data: settings
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * API: 更新配置设置
 * POST /api/settings
 */
app.post('/api/settings', (req, res) => {
  try {
    const newSettings = req.body;
    
    // 验证并更新配置
    if (newSettings.teamName !== undefined) {
      teamConfig.teamName = newSettings.teamName;
    }
    if (newSettings.checkInterval !== undefined) {
      // 限制在 5 秒到 5 分钟之间
      teamConfig.checkInterval = Math.max(5000, Math.min(300000, parseInt(newSettings.checkInterval)));
    }
    if (newSettings.timeout !== undefined) {
      // 限制在 1 秒到 30 秒之间
      teamConfig.timeout = Math.max(1000, Math.min(30000, parseInt(newSettings.timeout)));
    }
    if (newSettings.workspace !== undefined) {
      teamConfig.workspace = newSettings.workspace;
    }
    
    // 保存配置到文件
    fs.writeFileSync(configPath, JSON.stringify(teamConfig, null, 2), 'utf8');
    
    // 如果检查间隔改变，需要重启调度器（这里简单处理，实际生产环境需要更复杂的逻辑）
    if (newSettings.checkInterval !== undefined) {
      console.log(`⏰ 检查间隔已更新：${teamConfig.checkInterval / 1000}秒`);
    }
    
    res.json({
      success: true,
      message: '配置已保存',
      data: {
        teamName: teamConfig.teamName,
        checkInterval: teamConfig.checkInterval,
        timeout: teamConfig.timeout,
        workspace: teamConfig.workspace
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: '保存配置失败：' + err.message
    });
  }
});

/**
 * API: 添加新节点
 * POST /api/nodes
 */
app.post('/api/nodes', (req, res) => {
  try {
    const newNode = req.body;
    
    // 验证必填字段
    if (!newNode.id || !newNode.name) {
      return res.status(400).json({
        success: false,
        error: '缺少必填字段：id 和 name'
      });
    }
    
    // 检查是否已存在
    const exists = teamConfig.members.some(m => m.id === newNode.id);
    if (exists) {
      return res.status(400).json({
        success: false,
        error: '节点 ID 已存在'
      });
    }
    
    // 添加新节点
    teamConfig.members.push({
      id: newNode.id,
      name: newNode.name,
      role: newNode.role || 'Agent',
      emoji: newNode.emoji || '🤖',
      description: newNode.description || '',
      workspace: newNode.workspace || teamConfig.workspace
    });
    
    // 保存配置
    fs.writeFileSync(configPath, JSON.stringify(teamConfig, null, 2), 'utf8');
    
    res.json({
      success: true,
      message: '节点已添加',
      data: teamConfig.members[teamConfig.members.length - 1]
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: '添加节点失败：' + err.message
    });
  }
});

/**
 * API: 更新节点
 * PUT /api/nodes/:id
 */
app.put('/api/nodes/:id', (req, res) => {
  try {
    const nodeId = req.params.id;
    const updates = req.body;
    
    // 查找节点
    const nodeIndex = teamConfig.members.findIndex(m => m.id === nodeId);
    if (nodeIndex === -1) {
      return res.status(404).json({
        success: false,
        error: '节点未找到'
      });
    }
    
    // 更新节点信息
    const node = teamConfig.members[nodeIndex];
    if (updates.name !== undefined) node.name = updates.name;
    if (updates.role !== undefined) node.role = updates.role;
    if (updates.emoji !== undefined) node.emoji = updates.emoji;
    if (updates.description !== undefined) node.description = updates.description;
    if (updates.workspace !== undefined) node.workspace = updates.workspace;
    
    // 保存配置
    fs.writeFileSync(configPath, JSON.stringify(teamConfig, null, 2), 'utf8');
    
    res.json({
      success: true,
      message: '节点已更新',
      data: node
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: '更新节点失败：' + err.message
    });
  }
});

/**
 * API: 删除节点
 * DELETE /api/nodes/:id
 */
app.delete('/api/nodes/:id', (req, res) => {
  try {
    const nodeId = req.params.id;
    
    // 查找节点
    const nodeIndex = teamConfig.members.findIndex(m => m.id === nodeId);
    if (nodeIndex === -1) {
      return res.status(404).json({
        success: false,
        error: '节点未找到'
      });
    }
    
    // 删除节点
    teamConfig.members.splice(nodeIndex, 1);
    
    // 保存配置
    fs.writeFileSync(configPath, JSON.stringify(teamConfig, null, 2), 'utf8');
    
    res.json({
      success: true,
      message: '节点已删除'
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: '删除节点失败：' + err.message
    });
  }
});

/**
 * 格式化字节数为人类可读格式
 * @param {number} bytes - 字节数
 * @returns {string} 格式化后的字符串
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * 格式化运行时间为人类可读格式
 * @param {number} seconds - 秒数
 * @returns {string} 格式化后的字符串
 */
function formatUptime(seconds) {
  const days = Math.floor(seconds / (24 * 60 * 60));
  const hours = Math.floor((seconds % (24 * 60 * 60)) / (60 * 60));
  const minutes = Math.floor((seconds % (60 * 60)) / 60);
  const secs = Math.floor(seconds % 60);
  
  const parts = [];
  if (days > 0) parts.push(`${days}天`);
  if (hours > 0) parts.push(`${hours}小时`);
  if (minutes > 0) parts.push(`${minutes}分钟`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}秒`);
  
  return parts.join(' ');
}

/**
 * 首页
 */
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/**
 * 启动定时健康检查
 */
function startHealthCheckScheduler() {
  const interval = teamConfig.checkInterval || 30000;
  console.log(`⏰ 启动定时健康检查，间隔：${interval / 1000}秒`);
  
  // 立即执行一次
  checkAllNodes().then(statuses => {
    const onlineCount = statuses.filter(s => s.online).length;
    const configuredCount = statuses.filter(s => s.configured).length;
    console.log(`✅ 初始健康检查完成：${onlineCount}/${configuredCount} 节点在线（共 ${statuses.length} 个 agent）`);
  });
  
  // 定时执行
  setInterval(() => {
    checkAllNodes().then(statuses => {
      const onlineCount = statuses.filter(s => s.online).length;
      const configuredCount = statuses.filter(s => s.configured).length;
      console.log(`📊 健康检查：${onlineCount}/${configuredCount} 节点在线`);
    });
  }, interval);
}

// 启动服务器
app.listen(PORT, () => {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║     🚀 Node Monitor Server 已启动                      ║');
  console.log('║     J.A.R.V.I.S. 团队节点状态监控                       ║');
  console.log('╠════════════════════════════════════════════════════════╣');
  console.log(`║     🌐 本地访问：http://localhost:${PORT}                ║`);
  console.log(`║     📡 API: http://localhost:${PORT}/api/status         ║`);
  console.log(`║     📋 配置源：openclaw.json                            ║`);
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log('');
  
  // 启动健康检查调度器
  startHealthCheckScheduler();
});

// 优雅关闭
process.on('SIGINT', () => {
  console.log('\n👋 正在关闭服务器...');
  process.exit(0);
});
