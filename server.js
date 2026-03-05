/**
 * Node Monitor Server - J.A.R.V.I.S. 团队节点状态监控
 * 
 * 功能：
 * - 从 openclaw.json 读取真实的 agent 配置
 * - 提供团队节点状态 API
 * - 健康检查服务（真实检测，非模拟）
 * - 静态文件服务（前端页面）
 * - 🔒 HTTPS 安全连接支持
 * 
 * @author 牛开发 🐮💻
 * @version 1.28.0 - HTTPS 安全增强版
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const os = require('os');
const WebSocket = require('ws');

// ===== HTTPS 配置 =====

/**
 * HTTPS 配置选项
 * 可通过环境变量或配置文件启用
 */
const HTTPS_CONFIG = {
  enabled: process.env.HTTPS_ENABLED === 'true' || process.env.HTTPS_ENABLED === '1',
  port: parseInt(process.env.HTTPS_PORT) || 3443,
  certPath: process.env.SSL_CERT_PATH || './config/ssl/server.crt',
  keyPath: process.env.SSL_KEY_PATH || './config/ssl/server.key'
};

/**
 * 加载 SSL 证书
 * @returns {Object|null} SSL 证书选项或 null（如果未启用或加载失败）
 */
function loadSSLCerts() {
  if (!HTTPS_CONFIG.enabled) {
    return null;
  }
  
  try {
    const certPath = path.resolve(__dirname, HTTPS_CONFIG.certPath);
    const keyPath = path.resolve(__dirname, HTTPS_CONFIG.keyPath);
    
    // 检查证书文件是否存在
    if (!fs.existsSync(certPath)) {
      console.warn('⚠️  SSL 证书文件不存在：' + certPath);
      console.warn('   请运行：npm run generate-certs');
      return null;
    }
    
    if (!fs.existsSync(keyPath)) {
      console.warn('⚠️  SSL 私钥文件不存在：' + keyPath);
      console.warn('   请运行：npm run generate-certs');
      return null;
    }
    
    // 读取证书和私钥
    const cert = fs.readFileSync(certPath);
    const key = fs.readFileSync(keyPath);
    
    console.log('✅ SSL 证书加载成功');
    console.log('   证书：' + certPath);
    console.log('   私钥：' + keyPath);
    
    return { cert, key };
  } catch (err) {
    console.error('❌ SSL 证书加载失败：' + err.message);
    return null;
  }
}

// ===== 性能优化模块 =====

/**
 * 响应缓存系统
 */
const responseCache = new Map();
const CACHE_CONFIG = {
  enabled: true,
  defaultTTL: 5000, // 默认缓存时间 5 秒
  maxEntries: 100 // 最大缓存条目数
};

/**
 * 缓存中间件
 * @param {number} ttl - 缓存时间（毫秒）
 * @returns {Function} Express 中间件
 */
function cacheMiddleware(ttl = CACHE_CONFIG.defaultTTL) {
  return (req, res, next) => {
    if (!CACHE_CONFIG.enabled || req.method !== 'GET') {
      return next();
    }
    
    const cacheKey = `GET:${req.originalUrl}`;
    const cached = responseCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      // 缓存命中
      res.set('X-Cache', 'HIT');
      return res.json(cached.data);
    }
    
    // 缓存未命中，拦截响应
    const originalJson = res.json.bind(res);
    res.json = (data) => {
      // 存储缓存
      if (responseCache.size >= CACHE_CONFIG.maxEntries) {
        // 清除最旧的缓存
        const oldestKey = responseCache.keys().next().value;
        responseCache.delete(oldestKey);
      }
      
      responseCache.set(cacheKey, {
        data,
        timestamp: Date.now(),
        ttl
      });
      
      res.set('X-Cache', 'MISS');
      return originalJson(data);
    };
    
    next();
  };
}

/**
 * 清除缓存
 * @param {string} pattern - 缓存键模式（支持通配符）
 */
function clearCache(pattern) {
  if (!pattern) {
    responseCache.clear();
    return;
  }
  
  const regex = new RegExp(pattern.replace('*', '.*'));
  for (const key of responseCache.keys()) {
    if (regex.test(key)) {
      responseCache.delete(key);
    }
  }
}

/**
 * 定时清理过期缓存（每 30 秒）
 */
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of responseCache.entries()) {
    if (now - value.timestamp > value.ttl) {
      responseCache.delete(key);
    }
  }
}, 30000);

/**
 * 性能监控
 */
