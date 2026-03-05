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
const WebSocket = require('ws');

const app = express();
const PORT = process.env.PORT || 3000;

// ===== WebSocket 实时推送系统 =====
// 创建 HTTP 服务器
const server = http.createServer(app);

// 创建 WebSocket 服务器
const wss = new WebSocket.Server({ server, path: '/ws' });

// 客户端连接集合
const clients = new Set();

/**
 * 广播消息给所有连接的客户端
 * @param {Object} data - 要发送的数据对象
 */
function broadcast(data) {
  const message = JSON.stringify(data);
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

/**
 * 发送消息给单个客户端
 * @param {WebSocket} client - 客户端连接
 * @param {Object} data - 要发送的数据对象
 */
function sendToClient(client, data) {
  if (client.readyState === WebSocket.OPEN) {
    client.send(JSON.stringify(data));
  }
}

// WebSocket 连接处理
wss.on('connection', (ws, req) => {
  const clientId = req.socket.remoteAddress + ':' + req.socket.remotePort;
  console.log(`🔌 WebSocket 客户端已连接：${clientId}`);
  
  // 添加到客户端集合
  clients.add(ws);
  
  // 发送欢迎消息和当前状态
  sendToClient(ws, {
    type: 'connected',
    clientId: clientId,
    timestamp: new Date().toISOString(),
    message: '欢迎连接到 Node Monitor WebSocket'
  });
  
  // 发送当前节点状态
  const statuses = Array.from(nodeStatusCache.values());
  sendToClient(ws, {
    type: 'initial_state',
    data: {
      nodes: statuses,
      timestamp: new Date().toISOString()
    }
  });
  
  // 处理客户端消息
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      console.log(`📨 收到客户端消息：${clientId}`, data);
      
      // 处理不同类型的客户端请求
      switch (data.type) {
        case 'ping':
          sendToClient(ws, {
            type: 'pong',
            timestamp: new Date().toISOString()
          });
          break;
        case 'request_state':
          // 立即返回当前状态
          const currentStatuses = Array.from(nodeStatusCache.values());
          sendToClient(ws, {
            type: 'state_update',
            data: {
              nodes: currentStatuses,
              timestamp: new Date().toISOString()
            }
          });
          break;
        case 'request_metrics':
          // 返回系统指标
          sendToClient(ws, {
            type: 'metrics_update',
            data: {
              ...systemMetricsCache,
              timestamp: new Date().toISOString()
            }
          });
          break;
      }
    } catch (err) {
      console.warn('⚠️ 解析客户端消息失败:', err.message);
    }
  });
  
  // 处理断开连接
  ws.on('close', () => {
    console.log(`🔌 WebSocket 客户端已断开：${clientId}`);
    clients.delete(ws);
  });
  
  // 处理错误
  ws.on('error', (err) => {
    console.error(`❌ WebSocket 错误 (${clientId}):`, err.message);
    clients.delete(ws);
  });
});

console.log('🌐 WebSocket 服务器已启动：ws://localhost:' + PORT + '/ws');

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

// 历史数据存储路径
const historyDir = path.join(__dirname, 'data', 'history');
const historyFilePath = path.join(historyDir, 'node-history.json');

// 告警配置和数据路径
const alertsDir = path.join(__dirname, 'data', 'alerts');
const alertsConfigPath = path.join(alertsDir, 'alerts-config.json');
const alertsHistoryPath = path.join(alertsDir, 'alerts-history.json');

// 告警配置缓存
let alertsConfig = {
  enabled: false,
  feishuWebhook: '',
  emailEnabled: false,
  emailConfig: {
    smtpHost: '',
    smtpPort: 587,
    username: '',
    password: '',
    from: '',
    to: []
  },
  notifyOnOffline: true,    // 节点离线时通知
  notifyOnOnline: false,    // 节点上线时通知（可选，避免骚扰）
  notifyOnConfigChange: false, // 配置变化时通知
  cooldownMinutes: 5        // 同一节点告警冷却时间（分钟）
};

// 告警发送历史（用于冷却）
const alertsHistory = [];

// ===== 实时日志系统 =====
// 内存日志缓冲区（保留最近 200 条）
const LOG_BUFFER_SIZE = 200;
const logBuffer = [];

// 日志级别
const LOG_LEVELS = {
  INFO: 'INFO',
  WARNING: 'WARNING',
  ERROR: 'ERROR',
  SUCCESS: 'SUCCESS'
};

/**
 * 添加日志到缓冲区
 * @param {string} level - 日志级别
 * @param {string} message - 日志消息
 * @param {string} [source] - 日志来源（可选）
 */
