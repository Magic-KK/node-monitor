/**
 * Node Monitor - 前端逻辑
 * 赛博朋克风格版本
 * 
 * @author 牛开发 🐮💻
 */

// ===== 粒子背景系统 =====
let particleCanvas = null;
let particleCtx = null;
let particles = [];
let particleAnimationId = null;

// 粒子配置
const PARTICLE_CONFIG = {
  count: 80, // 粒子数量
  minSize: 1, // 最小粒子大小
  maxSize: 3, // 最大粒子大小
  minSpeed: 0.2, // 最小速度
  maxSpeed: 0.8, // 最大速度
  connectionDistance: 150, // 连线距离
  mouseDistance: 200, // 鼠标互动距离
  colors: {
    dark: ['rgba(0, 245, 255, 0.5)', 'rgba(185, 38, 255, 0.5)', 'rgba(0, 102, 255, 0.5)'],
    light: ['rgba(0, 139, 163, 0.4)', 'rgba(139, 38, 217, 0.4)', 'rgba(0, 82, 204, 0.4)']
  }
};

// 鼠标位置
let mouse = { x: null, y: null };

// 全局状态
let config = null;
let autoRefreshInterval = null;
let isRefreshing = false;
let currentNodes = []; // 缓存当前节点数据用于搜索过滤
let searchQuery = ''; // 当前搜索关键词

// DOM 元素
const nodesGrid = document.getElementById('nodesGrid');
const refreshBtn = document.getElementById('refreshBtn');
const healthCheckBtn = document.getElementById('healthCheckBtn');
const autoRefreshToggle = document.getElementById('autoRefresh');
const themeToggle = document.getElementById('themeToggle');
const themeIcon = document.getElementById('themeIcon');
const lastUpdateEl = document.getElementById('lastUpdate');
const totalNodesEl = document.getElementById('totalNodes');
const onlineNodesEl = document.getElementById('onlineNodes');
const offlineNodesEl = document.getElementById('offlineNodes');
const searchInput = document.getElementById('searchInput');
const clearSearchBtn = document.getElementById('clearSearchBtn');

// 弹窗元素
const nodeModal = document.getElementById('nodeModal');
const modalTitle = document.getElementById('modalTitle');
const modalBody = document.getElementById('modalBody');
const closeModal = document.getElementById('closeModal');
const pingNodeBtn = document.getElementById('pingNodeBtn');
const copyInfoBtn = document.getElementById('copyInfoBtn');

// 当前选中的节点
let selectedNode = null;

/**
 * 初始化应用
 */
async function init() {
  console.log('🚀 SYSTEM INITIALIZING...');
  console.log('🤖 J.A.R.V.I.S. NODE MONITOR - CYBERPUNK EDITION');
  
  // 初始化粒子背景
  initParticles();
  
  // 初始化响应时间图表
  initResponseTimeChart();
  
  // 初始化主题
  initTheme();
  
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
 * 初始化主题（从 localStorage 读取或默认暗色模式）
 */
function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'dark';
  setTheme(savedTheme);
  console.log('🎨 THEME INITIALIZED:', savedTheme);
}

/**
 * 设置主题
 * @param {string} theme - 'dark' 或 'light'
 */
function setTheme(theme) {
  if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
    themeIcon.textContent = '☀️';
    localStorage.setItem('theme', 'light');
  } else {
    document.documentElement.removeAttribute('data-theme');
    themeIcon.textContent = '🌙';
    localStorage.setItem('theme', 'dark');
  }
}

/**
 * 切换主题
 */