const perfStats = {
  requests: 0,
  cacheHits: 0,
  cacheMisses: 0,
  startTime: Date.now()
};

/**
 * 性能监控中间件
 */
function perfMiddleware(req, res, next) {
  perfStats.requests++;
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const cacheHeader = res.get('X-Cache');
    
    if (cacheHeader === 'HIT') {
      perfStats.cacheHits++;
    } else if (cacheHeader === 'MISS') {
      perfStats.cacheMisses++;
    }
    
    // 记录慢请求
    if (duration > 1000) {
      console.log(`⚠️ 慢请求：${req.method} ${req.originalUrl} - ${duration}ms`);
    }
  });
  
  next();
}

/**
 * 获取性能统计
 */
function getPerfStats() {
  const uptime = Date.now() - perfStats.startTime;
  const hitRate = perfStats.requests > 0 
    ? ((perfStats.cacheHits / perfStats.requests) * 100).toFixed(2)
    : 0;
  
  return {
    uptime,
    totalRequests: perfStats.requests,
    cacheHits: perfStats.cacheHits,
    cacheMisses: perfStats.cacheMisses,
    cacheHitRate: hitRate + '%',
    cacheSize: responseCache.size
  };
}

// 加载 package.json 获取版本信息
const packageJson = require('./package.json');

const app = express();
const PORT = process.env.PORT || 3000;

// ===== WebSocket 实时推送系统 =====
// 创建 HTTP 服务器（主服务器）
const server = http.createServer(app);

// 创建 WebSocket 服务器（绑定到 HTTP 服务器）
const wss = new WebSocket.Server({ server, path: '/ws' });

// ===== HTTPS 服务器（可选） =====
let httpsServer = null;
let httpsWss = null;

/**
 * 初始化 HTTPS 服务器
 */
function initHttpsServer() {
  const sslOptions = loadSSLCerts();
  
  if (!sslOptions) {
    console.log('🔓 HTTPS 未启用（证书未配置）');
    console.log('   启用方法：');
    console.log('   1. 生成证书：npm run generate-certs');
    console.log('   2. 设置环境变量：HTTPS_ENABLED=true');
    console.log('   3. 或直接启动：npm start:https');
    return false;
  }
  
  try {
    // 创建 HTTPS 服务器
    httpsServer = https.createServer(sslOptions, app);
    
    // 为 HTTPS 创建独立的 WebSocket 服务器
    httpsWss = new WebSocket.Server({ server: httpsServer, path: '/ws' });
    
    // 复用 HTTP 的 WebSocket 连接处理逻辑
    setupWebSocket(httpsWss);
    
    console.log('✅ HTTPS 服务器初始化成功');
    return true;
  } catch (err) {
    console.error('❌ HTTPS 服务器初始化失败：' + err.message);
    return false;
  }
}

/**
 * 设置 WebSocket 连接处理
 * @param {WebSocket.Server} wsServer - WebSocket 服务器实例
 */
function setupWebSocket(wsServer) {
  wsServer.on('connection', (ws) => {
    clients.add(ws);
    console.log('🔌 WebSocket 客户端已连接（当前在线：' + clients.size + '）');
    
    // 发送欢迎消息
    sendToClient(ws, {
      type: 'connected',
      message: '欢迎连接到 J.A.R.V.I.S. 节点监控系统',
      timestamp: new Date().toISOString()
    });
    
    // 发送初始状态
    const currentStatuses = nodeStatuses.map(node => ({
      ...node,
      lastCheck: node.lastCheck || new Date().toISOString()
    }));
    
    sendToClient(ws, {
      type: 'initial_state',
      nodes: currentStatuses,
      summary: getNodeSummary(currentStatuses),
      timestamp: new Date().toISOString()
    });
    
    // 处理客户端消息
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message);
        
        switch (data.type) {
          case 'ping':
            sendToClient(ws, { type: 'pong', timestamp: new Date().toISOString() });
            break;
            
          case 'request_state':
            sendToClient(ws, {
              type: 'state_update',
              nodes: nodeStatuses,
              summary: getNodeSummary(nodeStatuses),
              timestamp: new Date().toISOString()
            });
            break;
            
          case 'request_metrics':
            sendToClient(ws, {
              type: 'metrics_update',
              metrics: getSystemMetrics(),
              timestamp: new Date().toISOString()
            });
            break;
            
          default:
            console.log('📨 未知消息类型：' + data.type);
        }
      } catch (err) {
        console.error('❌ 解析 WebSocket 消息失败：' + err.message);
      }
    });
    
    // 处理断开连接
    ws.on('close', () => {
      clients.delete(ws);
      console.log('🔌 WebSocket 客户端已断开（当前在线：' + clients.size + '）');
    });
    
    // 处理错误
    ws.on('error', (err) => {
      console.error('❌ WebSocket 错误：' + err.message);
      clients.delete(ws);
    });
  });
}