function addLog(level, message, source = 'SYSTEM') {
  const logEntry = {
    id: Date.now() + '-' + Math.random().toString(36).substr(2, 9),
    timestamp: new Date().toISOString(),
    level: level,
    message: message,
    source: source
  };
  
  logBuffer.push(logEntry);
  
  // 保持缓冲区大小限制
  if (logBuffer.length > LOG_BUFFER_SIZE) {
    logBuffer.shift();
  }
  
  // 同时在控制台输出
  const logPrefix = `[${new Date().toLocaleTimeString('zh-CN')}]`;
  const logLevelColors = {
    'INFO': '\x1b[36m',      // 青色
    'WARNING': '\x1b[33m',   // 黄色
    'ERROR': '\x1b[31m',     // 红色
    'SUCCESS': '\x1b[32m'    // 绿色
  };
  const reset = '\x1b[0m';
  const color = logLevelColors[level] || '';
  
  console.log(`${logPrefix} ${color}[${level}]${reset} ${message}`);
}

// 重载 console.log 来捕获日志（可选）
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

console.log = function(...args) {
  const message = args.join(' ');
  // 排除日志系统自身的输出，避免循环
  if (!message.includes('[INFO]') && !message.includes('[WARNING]') && !message.includes('[ERROR]')) {
    addLog(LOG_LEVELS.INFO, message, 'CONSOLE');
  }
  originalConsoleLog.apply(console, args);
};

console.warn = function(...args) {
  const message = args.join(' ');
  addLog(LOG_LEVELS.WARNING, message, 'CONSOLE');
  originalConsoleWarn.apply(console, args);
};

console.error = function(...args) {
  const message = args.join(' ');
  addLog(LOG_LEVELS.ERROR, message, 'CONSOLE');
  originalConsoleError.apply(console, args);
};

// 记录服务启动日志
addLog(LOG_LEVELS.SUCCESS, '日志系统初始化完成', 'LOG_SYSTEM');

// 初始化历史数据存储
function initHistoryStorage() {
  try {
    // 创建数据目录
    if (!fs.existsSync(historyDir)) {
      fs.mkdirSync(historyDir, { recursive: true });
      console.log('📁 创建历史数据目录:', historyDir);
    }
    
    // 初始化历史文件
    if (!fs.existsSync(historyFilePath)) {
      const initialData = {
        version: '1.0',
        createdAt: new Date().toISOString(),
        records: []
      };
      fs.writeFileSync(historyFilePath, JSON.stringify(initialData, null, 2));
      console.log('📄 初始化历史数据文件:', historyFilePath);
    }
    
    console.log('✅ 历史数据存储初始化完成');
  } catch (err) {
    console.warn('⚠️ 历史数据存储初始化失败:', err.message);
  }
}

// 初始化告警系统
function initAlertsSystem() {
  try {
    // 创建告警目录
    if (!fs.existsSync(alertsDir)) {
      fs.mkdirSync(alertsDir, { recursive: true });
      console.log('📁 创建告警数据目录:', alertsDir);
    }
    
    // 加载告警配置
    if (fs.existsSync(alertsConfigPath)) {
      alertsConfig = JSON.parse(fs.readFileSync(alertsConfigPath, 'utf8'));
      console.log('✅ 告警配置加载成功');
    } else {
      // 保存默认配置
      fs.writeFileSync(alertsConfigPath, JSON.stringify(alertsConfig, null, 2));
      console.log('📄 初始化告警配置文件');
    }
    
    // 初始化告警历史
    if (!fs.existsSync(alertsHistoryPath)) {
      const initialData = {
        version: '1.0',
        createdAt: new Date().toISOString(),
        alerts: []
      };
      fs.writeFileSync(alertsHistoryPath, JSON.stringify(initialData, null, 2));
      console.log('📄 初始化告警历史文件');
    }
    
    // 清理旧的告警历史（保留最近 7 天）
    cleanupOldAlerts();
    
    console.log('✅ 告警系统初始化完成');
  } catch (err) {
    console.warn('⚠️ 告警系统初始化失败:', err.message);
  }
}

// 清理 7 天前的告警记录
function cleanupOldAlerts() {
  try {
    if (!fs.existsSync(alertsHistoryPath)) return;
    
    const historyData = JSON.parse(fs.readFileSync(alertsHistoryPath, 'utf8'));
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    historyData.alerts = historyData.alerts.filter(alert => 
      new Date(alert.timestamp) > sevenDaysAgo
    );
    
    fs.writeFileSync(alertsHistoryPath, JSON.stringify(historyData, null, 2));
    console.log('🧹 清理旧告警记录完成');
  } catch (err) {
    console.warn('⚠️ 清理告警记录失败:', err.message);
  }
}

// 保存告警配置
function saveAlertsConfig() {
  try {
    fs.writeFileSync(alertsConfigPath, JSON.stringify(alertsConfig, null, 2));
    console.log('💾 告警配置已保存');
  } catch (err) {
    console.warn('⚠️ 保存告警配置失败:', err.message);
  }
}

// 记录告警历史
function recordAlert(alert) {
  try {
    let historyData;
    if (fs.existsSync(alertsHistoryPath)) {
      historyData = JSON.parse(fs.readFileSync(alertsHistoryPath, 'utf8'));
    } else {
      historyData = { version: '1.0', createdAt: new Date().toISOString(), alerts: [] };
    }
    
    historyData.alerts.unshift({
      ...alert,
      timestamp: new Date().toISOString()
    });
    
    // 限制记录数量（保留最近 500 条）
    if (historyData.alerts.length > 500) {
      historyData.alerts = historyData.alerts.slice(0, 500);
    }
    
    fs.writeFileSync(alertsHistoryPath, JSON.stringify(historyData, null, 2));
  } catch (err) {
    console.warn('⚠️ 记录告警历史失败:', err.message);
  }
}