function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';
  setTheme(newTheme);
  
  // 更新粒子颜色
  updateParticleColors();
  
  // 更新图表
  updateResponseTimeChart();
  
  showNotification(`THEME SWITCHED TO ${newTheme.toUpperCase()} MODE`);
  console.log('🎨 THEME TOGGLED:', newTheme);
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
      // 更新响应时间历史
      updateResponseTimeHistory(result.data.nodes);
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
  
  // 缓存当前节点数据
  currentNodes = nodes;
  
  // 如果有搜索关键词，先过滤
  const filteredNodes = filterNodes(nodes, searchQuery);
  
  // 生成 HTML
  if (filteredNodes.length === 0) {
    nodesGrid.innerHTML = `
      <div class="no-results">
        <div class="no-results-icon">🔍</div>
        <div class="no-results-title">NO NODES FOUND</div>
        <div class="no-results-text">Try adjusting your search query</div>
      </div>
    `;
  } else {
    nodesGrid.innerHTML = filteredNodes.map(node => createNodeCard(node)).join('');
  }
  
  // 更新搜索按钮状态
  updateClearSearchButton();
}

/**
 * 过滤节点（根据搜索关键词）
 * @param {Array} nodes - 节点数组
 * @param {string} query - 搜索关键词
 * @returns {Array} 过滤后的节点数组
 */
function filterNodes(nodes, query) {
  if (!query || query.trim() === '') {
    return nodes;
  }
  
  const searchLower = query.toLowerCase().trim();
  
  return nodes.filter(node => {
    // 搜索节点名称
    if (node.name && node.name.toLowerCase().includes(searchLower)) {
      return true;
    }
    // 搜索角色
    if (node.role && node.role.toLowerCase().includes(searchLower)) {
      return true;
    }
    // 搜索描述
    if (node.description && node.description.toLowerCase().includes(searchLower)) {
      return true;
    }
    // 搜索工作空间
    if (node.workspace && node.workspace.toLowerCase().includes(searchLower)) {
      return true;
    }
    return false;
  });
}

/**
 * 更新清除搜索按钮状态
 */
function updateClearSearchButton() {
  if (searchInput && searchInput.value.trim() !== '') {
    clearSearchBtn.classList.add('visible');
  } else {
    clearSearchBtn.classList.remove('visible');
  }
}

/**
 * 清除搜索
 */