// 初始化 WebSocket（HTTP）
setupWebSocket(wss);

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

// ===== 自动化日报/周报系统 =====
// 报告存储目录
const reportsDir = path.join(__dirname, 'data', 'reports');
const dailyReportsPath = path.join(reportsDir, 'daily-reports.json');
const weeklyReportsPath = path.join(reportsDir, 'weekly-reports.json');

// 报告配置
const reportsConfig = {
  enabled: true,              // 是否启用自动报告
  dailyTime: '23:59',         // 日报发送时间（每天）
  weeklyDay: 0,               // 周报发送星期（0=周日，1=周一...）
  weeklyTime: '23:59',        // 周报发送时间
  sendViaFeishu: true,        // 是否通过飞书发送
  feishuWebhook: null         // 飞书 webhook URL（从告警配置读取）
};

// 报告生成定时器
let dailyReportTimer = null;
let weeklyReportTimer = null;

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

// ===== 自动化日报/周报系统函数 =====

/**
 * 初始化报告系统
 */
function initReportsSystem() {
  try {
    // 创建报告目录
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
      console.log('📁 创建报告数据目录:', reportsDir);
    }
    
    // 初始化日报文件
    if (!fs.existsSync(dailyReportsPath)) {
      const initialData = {
        version: '1.0',
        createdAt: new Date().toISOString(),
        reports: []
      };
      fs.writeFileSync(dailyReportsPath, JSON.stringify(initialData, null, 2));
      console.log('📄 初始化日报文件');
    }
    
    // 初始化周报文件
    if (!fs.existsSync(weeklyReportsPath)) {
      const initialData = {
        version: '1.0',
        createdAt: new Date().toISOString(),
        reports: []
      };
      fs.writeFileSync(weeklyReportsPath, JSON.stringify(initialData, null, 2));
      console.log('📄 初始化周报文件');
    }
    
    // 从告警配置读取飞书 webhook
    if (fs.existsSync(alertsConfigPath)) {
      const config = JSON.parse(fs.readFileSync(alertsConfigPath, 'utf8'));
      reportsConfig.feishuWebhook = config.feishuWebhook || null;
    }
    
    // 启动报告调度器
    scheduleReports();
    
    console.log('✅ 报告系统初始化完成');
  } catch (err) {
    console.warn('⚠️ 报告系统初始化失败:', err.message);
  }
}

/**
 * 生成日报
 * @returns {Object} 日报数据
 */