// 检查是否在冷却期内
function isInCooldown(nodeId, alertType) {
  const cooldownMs = alertsConfig.cooldownMinutes * 60 * 1000;
  const now = Date.now();
  
  return alertsHistory.some(alert => 
    alert.nodeId === nodeId && 
    alert.type === alertType && 
    (now - new Date(alert.timestamp).getTime()) < cooldownMs
  );
}

// 发送飞书 webhook 通知
async function sendFeishuAlert(alert) {
  if (!alertsConfig.feishuWebhook) {
    console.warn('⚠️ 飞书 webhook 未配置，跳过发送');
    return false;
  }
  
  try {
    const https = require('https');
    
    // 根据告警类型设置颜色和表情
    let color = '#246eff';
    let emoji = '🔔';
    if (alert.type === 'offline') {
      color = '#f53f3f';
      emoji = '🚨';
    } else if (alert.type === 'online') {
      color = '#00b42a';
      emoji = '✅';
    } else if (alert.type === 'config_change') {
      color = '#ff7d00';
      emoji = '⚙️';
    }
    
    // 构建飞书消息卡片
    const message = {
      msg_type: 'interactive',
      card: {
        config: {
          wide_screen_mode: true
        },
        header: {
          template: alert.type === 'offline' ? 'red' : (alert.type === 'online' ? 'green' : 'blue'),
          title: {
            tag: 'plain_text',
            content: `${emoji} 节点监控告警`
          }
        },
        elements: [
          {
            tag: 'div',
            text: {
              tag: 'lark_md',
              content: `**节点名称：** ${alert.nodeName}\n**节点 ID：** ${alert.nodeId}\n**告警类型：** ${alert.alertType}\n**发生时间：** ${new Date(alert.timestamp).toLocaleString('zh-CN')}`
            }
          },
          {
            tag: 'div',
            text: {
              tag: 'lark_md',
              content: `**详情：** ${alert.message}`
            }
          },
          {
            tag: 'note',
            elements: [
              {
                tag: 'plain_text',
                content: `Node Monitor 自动告警系统`
              }
            ]
          }
        ]
      }
    };
    
    const postData = JSON.stringify(message);
    
    return new Promise((resolve, reject) => {
      const url = new URL(alertsConfig.feishuWebhook);
      const options = {
        hostname: url.hostname,
        port: 443,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      };
      
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          const result = JSON.parse(data);
          if (result.StatusCode === 0 || result.code === 0) {
            console.log(`✅ 飞书告警发送成功：${alert.nodeId} - ${alert.type}`);
            resolve(true);
          } else {
            console.warn('⚠️ 飞书告警发送失败:', result);
            resolve(false);
          }
        });
      });
      
      req.on('error', (e) => {
        console.error('❌ 飞书告警发送错误:', e.message);
        resolve(false);
      });
      
      req.write(postData);
      req.end();
    });
  } catch (err) {
    console.error('❌ 发送飞书告警异常:', err.message);
    return false;
  }
}

// 发送告警（统一入口）
async function sendAlert(alert) {
  if (!alertsConfig.enabled) {
    return false;
  }
  
  // 检查冷却期
  if (isInCooldown(alert.nodeId, alert.type)) {
    console.log(`⏰ 告警冷却期内，跳过发送：${alert.nodeId} - ${alert.type}`);
    return false;
  }
  
  console.log(`🚨 发送告警：${alert.nodeId} - ${alert.type}`);
  
  // 记录告警历史
  recordAlert(alert);
  
  // 发送飞书通知
  if (alertsConfig.feishuWebhook) {
    await sendFeishuAlert(alert);
  }
  
  // TODO: 邮件通知可以在未来添加
  
  return true;
}

// 检查节点状态变化并触发告警
async function checkAlerts(newStatuses) {
  if (!alertsConfig.enabled) return;
  
  const oldStatuses = Array.from(nodeStatusCache.values());
  
  for (const newNode of newStatuses) {
    const oldNode = oldStatuses.find(s => s.id === newNode.id);
    
    // 状态变化检测
    if (oldNode && oldNode.online !== newNode.online) {
      if (!newNode.online && alertsConfig.notifyOnOffline) {
        // 节点离线告警
        await sendAlert({
          nodeId: newNode.id,
          nodeName: newNode.name,
          type: 'offline',
          alertType: '节点离线',
          message: `节点 ${newNode.name} (${newNode.id}) 已离线。错误信息：${newNode.error || '未知错误'}`,
          timestamp: new Date().toISOString(),
          severity: 'high'
        });
      } else if (newNode.online && alertsConfig.notifyOnOnline) {
        // 节点上线告警
        await sendAlert({
          nodeId: newNode.id,
          nodeName: newNode.name,
          type: 'online',
          alertType: '节点恢复',
          message: `节点 ${newNode.name} (${newNode.id}) 已恢复在线。响应时间：${newNode.responseTime}ms`,
          timestamp: new Date().toISOString(),
          severity: 'low'
        });
      }
    }
  }
}

