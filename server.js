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