function generateDailyReport() {
  try {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    
    // 读取历史数据
    if (!fs.existsSync(historyFilePath)) {
      return null;
    }
    
    const historyData = JSON.parse(fs.readFileSync(historyFilePath, 'utf8'));
    const records = historyData.records || [];
    
    // 筛选昨天的记录
    const yesterdayRecords = records.filter(r => {
      const recordDate = new Date(r.timestamp);
      return recordDate >= yesterday && recordDate < today;
    });
    
    if (yesterdayRecords.length === 0) {
      return null;
    }
    
    // 统计节点数据
    const nodeStats = {};
    let totalChecks = 0;
    let totalOnline = 0;
    let totalResponseTime = 0;
    let responseTimeCount = 0;
    
    yesterdayRecords.forEach(record => {
      record.nodes.forEach(node => {
        if (!nodeStats[node.id]) {
          nodeStats[node.id] = {
            id: node.id,
            name: node.name,
            role: node.role,
            checks: 0,
            online: 0,
            offline: 0,
            totalResponseTime: 0,
            responseTimeCount: 0,
            lastStatus: null,
            statusChanges: 0
          };
        }
        
        const stats = nodeStats[node.id];
        stats.checks++;
        totalChecks++;
        
        if (node.online) {
          stats.online++;
          totalOnline++;
          if (node.responseTime) {
            stats.totalResponseTime += node.responseTime;
            stats.responseTimeCount++;
            totalResponseTime += node.responseTime;
            responseTimeCount++;
          }
        } else {
          stats.offline++;
        }
        
        // 检测状态变化
        if (stats.lastStatus !== null && stats.lastStatus !== node.online) {
          stats.statusChanges++;
        }
        stats.lastStatus = node.online;
      });
    });
    
    // 计算汇总统计
    const avgOnlineRate = totalChecks > 0 ? (totalOnline / totalChecks * 100).toFixed(2) : 0;
    const avgResponseTime = responseTimeCount > 0 ? (totalResponseTime / responseTimeCount).toFixed(2) : 0;
    
    // 生成节点列表
    const nodeList = Object.values(nodeStats).map(stats => ({
      ...stats,
      onlineRate: stats.checks > 0 ? (stats.online / stats.checks * 100).toFixed(2) : 0,
      avgResponseTime: stats.responseTimeCount > 0 ? (stats.totalResponseTime / stats.responseTimeCount).toFixed(2) : 0
    }));
    
    // 读取昨天的告警记录
    let alertCount = 0;
    if (fs.existsSync(alertsHistoryPath)) {
      const alertData = JSON.parse(fs.readFileSync(alertsHistoryPath, 'utf8'));
      const yesterdayAlerts = (alertData.alerts || []).filter(a => {
        const alertDate = new Date(a.timestamp);
        return alertDate >= yesterday && alertDate < today;
      });
      alertCount = yesterdayAlerts.length;
    }
    
    const report = {
      id: 'daily-' + yesterday.toISOString().split('T')[0],
      type: 'daily',
      date: yesterday.toISOString().split('T')[0],
      generatedAt: now.toISOString(),
      summary: {
        totalNodes: Object.keys(nodeStats).length,
        avgOnlineRate: parseFloat(avgOnlineRate),
        avgResponseTime: parseFloat(avgResponseTime),
        totalChecks: totalChecks,
        totalOnline: totalOnline,
        alertCount: alertCount
      },
      nodes: nodeList,
      period: {
        start: yesterday.toISOString(),
        end: today.toISOString()
      }
    };
    
    // 保存报告
    saveDailyReport(report);
    
    console.log(`📊 日报生成完成：${yesterday.toISOString().split('T')[0]}`);
    
    return report;
  } catch (err) {
    console.error('❌ 生成日报失败:', err.message);
    return null;
  }
}

/**
 * 生成周报
 * @returns {Object} 周报数据
 */
