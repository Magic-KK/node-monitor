/**
 * Node Monitor Server - J.A.R.V.I.S. 团队节点状态监控
 * 
 * 功能：
 * - 提供团队节点状态 API
 * - 健康检查服务
 * - 静态文件服务（前端页面）
 * 
 * @author 牛开发 🐮💻
 * @version 1.0.0
 */

const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// 加载团队配置
const configPath = path.join(__dirname, 'config', 'team-config.json');
let teamConfig = { members: [], checkInterval: 30000, timeout: 5000 };

try {
  teamConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  console.log('✅ 团队配置加载成功:', teamConfig.teamName);
} catch (err) {
  console.warn('⚠️ 配置文件加载失败，使用默认配置:', err.message);
}

// 节点状态缓存（内存存储）
const nodeStatusCache = new Map();

/**
 * 健康检查函数 - 检测节点是否可达
 * @param {Object} member - 团队成员配置
 * @returns {Promise<Object>} 健康状态结果
 */
async function checkNodeHealth(member) {
  const startTime = Date.now();
  
  return new Promise((resolve) => {
    // 模拟健康检查（实际部署时可替换为真实 HTTP 请求）
    // 这里使用超时模拟，实际可以调用 http.get 检测端点
    const timeout = setTimeout(() => {
      resolve({
        id: member.id,
        name: member.name,
        online: false,
        responseTime: null,
        lastCheck: new Date().toISOString(),
        error: '超时或无法连接'
      });
    }, teamConfig.timeout || 5000);

    // 模拟检查逻辑（实际部署时取消注释并使用真实请求）
    // 由于是本地演示，我们随机模拟在线状态
    setTimeout(() => {
      clearTimeout(timeout);
      const isOnline = Math.random() > 0.2; // 80% 概率在线（演示用）
      const responseTime = isOnline ? Math.floor(Math.random() * 200) + 20 : null;
      
      const result = {
        id: member.id,
        name: member.name,
        online: isOnline,
        responseTime: responseTime,
        lastCheck: new Date().toISOString(),
        error: isOnline ? null : '节点无响应'
      };
      
      // 更新缓存
      nodeStatusCache.set(member.id, result);
      resolve(result);
    }, Math.floor(Math.random() * 500) + 100);
  });
}

/**
 * 检查所有节点健康状态
 * @returns {Promise<Array>} 所有节点状态
 */
async function checkAllNodes() {
  const checks = teamConfig.members.map(member => checkNodeHealth(member));
  return Promise.all(checks);
}

// 中间件 - 解析 JSON
app.use(express.json());

// 静态文件服务
app.use(express.static(path.join(__dirname, 'public')));

/**
 * API: 获取团队配置
 * GET /api/config
 */
app.get('/api/config', (req, res) => {
  res.json({
    success: true,
    data: teamConfig
  });
});

/**
 * API: 获取所有节点状态
 * GET /api/status
 */
app.get('/api/status', async (req, res) => {
  try {
    const statuses = Array.from(nodeStatusCache.values());
    res.json({
      success: true,
      data: {
        nodes: statuses,
        totalNodes: teamConfig.members.length,
        onlineCount: statuses.filter(s => s.online).length,
        lastUpdate: new Date().toISOString()
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
        totalNodes: teamConfig.members.length,
        onlineCount: statuses.filter(s => s.online).length,
        checkTime: new Date().toISOString()
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
      error: '节点未找到'
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
    console.log(`✅ 初始健康检查完成，${statuses.filter(s => s.online).length}/${statuses.length} 节点在线`);
  });
  
  // 定时执行
  setInterval(() => {
    checkAllNodes().then(statuses => {
      const onlineCount = statuses.filter(s => s.online).length;
      console.log(`📊 健康检查：${onlineCount}/${statuses.length} 节点在线`);
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