function clearSearch() {
  searchInput.value = '';
  searchQuery = '';
  renderNodes(currentNodes);
  searchInput.focus();
  showNotification('SEARCH CLEARED');
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
    <div class="node-card ${statusClass}" data-node-id="${node.id}" style="cursor: pointer;">
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
  
  // 主题切换按钮
  themeToggle.addEventListener('click', toggleTheme);
  
  // 搜索输入框
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      renderNodes(currentNodes);
    });
    
    // 支持 ESC 键清除搜索
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        clearSearch();
      }
    });
  }
  
  // 清除搜索按钮
  if (clearSearchBtn) {
    clearSearchBtn.addEventListener('click', clearSearch);
  }
  
  // 节点卡片点击事件（事件委托）
  nodesGrid.addEventListener('click', (e) => {
    const card = e.target.closest('.node-card');
    if (card) {
      const nodeId = card.getAttribute('data-node-id');
      const node = currentNodes.find(n => n.id === nodeId);
      if (node) {
        openNodeModal(node);
      }
    }
  });
  
  // 弹窗关闭按钮
  if (closeModal) {
    closeModal.addEventListener('click', closeNodeModal);
  }
  
  // 点击弹窗背景关闭
  if (nodeModal) {
    nodeModal.addEventListener('click', (e) => {
      if (e.target === nodeModal) {
        closeNodeModal();
      }
    });
  }
  
  // PING NODE 按钮
  if (pingNodeBtn) {
    pingNodeBtn.addEventListener('click', pingSelectedNode);
  }
  
  // COPY INFO 按钮
  if (copyInfoBtn) {
    copyInfoBtn.addEventListener('click', copyNodeInfo);
  }
  
  // ESC 键关闭弹窗
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && nodeModal && nodeModal.classList.contains('active')) {
      closeNodeModal();
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
  
  // 窗口大小改变时更新图表
  window.addEventListener('resize', () => {
    // 延迟一点执行，避免频繁触发
    setTimeout(() => {
      initResponseTimeChart();
      updateResponseTimeChart();
    }, 100);
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

// ===== 粒子背景系统函数 =====

/**
 * 初始化粒子系统
 */
function initParticles() {
  particleCanvas = document.getElementById('particleCanvas');
  if (!particleCanvas) return;
  
  particleCtx = particleCanvas.getContext('2d');
  
  // 设置画布尺寸
  resizeCanvas();
  
  // 创建粒子
  createParticles();
  
  // 绑定事件
  window.addEventListener('resize', resizeCanvas);
  window.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('mouseout', () => {
    mouse.x = null;
    mouse.y = null;
  });
  
  // 启动动画
  animateParticles();
  
  console.log('✨ PARTICLE SYSTEM INITIALIZED');
}

/**
 * 调整画布尺寸
 */
function resizeCanvas() {
  if (!particleCanvas) return;
  
  particleCanvas.width = window.innerWidth;
  particleCanvas.height = window.innerHeight;
}

/**
 * 创建粒子
 */
function createParticles() {
  particles = [];
  const isLightTheme = document.documentElement.getAttribute('data-theme') === 'light';
  const colors = isLightTheme ? PARTICLE_CONFIG.colors.light : PARTICLE_CONFIG.colors.dark;
  
  for (let i = 0; i < PARTICLE_CONFIG.count; i++) {
    particles.push({
      x: Math.random() * particleCanvas.width,
      y: Math.random() * particleCanvas.height,
      size: Math.random() * (PARTICLE_CONFIG.maxSize - PARTICLE_CONFIG.minSize) + PARTICLE_CONFIG.minSize,
      speedX: (Math.random() - 0.5) * (Math.random() < 0.5 ? PARTICLE_CONFIG.minSpeed : PARTICLE_CONFIG.maxSpeed),
      speedY: (Math.random() - 0.5) * (Math.random() < 0.5 ? PARTICLE_CONFIG.minSpeed : PARTICLE_CONFIG.maxSpeed),
      color: colors[Math.floor(Math.random() * colors.length)],
      opacity: Math.random() * 0.5 + 0.3
    });
  }
}

/**
 * 处理鼠标移动
 * @param {MouseEvent} e - 鼠标事件
 */
function handleMouseMove(e) {
  mouse.x = e.clientX;
  mouse.y = e.clientY;
}

/**
 * 更新粒子位置
 */
function updateParticles() {
  const isLightTheme = document.documentElement.getAttribute('data-theme') === 'light';
  const colors = isLightTheme ? PARTICLE_CONFIG.colors.light : PARTICLE_CONFIG.colors.dark;
  
  particles.forEach(particle => {
    // 更新位置
    particle.x += particle.speedX;
    particle.y += particle.speedY;
    
    // 边界检测（反弹）
    if (particle.x < 0 || particle.x > particleCanvas.width) {
      particle.speedX *= -1;
    }
    if (particle.y < 0 || particle.y > particleCanvas.height) {
      particle.speedY *= -1;
    }
    
    // 鼠标互动（排斥效果）
    if (mouse.x !== null && mouse.y !== null) {
      const dx = mouse.x - particle.x;
      const dy = mouse.y - particle.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance < PARTICLE_CONFIG.mouseDistance) {
        const force = (PARTICLE_CONFIG.mouseDistance - distance) / PARTICLE_CONFIG.mouseDistance;
        const angle = Math.atan2(dy, dx);
        const pushX = Math.cos(angle) * force * 2;
        const pushY = Math.sin(angle) * force * 2;
        
        particle.x -= pushX;
        particle.y -= pushY;
      }
    }
  });
}

/**
 * 绘制粒子
 */
function drawParticles() {
  if (!particleCtx) return;
  
  // 清空画布
  particleCtx.clearRect(0, 0, particleCanvas.width, particleCanvas.height);
  
  // 绘制粒子连线
  drawConnections();
  
  // 绘制粒子
  particles.forEach(particle => {
    particleCtx.beginPath();
    particleCtx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
    particleCtx.fillStyle = particle.color;
    particleCtx.globalAlpha = particle.opacity;
    particleCtx.fill();
    
    // 添加辉光效果
    particleCtx.shadowBlur = 15;
    particleCtx.shadowColor = particle.color;
  });
  
  particleCtx.globalAlpha = 1;
  particleCtx.shadowBlur = 0;
}

/**
 * 绘制粒子之间的连线
 */
function drawConnections() {
  const isLightTheme = document.documentElement.getAttribute('data-theme') === 'light';
  
  for (let i = 0; i < particles.length; i++) {
    for (let j = i + 1; j < particles.length; j++) {
      const dx = particles[i].x - particles[j].x;
      const dy = particles[i].y - particles[j].y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance < PARTICLE_CONFIG.connectionDistance) {
        const opacity = (1 - distance / PARTICLE_CONFIG.connectionDistance) * 0.5;
        
        particleCtx.beginPath();
        particleCtx.strokeStyle = isLightTheme 
          ? `rgba(0, 139, 163, ${opacity})`
          : `rgba(0, 245, 255, ${opacity})`;
        particleCtx.lineWidth = 0.5;
        particleCtx.globalAlpha = opacity;
        particleCtx.moveTo(particles[i].x, particles[i].y);
        particleCtx.lineTo(particles[j].x, particles[j].y);
        particleCtx.stroke();
      }
    }
  }
  
  particleCtx.globalAlpha = 1;
}

/**
 * 粒子动画循环
 */
function animateParticles() {
  updateParticles();
  drawParticles();
  particleAnimationId = requestAnimationFrame(animateParticles);
}

/**
 * 根据主题更新粒子颜色
 */
function updateParticleColors() {
  const isLightTheme = document.documentElement.getAttribute('data-theme') === 'light';
  const colors = isLightTheme ? PARTICLE_CONFIG.colors.light : PARTICLE_CONFIG.colors.dark;
  
  particles.forEach((particle, index) => {
    particle.color = colors[index % colors.length];
  });
}

// ===== 节点详情弹窗功能 =====

/**
 * 打开节点详情弹窗
 * @param {Object} node - 节点数据
 */
function openNodeModal(node) {
  selectedNode = node;
  
  // 确定状态
  let statusClass = 'status-offline';
  let statusText = 'OFFLINE';
  
  if (!node.configured) {
    statusClass = 'status-unconfigured';
    statusText = 'NOT CONFIGURED';
  } else if (node.online) {
    statusClass = 'status-online';
    statusText = 'ONLINE';
  }
  
  // 生成详情内容
  modalTitle.textContent = 'NODE DETAILS';
  modalBody.innerHTML = `
    <div style="text-align: center; margin-bottom: 20px;">
      <span class="node-emoji-large">${node.emoji || '📡'}</span>
    </div>
    
    <div class="status-indicator-large ${statusClass}">
      <span class="status-dot-large"></span>
      ${statusText}
    </div>
    
    <div class="detail-section">
      <div class="detail-section-title">BASIC INFO</div>
      <div class="detail-grid">
        <div class="detail-item">
          <div class="detail-item-label">NAME</div>
          <div class="detail-item-value">${node.name}</div>
        </div>
        <div class="detail-item">
          <div class="detail-item-label">ROLE</div>
          <div class="detail-item-value">${node.role || 'N/A'}</div>
        </div>
        <div class="detail-item">
          <div class="detail-item-label">WORKSPACE</div>
          <div class="detail-item-value">${node.workspace || 'N/A'}</div>
        </div>
        <div class="detail-item">
          <div class="detail-item-label">NODE ID</div>
          <div class="detail-item-value" style="font-family: monospace; font-size: 0.9rem;">${node.id}</div>
        </div>
      </div>
    </div>
    
    <div class="detail-section">
      <div class="detail-section-title">DESCRIPTION</div>
      <div class="detail-item" style="background: transparent; border: none; padding: 0;">
        <div class="detail-item-value" style="font-size: 1rem; line-height: 1.8;">
          ${node.description || 'No description available'}
        </div>
      </div>
    </div>
    
    ${node.configured ? `
    <div class="detail-section">
      <div class="detail-section-title">STATUS INFO</div>
      <div class="detail-grid">
        <div class="detail-item">
          <div class="detail-item-label">RESPONSE TIME</div>
          <div class="detail-item-value" style="color: var(--success);">
            ${node.responseTime ? node.responseTime + 'ms' : 'N/A'}
          </div>
        </div>
        <div class="detail-item">
          <div class="detail-item-label">LAST CHECK</div>
          <div class="detail-item-value">${formatTime(node.lastCheck)}</div>
        </div>
        ${node.url ? `
        <div class="detail-item" style="grid-column: 1 / -1;">
          <div class="detail-item-label">ENDPOINT URL</div>
          <div class="detail-item-value" style="font-family: monospace; font-size: 0.9rem; color: var(--neon-cyan);">
            ${node.url}
          </div>
        </div>
        ` : ''}
        ${node.error ? `
        <div class="detail-item" style="grid-column: 1 / -1;">
          <div class="detail-item-label">LAST ERROR</div>
          <div class="detail-item-value" style="color: var(--danger);">
            ${node.error}
          </div>
        </div>
        ` : ''}
      </div>
    </div>
    ` : `
    <div class="detail-section">
      <div class="detail-section-title">⚠️ CONFIGURATION WARNING</div>
      <div class="detail-item" style="background: rgba(252, 238, 10, 0.1); border-color: var(--warning);">
        <div class="detail-item-value" style="color: var(--warning);">
          This node is not configured yet. Please add the APP_ID to enable monitoring.
        </div>
      </div>
    </div>
    `}
  `;
  
  // 显示弹窗
  nodeModal.classList.add('active');
  document.body.style.overflow = 'hidden'; // 防止背景滚动
  
  console.log('📋 NODE MODAL OPENED:', node.name);
}

/**
 * 关闭节点详情弹窗
 */
function closeNodeModal() {
  nodeModal.classList.remove('active');
  document.body.style.overflow = ''; // 恢复滚动
  selectedNode = null;
  
  console.log('📋 NODE MODAL CLOSED');
}

/**
 * PING 选中的节点
 */
async function pingSelectedNode() {
  if (!selectedNode || !selectedNode.url) {
    showNotification('NO ENDPOINT URL AVAILABLE');
    return;
  }
  
  pingNodeBtn.disabled = true;
  pingNodeBtn.innerHTML = '<span class="btn-icon">⏳</span> PINGING...';
  
  try {
    const startTime = Date.now();
    const response = await fetch(selectedNode.url, { 
      method: 'HEAD',
      timeout: 5000
    });
    const endTime = Date.now();
    const responseTime = endTime - startTime;
    
    if (response.ok) {
      showNotification(`PING SUCCESS: ${responseTime}ms`);
      // 更新弹窗中的响应时间
      const responseTimeEl = modalBody.querySelector('.detail-item-value');
      if (responseTimeEl) {
        responseTimeEl.textContent = responseTime + 'ms';
      }
    } else {
      showNotification(`PING FAILED: ${response.status}`);
    }
  } catch (err) {
    console.error('⚠️ PING FAILED:', err);
    showNotification('PING FAILED: CONNECTION ERROR');
  } finally {
    pingNodeBtn.disabled = false;
    pingNodeBtn.innerHTML = '<span class="btn-icon">📡</span> PING NODE';
  }
}

/**
 * 复制节点信息到剪贴板
 */
async function copyNodeInfo() {
  if (!selectedNode) return;
  
  const info = `
NODE: ${selectedNode.name}
ROLE: ${selectedNode.role || 'N/A'}
STATUS: ${selectedNode.configured ? (selectedNode.online ? 'ONLINE' : 'OFFLINE') : 'NOT CONFIGURED'}
WORKSPACE: ${selectedNode.workspace || 'N/A'}
${selectedNode.url ? 'URL: ' + selectedNode.url : ''}
${selectedNode.responseTime ? 'RESPONSE TIME: ' + selectedNode.responseTime + 'ms' : ''}
${selectedNode.description ? 'DESCRIPTION: ' + selectedNode.description : ''}
  `.trim();
  
  try {
    await navigator.clipboard.writeText(info);
    showNotification('NODE INFO COPIED TO CLIPBOARD');
  } catch (err) {
    console.error('⚠️ COPY FAILED:', err);
    showError('FAILED TO COPY TO CLIPBOARD');
  }
}

// ===== 响应时间图表功能 =====

// 响应时间历史数据（最多保存 10 次记录）
const responseTimeHistory = {
  maxRecords: 10,
  data: {} // { nodeId: [{ time, responseTime }, ...] }
};

// 图表配置
const CHART_CONFIG = {
  colors: {
    dark: {
      grid: 'rgba(0, 245, 255, 0.1)',
      text: 'rgba(255, 255, 255, 0.6)',
      default: '#00f5ff'
    },
    light: {
      grid: 'rgba(0, 139, 163, 0.15)',
      text: 'rgba(26, 26, 46, 0.6)',
      default: '#008ba3'
    }
  },
  nodeColors: {} // 为每个节点分配颜色
};

// 节点颜色池
const NODE_COLOR_POOL = [
  '#00f5ff', '#b926ff', '#0066ff', '#ff006e', '#00ff88',
  '#fcee0a', '#ff6b35', '#00d9ff', '#ff00ff', '#00ff00'
];

/**
 * 初始化响应时间图表
 */
function initResponseTimeChart() {
  const canvas = document.getElementById('responseTimeChart');
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  
  // 设置画布尺寸（高分辨率）
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  
  // 存储 canvas 上下文供后续使用
  responseTimeChart.ctx = ctx;
  responseTimeChart.width = rect.width;
  responseTimeChart.height = rect.height;
  
  console.log('📈 RESPONSE TIME CHART INITIALIZED');
}

// 图表对象
const responseTimeChart = {
  ctx: null,
  width: 0,
  height: 0
};

/**
 * 添加响应时间记录
 * @param {string} nodeId - 节点 ID
 * @param {number} responseTime - 响应时间 (ms)
 */
function addResponseTimeRecord(nodeId, responseTime) {
  if (!responseTimeHistory.data[nodeId]) {
    responseTimeHistory.data[nodeId] = [];
    // 为节点分配颜色
    const colorIndex = Object.keys(responseTimeHistory.data).length % NODE_COLOR_POOL.length;
    CHART_CONFIG.nodeColors[nodeId] = NODE_COLOR_POOL[colorIndex];
  }
  
  const records = responseTimeHistory.data[nodeId];
  records.push({
    time: new Date(),
    responseTime: responseTime
  });
  
  // 保持最大记录数
  if (records.length > responseTimeHistory.maxRecords) {
    records.shift();
  }
}

/**
 * 更新响应时间图表
 */
function updateResponseTimeChart() {
  const canvas = document.getElementById('responseTimeChart');
  if (!canvas || !responseTimeChart.ctx) return;
  
  const ctx = responseTimeChart.ctx;
  const width = responseTimeChart.width;
  const height = responseTimeChart.height;
  const isLightTheme = document.documentElement.getAttribute('data-theme') === 'light';
  const config = isLightTheme ? CHART_CONFIG.colors.light : CHART_CONFIG.colors.dark;
  
  // 清空画布
  ctx.clearRect(0, 0, width, height);
  
  const nodeIds = Object.keys(responseTimeHistory.data);
  if (nodeIds.length === 0) {
    // 绘制空状态提示
    ctx.fillStyle = config.text;
    ctx.font = '14px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('NO DATA AVAILABLE', width / 2, height / 2);
    return;
  }
  
  // 计算最大响应时间（用于 Y 轴缩放）
  let maxResponseTime = 100;
  nodeIds.forEach(nodeId => {
    responseTimeHistory.data[nodeId].forEach(record => {
      if (record.responseTime > maxResponseTime) {
        maxResponseTime = record.responseTime;
      }
    });
  });
  maxResponseTime = Math.ceil(maxResponseTime / 100) * 100; // 向上取整到 100 的倍数
  
  // 绘制网格
  const gridLines = 5;
  ctx.strokeStyle = config.grid;
  ctx.lineWidth = 1;
  for (let i = 0; i <= gridLines; i++) {
    const y = (height - 40) * (i / gridLines) + 20;
    ctx.beginPath();
    ctx.moveTo(50, y);
    ctx.lineTo(width - 20, y);
    ctx.stroke();
    
    // Y 轴标签
    ctx.fillStyle = config.text;
    ctx.font = '11px "Segoe UI", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${maxResponseTime - (maxResponseTime / gridLines) * i}ms`, 45, y + 4);
  }
  
  // 绘制每个节点的折线
  const padding = { left: 50, right: 20, top: 20, bottom: 40 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  
  nodeIds.forEach((nodeId, nodeIndex) => {
    const records = responseTimeHistory.data[nodeId];
    if (records.length < 2) return;
    
    const color = CHART_CONFIG.nodeColors[nodeId] || config.default;
    
    // 绘制折线
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    
    records.forEach((record, index) => {
      const x = padding.left + (chartWidth / (responseTimeHistory.maxRecords - 1)) * index;
      const y = padding.top + chartHeight - (record.responseTime / maxResponseTime) * chartHeight;
      
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();
    
    // 绘制数据点
    records.forEach((record, index) => {
      const x = padding.left + (chartWidth / (responseTimeHistory.maxRecords - 1)) * index;
      const y = padding.top + chartHeight - (record.responseTime / maxResponseTime) * chartHeight;
      
      // 绘制点
      ctx.beginPath();
      ctx.fillStyle = color;
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
      
      // 绘制辉光
      ctx.beginPath();
      ctx.fillStyle = color + '40'; // 添加透明度
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fill();
    });
  });
  
  // 更新图例
  updateChartLegend();
}

/**
 * 更新图表图例
 */
function updateChartLegend() {
  const legendEl = document.getElementById('chartLegend');
  if (!legendEl) return;
  
  const nodeIds = Object.keys(responseTimeHistory.data);
  if (nodeIds.length === 0) {
    legendEl.innerHTML = '<div class="legend-item">NO DATA</div>';
    return;
  }
  
  legendEl.innerHTML = nodeIds.map(nodeId => {
    const color = CHART_CONFIG.nodeColors[nodeId] || CHART_CONFIG.colors.dark.default;
    const records = responseTimeHistory.data[nodeId];
    const latestTime = records[records.length - 1]?.time.toLocaleTimeString('en-US', { 
      hour12: false,
      hour: '2-digit', 
      minute: '2-digit'
    }) || '-';
    const latestResponseTime = records[records.length - 1]?.responseTime || 0;
    
    return `
      <div class="legend-item" data-node-id="${nodeId}">
        <div class="legend-color" style="background: ${color}; color: ${color}"></div>
        <span>${nodeId}: ${latestResponseTime}ms (${latestTime})</span>
      </div>
    `;
  }).join('');
}

/**
 * 从节点数据更新响应时间历史
 * @param {Array} nodes - 节点数组
 */
function updateResponseTimeHistory(nodes) {
  nodes.forEach(node => {
    if (node.responseTime && node.configured) {
      addResponseTimeRecord(node.id, node.responseTime);
    }
  });
  
  updateResponseTimeChart();
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', init);

// 请求通知权限
requestNotificationPermission();