function generateWeeklyReport() {
  try {
    const now = new Date();
    
    // 计算上周的起始和结束时间
    const dayOfWeek = now.getDay(); // 0=周日
    const lastSunday = new Date(now);
    lastSunday.setDate(now.getDate() - dayOfWeek - 7);
    lastSunday.setHours(0, 0, 0, 0);
    
    const thisSunday = new Date(lastSunday);
    thisSunday.setDate(lastSunday.getDate() + 7);
    
    // 读取历史数据
    if (!fs.existsSync(historyFilePath)) {
      return null;
    }
    
    const historyData = JSON.parse(fs.readFileSync(historyFilePath, 'utf8'));
    const records = historyData.records || [];
    
    // 筛选上周的记录
    const weekRecords = records.filter(r => {
      const recordDate = new Date(r.timestamp);
      return recordDate >= lastSunday && recordDate < thisSunday;
    });
    
    if (weekRecords.length === 0) {
      return null;
    }
    
    // 统计节点数据（类似日报，但按天分组）
    const nodeStats = {};
    const dailyStats = {}; // 按天统计
    
    weekRecords.forEach(record => {
      const recordDate = new Date(record.timestamp).toISOString().split('T')[0];
      
      if (!dailyStats[recordDate]) {
        dailyStats[recordDate] = {
          total: 0,
          online: 0,
          checks: 0
        };
      }
      
      record.nodes.forEach(node => {
        if (!nodeStats[node.id]) {
          nodeStats[node.id] = {
            id: node.id,
            name: node.name,
            role: node.role,
            checks: 0,
            online: 0,
            offline: 0,
            totalResponseTime: 0,
            responseTimeCount: 0
          };
        }
        
        const stats = nodeStats[node.id];
        stats.checks++;
        
        if (node.online) {
          stats.online++;
          dailyStats[recordDate].online++;
          if (node.responseTime) {
            stats.totalResponseTime += node.responseTime;
            stats.responseTimeCount++;
          }
        } else {
          stats.offline++;
        }
        
        dailyStats[recordDate].total++;
        dailyStats[recordDate].checks++;
      });
    });
    
    // 计算汇总
    let totalChecks = 0;
    let totalOnline = 0;
    let totalResponseTime = 0;
    let responseTimeCount = 0;
    
    Object.values(nodeStats).forEach(stats => {
      totalChecks += stats.checks;
      totalOnline += stats.online;
      totalResponseTime += stats.totalResponseTime;
      responseTimeCount += stats.responseTimeCount;
    });
    
    const avgOnlineRate = totalChecks > 0 ? (totalOnline / totalChecks * 100).toFixed(2) : 0;
    const avgResponseTime = responseTimeCount > 0 ? (totalResponseTime / responseTimeCount).toFixed(2) : 0;
    
    // 生成每日趋势
    const dailyTrend = Object.entries(dailyStats).map(([date, stats]) => ({
      date: date,
      onlineRate: stats.checks > 0 ? (stats.online / stats.total * 100).toFixed(2) : 0,
      totalChecks: stats.checks,
      onlineCount: Math.round(stats.online / (stats.total / stats.checks))
    }));
    
    // 生成节点列表
    const nodeList = Object.values(nodeStats).map(stats => ({
      ...stats,
      onlineRate: stats.checks > 0 ? (stats.online / stats.checks * 100).toFixed(2) : 0,
      avgResponseTime: stats.responseTimeCount > 0 ? (stats.totalResponseTime / stats.responseTimeCount).toFixed(2) : 0
    }));
    
    // 读取上周的告警记录
    let alertCount = 0;
    if (fs.existsSync(alertsHistoryPath)) {
      const alertData = JSON.parse(fs.readFileSync(alertsHistoryPath, 'utf8'));
      const weekAlerts = (alertData.alerts || []).filter(a => {
        const alertDate = new Date(a.timestamp);
        return alertDate >= lastSunday && alertDate < thisSunday;
      });
      alertCount = weekAlerts.length;
    }
    
    const report = {
      id: 'weekly-' + lastSunday.toISOString().split('T')[0],
      type: 'weekly',
      weekStart: lastSunday.toISOString().split('T')[0],
      weekEnd: new Date(thisSunday.getTime() - 24*60*60*1000).toISOString().split('T')[0],
      generatedAt: now.toISOString(),
      summary: {
        totalNodes: Object.keys(nodeStats).length,
        avgOnlineRate: parseFloat(avgOnlineRate),
        avgResponseTime: parseFloat(avgResponseTime),
        totalChecks: totalChecks,
        totalOnline: totalOnline,
        alertCount: alertCount,
        days: Object.keys(dailyStats).length
      },
      nodes: nodeList,
      dailyTrend: dailyTrend,
      period: {
        start: lastSunday.toISOString(),
        end: thisSunday.toISOString()
      }
    };
    
    // 保存报告
    saveWeeklyReport(report);
    
    console.log(`📊 周报生成完成：${lastSunday.toISOString().split('T')[0]} 至 ${report.weekEnd}`);
    
    return report;
  } catch (err) {
    console.error('❌ 生成周报失败:', err.message);
    return null;
  }
}

/**
 * 保存日报
 */
function saveDailyReport(report) {
  try {
    let data;
    if (fs.existsSync(dailyReportsPath)) {
      data = JSON.parse(fs.readFileSync(dailyReportsPath, 'utf8'));
    } else {
      data = { version: '1.0', createdAt: new Date().toISOString(), reports: [] };
    }
    
    // 检查是否已存在该日期的报告
    const existingIndex = data.reports.findIndex(r => r.id === report.id);
    if (existingIndex >= 0) {
      data.reports[existingIndex] = report;
    } else {
      data.reports.unshift(report);
    }
    
    // 限制报告数量（保留最近 90 天）
    if (data.reports.length > 90) {
      data.reports = data.reports.slice(0, 90);
    }
    
    fs.writeFileSync(dailyReportsPath, JSON.stringify(data, null, 2));
  } catch (err) {
    console.warn('⚠️ 保存日报失败:', err.message);
  }
}

/**
 * 保存周报
 */
function saveWeeklyReport(report) {
  try {
    let data;
    if (fs.existsSync(weeklyReportsPath)) {
      data = JSON.parse(fs.readFileSync(weeklyReportsPath, 'utf8'));
    } else {
      data = { version: '1.0', createdAt: new Date().toISOString(), reports: [] };
    }
    
    // 检查是否已存在该周的报告
    const existingIndex = data.reports.findIndex(r => r.id === report.id);
    if (existingIndex >= 0) {
      data.reports[existingIndex] = report;
    } else {
      data.reports.unshift(report);
    }
    
    // 限制报告数量（保留最近 52 周）
    if (data.reports.length > 52) {
      data.reports = data.reports.slice(0, 52);
    }
    
    fs.writeFileSync(weeklyReportsPath, JSON.stringify(data, null, 2));
  } catch (err) {
    console.warn('⚠️ 保存周报失败:', err.message);
  }
}