// 保存状态快照到历史记录
function saveHistorySnapshot(statuses) {
  try {
    let historyData;
    
    // 读取现有历史数据
    if (fs.existsSync(historyFilePath)) {
      historyData = JSON.parse(fs.readFileSync(historyFilePath, 'utf8'));
    } else {
      historyData = {
        version: '1.0',
        createdAt: new Date().toISOString(),
        records: []
      };
    }
    
    // 创建新的快照记录
    const snapshot = {
      timestamp: new Date().toISOString(),
      nodes: statuses.map(s => ({
        id: s.id,
        name: s.name,
        online: s.online,
        configured: s.configured,
        responseTime: s.responseTime,
        error: s.error
      })),
      summary: {
        totalNodes: statuses.length,
        onlineCount: statuses.filter(s => s.online).length,
        offlineCount: statuses.filter(s => !s.online).length,
        configuredCount: statuses.filter(s => s.configured).length
      }
    };
    
    // 添加到记录数组开头（最新的在前）
    historyData.records.unshift(snapshot);
    
    // 限制记录数量（保留最近 1000 条快照，约 16 小时的数据）
    const MAX_RECORDS = 1000;
    if (historyData.records.length > MAX_RECORDS) {
      historyData.records = historyData.records.slice(0, MAX_RECORDS);
    }
    
    // 写入文件
    fs.writeFileSync(historyFilePath, JSON.stringify(historyData, null, 2));
    
    console.log(`📊 历史快照已保存（共 ${historyData.records.length} 条记录）`);
  } catch (err) {
    console.warn('⚠️ 保存历史快照失败:', err.message);
  }
}

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

/**
 * 广播节点状态更新给所有 WebSocket 客户端
 * @param {Array} statuses - 节点状态数组
 */
function broadcastStatusUpdate(statuses) {
  const onlineCount = statuses.filter(s => s.online).length;
  const configuredCount = statuses.filter(s => s.configured).length;
  
  // 广播状态更新
  broadcast({
    type: 'state_update',
    data: {
      nodes: statuses,
      totalNodes: statuses.length,
      onlineCount: onlineCount,
      configuredCount: configuredCount,
      timestamp: new Date().toISOString()
    }
  });
  
  // 同时广播系统指标
  broadcast({
    type: 'metrics_update',
    data: {
      ...systemMetricsCache,
      timestamp: new Date().toISOString()
    }
  });
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
 * API: 获取历史状态记录
 * GET /api/history
 * 
 * 查询参数：
 * - limit: 返回记录数量（默认 50，最大 200）
 * - nodeId: 筛选特定节点（可选）
 * - startTime: 开始时间（ISO 格式，可选）
 * - endTime: 结束时间（ISO 格式，可选）
 */
app.get('/api/history', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const nodeId = req.query.nodeId;
    const startTime = req.query.startTime;
    const endTime = req.query.endTime;
    
    // 读取历史数据
    if (!fs.existsSync(historyFilePath)) {
      return res.json({
        success: true,
        data: {
          records: [],
          total: 0
        }
      });
    }
    
    let historyData = JSON.parse(fs.readFileSync(historyFilePath, 'utf8'));
    let records = historyData.records || [];
    
    // 按节点 ID 筛选
    if (nodeId) {
      records = records.map(record => {
        const nodeStatus = record.nodes.find(n => n.id === nodeId);
        if (nodeStatus) {
          return {
            timestamp: record.timestamp,
            node: nodeStatus,
            summary: record.summary
          };
        }
        return null;
      }).filter(r => r !== null);
    }
    
    // 按时间范围筛选
    if (startTime) {
      records = records.filter(r => new Date(r.timestamp) >= new Date(startTime));
    }
    if (endTime) {
      records = records.filter(r => new Date(r.timestamp) <= new Date(endTime));
    }
    
    // 限制返回数量
    const total = records.length;
    records = records.slice(0, limit);
    
    res.json({
      success: true,
      data: {
        records,
        total,
        limit,
        historyFile: historyFilePath
      }
    });
  } catch (err) {
    console.error('❌ 获取历史记录失败:', err.message);
    res.status(500).json({
      success: false,
      error: '获取历史记录失败：' + err.message
    });
  }
});

/**
 * API: 获取节点历史趋势统计
 * GET /api/history/stats
 * 
 * 返回节点在线率、平均响应时间等统计信息
 */
