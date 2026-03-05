/**
 * Node Monitor - 前端逻辑
 * 赛博朋克风格版本
 * 
 * @author 牛开发 🐮💻
 */

// 全局状态
let config = null;
let autoRefreshInterval = null;
let isRefreshing = false;

// DOM 元素
const nodesGrid = document.getElementById('nodesGrid');
const refreshBtn = document.getElementById('refreshBtn');
const healthCheckBtn = document.getElementById('healthCheckBtn');
const autoRefreshToggle = document.getElementById('autoRefresh');
const lastUpdateEl = document.getElementById('lastUpdate');
const totalNodesEl = document.getElementById('totalNodes');
const onlineNodesEl = document.getElementById('onlineNodes');
const offlineNodesEl = document.getElementById('offlineNodes');

/**
 * 初始化应用
 */
async function init() {
  console.log('🚀 SYSTEM INITIALIZING...');
  console.log('🤖 J.A.R.V.I.S. NODE MONITOR - CYBERPUNK EDITION');
  
  // 加载配置
  await loadConfig();
  
  // 初始状态获取
  await fetchStatus();
  
  // 绑定事件
  bindEvents();
  
  // 启动自动刷新
  startAutoRefresh();
  
  console.log('✅ SYSTEM ONLINE');
}

/**
 * 加载团队配置
 */
async function loadConfig() {
  try {
    const response = await fetch('/api/config');
    const result = await response.json();
    
    if (result.success) {
      config = result.data;
      console.log('📋 CONFIG LOADED:', config.teamName);
      document.title = `${config.teamName} | CYBERPUNK EDITION`;
    }
  } catch (err) {
    console.error('⚠️ CONFIG LOAD FAILED:', err);
    showError('SYSTEM ERROR: UNABLE TO LOAD CONFIGURATION');
  }
}

/**
 * 获取节点状态
 */
async function fetchStatus() {
  if (isRefreshing) return;
  
  isRefreshing = true;
  updateButtonState(true);
  
  try {
    const response = await fetch('/api/status');
    const result = await response.json();
    
    if (result.success) {
      renderNodes(result.data.nodes);
      updateStats(result.data);
      updateLastUpdateTime(result.data.lastUpdate);
    } else {
      showError('SYSTEM ERROR: ' + result.error);
    }
  } catch (err) {
    console.error('⚠️ STATUS FETCH FAILED:', err);
    showError('CONNECTION ERROR: CHECK NETWORK');
  } finally {
    isRefreshing = false;
    updateButtonState(false);
  }
}

/**
 * 执行健康检查
 */
async function runHealthCheck() {
  if (isRefreshing) return;
  
  updateButtonState(true);
  healthCheckBtn.disabled = true;
  healthCheckBtn.innerHTML = '<span class="btn-icon">⏳</span> SCANNING...';
  
  try {
    const response = await fetch('/api/health-check', { method: 'POST' });
    const result = await response.json();
    
    if (result.success) {
      renderNodes(result.data.nodes);
      updateStats(result.data);
      updateLastUpdateTime(result.data.checkTime);
      
      // 显示成功提示
      showNotification(`SCAN COMPLETE: ${result.data.onlineCount}/${result.data.configuredCount} NODES ONLINE`);
    } else {
      showError('SCAN FAILED: ' + result.error);
    }
  } catch (err) {
    console.error('⚠️ HEALTH CHECK FAILED:', err);
    showError('UNABLE TO EXECUTE SCAN');
  } finally {
    updateButtonState(false);
    healthCheckBtn.disabled = false;
    healthCheckBtn.innerHTML = '<span class="btn-icon">🔍</span> 健康检查';
  }
}

/**
 * 渲染节点卡片
 * @param {Array} nodes - 节点状态数组
 */
function renderNodes(nodes) {
  if (!config || !config.nodes) {
    nodesGrid.innerHTML = '<div class="error-message">SYSTEM ERROR: CONFIGURATION NOT LOADED</div>';
    return;
  }
  
  // 生成 HTML
  nodesGrid.innerHTML = nodes.map(node => createNodeCard(node)).join('');
}

/**
 * 创建单个节点卡片 HTML
 * @param {Object} node - 节点数据
 * @returns {string} HTML 字符串
 */