/**
 * 发送飞书报告
 */
async function sendFeishuReport(report) {
  try {
    if (!reportsConfig.feishuWebhook) {
      console.log('⚠️ 未配置飞书 webhook，跳过报告发送');
      return false;
    }
    
    const isDaily = report.type === 'daily';
    const title = isDaily ? '📊 节点监控日报' : '📈 节点监控周报';
    const periodText = isDaily 
      ? `统计周期：${report.period.start.split('T')[0]} 至 ${report.period.end.split('T')[0]}`
      : `统计周期：${report.weekStart} 至 ${report.weekEnd}`;
    
    // 构建飞书消息卡片
    const message = {
      msg_type: 'interactive',
      card: {
        config: {
          wide_screen_mode: true
        },
        header: {
          template: isDaily ? 'blue' : 'purple',
          title: {
            tag: 'plain_text',
            content: title
          }
        },
        elements: [
          {
            tag: 'div',
            text: {
              tag: 'lark_md',
              content: `**📋 概览**\n${periodText}`
            }
          },
          {
            tag: 'div',
            text: {
              tag: 'lark_md',
              content: `**🔹 节点总数：** ${report.summary.totalNodes}\n**🔹 平均在线率：** ${report.summary.avgOnlineRate}%\n**🔹 平均响应时间：** ${report.summary.avgResponseTime}ms\n**🔹 告警次数：** ${report.summary.alertCount}`
            }
          },
          {
            tag: 'hr'
          },
          {
            tag: 'div',
            text: {
              tag: 'lark_md',
              content: `**💡 健康检查总数：** ${report.summary.totalChecks}\n**💡 在线次数：** ${report.summary.totalOnline}`
            }
          },
          {
            tag: 'action',
            actions: [
              {
                tag: 'button',
                text: {
                  tag: 'plain_text',
                  content: '🌐 查看监控面板'
                },
                url: 'http://localhost:3000',
                type: 'primary'
              }
            ]
          }
        ]
      }
    };
    
    const response = await fetch(reportsConfig.feishuWebhook, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(message)
    });
    
    const result = await response.json();
    
    if (result.StatusCode === 0 || result.code === 0) {
      console.log(`✅ 飞书${isDaily ? '日报' : '周报'}发送成功`);
      return true;
    } else {
      console.warn('⚠️ 飞书报告发送失败:', result);
      return false;
    }
  } catch (err) {
    console.error('❌ 发送飞书报告失败:', err.message);
    return false;
  }
}

/**
 * 调度报告任务
 */
function scheduleReports() {
  if (!reportsConfig.enabled) {
    console.log('⚠️ 自动报告已禁用');
    return;
  }
  
  const now = new Date();
  
  // 计算到下一个日报时间的延迟（毫秒）
  const [dailyHour, dailyMinute] = reportsConfig.dailyTime.split(':').map(Number);
  const nextDaily = new Date(now);
  nextDaily.setHours(dailyHour, dailyMinute, 0, 0);
  if (nextDaily <= now) {
    nextDaily.setDate(nextDaily.getDate() + 1);
  }
  const dailyDelay = nextDaily.getTime() - now.getTime();
  
  // 计算到下一个周报时间的延迟（毫秒）
  const [weeklyHour, weeklyMinute] = reportsConfig.weeklyTime.split(':').map(Number);
  const nextWeekly = new Date(now);
  nextWeekly.setHours(weeklyHour, weeklyMinute, 0, 0);
  const daysUntilWeekly = (reportsConfig.weeklyDay - nextWeekly.getDay() + 7) % 7;
  if (daysUntilWeekly === 0 && nextWeekly <= now) {
    nextWeekly.setDate(nextWeekly.getDate() + 7);
  } else {
    nextWeekly.setDate(nextWeekly.getDate() + daysUntilWeekly);
  }
  const weeklyDelay = nextWeekly.getTime() - now.getTime();
  
  console.log(`⏰ 日报调度：${nextDaily.toLocaleString('zh-CN')}（${Math.round(dailyDelay/1000/60)} 分钟后）`);
  console.log(`⏰ 周报调度：${nextWeekly.toLocaleString('zh-CN')}（${Math.round(weeklyDelay/1000/60/60)} 小时后）`);
  
  // 设置日报定时器
  if (dailyReportTimer) clearTimeout(dailyReportTimer);
  dailyReportTimer = setTimeout(() => {
    console.log('📝 开始生成日报...');
    const report = generateDailyReport();
    if (report && reportsConfig.sendViaFeishu) {
      sendFeishuReport(report);
    }
    // 重新调度（每天）
    scheduleReports();
  }, dailyDelay);
  
  // 设置周报定时器
  if (weeklyReportTimer) clearTimeout(weeklyReportTimer);
  weeklyReportTimer = setTimeout(() => {
    console.log('📝 开始生成周报...');
    const report = generateWeeklyReport();
    if (report && reportsConfig.sendViaFeishu) {
      sendFeishuReport(report);
    }
    // 重新调度（每周）
    scheduleReports();
  }, weeklyDelay);
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

// 性能监控中间件
app.use(perfMiddleware);

// 静态文件服务（带缓存控制）
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1d', // 静态资源缓存 1 天
  etag: true,
  lastModified: true
}));