app.get('/api/history/stats', (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7; // 默认统计最近 7 天
    
    if (!fs.existsSync(historyFilePath)) {
      return res.json({
        success: true,
        data: {
          period: `${days} days`,
          nodes: []
        }
      });
    }
    
    const historyData = JSON.parse(fs.readFileSync(historyFilePath, 'utf8'));
    const records = historyData.records || [];
    
    // 计算时间范围
    const now = new Date();
    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    
    const filteredRecords = records.filter(r => new Date(r.timestamp) >= startDate);
    
    // 按节点统计
    const nodeStats = {};
    
    filteredRecords.forEach(record => {
      record.nodes.forEach(node => {
        if (!nodeStats[node.id]) {
          nodeStats[node.id] = {
            id: node.id,
            name: node.name,
            totalChecks: 0,
            onlineCount: 0,
            offlineCount: 0,
            responseTimes: [],
            uptime: 0,
            avgResponseTime: 0
          };
        }
        
        const stats = nodeStats[node.id];
        stats.totalChecks++;
        
        if (node.online) {
          stats.onlineCount++;
          if (node.responseTime !== null) {
            stats.responseTimes.push(node.responseTime);
          }
        } else {
          stats.offlineCount++;
        }
      });
    });
    
    // 计算最终统计
    const statsArray = Object.values(nodeStats).map(stats => {
      const uptime = stats.totalChecks > 0 
        ? Math.round((stats.onlineCount / stats.totalChecks) * 100 * 100) / 100
        : 0;
      
      const avgResponseTime = stats.responseTimes.length > 0
        ? Math.round(stats.responseTimes.reduce((a, b) => a + b, 0) / stats.responseTimes.length * 100) / 100
        : 0;
      
      return {
        ...stats,
        uptime,
        avgResponseTime,
        responseTimes: undefined // 不返回原始数据
      };
    });
    
    res.json({
      success: true,
      data: {
        period: `${days} days`,
        totalRecords: filteredRecords.length,
        nodes: statsArray
      }
    });
  } catch (err) {
    console.error('❌ 获取历史统计失败:', err.message);
    res.status(500).json({
      success: false,
      error: '获取历史统计失败：' + err.message
    });
  }
});

/**
 * API: 清除历史记录
 * POST /api/history/clear
 * 
 * 清除所有历史记录（谨慎使用）
 */