function createNodeCard(node) {
  // 确定状态类别
  let statusClass = 'offline';
  let statusText = 'OFFLINE';
  let statusBadgeClass = 'status-offline';
  
  if (!node.configured) {
    // 未配置
    statusClass = 'unconfigured';
    statusText = 'NOT CONFIGURED';
    statusBadgeClass = 'status-unconfigured';
  } else if (node.online) {
    // 已配置且在线
    statusClass = 'online';
    statusText = 'ONLINE';
    statusBadgeClass = 'status-online';
  } else if (node.configured) {
    // 已配置但离线
    statusClass = 'offline';
    statusText = 'OFFLINE';
    statusBadgeClass = 'status-offline';
  }
  
  return `
    <div class="node-card ${statusClass}">
      <div class="node-header">
        <span class="node-emoji">${node.emoji || '📡'}</span>
        <div class="node-info">
          <div class="node-name">${node.name}</div>
          <div class="node-role">${node.role || 'NODE'}</div>
        </div>
        <span class="status-badge ${statusBadgeClass}">
          <span class="status-dot"></span>
          ${statusText}
        </span>
      </div>
      
      <div class="node-description">
        ${node.description || 'No description available'}
      </div>
      
      ${!node.configured ? `
      <div class="node-details">
        <div class="detail-row" style="color: var(--warning)">
          <span class="detail-label">⚠️ STATUS</span>
          <span class="detail-value">APP_ID NOT CONFIGURED</span>
        </div>
        ${node.workspace ? `
        <div class="detail-row">
          <span class="detail-label">WORKSPACE</span>
          <span class="detail-value">${node.workspace}</span>
        </div>
        ` : ''}
      </div>
      ` : `
      <div class="node-details">
        <div class="detail-row">
          <span class="detail-label">WORKSPACE</span>
          <span class="detail-value">${node.workspace || 'N/A'}</span>
        </div>
        ${node.responseTime ? `
        <div class="detail-row">
          <span class="detail-label">RESPONSE TIME</span>
          <span class="detail-value response-time">${node.responseTime}ms</span>
        </div>
        ` : ''}
        <div class="detail-row">
          <span class="detail-label">LAST CHECK</span>
          <span class="detail-value">${formatTime(node.lastCheck)}</span>
        </div>
        ${node.error ? `
        <div class="detail-row">
          <span class="detail-label">ERROR</span>
          <span class="detail-value" style="color: var(--danger)">${node.error}</span>
        </div>
        ` : ''}
      </div>
      `}
    </div>
  `;
}

/**
 * 更新统计信息
 * @param {Object} data - 状态数据
 */
function updateStats(data) {
  totalNodesEl.textContent = data.totalNodes || 0;
  onlineNodesEl.textContent = data.onlineCount || 0;
  offlineNodesEl.textContent = (data.configuredCount || 0) - (data.onlineCount || 0);
  
  // 更新颜色
  onlineNodesEl.style.color = 'var(--success)';
  offlineNodesEl.style.color = data.onlineCount === data.configuredCount ? 'var(--text-muted)' : 'var(--danger)';
}

/**
 * 更新最后更新时间
 * @param {string} timestamp - ISO 时间戳
 */
function updateLastUpdateTime(timestamp) {
  lastUpdateEl.textContent = formatTime(timestamp);
}

/**
 * 格式化时间
 * @param {string} isoString - ISO 时间戳
 * @returns {string} 格式化后的时间
 */
function formatTime(isoString) {
  if (!isoString) return '-';
  
  const date = new Date(isoString);
  const now = new Date();
  const diff = now - date;
  
  // 如果是 1 分钟内，显示"刚刚"
  if (diff < 60000) {
    return 'JUST NOW';
  }
  
  // 否则显示具体时间
  return date.toLocaleTimeString('en-US', { 
    hour12: false,
    hour: '2-digit', 
    minute: '2-digit',
    second: '2-digit'
  });
}

/**
 * 更新按钮状态
 * @param {boolean} loading - 是否加载中
 */
function updateButtonState(loading) {
  refreshBtn.disabled = loading;
  refreshBtn.innerHTML = loading 
    ? '<span class="btn-icon">⏳</span> REFRESHING...' 
    : '<span class="btn-icon">🔄</span> 刷新状态';
}

/**
 * 启动自动刷新
 */
function startAutoRefresh() {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
  }
  
  // 每 30 秒自动刷新
  autoRefreshInterval = setInterval(() => {
    if (autoRefreshToggle.checked && !isRefreshing) {
      fetchStatus();
    }
  }, 30000);
}

/**
 * 绑定事件监听器
 */
function bindEvents() {
  // 刷新按钮
  refreshBtn.addEventListener('click', fetchStatus);
  
  // 健康检查按钮
  healthCheckBtn.addEventListener('click', runHealthCheck);
  
  // 自动刷新开关
  autoRefreshToggle.addEventListener('change', () => {
    if (autoRefreshToggle.checked) {
      showNotification('AUTO-REFRESH ENABLED');
    } else {
      showNotification('AUTO-REFRESH DISABLED');
    }
  });
  
  // 页面可见性变化时暂停/恢复刷新
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
        autoRefreshInterval = null;
      }
    } else {
      startAutoRefresh();
    }
  });
}

/**
 * 显示错误消息
 * @param {string} message - 错误信息
 */
function showError(message) {
  const errorEl = document.createElement('div');
  errorEl.className = 'error-message';
  errorEl.textContent = '⚠️ ' + message;
  
  // 插入到顶部
  nodesGrid.parentNode.insertBefore(errorEl, nodesGrid);
  
  // 3 秒后移除
  setTimeout(() => errorEl.remove(), 3000);
}

/**
 * 显示通知
 * @param {string} message - 通知内容
 */
function showNotification(message) {
  // 使用浏览器通知（如果支持）
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('J.A.R.V.I.S. MONITOR', {
      body: message,
      icon: '🤖'
    });
  }
  
  // 同时在控制台输出
  console.log('📢', message);
}

/**
 * 请求通知权限
 */
function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission().then(permission => {
      console.log('🔔 Notification permission:', permission);
    });
  }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', init);

// 请求通知权限
requestNotificationPermission();