/**
 * API: 健康检查端点（用于 Docker 健康检查）
 * GET /api/health
 */
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: packageJson.version || '1.26.0'
  });
});

/**
 * API: 获取性能统计
 * GET /api/perf
 */
app.get('/api/perf', (req, res) => {
  res.json({
    success: true,
    data: getPerfStats()
  });
});

/**
 * API: 清除缓存
 * POST /api/cache/clear
 */
app.post('/api/cache/clear', (req, res) => {
  const pattern = req.query.pattern || '*';
  clearCache(pattern);
  res.json({
    success: true,
    message: `Cache cleared (pattern: ${pattern})`,
    remainingCache: responseCache.size
  });
});

/**
 * API: 获取团队配置（从 OpenClaw 读取）
 * GET /api/config
 */
app.get('/api/config', cacheMiddleware(30000), (req, res) => {
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
app.get('/api/status', cacheMiddleware(3000), async (req, res) => {
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
app.get('/api/system-metrics', cacheMiddleware(5000), (req, res) => {
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
app.get('/api/history', cacheMiddleware(10000), (req, res) => {
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
app.get('/api/history/stats', cacheMiddleware(15000), (req, res) => {
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
 * API: 获取日报列表
 * GET /api/reports/daily?limit=30
 */
app.get('/api/reports/daily', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 30, 90);
    
    if (!fs.existsSync(dailyReportsPath)) {
      return res.json({
        success: true,
        data: {
          reports: [],
          total: 0
        }
      });
    }
    
    const data = JSON.parse(fs.readFileSync(dailyReportsPath, 'utf8'));
    const reports = (data.reports || []).slice(0, limit);
    
    res.json({
      success: true,
      data: {
        reports,
        total: reports.length,
        limit
      }
    });
  } catch (err) {
    console.error('❌ 获取日报列表失败:', err.message);
    res.status(500).json({
      success: false,
      error: '获取日报列表失败：' + err.message
    });
  }
});

/**
 * API: 获取周报列表
 * GET /api/reports/weekly?limit=12
 */
app.get('/api/reports/weekly', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 12, 52);
    
    if (!fs.existsSync(weeklyReportsPath)) {
      return res.json({
        success: true,
        data: {
          reports: [],
          total: 0
        }
      });
    }
    
    const data = JSON.parse(fs.readFileSync(weeklyReportsPath, 'utf8'));
    const reports = (data.reports || []).slice(0, limit);
    
    res.json({
      success: true,
      data: {
        reports,
        total: reports.length,
        limit
      }
    });
  } catch (err) {
    console.error('❌ 获取周报列表失败:', err.message);
    res.status(500).json({
      success: false,
      error: '获取周报列表失败：' + err.message
    });
  }
});

/**
 * API: 获取单个报告详情
 * GET /api/reports/:type/:id
 */
app.get('/api/reports/:type/:id', (req, res) => {
  try {
    const { type, id } = req.params;
    const filePath = type === 'daily' ? dailyReportsPath : weeklyReportsPath;
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        error: '报告文件不存在'
      });
    }
    
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const report = (data.reports || []).find(r => r.id === id);
    
    if (!report) {
      return res.status(404).json({
        success: false,
        error: '报告不存在'
      });
    }
    
    res.json({
      success: true,
      data: report
    });
  } catch (err) {
    console.error('❌ 获取报告详情失败:', err.message);
    res.status(500).json({
      success: false,
      error: '获取报告详情失败：' + err.message
    });
  }
});

/**
 * API: 手动生成报告
 * POST /api/reports/generate
 */
app.post('/api/reports/generate', async (req, res) => {
  try {
    const { type } = req.body;
    
    if (!type || !['daily', 'weekly'].includes(type)) {
      return res.status(400).json({
        success: false,
        error: '无效的报告类型，必须是 daily 或 weekly'
      });
    }
    
    let report;
    if (type === 'daily') {
      report = generateDailyReport();
    } else {
      report = generateWeeklyReport();
    }
    
    if (!report) {
      return res.status(400).json({
        success: false,
        error: '没有足够的数据生成报告'
      });
    }
    
    // 如果配置了飞书，尝试发送
    let sentViaFeishu = false;
    if (reportsConfig.sendViaFeishu && reportsConfig.feishuWebhook) {
      sentViaFeishu = await sendFeishuReport(report);
    }
    
    res.json({
      success: true,
      data: report,
      sentViaFeishu
    });
  } catch (err) {
    console.error('❌ 生成报告失败:', err.message);
    res.status(500).json({
      success: false,
      error: '生成报告失败：' + err.message
    });
  }
});

/**
 * API: 获取报告配置
 * GET /api/reports/config
 */
app.get('/api/reports/config', (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        enabled: reportsConfig.enabled,
        dailyTime: reportsConfig.dailyTime,
        weeklyDay: reportsConfig.weeklyDay,
        weeklyTime: reportsConfig.weeklyTime,
        sendViaFeishu: reportsConfig.sendViaFeishu,
        hasWebhook: !!reportsConfig.feishuWebhook
      }
    });
  } catch (err) {
    console.error('❌ 获取报告配置失败:', err.message);
    res.status(500).json({
      success: false,
      error: '获取报告配置失败：' + err.message
    });
  }
});