app.post('/api/history/clear', (req, res) => {
  try {
    if (fs.existsSync(historyFilePath)) {
      const initialData = {
        version: '1.0',
        createdAt: new Date().toISOString(),
        records: []
      };
      fs.writeFileSync(historyFilePath, JSON.stringify(initialData, null, 2));
      console.log('🗑️ 历史记录已清除');
    }
    
    res.json({
      success: true,
      message: '历史记录已清除'
    });
  } catch (err) {
    console.error('❌ 清除历史记录失败:', err.message);
    res.status(500).json({
      success: false,
      error: '清除历史记录失败：' + err.message
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
 * API: 获取告警配置
 * GET /api/alerts/config
 */
app.get('/api/alerts/config', (req, res) => {
  res.json({
    success: true,
    data: {
      ...alertsConfig,
      feishuWebhook: alertsConfig.feishuWebhook ? '***已配置***' : '' // 隐藏实际 webhook
    }
  });
});

/**
 * API: 更新告警配置
 * POST /api/alerts/config
 */
app.post('/api/alerts/config', (req, res) => {
  try {
    const newConfig = req.body;
    
    // 更新配置
    if (newConfig.enabled !== undefined) {
      alertsConfig.enabled = newConfig.enabled;
    }
    if (newConfig.feishuWebhook !== undefined) {
      alertsConfig.feishuWebhook = newConfig.feishuWebhook;
    }
    if (newConfig.notifyOnOffline !== undefined) {
      alertsConfig.notifyOnOffline = newConfig.notifyOnOffline;
    }
    if (newConfig.notifyOnOnline !== undefined) {
      alertsConfig.notifyOnOnline = newConfig.notifyOnOnline;
    }
    if (newConfig.cooldownMinutes !== undefined) {
      alertsConfig.cooldownMinutes = Math.max(1, parseInt(newConfig.cooldownMinutes));
    }
    
    // 保存配置
    saveAlertsConfig();
    
    res.json({
      success: true,
      message: '告警配置已保存',
      data: {
        ...alertsConfig,
        feishuWebhook: alertsConfig.feishuWebhook ? '***已配置***' : ''
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: '保存告警配置失败：' + err.message
    });
  }
});

/**
 * API: 测试告警
 * POST /api/alerts/test
 */
app.post('/api/alerts/test', async (req, res) => {
  try {
    if (!alertsConfig.enabled) {
      return res.status(400).json({
        success: false,
        error: '告警系统未启用'
      });
    }
    
    const testAlert = {
      nodeId: 'test-node',
      nodeName: '测试节点',
      type: 'test',
      alertType: '告警测试',
      message: '这是一条测试告警消息，用于验证告警系统是否正常工作。',
      timestamp: new Date().toISOString(),
      severity: 'low'
    };
    
    const result = await sendAlert(testAlert);
    
    res.json({
      success: result,
      message: result ? '测试告警已发送' : '测试告警发送失败'
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: '测试告警失败：' + err.message
    });
  }
});

/**
 * API: 获取告警历史
 * GET /api/alerts/history
 * 
 * 查询参数：
 * - limit: 返回记录数量（默认 50，最大 200）
 * - nodeId: 筛选特定节点（可选）
 * - type: 筛选告警类型（offline/online/test）（可选）
 * - severity: 筛选严重程度（high/low）（可选）
 */
app.get('/api/alerts/history', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const nodeId = req.query.nodeId;
    const type = req.query.type;
    const severity = req.query.severity;
    
    if (!fs.existsSync(alertsHistoryPath)) {
      return res.json({
        success: true,
        data: {
          alerts: [],
          total: 0
        }
      });
    }
    
    let historyData = JSON.parse(fs.readFileSync(alertsHistoryPath, 'utf8'));
    let alerts = historyData.alerts || [];
    
    // 筛选
    if (nodeId) {
      alerts = alerts.filter(a => a.nodeId === nodeId);
    }
    if (type) {
      alerts = alerts.filter(a => a.type === type);
    }
    if (severity) {
      alerts = alerts.filter(a => a.severity === severity);
    }
    
    // 限制返回数量
    const total = alerts.length;
    alerts = alerts.slice(0, limit);
    
    res.json({
      success: true,
      data: {
        alerts,
        total,
        limit
      }
    });
  } catch (err) {
    console.error('❌ 获取告警历史失败:', err.message);
    res.status(500).json({
      success: false,
      error: '获取告警历史失败：' + err.message
    });
  }
});

/**
 * API: 清除告警历史
 * POST /api/alerts/history/clear
 */
app.post('/api/alerts/history/clear', (req, res) => {
  try {
    if (fs.existsSync(alertsHistoryPath)) {
      const initialData = {
        version: '1.0',
        createdAt: new Date().toISOString(),
        alerts: []
      };
      fs.writeFileSync(alertsHistoryPath, JSON.stringify(initialData, null, 2));
      console.log('🗑️ 告警历史已清除');
    }
    
    res.json({
      success: true,
      message: '告警历史已清除'
    });
  } catch (err) {
    console.error('❌ 清除告警历史失败:', err.message);
    res.status(500).json({
      success: false,
      error: '清除告警历史失败：' + err.message
    });
  }
});

/**
 * API: 获取实时日志
 * GET /api/logs?level=INFO&limit=50&source=SYSTEM
 */
app.get('/api/logs', (req, res) => {
  try {
    const { level, limit = 50, source } = req.query;
    const maxLimit = Math.min(parseInt(limit) || 50, 200);
    
    // 过滤日志
    let filteredLogs = logBuffer;
    
    if (level) {
      filteredLogs = filteredLogs.filter(log => log.level === level);
    }
    
    if (source) {
      filteredLogs = filteredLogs.filter(log => log.source === source);
    }
    
    // 返回最近的日志（倒序）
    const logs = filteredLogs.slice(-maxLimit).reverse();
    
    res.json({
      success: true,
      data: {
        logs,
        total: filteredLogs.length,
        limit: maxLimit,
        bufferSize: logBuffer.length
      }
    });
  } catch (err) {
    console.error('❌ 获取日志失败:', err.message);
    res.status(500).json({
      success: false,
      error: '获取日志失败：' + err.message
    });
  }
});

/**
 * API: 清除日志缓冲区
 * POST /api/logs/clear
 */
app.post('/api/logs/clear', (req, res) => {
  try {
    logBuffer.length = 0; // 清空数组
    addLog(LOG_LEVELS.SUCCESS, '日志缓冲区已清除', 'API');
    
    res.json({
      success: true,
      message: '日志缓冲区已清除'
    });
  } catch (err) {
    console.error('❌ 清除日志失败:', err.message);
    res.status(500).json({
      success: false,
      error: '清除日志失败：' + err.message
    });
  }
});

/**
 * API: 日志聚合统计
 * GET /api/logs/aggregate
 * 支持按级别、来源、时间范围聚合统计
 */
app.get('/api/logs/aggregate', (req, res) => {
  try {
    const { groupBy = 'level', timeRange = '1h' } = req.query;
    
    // 计算时间范围
    const now = new Date();
    let startTime;
    switch (timeRange) {
      case '1h':
        startTime = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case '6h':
        startTime = new Date(now.getTime() - 6 * 60 * 60 * 1000);
        break;
      case '24h':
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      default:
        startTime = new Date(now.getTime() - 60 * 60 * 1000);
    }
    
    // 过滤时间范围内的日志
    const filteredLogs = logBuffer.filter(log => new Date(log.timestamp) >= startTime);
    
    // 按不同维度聚合
    let aggregated = {};
    
    if (groupBy === 'level') {
      // 按级别聚合
      Object.values(LOG_LEVELS).forEach(level => {
        aggregated[level] = filteredLogs.filter(log => log.level === level).length;
      });
    } else if (groupBy === 'source') {
      // 按来源聚合
      const sources = [...new Set(filteredLogs.map(log => log.source))];
      sources.forEach(source => {
        aggregated[source] = filteredLogs.filter(log => log.source === source).length;
      });
    } else if (groupBy === 'hourly') {
      // 按小时聚合（趋势）
      const hours = {};
      filteredLogs.forEach(log => {
        const hour = new Date(log.timestamp).getHours();
        hours[hour] = (hours[hour] || 0) + 1;
      });
      // 填充 24 小时
      for (let i = 0; i < 24; i++) {
        if (!hours[i]) hours[i] = 0;
      }
      aggregated = hours;
    }
    
    res.json({
      success: true,
      data: {
        aggregated,
        groupBy,
        timeRange,
        totalLogs: filteredLogs.length,
        startTime: startTime.toISOString(),
        endTime: now.toISOString()
      }
    });
  } catch (err) {
    console.error('❌ 日志聚合统计失败:', err.message);
    res.status(500).json({
      success: false,
      error: '日志聚合统计失败：' + err.message
    });
  }
});

/**
 * API: 日志趋势分析
 * GET /api/logs/trend
 * 返回按时间间隔的日志数量趋势
 */
app.get('/api/logs/trend', (req, res) => {
  try {
    const { interval = '5m', timeRange = '1h' } = req.query;
    
    // 计算时间范围
    const now = new Date();
    let startTime;
    switch (timeRange) {
      case '1h':
        startTime = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case '6h':
        startTime = new Date(now.getTime() - 6 * 60 * 60 * 1000);
        break;
      case '24h':
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      default:
        startTime = new Date(now.getTime() - 60 * 60 * 1000);
    }
    
    // 计算时间间隔（毫秒）
    let intervalMs;
    switch (interval) {
      case '1m':
        intervalMs = 60 * 1000;
        break;
      case '5m':
        intervalMs = 5 * 60 * 1000;
        break;
      case '15m':
        intervalMs = 15 * 60 * 1000;
        break;
      case '1h':
        intervalMs = 60 * 60 * 1000;
        break;
      default:
        intervalMs = 5 * 60 * 1000;
    }
    
    // 过滤时间范围内的日志
    const filteredLogs = logBuffer.filter(log => new Date(log.timestamp) >= startTime);
    
    // 按时间间隔分组统计
    const trend = [];
    let currentTime = startTime;
    
    while (currentTime < now) {
      const intervalEnd = new Date(currentTime.getTime() + intervalMs);
      const count = filteredLogs.filter(log => {
        const logTime = new Date(log.timestamp);
        return logTime >= currentTime && logTime < intervalEnd;
      }).length;
      
      trend.push({
        time: currentTime.toISOString(),
        count: count,
        label: currentTime.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
      });
      
      currentTime = intervalEnd;
    }
    
    // 按级别统计趋势
    const trendByLevel = {};
    Object.values(LOG_LEVELS).forEach(level => {
      trendByLevel[level] = [];
      currentTime = startTime;
      
      while (currentTime < now) {
        const intervalEnd = new Date(currentTime.getTime() + intervalMs);
        const count = filteredLogs.filter(log => {
          const logTime = new Date(log.timestamp);
          return logTime >= currentTime && logTime < intervalEnd && log.level === level;
        }).length;
        
        trendByLevel[level].push({
          time: currentTime.toISOString(),
          count: count,
          label: currentTime.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
        });
        
        currentTime = intervalEnd;
      }
    });
    
    res.json({
      success: true,
      data: {
        trend,
        trendByLevel,
        interval,
        timeRange,
        totalLogs: filteredLogs.length
      }
    });
  } catch (err) {
    console.error('❌ 日志趋势分析失败:', err.message);
    res.status(500).json({
      success: false,
      error: '日志趋势分析失败：' + err.message
    });
  }
});

/**
 * API: 日志搜索
 * GET /api/logs/search?keyword=xxx&level=INFO&limit=50
 * 支持关键词搜索和高亮
 */
app.get('/api/logs/search', (req, res) => {
  try {
    const { keyword, level, source, limit = 50 } = req.query;
    const maxLimit = Math.min(parseInt(limit) || 50, 200);
    
    if (!keyword || keyword.trim() === '') {
      return res.json({
        success: true,
        data: {
          logs: [],
          total: 0,
          keyword: ''
        }
      });
    }
    
    // 过滤日志
    let filteredLogs = logBuffer.filter(log => 
      log.message.toLowerCase().includes(keyword.toLowerCase()) ||
      log.source.toLowerCase().includes(keyword.toLowerCase())
    );
    
    if (level) {
      filteredLogs = filteredLogs.filter(log => log.level === level);
    }
    
    if (source) {
      filteredLogs = filteredLogs.filter(log => log.source === source);
    }
    
    // 返回最近的日志（倒序）
    const logs = filteredLogs.slice(-maxLimit).reverse();
    
    res.json({
      success: true,
      data: {
        logs,
        total: filteredLogs.length,
        keyword: keyword,
        limit: maxLimit
      }
    });
  } catch (err) {
    console.error('❌ 日志搜索失败:', err.message);
    res.status(500).json({
      success: false,
      error: '日志搜索失败：' + err.message
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
 * ===== 快速操作 API =====
 * 提供一键重启、清理缓存等快捷操作
 */

/**
 * 重启服务
 * 注意：由于 Node.js 进程无法自我重启，此 API 会返回信号给客户端
 * 实际重启由客户端或外部脚本执行
 */
app.post('/api/actions/restart', (req, res) => {
  try {
    addLog(LOG_LEVELS.INFO, '收到服务重启请求', 'API');
    
    // 广播重启通知给所有 WebSocket 客户端
    broadcast({
      type: 'system_action',
      action: 'restart',
      message: '服务即将重启，请稍候...',
      timestamp: new Date().toISOString()
    });
    
    addLog(LOG_LEVELS.SUCCESS, '重启通知已广播', 'API');
    
    res.json({
      success: true,
      message: '重启指令已发送，服务将在 3 秒后重启',
      action: 'restart',
      delay: 3000
    });
    
    // 3 秒后退出进程（由外部监控脚本自动重启）
    setTimeout(() => {
      console.log('🔄 服务正在重启...');
      process.exit(0);
    }, 3000);
    
  } catch (err) {
    console.error('❌ 重启服务失败:', err.message);
    addLog(LOG_LEVELS.ERROR, '重启服务失败：' + err.message, 'API');
    res.status(500).json({
      success: false,
      error: '重启服务失败：' + err.message
    });
  }
});

/**
 * 清理缓存
 * 清理节点状态缓存、历史数据缓存等
 */
app.post('/api/actions/clear-cache', (req, res) => {
  try {
    const clearedItems = [];
    
    // 清理节点状态缓存
    const nodeCount = nodeStatusCache.size;
    nodeStatusCache.clear();
    if (nodeCount > 0) {
      clearedItems.push(`节点状态缓存 (${nodeCount} 个)`);
    }
    
    // 清理系统指标缓存
    systemMetricsCache = {
      cpuUsage: 0,
      memoryUsage: 0,
      memoryTotal: os.totalmem(),
      memoryFree: os.freemem(),
      platform: os.platform(),
      uptime: os.uptime(),
      nodeVersion: process.version
    };
    clearedItems.push('系统指标缓存');
    
    // 清理日志缓冲区
    const logCount = logBuffer.length;
    logBuffer.length = 0;
    if (logCount > 0) {
      clearedItems.push(`日志缓冲区 (${logCount} 条)`);
    }
    
    addLog(LOG_LEVELS.SUCCESS, `缓存已清理：${clearedItems.join(', ')}`, 'API');
    
    // 广播缓存清理通知
    broadcast({
      type: 'system_action',
      action: 'clear_cache',
      message: '缓存已清理',
      details: clearedItems,
      timestamp: new Date().toISOString()
    });
    
    // 立即刷新节点状态
    checkAllNodes().then(statuses => {
      broadcastStatusUpdate(statuses);
      saveHistorySnapshot(statuses);
    });
    
    res.json({
      success: true,
      message: '缓存已清理',
      clearedItems: clearedItems
    });
    
  } catch (err) {
    console.error('❌ 清理缓存失败:', err.message);
    addLog(LOG_LEVELS.ERROR, '清理缓存失败：' + err.message, 'API');
    res.status(500).json({
      success: false,
      error: '清理缓存失败：' + err.message
    });
  }
});

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
    // 保存初始快照
    saveHistorySnapshot(statuses);
    // 广播状态更新给 WebSocket 客户端
    broadcastStatusUpdate(statuses);
    // 初始化时不触发告警（避免启动时大量告警）
  });
  
  // 定时执行
  setInterval(() => {
    checkAllNodes().then(statuses => {
      const onlineCount = statuses.filter(s => s.online).length;
      const configuredCount = statuses.filter(s => s.configured).length;
      console.log(`📊 健康检查：${onlineCount}/${configuredCount} 节点在线`);
      // 保存历史快照
      saveHistorySnapshot(statuses);
      // 广播状态更新给 WebSocket 客户端
      broadcastStatusUpdate(statuses);
      // 检查是否需要发送告警
      checkAlerts(statuses);
    });
  }, interval);
}

// 启动服务器
server.listen(PORT, () => {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║     🚀 Node Monitor Server 已启动                      ║');
  console.log('║     J.A.R.V.I.S. 团队节点状态监控                       ║');
  console.log('╠════════════════════════════════════════════════════════╣');
  console.log(`║     🌐 本地访问：http://localhost:${PORT}                ║`);
  console.log(`║     📡 API: http://localhost:${PORT}/api/status         ║`);
  console.log(`║     🔌 WebSocket: ws://localhost:${PORT}/ws             ║`);
  console.log(`║     📋 配置源：openclaw.json                            ║`);
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log('');
  
  // 初始化历史数据存储
  initHistoryStorage();
  
  // 初始化告警系统
  initAlertsSystem();
  
  // 启动健康检查调度器
  startHealthCheckScheduler();
});

// 优雅关闭
process.on('SIGINT', () => {
  console.log('\n👋 正在关闭服务器...');
  process.exit(0);
});