/**
 * API: 更新报告配置
 * POST /api/reports/config
 */
app.post('/api/reports/config', (req, res) => {
  try {
    const { enabled, dailyTime, weeklyDay, weeklyTime, sendViaFeishu } = req.body;
    
    if (enabled !== undefined) reportsConfig.enabled = enabled;
    if (dailyTime) reportsConfig.dailyTime = dailyTime;
    if (weeklyDay !== undefined) reportsConfig.weeklyDay = weeklyDay;
    if (weeklyTime) reportsConfig.weeklyTime = weeklyTime;
    if (sendViaFeishu !== undefined) reportsConfig.sendViaFeishu = sendViaFeishu;
    
    // 重新调度报告任务
    scheduleReports();
    
    res.json({
      success: true,
      message: '报告配置已更新',
      data: {
        enabled: reportsConfig.enabled,
        dailyTime: reportsConfig.dailyTime,
        weeklyDay: reportsConfig.weeklyDay,
        weeklyTime: reportsConfig.weeklyTime,
        sendViaFeishu: reportsConfig.sendViaFeishu
      }
    });
  } catch (err) {
    console.error('❌ 更新报告配置失败:', err.message);
    res.status(500).json({
      success: false,
      error: '更新报告配置失败：' + err.message
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
  console.log(`║     🌐 HTTP 访问：http://localhost:${PORT}               ║`);
  console.log(`║     📡 API: http://localhost:${PORT}/api/status         ║`);
  console.log(`║     🔌 WebSocket: ws://localhost:${PORT}/ws             ║`);
  console.log(`║     📋 配置源：openclaw.json                            ║`);
  
  // 启动 HTTPS 服务器（如果启用）
  const httpsEnabled = initHttpsServer();
  
  if (httpsEnabled) {
    httpsServer.listen(HTTPS_CONFIG.port, () => {
      console.log(`║     🔒 HTTPS 访问：https://localhost:${HTTPS_CONFIG.port}   ║`);
      console.log(`║     🔒 WSS: wss://localhost:${HTTPS_CONFIG.port}/ws         ║`);
    });
    console.log('╠════════════════════════════════════════════════════════╣');
    console.log('║     🔒 HTTPS 已启用 - 安全连接保护                      ║');
  } else {
    console.log('╠════════════════════════════════════════════════════════╣');
    console.log('║     ⚠️  HTTPS 未启用 - 建议使用 HTTPS 保护数据传输      ║');
  }
  
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log('');
  
  // 初始化历史数据存储
  initHistoryStorage();
  
  // 初始化告警系统
  initAlertsSystem();
  
  // 初始化报告系统
  initReportsSystem();
  
  // 启动健康检查调度器
  startHealthCheckScheduler();
});

// 优雅关闭
process.on('SIGINT', () => {
  console.log('\n👋 正在关闭服务器...');
  process.exit(0);
});
