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
let selectedGroup = 'all'; // 当前选中的分组
let favorites = new Set(); // 收藏的节点 ID 集合
let showFavoritesOnly = false; // 是否只显示收藏节点

// DOM 元素
const nodesGrid = document.getElementById('nodesGrid');
const refreshBtn = document.getElementById('refreshBtn');
const healthCheckBtn = document.getElementById('healthCheckBtn');
const autoRefreshToggle = document.getElementById('autoRefresh');
const refreshIntervalSelect = document.getElementById('refreshInterval');
const themeSelect = document.getElementById('themeSelect');
const lastUpdateEl = document.getElementById('lastUpdate');
const totalNodesEl = document.getElementById('totalNodes');
const onlineNodesEl = document.getElementById('onlineNodes');
const offlineNodesEl = document.getElementById('offlineNodes');
const searchInput = document.getElementById('searchInput');
const clearSearchBtn = document.getElementById('clearSearchBtn');
const groupFilter = document.getElementById('groupFilter');
const favoritesFilter = document.getElementById('favoritesFilter');

// 系统指标元素
const cpuUsageEl = document.getElementById('cpuUsage');
const cpuBarEl = document.getElementById('cpuBar');
const memoryUsageEl = document.getElementById('memoryUsage');
const memoryBarEl = document.getElementById('memoryBar');
const memoryDetailEl = document.getElementById('memoryDetail');
const uptimeEl = document.getElementById('uptime');
const platformDetailEl = document.getElementById('platformDetail');
const metricsLastUpdateEl = document.getElementById('metricsLastUpdate');

// 弹窗元素
const nodeModal = document.getElementById('nodeModal');
const modalTitle = document.getElementById('modalTitle');
const modalBody = document.getElementById('modalBody');
const closeModal = document.getElementById('closeModal');
const pingNodeBtn = document.getElementById('pingNodeBtn');
const copyInfoBtn = document.getElementById('copyInfoBtn');

// 连线图层
const connectionCanvas = document.getElementById('connectionCanvas');
let connectionCtx = null;

// 当前选中的节点
let selectedNode = null;

// 加载动画元素
let loadingOverlay = null;
let loadingProgress = null;
let loadingStatus = null;

// 音效系统
const soundToggle = document.getElementById('soundToggle');
let soundEnabled = true;
let audioContext = null;

// 音效配置
const SOUND_CONFIG = {
  volume: 0.3, // 主音量
  sounds: {
    refresh: { freq: 880, duration: 0.1, type: 'sine' }, // 刷新完成 - 高音
    online: { freq: 660, duration: 0.15, type: 'sine' }, // 节点上线 - 中音
    offline: { freq: 220, duration: 0.2, type: 'sawtooth' }, // 节点离线 - 低音
    error: { freq: 150, duration: 0.3, type: 'sawtooth' }, // 错误 - 低沉
    success: { freq: 1200, duration: 0.1, type: 'triangle' } // 成功 - 清脆
  }
};

// ===== WebSocket 实时推送系统 =====
let ws = null; // WebSocket 连接
let wsReconnectTimer = null; // 重连定时器
let wsReconnectAttempts = 0; // 重连次数
const WS_MAX_RECONNECT_ATTEMPTS = 5; // 最大重连次数
const WS_RECONNECT_DELAY = 3000; // 重连延迟（毫秒）

// WebSocket 状态指示器
let wsConnected = false;

/**
 * 初始化 WebSocket 连接
 */
function initWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws`;
  
  console.log('🔌 尝试连接 WebSocket:', wsUrl);
  
  try {
    ws = new WebSocket(wsUrl);
    
    // 连接成功
    ws.onopen = () => {
      console.log('✅ WebSocket 连接成功');
      wsConnected = true;
      wsReconnectAttempts = 0;
      updateWebSocketStatus(true);
      
      // 播放连接成功音效
      if (soundEnabled) {
        playSound('success');
      }
    };
    
    // 接收消息
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleWebSocketMessage(data);
      } catch (err) {
        console.error('❌ 解析 WebSocket 消息失败:', err);
      }
    };
    
    // 连接关闭
    ws.onclose = () => {
      console.log('🔌 WebSocket 连接已关闭');
      wsConnected = false;
      updateWebSocketStatus(false);
      
      // 尝试重连
      scheduleReconnect();
    };
    
    // 连接错误
    ws.onerror = (error) => {
      console.error('❌ WebSocket 错误:', error);
      wsConnected = false;
      updateWebSocketStatus(false);
    };
  } catch (err) {
    console.error('❌ 创建 WebSocket 连接失败:', err);
    scheduleReconnect();
  }
}

/**
 * 处理 WebSocket 消息
 * @param {Object} data - 消息数据
 */
function handleWebSocketMessage(data) {
  console.log('📨 收到 WebSocket 消息:', data.type);
  
  switch (data.type) {
    case 'connected':
      console.log('👋 服务器欢迎:', data.message);
      break;
      
    case 'initial_state':
      // 初始状态已加载，无需额外处理
      console.log('📊 收到初始状态');
      break;
      
    case 'state_update':
      // 节点状态更新
      handleStateUpdate(data.data);
      break;
      
    case 'metrics_update':
      // 系统指标更新
      handleMetricsUpdate(data.data);
      break;
      
    case 'pong':
      // 心跳响应
      console.log('🏓 WebSocket 心跳响应');
      break;
  }
}

/**
 * 处理状态更新
 * @param {Object} data - 状态数据
 */
function handleStateUpdate(data) {
  if (!data || !data.nodes) return;
  
  console.log('📊 实时更新节点状态:', data.nodes.length, '节点');
  
  // 更新缓存
  currentNodes = data.nodes;
  
  // 更新 UI（只刷新卡片，不重新渲染整个页面）
  updateNodesGrid(currentNodes);
  
  // 更新统计
  updateStats(currentNodes);
  
  // 更新连线图
  drawConnections();
  
  // 更新最后更新时间
  if (data.timestamp) {
    lastUpdateEl.textContent = new Date(data.timestamp).toLocaleTimeString('zh-CN');
  }
}

/**
 * 处理系统指标更新
 * @param {Object} data - 指标数据
 */
function handleMetricsUpdate(data) {
  if (!data) return;
  
  // 更新 CPU 使用率
  if (data.cpu !== undefined && cpuUsageEl) {
    cpuUsageEl.textContent = data.cpu.toFixed(1);
    const cpuPercent = Math.min(100, data.cpu);
    cpuBarEl.style.width = cpuPercent + '%';
    
    // 根据使用率设置颜色
    cpuBarEl.style.background = getMetricBarColor(cpuPercent);
  }
  
  // 更新内存使用率
  if (data.memory && data.memory.percent !== undefined && memoryUsageEl) {
    memoryUsageEl.textContent = data.memory.percent.toFixed(1);
    const memoryPercent = Math.min(100, data.memory.percent);
    memoryBarEl.style.width = memoryPercent + '%';
    memoryBarEl.style.background = getMetricBarColor(memoryPercent);
    
    // 更新内存详情
    if (memoryDetailEl && data.memory.usedFormatted && data.memory.totalFormatted) {
      memoryDetailEl.textContent = `${data.memory.usedFormatted} / ${data.memory.totalFormatted}`;
    }
  }
  
  // 更新运行时间
  if (data.uptimeFormatted && uptimeEl) {
    uptimeEl.textContent = data.uptimeFormatted;
  }
  
  // 更新平台信息
  if (data.platform && platformDetailEl) {
    platformDetailEl.textContent = `${data.platform} (${data.arch})`;
  }
  
  // 更新最后更新时间
  if (data.timestamp && metricsLastUpdateEl) {
    metricsLastUpdateEl.textContent = new Date(data.timestamp).toLocaleTimeString('zh-CN');
  }
}

/**
 * 更新 WebSocket 状态指示器
 * @param {boolean} connected - 是否已连接
 */
function updateWebSocketStatus(connected) {
  const wsIndicator = document.getElementById('wsStatus');
  if (wsIndicator) {
    wsIndicator.textContent = connected ? '🟢 WS' : '🔴 WS';
    wsIndicator.title = connected ? 'WebSocket 已连接' : 'WebSocket 未连接';
    
    // 添加/移除连接状态类
    if (connected) {
      wsIndicator.classList.add('connected');
    } else {
      wsIndicator.classList.remove('connected');
    }
  }
}

/**
 * 安排重连
 */
function scheduleReconnect() {
  if (wsReconnectAttempts >= WS_MAX_RECONNECT_ATTEMPTS) {
    console.log('❌ WebSocket 重连次数已达上限，停止重连');
    return;
  }
  
  wsReconnectAttempts++;
  const delay = WS_RECONNECT_DELAY * wsReconnectAttempts; // 指数退避
  
  console.log(`⏰ ${delay / 1000}秒后尝试第${wsReconnectAttempts}次重连...`);
  
  wsReconnectTimer = setTimeout(() => {
    console.log('🔄 尝试重新连接 WebSocket...');
    initWebSocket();
  }, delay);
}

/**
 * 发送 WebSocket 消息
 * @param {Object} data - 要发送的数据
 */
function sendWebSocketMessage(data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
    return true;
  }
  return false;
}

/**
 * 请求实时状态更新
 */
function requestStateUpdate() {
  return sendWebSocketMessage({ type: 'request_state' });
}

/**
 * 请求系统指标更新
 */
function requestMetricsUpdate() {
  return sendWebSocketMessage({ type: 'request_metrics' });
}

/**
 * 发送心跳
 */
function sendWebSocketPing() {
  return sendWebSocketMessage({ type: 'ping' });
}

/**
 * 初始化应用
 */
async function init() {
  console.log('🚀 SYSTEM INITIALIZING...');
  console.log('🤖 J.A.R.V.I.S. NODE MONITOR - CYBERPUNK EDITION');
  
  // 初始化加载动画
  initLoadingAnimation();
  
  // 初始化粒子背景
  initParticles();
  
  // 初始化连线图层
  initConnections();
  
  // 初始化响应时间图表
  initResponseTimeChart();
  
  // 初始化主题
  initTheme();
  
  // 初始化音效
  initSound();
  
  // 初始化收藏功能
  initFavorites();
  
  // 加载配置
  updateLoadingProgress(20, 'LOADING CONFIGURATION...');
  await loadConfig();
  
  // 初始状态获取
  updateLoadingProgress(40, 'FETCHING NODE STATUS...');
  await fetchStatus();
  
  // 获取系统指标
  updateLoadingProgress(70, 'LOADING SYSTEM METRICS...');
  await fetchSystemMetrics();
  
  // 绑定事件
  updateLoadingProgress(90, 'INITIALIZING CONTROLS...');
  bindEvents();
  
  // 启动自动刷新
  startAutoRefresh();
  
  // 初始化 WebSocket 实时推送
  initWebSocket();
  
  // 隐藏加载动画
  updateLoadingProgress(100, 'SYSTEM ONLINE');
  setTimeout(() => hideLoadingOverlay(), 500);
  
  // 初始化快速操作
  initQuickActions();
  
  console.log('✅ SYSTEM ONLINE');
}

/**
 * 初始化加载动画
 */
function initLoadingAnimation() {
  loadingOverlay = document.getElementById('loadingOverlay');
  loadingProgress = document.getElementById('loadingProgress');
  loadingStatus = document.getElementById('loadingStatus');
  console.log('🎬 LOADING ANIMATION INITIALIZED');
}

/**
 * 更新加载进度
 * @param {number} percent - 进度百分比 (0-100)
 * @param {string} status - 状态文本
 */
function updateLoadingProgress(percent, status) {
  if (loadingProgress) {
    loadingProgress.style.width = percent + '%';
  }
  if (loadingStatus) {
    loadingStatus.textContent = status;
  }
  console.log(`📊 LOADING: ${percent}% - ${status}`);
}

/**
 * 隐藏加载动画
 */
function hideLoadingOverlay() {
  if (loadingOverlay) {
    loadingOverlay.classList.add('hidden');
    // 3 秒后完全移除 DOM 元素
    setTimeout(() => {
      if (loadingOverlay) {
        loadingOverlay.style.display = 'none';
      }
    }, 500);
  }
}

/**
 * 显示加载动画（用于刷新操作）
 */
function showLoadingOverlay() {
  if (loadingOverlay) {
    loadingOverlay.classList.remove('hidden');
    loadingOverlay.style.display = 'flex';
    updateLoadingProgress(0, 'REFRESHING...');
  }
}

/**
 * 初始化主题（从 localStorage 读取或默认赛博朋克）
 */
function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'cyberpunk';
  setTheme(savedTheme);
  // 更新主题选择器的值
  if (themeSelect) {
    themeSelect.value = savedTheme;
  }
  console.log('🎨 THEME INITIALIZED:', savedTheme);
}

/**
 * 初始化音效系统
 */
function initSound() {
  // 从 localStorage 读取音效设置
  const savedSound = localStorage.getItem('soundEnabled');
  if (savedSound !== null) {
    soundEnabled = savedSound === 'true';
    if (soundToggle) {
      soundToggle.checked = soundEnabled;
    }
  }
  console.log('🔊 SOUND INITIALIZED:', soundEnabled ? 'ENABLED' : 'DISABLED');
}

/**
 * 初始化收藏功能
 */
function initFavorites() {
  // 从 localStorage 读取收藏列表
  const savedFavorites = localStorage.getItem('nodeFavorites');
  if (savedFavorites) {
    try {
      const favoriteIds = JSON.parse(savedFavorites);
      favorites = new Set(favoriteIds);
      console.log('⭐ FAVORITES LOADED:', favorites.size, 'nodes');
    } catch (err) {
      console.error('⚠️ 读取收藏列表失败:', err);
      favorites = new Set();
    }
  } else {
    favorites = new Set();
  }
  console.log('⭐ FAVORITE SYSTEM INITIALIZED');
}

/**
 * 保存收藏列表到 localStorage
 */
function saveFavorites() {
  try {
    localStorage.setItem('nodeFavorites', JSON.stringify(Array.from(favorites)));
    console.log('💾 FAVORITES SAVED:', favorites.size, 'nodes');
  } catch (err) {
    console.error('⚠️ 保存收藏列表失败:', err);
  }
}

/**
 * 切换节点收藏状态
 * @param {string} nodeId - 节点 ID
 */
function toggleFavorite(nodeId) {
  if (favorites.has(nodeId)) {
    favorites.delete(nodeId);
    showNotification('REMOVED FROM FAVORITES ⭐');
    playSound('offline'); // 使用下线音效表示移除
  } else {
    favorites.add(nodeId);
    showNotification('ADDED TO FAVORITES ⭐');
    playSound('success'); // 使用成功音效表示添加
  }
  
  saveFavorites();
  
  // 重新渲染节点卡片（更新收藏按钮状态）
  renderNodes(currentNodes);
}

/**
 * 检查节点是否已收藏
 * @param {string} nodeId - 节点 ID
 * @returns {boolean} 是否已收藏
 */
function isFavorite(nodeId) {
  return favorites.has(nodeId);
}

/**
 * 过滤收藏节点
 * @param {Array} nodes - 节点数组
 * @returns {Array} 过滤后的节点数组
 */
function filterFavorites(nodes) {
  if (!showFavoritesOnly) {
    return nodes;
  }
  
  return nodes.filter(node => favorites.has(node.id));
}

/**
 * 初始化音频上下文（用户交互后调用）
 */
function initAudioContext() {
  if (!audioContext) {
    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      console.log('🎵 AUDIO CONTEXT INITIALIZED');
    } catch (err) {
      console.warn('⚠️ AUDIO CONTEXT FAILED:', err.message);
    }
  }
}

/**
 * 播放音效
 * @param {string} soundName - 音效名称 (refresh, online, offline, error, success)
 */
function playSound(soundName) {
  if (!soundEnabled) return;
  
  // 初始化音频上下文（如果需要）
  if (!audioContext) {
    initAudioContext();
  }
  
  if (!audioContext || !SOUND_CONFIG.sounds[soundName]) {
    console.warn('⚠️ Cannot play sound:', soundName);
    return;
  }
  
  const sound = SOUND_CONFIG.sounds[soundName];
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  
  // 连接节点
  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);
  
  // 设置参数
  oscillator.type = sound.type;
  oscillator.frequency.setValueAtTime(sound.freq, audioContext.currentTime);
  
  // 音量包络（避免爆音）
  gainNode.gain.setValueAtTime(0, audioContext.currentTime);
  gainNode.gain.linearRampToValueAtTime(SOUND_CONFIG.volume, audioContext.currentTime + 0.01);
  gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + sound.duration);
  
  // 播放
  oscillator.start(audioContext.currentTime);
  oscillator.stop(audioContext.currentTime + sound.duration);
  
  console.log('🔊 PLAYED SOUND:', soundName);
}

/**
 * 播放节点状态变化音效
 * @param {boolean} isOnline - 是否在线
 */
function playNodeStatusSound(isOnline) {
  if (isOnline) {
    playSound('online');
  } else {
    playSound('offline');
  }
}

/**
 * 设置主题
 * @param {string} theme - 'cyberpunk', 'scifi', 'minimal', 或 'light'
 */
function setTheme(theme) {
  const validThemes = ['cyberpunk', 'scifi', 'minimal', 'light'];
  if (!validThemes.includes(theme)) {
    theme = 'cyberpunk'; // 默认主题
  }
  
  if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else if (theme === 'cyberpunk') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
  
  localStorage.setItem('theme', theme);
  
  // 更新粒子颜色
  updateParticleColors();
  
  // 更新图表
  updateResponseTimeChart();
  
  // 重绘连线
  if (currentNodes && currentNodes.length > 0) {
    drawConnections(filterNodes(currentNodes, searchQuery));
  }
  
  const themeNames = {
    cyberpunk: '赛博朋克',
    scifi: '科幻深空',
    minimal: '极简现代',
    light: '明亮简洁'
  };
  
  showNotification(`THEME SWITCHED TO ${themeNames[theme] || theme.toUpperCase()}`);
  console.log('🎨 THEME SET TO:', theme);
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
    showErrorParticles(window.innerWidth / 2, 100, 40);
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
      updateGroupFilter(result.data.nodes); // 更新分组筛选器
      updateStats(result.data);
      updateLastUpdateTime(result.data.lastUpdate);
      // 更新响应时间历史
      updateResponseTimeHistory(result.data.nodes);
      // 同时更新系统指标
      fetchSystemMetrics();
      // 播放刷新完成音效
      playSound('refresh');
    } else {
      showError('SYSTEM ERROR: ' + result.error);
      showErrorParticles(window.innerWidth / 2, 150, 30);
      playSound('error');
    }
  } catch (err) {
    console.error('⚠️ STATUS FETCH FAILED:', err);
    showError('CONNECTION ERROR: CHECK NETWORK');
    showErrorParticles(window.innerWidth / 2, 150, 30);
    triggerErrorShake(document.querySelector('.refresh-btn'));
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
      updateGroupFilter(result.data.nodes); // 更新分组筛选器
      updateStats(result.data);
      updateLastUpdateTime(result.data.checkTime);
      
      // 显示成功提示
      showNotification(`SCAN COMPLETE: ${result.data.onlineCount}/${result.data.configuredCount} NODES ONLINE`);
      // 播放成功音效
      playSound('success');
    } else {
      showError('SCAN FAILED: ' + result.error);
      showErrorParticles(window.innerWidth / 2, 200, 35);
      triggerErrorShake(healthCheckBtn);
      playSound('error');
    }
  } catch (err) {
    console.error('⚠️ HEALTH CHECK FAILED:', err);
    showError('UNABLE TO EXECUTE SCAN');
    showErrorParticles(window.innerWidth / 2, 200, 35);
    triggerErrorShake(healthCheckBtn);
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
  
  // 检测节点状态变化并播放音效
  if (currentNodes && currentNodes.length > 0) {
    nodes.forEach(newNode => {
      const oldNode = currentNodes.find(n => n.id === newNode.id);
      if (oldNode && oldNode.online !== newNode.online) {
        // 节点状态发生变化
        playNodeStatusSound(newNode.online);
      }
    });
  }
  
  // 缓存当前节点数据
  currentNodes = nodes;
  
  // 过滤链：分组 -> 收藏 -> 搜索
  const groupedNodes = filterNodesByGroup(nodes, selectedGroup);
  const favoriteFilteredNodes = filterFavorites(groupedNodes);
  const filteredNodes = filterNodes(favoriteFilteredNodes, searchQuery);
  
  // 生成 HTML
  if (filteredNodes.length === 0) {
    const noResultsMessage = showFavoritesOnly && favorites.size === 0 
      ? 'No favorites yet. Click the star icon on a node to add it!'
      : 'Try adjusting your search query';
    
    nodesGrid.innerHTML = `
      <div class="no-results">
        <div class="no-results-icon">${showFavoritesOnly ? '⭐' : '🔍'}</div>
        <div class="no-results-title">NO NODES FOUND</div>
        <div class="no-results-text">${noResultsMessage}</div>
      </div>
    `;
  } else {
    nodesGrid.innerHTML = filteredNodes.map(node => createNodeCard(node)).join('');
  }
  
  // 更新搜索按钮状态
  updateClearSearchButton();
  
  // 绘制节点连线（延迟等待 DOM 渲染完成）
  setTimeout(() => {
    drawConnections(filteredNodes);
  }, 100);
  
  // 初始化 3D 卡片效果（延迟等待 DOM 渲染完成）
  setTimeout(() => {
    init3DCards();
  }, 150);
}

/**
 * 过滤节点（根据分组）
 * @param {Array} nodes - 节点数组
 * @param {string} group - 选中的分组（'all' 表示全部）
 * @returns {Array} 过滤后的节点数组
 */
function filterNodesByGroup(nodes, group) {
  if (!group || group === 'all') {
    return nodes;
  }
  
  return nodes.filter(node => {
    // 支持 group 字段或 workspace 字段作为分组依据
    const nodeGroup = node.group || node.workspace || 'default';
    return nodeGroup === group;
  });
}

/**
 * 更新分组筛选器选项
 * @param {Array} nodes - 节点数组
 */
function updateGroupFilter(nodes) {
  if (!groupFilter) return;
  
  // 收集所有分组
  const groups = new Set();
  nodes.forEach(node => {
    const group = node.group || node.workspace || 'default';
    groups.add(group);
  });
  
  // 保存当前选中的分组
  const currentSelection = selectedGroup;
  
  // 清空现有选项（保留"全部"选项）
  groupFilter.innerHTML = '<option value="all">ALL GROUPS</option>';
  
  // 添加分组选项
  Array.from(groups).sort().forEach(group => {
    const option = document.createElement('option');
    option.value = group;
    option.textContent = group.toUpperCase();
    groupFilter.appendChild(option);
  });
  
  // 恢复之前的选择（如果该分组仍然存在）
  if (groups.has(currentSelection)) {
    groupFilter.value = currentSelection;
  } else {
    selectedGroup = 'all';
    groupFilter.value = 'all';
  }
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
  
  // 检查是否已收藏
  const isFavorited = isFavorite(node.id);
  const favoriteClass = isFavorited ? 'favorited' : '';
  const favoriteIcon = isFavorited ? '⭐' : '☆';
  
  return `
    <div class="node-card ${statusClass}" data-node-id="${node.id}" style="cursor: pointer;">
      <div class="node-header">
        <span class="node-emoji">${node.emoji || '📡'}</span>
        <div class="node-info">
          <div class="node-name">${node.name}</div>
          <div class="node-role">${node.role || 'NODE'}</div>
        </div>
        <div class="node-actions">
          <button class="favorite-btn ${favoriteClass}" 
                  data-node-id="${node.id}" 
                  title="${isFavorited ? 'Remove from favorites' : 'Add to favorites'}"
                  onclick="event.stopPropagation(); toggleFavorite('${node.id}')">
            ${favoriteIcon}
          </button>
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
 * 获取系统指标（CPU、内存、运行时间）
 */
async function fetchSystemMetrics() {
  try {
    const response = await fetch('/api/system-metrics');
    const result = await response.json();
    
    if (result.success) {
      updateSystemMetrics(result.data);
    }
  } catch (err) {
    console.error('⚠️ SYSTEM METRICS FETCH FAILED:', err);
    // 静默失败，不影响主功能
  }
}

/**
 * 更新系统指标 UI
 * @param {Object} metrics - 系统指标数据
 */
function updateSystemMetrics(metrics) {
  // 更新 CPU 使用率
  if (cpuUsageEl && cpuBarEl) {
    const cpu = metrics.cpu || 0;
    cpuUsageEl.textContent = cpu.toFixed(1);
    cpuBarEl.style.width = `${Math.min(cpu, 100)}%`;
    
    // 根据 CPU 使用率设置颜色
    if (cpu < 50) {
      cpuBarEl.style.background = 'var(--success)';
    } else if (cpu < 80) {
      cpuBarEl.style.background = 'var(--warning)';
    } else {
      cpuBarEl.style.background = 'var(--danger)';
    }
  }
  
  // 更新内存使用率
  if (memoryUsageEl && memoryBarEl && memoryDetailEl) {
    const memory = metrics.memory || {};
    const percent = memory.percent || 0;
    memoryUsageEl.textContent = percent.toFixed(1);
    memoryBarEl.style.width = `${Math.min(percent, 100)}%`;
    memoryDetailEl.textContent = `${memory.usedFormatted || '-'} / ${memory.totalFormatted || '-'}`;
    
    // 根据内存使用率设置颜色
    if (percent < 50) {
      memoryBarEl.style.background = 'var(--success)';
    } else if (percent < 80) {
      memoryBarEl.style.background = 'var(--warning)';
    } else {
      memoryBarEl.style.background = 'var(--danger)';
    }
  }
  
  // 更新运行时间
  if (uptimeEl && platformDetailEl) {
    uptimeEl.textContent = metrics.uptimeFormatted || '-';
    platformDetailEl.textContent = metrics.platform || '-';
  }
  
  // 更新指标最后更新时间
  if (metricsLastUpdateEl) {
    metricsLastUpdateEl.textContent = formatTime(metrics.lastUpdate);
  }
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
  
  // 获取用户配置的刷新间隔（默认 30 秒）
  const refreshInterval = parseInt(refreshIntervalSelect?.value || '30000');
  
  autoRefreshInterval = setInterval(() => {
    if (autoRefreshToggle.checked && !isRefreshing) {
      fetchStatus();
      fetchSystemMetrics();
    }
  }, refreshInterval);
}

/**
 * 绑定事件监听器
 */
function bindEvents() {
  // 刷新按钮
  refreshBtn.addEventListener('click', fetchStatus);
  
  // 健康检查按钮
  healthCheckBtn.addEventListener('click', runHealthCheck);
  
  // 导出报告按钮
  const exportBtn = document.getElementById('exportBtn');
  if (exportBtn) {
    exportBtn.addEventListener('click', exportToCSV);
  }
  
  // 历史趋势按钮
  const historyBtn = document.getElementById('historyBtn');
  if (historyBtn) {
    historyBtn.addEventListener('click', openHistoryModal);
  }
  
  // 自动刷新开关
  autoRefreshToggle.addEventListener('change', () => {
    if (autoRefreshToggle.checked) {
      showNotification('AUTO-REFRESH ENABLED');
      startAutoRefresh();
    } else {
      showNotification('AUTO-REFRESH DISABLED');
      if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
        autoRefreshInterval = null;
      }
    }
  });
  
  // 刷新间隔选择器
  if (refreshIntervalSelect) {
    // 从 localStorage 加载保存的刷新间隔
    const savedInterval = localStorage.getItem('refreshInterval');
    if (savedInterval) {
      refreshIntervalSelect.value = savedInterval;
    }
    
    refreshIntervalSelect.addEventListener('change', () => {
      const interval = refreshIntervalSelect.value;
      // 保存到 localStorage
      localStorage.setItem('refreshInterval', interval);
      
      // 格式化显示
      const intervalText = formatIntervalText(interval);
      showNotification(`REFRESH INTERVAL: ${intervalText}`);
      
      // 重新启动自动刷新（如果已启用）
      if (autoRefreshToggle.checked) {
        startAutoRefresh();
      }
    });
  }
  
  // 主题选择器
  if (themeSelect) {
    themeSelect.addEventListener('change', (e) => {
      setTheme(e.target.value);
    });
  }
  
  // 音效开关
  if (soundToggle) {
    soundEnabled = soundToggle.checked;
    soundToggle.addEventListener('change', () => {
      soundEnabled = soundToggle.checked;
      if (soundEnabled) {
        showNotification('SOUND EFFECTS ENABLED 🔊');
        playSound('success'); // 播放成功音效确认
      } else {
        showNotification('SOUND EFFECTS DISABLED 🔇');
      }
      // 保存到 localStorage
      localStorage.setItem('soundEnabled', soundEnabled);
    });
  }
  
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
  
  // 分组筛选器
  if (groupFilter) {
    groupFilter.addEventListener('change', (e) => {
      selectedGroup = e.target.value;
      renderNodes(currentNodes);
      
      const groupName = selectedGroup === 'all' ? 'ALL GROUPS' : selectedGroup;
      showNotification(`FILTER: ${groupName}`);
    });
  }
  
  // 收藏筛选器
  if (favoritesFilter) {
    // 从 localStorage 读取收藏筛选状态
    const savedFavoritesFilter = localStorage.getItem('showFavoritesOnly');
    if (savedFavoritesFilter === 'true') {
      showFavoritesOnly = true;
      favoritesFilter.checked = true;
    }
    
    favoritesFilter.addEventListener('change', (e) => {
      showFavoritesOnly = favoritesFilter.checked;
      // 保存到 localStorage
      localStorage.setItem('showFavoritesOnly', showFavoritesOnly);
      
      renderNodes(currentNodes);
      
      if (showFavoritesOnly) {
        showNotification(`SHOWING FAVORITES ONLY (${favorites.size} nodes) ⭐`);
      } else {
        showNotification('SHOWING ALL NODES');
      }
    });
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
  
  // ===== 告警管理相关事件 =====
  
  // 告警管理按钮
  const alertsBtn = document.getElementById('alertsBtn');
  if (alertsBtn) {
    alertsBtn.addEventListener('click', openAlertsModal);
  }
  
  // ===== 实时日志流相关事件 =====
  
  // 日志按钮
  const logsBtn = document.getElementById('logsBtn');
  if (logsBtn) {
    logsBtn.addEventListener('click', openLogsModal);
  }
  
  // 关闭日志弹窗按钮
  const closeLogsModal = document.getElementById('closeLogsModal');
  if (closeLogsModal) {
    closeLogsModal.addEventListener('click', closeLogsModalFunc);
  }
  
  // 刷新日志按钮
  const refreshLogsBtn = document.getElementById('refreshLogsBtn');
  if (refreshLogsBtn) {
    refreshLogsBtn.addEventListener('click', loadLogs);
  }
  
  // 清除日志按钮
  const clearLogsBtn = document.getElementById('clearLogsBtn');
  if (clearLogsBtn) {
    clearLogsBtn.addEventListener('click', clearLogs);
  }
  
  // 日志级别过滤
  const logLevelFilter = document.getElementById('logLevelFilter');
  if (logLevelFilter) {
    logLevelFilter.addEventListener('change', loadLogs);
  }
  
  // 日志来源过滤
  const logSourceFilter = document.getElementById('logSourceFilter');
  if (logSourceFilter) {
    logSourceFilter.addEventListener('change', loadLogs);
  }
  
  // 自动滚动开关
  const autoScrollLogs = document.getElementById('autoScrollLogs');
  if (autoScrollLogs) {
    autoScrollLogs.addEventListener('change', () => {
      if (autoScrollLogs.checked) {
        scrollToBottom();
      }
    });
  }
  
  // ===== 配置管理相关事件 =====
  
  // 配置管理按钮
  const settingsBtn = document.getElementById('settingsBtn');
  if (settingsBtn) {
    settingsBtn.addEventListener('click', openSettingsModal);
  }
  
  // ===== 历史趋势相关事件 =====
  
  // 关闭告警弹窗按钮
  const closeAlertsModal = document.getElementById('closeAlertsModal');
  if (closeAlertsModal) {
    closeAlertsModal.addEventListener('click', closeAlertsModalFunc);
  }
  
  // 告警配置标签页切换
  document.querySelectorAll('[data-tab="alerts-config"]').forEach(btn => {
    btn.addEventListener('click', () => switchAlertsTab('config'));
  });
  
  // 告警历史标签页切换
  document.querySelectorAll('[data-tab="alerts-history"]').forEach(btn => {
    btn.addEventListener('click', () => switchAlertsTab('history'));
  });
  
  // 保存告警配置按钮
  const saveAlertsConfigBtn = document.getElementById('saveAlertsConfigBtn');
  if (saveAlertsConfigBtn) {
    saveAlertsConfigBtn.addEventListener('click', saveAlertsConfig);
  }
  
  // 测试告警按钮
  const testAlertBtn = document.getElementById('testAlertBtn');
  if (testAlertBtn) {
    testAlertBtn.addEventListener('click', testAlert);
  }
  
  // 清除告警历史按钮
  const clearAlertsHistoryBtn = document.getElementById('clearAlertsHistoryBtn');
  if (clearAlertsHistoryBtn) {
    clearAlertsHistoryBtn.addEventListener('click', clearAlertsHistory);
  }
  
  // 告警历史筛选器
  const alertHistoryFilter = document.getElementById('alertHistoryFilter');
  if (alertHistoryFilter) {
    alertHistoryFilter.addEventListener('change', () => loadAlertsHistory());
  }
  
  // 关闭历史弹窗按钮
  const closeHistoryModal = document.getElementById('closeHistoryModal');
  if (closeHistoryModal) {
    closeHistoryModal.addEventListener('click', closeHistoryModalFunc);
  }
  
  // 历史天数选择器
  const historyDaysSelect = document.getElementById('historyDaysSelect');
  if (historyDaysSelect) {
    historyDaysSelect.addEventListener('change', () => {
      loadHistoryStats(parseInt(historyDaysSelect.value));
    });
  }
  
  // 关闭配置弹窗按钮
  const closeSettingsModal = document.getElementById('closeSettingsModal');
  if (closeSettingsModal) {
    closeSettingsModal.addEventListener('click', closeSettingsModal);
  }
  
  // 取消配置按钮
  const cancelSettingsBtn = document.getElementById('cancelSettingsBtn');
  if (cancelSettingsBtn) {
    cancelSettingsBtn.addEventListener('click', closeSettingsModal);
  }
  
  // 保存设置按钮
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');
  if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener('click', saveSettings);
  }
  
  // 添加节点按钮
  const addNodeBtn = document.getElementById('addNodeBtn');
  if (addNodeBtn) {
    addNodeBtn.addEventListener('click', addNewNode);
  }
  
  // 点击配置弹窗背景关闭
  const settingsModal = document.getElementById('settingsModal');
  if (settingsModal) {
    settingsModal.addEventListener('click', (e) => {
      if (e.target === settingsModal) {
        closeSettingsModal();
      }
    });
  }
  
  // 标签页切换
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.getAttribute('data-tab');
      switchTab(tabId);
    });
  });
  
  // ESC 键关闭配置弹窗
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && settingsModal && settingsModal.classList.contains('active')) {
      closeSettingsModal();
    }
  });
}

/**
 * 显示错误消息
 * @param {string} message - 错误信息
 */
function showError(message) {
  const errorEl = document.createElement('div');
  errorEl.className = 'error-message error-ripple';
  errorEl.textContent = '⚠️ ' + message;
  
  // 插入到顶部
  nodesGrid.parentNode.insertBefore(errorEl, nodesGrid);
  
  // 3 秒后移除
  setTimeout(() => errorEl.remove(), 3000);
  
  // 播放错误音效
  playSound('error');
}

/**
 * 触发元素震动动画
 * @param {HTMLElement} element - 目标元素
 */
function triggerErrorShake(element) {
  if (!element) return;
  
  element.classList.add('error-shake');
  
  // 动画结束后移除 class
  setTimeout(() => {
    element.classList.remove('error-shake');
  }, 600);
}

/**
 * 触发元素边框闪烁动画
 * @param {HTMLElement} element - 目标元素
 */
function triggerErrorBorderFlash(element) {
  if (!element) return;
  
  element.classList.add('error-border-flash');
  
  // 动画结束后移除 class
  setTimeout(() => {
    element.classList.remove('error-border-flash');
  }, 400);
}

/**
 * 显示错误粒子爆炸效果
 * @param {number} x - X 坐标
 * @param {number} y - Y 坐标
 * @param {number} count - 粒子数量
 */
function showErrorParticles(x = window.innerWidth / 2, y = window.innerHeight / 2, count = 30) {
  // 创建粒子容器
  let container = document.querySelector('.error-particle-container');
  
  if (!container) {
    container = document.createElement('div');
    container.className = 'error-particle-container';
    document.body.appendChild(container);
  }
  
  // 激活容器
  container.classList.add('active');
  
  // 创建粒子
  for (let i = 0; i < count; i++) {
    const particle = document.createElement('div');
    particle.className = 'error-particle';
    
    // 随机方向
    const angle = (Math.PI * 2 * i) / count;
    const distance = 100 + Math.random() * 150;
    const tx = Math.cos(angle) * distance;
    const ty = Math.sin(angle) * distance;
    
    // 设置粒子样式
    particle.style.left = x + 'px';
    particle.style.top = y + 'px';
    particle.style.setProperty('--tx', tx + 'px');
    particle.style.setProperty('--ty', ty + 'px');
    particle.style.animation = `errorParticleExplode ${0.5 + Math.random() * 0.3}s ease-out forwards`;
    
    container.appendChild(particle);
    
    // 粒子动画结束后移除
    setTimeout(() => {
      particle.remove();
      if (container.children.length === 0) {
        container.classList.remove('active');
      }
    }, 800);
  }
  
  // 播放错误音效
  playSound('error');
}

/**
 * 显示严重错误覆盖层
 * @param {string} title - 错误标题
 * @param {string} message - 错误详情
 * @param {Function} onRetry - 重试回调
 */
function showCriticalError(title, message, onRetry) {
  // 创建覆盖层
  let overlay = document.querySelector('.critical-error-overlay');
  
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'critical-error-overlay';
    overlay.innerHTML = `
      <div class="critical-error-content">
        <div class="critical-error-icon">⚠️</div>
        <h2 class="critical-error-title"></h2>
        <p class="critical-error-message"></p>
        <button class="critical-error-retry-btn">重试</button>
      </div>
    `;
    document.body.appendChild(overlay);
    
    // 绑定重试按钮事件
    const retryBtn = overlay.querySelector('.critical-error-retry-btn');
    retryBtn.addEventListener('click', () => {
      overlay.classList.remove('active');
      setTimeout(() => overlay.remove(), 300);
      if (onRetry) onRetry();
    });
  }
  
  // 设置内容
  overlay.querySelector('.critical-error-title').textContent = title;
  overlay.querySelector('.critical-error-message').textContent = message;
  
  // 显示覆盖层
  overlay.classList.add('active');
  
  // 播放错误音效
  playSound('error');
}

/**
 * 显示节点卡片错误状态
 * @param {string} nodeId - 节点 ID
 * @param {boolean} isError - 是否为错误状态
 */
function setNodeErrorState(nodeId, isError) {
  const card = document.querySelector(`.node-card[data-node-id="${nodeId}"]`);
  if (!card) return;
  
  if (isError) {
    card.classList.add('error-state');
    triggerErrorShake(card);
  } else {
    card.classList.remove('error-state');
  }
}

/**
 * HTML 转义工具函数
 * @param {string} text - 需要转义的文本
 * @returns {string} 转义后的文本
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * 格式化刷新间隔文本
 * @param {string} ms - 毫秒数
 * @returns {string} 格式化后的文本
 */
function formatIntervalText(ms) {
  const seconds = parseInt(ms) / 1000;
  if (seconds < 60) {
    return `${seconds}秒`;
  } else if (seconds < 3600) {
    const minutes = seconds / 60;
    return `${minutes}分钟`;
  } else {
    const hours = seconds / 3600;
    return `${hours}小时`;
  }
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
    triggerErrorBorderFlash(document.querySelector('.copy-info-btn'));
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

// ===== 节点连线系统 =====

/**
 * 初始化连线画布
 */
function initConnections() {
  if (!connectionCanvas) return;
  
  connectionCtx = connectionCanvas.getContext('2d');
  
  // 设置画布尺寸
  resizeConnectionCanvas();
  
  // 监听窗口大小变化
  window.addEventListener('resize', () => {
    resizeConnectionCanvas();
    // 重绘连线
    if (currentNodes && currentNodes.length > 0) {
      drawConnections(currentNodes);
    }
  });
  
  console.log('🔗 CONNECTION LAYER INITIALIZED');
}

/**
 * 调整连线画布尺寸
 */
function resizeConnectionCanvas() {
  if (!connectionCanvas) return;
  
  connectionCanvas.width = window.innerWidth;
  connectionCanvas.height = window.innerHeight;
}

/**
 * 绘制节点连线
 * @param {Array} nodes - 节点数组
 */
function drawConnections(nodes) {
  if (!connectionCtx || !connectionCanvas) return;
  
  // 清空画布
  connectionCtx.clearRect(0, 0, connectionCanvas.width, connectionCanvas.height);
  
  // 获取主题
  const isLightTheme = document.documentElement.getAttribute('data-theme') === 'light';
  
  // 连线颜色配置
  const lineColors = {
    dark: 'rgba(0, 245, 255, 0.3)',
    light: 'rgba(0, 139, 163, 0.2)'
  };
  
  const glowColors = {
    dark: 'rgba(0, 245, 255, 0.5)',
    light: 'rgba(0, 139, 163, 0.3)'
  };
  
  const lineColor = isLightTheme ? lineColors.light : lineColors.dark;
  const glowColor = isLightTheme ? glowColors.light : glowColors.dark;
  
  // 获取所有节点卡片元素
  const nodeCards = document.querySelectorAll('.node-card');
  if (nodeCards.length < 2) return;
  
  // 找到主脑节点（作为中心节点）
  let mainNodeIndex = -1;
  nodes.forEach((node, index) => {
    if (node.id === 'main-bot' || node.role === '主脑') {
      mainNodeIndex = index;
    }
  });
  
  // 获取节点卡片中心点坐标
  const nodeCenters = [];
  nodeCards.forEach((card, index) => {
    const rect = card.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    nodeCenters.push({ x: centerX, y: centerY, index });
  });
  
  // 绘制连线：主脑连接到所有其他节点
  if (mainNodeIndex >= 0 && nodeCenters[mainNodeIndex]) {
    const mainNode = nodeCenters[mainNodeIndex];
    
    nodeCenters.forEach((target, index) => {
      if (index !== mainNodeIndex) {
        drawConnectionLine(
          connectionCtx,
          mainNode.x,
          mainNode.y,
          target.x,
          target.y,
          lineColor,
          glowColor,
          nodes[index]?.status === 'online'
        );
      }
    });
  }
  
  // 如果没有明确的主脑节点，则绘制网状连接（相邻节点连接）
  if (mainNodeIndex < 0 && nodeCenters.length > 1) {
    for (let i = 0; i < nodeCenters.length - 1; i++) {
      drawConnectionLine(
        connectionCtx,
        nodeCenters[i].x,
        nodeCenters[i].y,
        nodeCenters[i + 1].x,
        nodeCenters[i + 1].y,
        lineColor,
        glowColor,
        nodes[i]?.status === 'online'
      );
    }
  }
}

/**
 * 绘制单条连线
 */
function drawConnectionLine(ctx, x1, y1, x2, y2, lineColor, glowColor, isActive) {
  // 绘制光晕效果
  if (isActive) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = glowColor;
    ctx.lineWidth = 4;
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 15;
    ctx.stroke();
    ctx.restore();
  }
  
  // 绘制主连线
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 5]); // 虚线效果
  ctx.stroke();
  ctx.restore();
  
  // 绘制端点圆圈
  ctx.save();
  ctx.beginPath();
  ctx.arc(x1, y1, 4, 0, Math.PI * 2);
  ctx.arc(x2, y2, 4, 0, Math.PI * 2);
  ctx.fillStyle = isActive ? glowColor : lineColor;
  ctx.fill();
  ctx.restore();
}

// ===== 3D 卡片倾斜效果 =====

/**
 * 初始化 3D 卡片效果
 */
function init3DCards() {
  const nodeCards = document.querySelectorAll('.node-card');
  
  nodeCards.forEach(card => {
    // 创建光晕层
    const glowLayer = document.createElement('div');
    glowLayer.className = 'node-card-glow';
    card.appendChild(glowLayer);
    
    // 包裹内容为 3D 内容层
    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'node-card-content';
    
    // 移动所有子元素到内容层（除了光晕层）
    const children = Array.from(card.children).filter(child => !child.classList.contains('node-card-glow'));
    children.forEach(child => contentWrapper.appendChild(child));
    
    card.appendChild(contentWrapper);
    
    // 鼠标移动时的 3D 倾斜效果
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      // 计算中心点
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      
      // 计算倾斜角度（最大 15 度）
      const rotateX = ((y - centerY) / centerY) * -15;
      const rotateY = ((x - centerX) / centerX) * 15;
      
      // 应用 3D 变换
      card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.02)`;
      
      // 更新光晕位置
      card.style.setProperty('--mouse-x', `${(x / rect.width) * 100}%`);
      card.style.setProperty('--mouse-y', `${(y / rect.height) * 100}%`);
    });
    
    // 鼠标离开时恢复
    card.addEventListener('mouseleave', () => {
      card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale(1)';
    });
  });
  
  console.log('🎴 3D CARD EFFECT INITIALIZED');
}

// ===== 配置管理功能 =====

// 配置管理相关 DOM 元素
let settingsModal = null;
let settingsMessage = null;
let currentTab = 'general';

/**
 * 打开配置管理弹窗
 */
async function openSettingsModal() {
  settingsModal = document.getElementById('settingsModal');
  settingsMessage = document.getElementById('settingsMessage');
  
  if (!settingsModal) return;
  
  // 加载当前配置
  await loadSettings();
  
  // 显示弹窗
  settingsModal.classList.add('active');
  
  console.log('⚙️ SETTINGS MODAL OPENED');
}

/**
 * 关闭配置管理弹窗
 */
function closeSettingsModal() {
  if (settingsModal) {
    settingsModal.classList.remove('active');
    hideSettingsMessage();
  }
}

/**
 * 加载当前配置设置
 */
async function loadSettings() {
  try {
    const response = await fetch('/api/settings');
    const result = await response.json();
    
    if (result.success) {
      const settings = result.data;
      
      // 填充基础设置表单
      document.getElementById('teamNameInput').value = settings.teamName || '';
      document.getElementById('checkIntervalInput').value = settings.checkInterval || 30000;
      document.getElementById('timeoutInput').value = settings.timeout || 5000;
      document.getElementById('workspaceInput').value = settings.workspace || '';
      
      // 填充节点表格
      renderNodesTable(settings.members || []);
      
      console.log('📋 SETTINGS LOADED');
    }
  } catch (err) {
    console.error('⚠️ SETTINGS LOAD FAILED:', err);
    showSettingsMessage('加载配置失败：' + err.message, 'error');
  }
}

/**
 * 渲染节点表格
 * @param {Array} members - 成员列表
 */
function renderNodesTable(members) {
  const tbody = document.getElementById('nodesTableBody');
  if (!tbody) return;
  
  if (members.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="no-data">暂无自定义节点</td></tr>';
    return;
  }
  
  tbody.innerHTML = members.map(member => `
    <tr data-node-id="${member.id}">
      <td><code>${member.id}</code></td>
      <td>${member.emoji || '🤖'} ${member.name}</td>
      <td><span class="badge badge-info">${member.role}</span></td>
      <td><small>${member.workspace || '-'}</small></td>
      <td>
        <button class="btn-small btn-edit" onclick="editNode('${member.id}')">✏️</button>
        <button class="btn-small btn-delete" onclick="deleteNode('${member.id}')">🗑️</button>
      </td>
    </tr>
  `).join('');
}

/**
 * 切换标签页
 * @param {string} tabId - 标签页 ID
 */
function switchTab(tabId) {
  currentTab = tabId;
  
  // 更新按钮状态
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
  });
  
  // 更新内容显示
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.toggle('active', content.id === `tab-${tabId}`);
  });
  
  // 更新按钮显示
  const addNodeBtn = document.getElementById('addNodeBtn');
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');
  
  if (tabId === 'add-node') {
    if (addNodeBtn) addNodeBtn.style.display = 'inline-flex';
    if (saveSettingsBtn) saveSettingsBtn.style.display = 'none';
  } else {
    if (addNodeBtn) addNodeBtn.style.display = 'none';
    if (saveSettingsBtn) saveSettingsBtn.style.display = 'inline-flex';
  }
  
  console.log('📑 TAB SWITCHED:', tabId);
}

/**
 * 保存设置
 */
async function saveSettings() {
  const teamName = document.getElementById('teamNameInput').value.trim();
  const checkInterval = parseInt(document.getElementById('checkIntervalInput').value);
  const timeout = parseInt(document.getElementById('timeoutInput').value);
  const workspace = document.getElementById('workspaceInput').value.trim();
  
  // 验证
  if (!teamName) {
    showSettingsMessage('团队名称不能为空', 'error');
    return;
  }
  
  if (checkInterval < 5000 || checkInterval > 300000) {
    showSettingsMessage('检查间隔必须在 5000-300000ms 之间', 'error');
    return;
  }
  
  if (timeout < 1000 || timeout > 30000) {
    showSettingsMessage('超时时间必须在 1000-30000ms 之间', 'error');
    return;
  }
  
  try {
    const response = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        teamName,
        checkInterval,
        timeout,
        workspace
      })
    });
    
    const result = await response.json();
    
    if (result.success) {
      showSettingsMessage('配置已保存！', 'success');
      setTimeout(() => {
        closeSettingsModal();
        // 重新加载配置
        loadConfig();
      }, 1500);
    } else {
      showSettingsMessage('保存失败：' + result.error, 'error');
      triggerErrorBorderFlash(document.querySelector('.save-settings-btn'));
    }
  } catch (err) {
    console.error('⚠️ SETTINGS SAVE FAILED:', err);
    showSettingsMessage('保存配置失败：' + err.message, 'error');
    triggerErrorBorderFlash(document.querySelector('.save-settings-btn'));
    showErrorParticles(window.innerWidth / 2, window.innerHeight / 2, 25);
  }
}

/**
 * 添加新节点
 */
async function addNewNode() {
  const id = document.getElementById('newNodeId').value.trim();
  const name = document.getElementById('newNodeName').value.trim();
  const role = document.getElementById('newNodeRole').value.trim();
  const emoji = document.getElementById('newNodeEmoji').value.trim() || '🤖';
  const description = document.getElementById('newNodeDescription').value.trim();
  const workspace = document.getElementById('newNodeWorkspace').value.trim();
  
  // 验证必填字段
  if (!id || !name) {
    showSettingsMessage('节点 ID 和名称为必填项', 'error');
    return;
  }
  
  // 验证 ID 格式
  if (!/^[a-z0-9\-_]+$/.test(id)) {
    showSettingsMessage('节点 ID 只能包含小写字母、数字、横线和下划线', 'error');
    return;
  }
  
  try {
    const response = await fetch('/api/nodes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id,
        name,
        role: role || 'Agent',
        emoji,
        description,
        workspace: workspace || 'workspace-team-a'
      })
    });
    
    const result = await response.json();
    
    if (result.success) {
      showSettingsMessage('节点已添加！', 'success');
      
      // 清空表单
      document.getElementById('newNodeId').value = '';
      document.getElementById('newNodeName').value = '';
      document.getElementById('newNodeRole').value = '';
      document.getElementById('newNodeEmoji').value = '🤖';
      document.getElementById('newNodeDescription').value = '';
      document.getElementById('newNodeWorkspace').value = '';
      
      // 刷新节点表格
      await loadSettings();
      
      // 切换到节点管理标签页
      setTimeout(() => switchTab('nodes'), 1500);
    } else {
      showSettingsMessage('添加失败：' + result.error, 'error');
    }
  } catch (err) {
    console.error('⚠️ ADD NODE FAILED:', err);
    showSettingsMessage('添加节点失败：' + err.message, 'error');
  }
}

/**
 * 编辑节点（全局函数，供 HTML 调用）
 * @param {string} nodeId - 节点 ID
 */
window.editNode = async function(nodeId) {
  // 切换到添加节点标签页并填充数据
  switchTab('add-node');
  
  // 这里可以进一步实现：从 API 获取节点详情并填充表单
  showSettingsMessage(`编辑节点：${nodeId}（功能开发中...）`, 'info');
};

/**
 * 删除节点（全局函数，供 HTML 调用）
 * @param {string} nodeId - 节点 ID
 */
window.deleteNode = async function(nodeId) {
  if (!confirm(`确定要删除节点 "${nodeId}" 吗？此操作不可恢复！`)) {
    return;
  }
  
  try {
    const response = await fetch(`/api/nodes/${nodeId}`, {
      method: 'DELETE'
    });
    
    const result = await response.json();
    
    if (result.success) {
      showSettingsMessage('节点已删除', 'success');
      // 刷新节点表格
      await loadSettings();
    } else {
      showSettingsMessage('删除失败：' + result.error, 'error');
    }
  } catch (err) {
    console.error('⚠️ DELETE NODE FAILED:', err);
    showSettingsMessage('删除节点失败：' + err.message, 'error');
  }
};

/**
 * 显示配置管理消息
 * @param {string} message - 消息内容
 * @param {string} type - 消息类型 (success, error, info)
 */
function showSettingsMessage(message, type = 'info') {
  if (!settingsMessage) return;
  
  settingsMessage.textContent = message;
  settingsMessage.className = `message-box message-${type}`;
  settingsMessage.style.display = 'block';
  
  // 自动隐藏（成功消息 2 秒后，错误消息 5 秒后）
  const autoHideTime = type === 'error' ? 5000 : 2000;
  setTimeout(() => {
    hideSettingsMessage();
  }, autoHideTime);
}

/**
 * 隐藏配置管理消息
 */
function hideSettingsMessage() {
  if (settingsMessage) {
    settingsMessage.style.display = 'none';
  }
}

/**
 * 导出节点状态报告为 CSV 文件
 * 调用后端 API 生成并下载 CSV 文件
 */
async function exportToCSV() {
  const exportBtn = document.getElementById('exportBtn');
  if (!exportBtn) return;
  
  try {
    // 显示加载状态
    const originalText = exportBtn.innerHTML;
    exportBtn.innerHTML = '<span class="btn-icon">⏳</span> 导出中...';
    exportBtn.disabled = true;
    
    // 调用导出 API
    const response = await fetch('/api/export/csv');
    
    if (!response.ok) {
      throw new Error('导出失败：' + response.statusText);
    }
    
    // 获取文件名（从 Content-Disposition 头）
    const contentDisposition = response.headers.get('Content-Disposition');
    let filename = 'node-monitor-report.csv';
    if (contentDisposition) {
      const match = contentDisposition.match(/filename="?(.+)"?$/i);
      if (match && match[1]) {
        filename = match[1];
      }
    }
    
    // 获取 CSV 内容并创建下载
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    
    // 恢复按钮状态
    exportBtn.innerHTML = originalText;
    exportBtn.disabled = false;
    
    // 显示成功通知
    showNotification('REPORT EXPORTED SUCCESSFULLY 📊');
    playSound('success');
    
    console.log('✅ CSV 报告已导出:', filename);
  } catch (err) {
    console.error('❌ 导出 CSV 失败:', err);
    
    // 恢复按钮状态
    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) {
      exportBtn.innerHTML = '<span class="btn-icon">📊</span> 导出报告';
      exportBtn.disabled = false;
    }
    
    // 显示错误通知
    showNotification('EXPORT FAILED: ' + err.message, 'error');
    playSound('error');
  }
}

// ===== 历史趋势功能 =====

let historyChartInstance = null;

/**
 * 打开历史趋势弹窗
 */
async function openHistoryModal() {
  const historyModal = document.getElementById('historyModal');
  if (!historyModal) return;
  
  historyModal.classList.add('active');
  
  // 加载历史数据
  await loadHistoryStats(parseInt(document.getElementById('historyDaysSelect')?.value || 7));
  await loadHistoryRecords();
}

/**
 * 关闭历史弹窗
 */
function closeHistoryModalFunc() {
  const historyModal = document.getElementById('historyModal');
  if (historyModal) {
    historyModal.classList.remove('active');
  }
}

/**
 * 加载历史统计数据
 */
async function loadHistoryStats(days = 7) {
  const summaryEl = document.getElementById('historySummary');
  if (!summaryEl) return;
  
  try {
    const response = await fetch(`/api/history/stats?days=${days}`);
    const result = await response.json();
    
    if (!result.success) {
      summaryEl.innerHTML = '<p class="error">加载失败</p>';
      return;
    }
    
    const data = result.data;
    const totalChecks = data.totalRecords || 0;
    
    // 计算整体统计
    let totalOnline = 0;
    let totalOffline = 0;
    let highUptimeNodes = 0;
    
    data.nodes.forEach(node => {
      totalOnline += node.onlineCount;
      totalOffline += node.offlineCount;
      if (node.uptime >= 95) highUptimeNodes++;
    });
    
    const overallUptime = (totalOnline + totalOffline) > 0 
      ? Math.round((totalOnline / (totalOnline + totalOffline)) * 100 * 100) / 100
      : 0;
    
    // 生成统计卡片
    summaryEl.innerHTML = `
      <div class="history-stat-card">
        <span class="history-stat-value">${totalChecks}</span>
        <span class="history-stat-label">总检查次数</span>
      </div>
      <div class="history-stat-card">
        <span class="history-stat-value">${data.nodes.length}</span>
        <span class="history-stat-label">监控节点</span>
      </div>
      <div class="history-stat-card">
        <span class="history-stat-value" style="color: ${overallUptime >= 95 ? '#00ff88' : overallUptime >= 80 ? '#ffa500' : '#ff4757'}">${overallUptime}%</span>
        <span class="history-stat-label">平均在线率</span>
      </div>
      <div class="history-stat-card">
        <span class="history-stat-value">${highUptimeNodes}</span>
        <span class="history-stat-label">高可用节点 (>95%)</span>
      </div>
    `;
    
    // 绘制趋势图表
    drawHistoryChart(data.nodes);
    
  } catch (err) {
    console.error('❌ 加载历史统计失败:', err);
    summaryEl.innerHTML = '<p class="error">加载失败：' + err.message + '</p>';
  }
}

/**
 * 绘制历史趋势图表
 */
function drawHistoryChart(nodes) {
  const canvas = document.getElementById('historyChart');
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  
  // 销毁旧图表
  if (historyChartInstance) {
    historyChartInstance.destroy();
  }
  
  // 设置画布大小
  canvas.width = canvas.offsetWidth;
  canvas.height = 300;
  
  // 准备数据
  const labels = nodes.map(n => n.name || n.id);
  const uptimeData = nodes.map(n => n.uptime);
  
  // 创建渐变背景
  const gradient = ctx.createLinearGradient(0, 0, 0, 300);
  gradient.addColorStop(0, 'rgba(0, 245, 255, 0.3)');
  gradient.addColorStop(1, 'rgba(0, 245, 255, 0.05)');
  
  // 绘制图表
  const chartData = {
    labels: labels,
    datasets: [{
      label: '在线率 (%)',
      data: uptimeData,
      borderColor: '#00f5ff',
      backgroundColor: gradient,
      borderWidth: 2,
      fill: true,
      tension: 0.4,
      pointBackgroundColor: '#00f5ff',
      pointBorderColor: '#fff',
      pointBorderWidth: 2,
      pointRadius: 4,
      pointHoverRadius: 6
    }]
  };
  
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleColor: '#00f5ff',
        bodyColor: '#fff',
        borderColor: 'rgba(0, 245, 255, 0.3)',
        borderWidth: 1,
        padding: 12,
        displayColors: false,
        callbacks: {
          label: function(context) {
            return `在线率：${context.parsed.y}%`;
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        max: 100,
        grid: {
          color: 'rgba(255, 255, 255, 0.1)'
        },
        ticks: {
          color: '#8b9bb4',
          callback: function(value) {
            return value + '%';
          }
        }
      },
      x: {
        grid: {
          color: 'rgba(255, 255, 255, 0.05)'
        },
        ticks: {
          color: '#8b9bb4',
          maxRotation: 45,
          minRotation: 45
        }
      }
    }
  };
  
  // 使用 Chart.js 绘制（如果已加载）
  if (typeof Chart !== 'undefined') {
    historyChartInstance = new Chart(ctx, {
      type: 'line',
      data: chartData,
      options: chartOptions
    });
  } else {
    // 简单绘制备用图表
    drawSimpleChart(ctx, canvas.width, canvas.height, labels, uptimeData);
  }
}

/**
 * 简单图表绘制（无 Chart.js 时备用）
 */
function drawSimpleChart(ctx, width, height, labels, data) {
  const padding = 40;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;
  
  // 清空画布
  ctx.clearRect(0, 0, width, height);
  
  // 绘制背景
  ctx.fillStyle = 'rgba(0, 245, 255, 0.05)';
  ctx.fillRect(padding, padding, chartWidth, chartHeight);
  
  // 绘制网格线
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 5; i++) {
    const y = padding + (chartHeight / 5) * i;
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(width - padding, y);
    ctx.stroke();
  }
  
  // 绘制数据线
  if (data.length > 0) {
    const pointSpacing = chartWidth / (data.length - 1 || 1);
    
    ctx.strokeStyle = '#00f5ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    data.forEach((value, index) => {
      const x = padding + index * pointSpacing;
      const y = padding + chartHeight - (value / 100) * chartHeight;
      
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    
    ctx.stroke();
    
    // 绘制数据点
    data.forEach((value, index) => {
      const x = padding + index * pointSpacing;
      const y = padding + chartHeight - (value / 100) * chartHeight;
      
      ctx.fillStyle = '#00f5ff';
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
    });
  }
}

/**
 * 加载历史记录表格
 */
async function loadHistoryRecords() {
  const tbody = document.getElementById('historyTableBody');
  if (!tbody) return;
  
  try {
    const response = await fetch('/api/history?limit=20');
    const result = await response.json();
    
    if (!result.success || !result.data.records || result.data.records.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-secondary);">暂无历史记录</td></tr>';
      return;
    }
    
    const records = result.data.records;
    
    // 生成表格行
    tbody.innerHTML = records.map(record => {
      const time = new Date(record.timestamp).toLocaleString('zh-CN');
      const nodesHtml = record.nodes.map(node => {
        const statusClass = node.online ? 'online' : 'offline';
        const statusText = node.online ? '🟢 在线' : '🔴 离线';
        const responseTime = node.responseTime !== null ? `${Math.round(node.responseTime)}ms` : '-';
        
        return `
          <tr>
            <td>${time}</td>
            <td>${node.name || node.id}</td>
            <td><span class="history-status ${statusClass}">${statusText}</span></td>
            <td>${responseTime}</td>
            <td class="history-uptime ${record.summary.onlineCount / record.summary.totalNodes >= 0.95 ? 'high' : record.summary.onlineCount / record.summary.totalNodes >= 0.8 ? 'medium' : 'low'}">
              ${Math.round(record.summary.onlineCount / record.summary.totalNodes * 100)}%
            </td>
          </tr>
        `;
      }).join('');
      
      return nodesHtml;
    }).join('');
    
  } catch (err) {
    console.error('❌ 加载历史记录失败:', err);
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #ff4757;">加载失败</td></tr>';
  }
}

// ===== 实时日志流功能 =====

// 日志轮询定时器
let logsPollingInterval = null;

/**
 * 打开日志弹窗
 */
async function openLogsModal() {
  const modal = document.getElementById('logsModal');
  if (!modal) return;
  
  modal.style.display = 'flex';
  
  // 加载日志
  await loadLogs();
  
  // 启动轮询（每 3 秒刷新一次）
  if (logsPollingInterval) {
    clearInterval(logsPollingInterval);
  }
  logsPollingInterval = setInterval(loadLogs, 3000);
}

/**
 * 关闭日志弹窗
 */
function closeLogsModalFunc() {
  const modal = document.getElementById('logsModal');
  if (modal) {
    modal.style.display = 'none';
  }
  
  // 停止轮询
  if (logsPollingInterval) {
    clearInterval(logsPollingInterval);
    logsPollingInterval = null;
  }
}

/**
 * 加载日志
 */
async function loadLogs() {
  try {
    const levelFilter = document.getElementById('logLevelFilter');
    const sourceFilter = document.getElementById('logSourceFilter');
    const logsContainer = document.getElementById('logsContainer');
    const logTotalCount = document.getElementById('logTotalCount');
    const logBufferSize = document.getElementById('logBufferSize');
    
    if (!logsContainer) return;
    
    // 构建查询参数
    let url = '/api/logs?limit=100';
    if (levelFilter && levelFilter.value !== 'all') {
      url += `&level=${levelFilter.value}`;
    }
    if (sourceFilter && sourceFilter.value !== 'all') {
      url += `&source=${sourceFilter.value}`;
    }
    
    const response = await fetch(url);
    const result = await response.json();
    
    if (result.success) {
      const logs = result.data.logs || [];
      
      // 更新统计
      if (logTotalCount) logTotalCount.textContent = result.data.total;
      if (logBufferSize) logBufferSize.textContent = result.data.bufferSize;
      
      // 渲染日志
      if (logs.length === 0) {
        logsContainer.innerHTML = `
          <div style="text-align: center; padding: 40px; color: var(--text-muted);">
            <p style="font-size: 2rem; margin-bottom: 10px;">📭</p>
            <p>暂无日志</p>
          </div>
        `;
      } else {
        logsContainer.innerHTML = logs.map(log => {
          const levelClass = `log-${log.level.toLowerCase()}`;
          const time = new Date(log.timestamp).toLocaleTimeString('zh-CN');
          
          return `
            <div class="log-entry ${levelClass}">
              <div class="log-header">
                <span class="log-timestamp">${time}</span>
                <div>
                  <span class="log-level log-level-${log.level.toLowerCase()}">${log.level}</span>
                  <span class="log-source">${log.source}</span>
                </div>
              </div>
              <div class="log-message">${escapeHtml(log.message)}</div>
            </div>
          `;
        }).join('');
        
        // 自动滚动到底部
        const autoScroll = document.getElementById('autoScrollLogs');
        if (autoScroll && autoScroll.checked) {
          scrollToBottom();
        }
      }
    }
  } catch (err) {
    console.error('❌ 加载日志失败:', err);
    const logsContainer = document.getElementById('logsContainer');
    if (logsContainer) {
      logsContainer.innerHTML = `
        <div style="text-align: center; padding: 40px; color: var(--danger);">
          <p>加载日志失败</p>
          <p style="font-size: 0.85rem; margin-top: 10px;">${err.message}</p>
        </div>
      `;
    }
  }
}

/**
 * 清除日志
 */
async function clearLogs() {
  if (!confirm('确定要清除日志缓冲区吗？')) return;
  
  try {
    const response = await fetch('/api/logs/clear', { method: 'POST' });
    const result = await response.json();
    
    if (result.success) {
      showNotification('日志已清除', 'success');
      await loadLogs();
    } else {
      showNotification('清除失败：' + result.error, 'error');
    }
  } catch (err) {
    console.error('❌ 清除日志失败:', err);
    showNotification('清除失败：' + err.message, 'error');
  }
}

/**
 * 滚动到底部
 */
function scrollToBottom() {
  const logsContainer = document.getElementById('logsContainer');
  if (logsContainer) {
    logsContainer.scrollTop = logsContainer.scrollHeight;
  }
}

// ===== 告警管理功能 =====

/**
 * 打开告警管理弹窗
 */
async function openAlertsModal() {
  const modal = document.getElementById('alertsModal');
  if (!modal) return;
  
  modal.style.display = 'flex';
  
  // 加载告警配置
  await loadAlertsConfig();
  
  // 加载告警历史
  await loadAlertsHistory();
}

/**
 * 关闭告警管理弹窗
 */
function closeAlertsModalFunc() {
  const modal = document.getElementById('alertsModal');
  if (modal) {
    modal.style.display = 'none';
  }
}

/**
 * 切换告警标签页
 */
function switchAlertsTab(tab) {
  // 移除所有标签页的 active 类
  document.querySelectorAll('#alertsModal .tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  document.querySelectorAll('#alertsModal .tab-content').forEach(content => {
    content.classList.remove('active');
  });
  
  // 添加当前标签页的 active 类
  document.querySelector(`#alertsModal [data-tab="alerts-${tab}"]`)?.classList.add('active');
  document.querySelector(`#alertsModal #tab-alerts-${tab}`)?.classList.add('active');
  
  // 如果切换到历史标签页，重新加载历史
  if (tab === 'history') {
    loadAlertsHistory();
  }
}

/**
 * 加载告警配置
 */
async function loadAlertsConfig() {
  try {
    const response = await fetch('/api/alerts/config');
    const result = await response.json();
    
    if (result.success) {
      const config = result.data;
      
      // 填充表单
      document.getElementById('alertsEnabled').checked = config.enabled || false;
      document.getElementById('feishuWebhookInput').value = config.feishuWebhook || '';
      document.getElementById('notifyOnOffline').checked = config.notifyOnOffline !== false;
      document.getElementById('notifyOnOnline').checked = config.notifyOnOnline || false;
      document.getElementById('cooldownMinutesInput').value = config.cooldownMinutes || 5;
    }
  } catch (err) {
    console.error('❌ 加载告警配置失败:', err);
    showAlertsMessage('加载配置失败', 'error');
  }
}

/**
 * 保存告警配置
 */
async function saveAlertsConfig() {
  const config = {
    enabled: document.getElementById('alertsEnabled').checked,
    feishuWebhook: document.getElementById('feishuWebhookInput').value.trim(),
    notifyOnOffline: document.getElementById('notifyOnOffline').checked,
    notifyOnOnline: document.getElementById('notifyOnOnline').checked,
    cooldownMinutes: parseInt(document.getElementById('cooldownMinutesInput').value) || 5
  };
  
  // 验证
  if (config.enabled && !config.feishuWebhook) {
    showAlertsMessage('启用告警需要配置飞书 Webhook', 'error');
    return;
  }
  
  try {
    const response = await fetch('/api/alerts/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });
    const result = await response.json();
    
    if (result.success) {
      showAlertsMessage('告警配置已保存', 'success');
      // 3 秒后自动关闭弹窗
      setTimeout(() => closeAlertsModalFunc(), 2000);
    } else {
      showAlertsMessage(result.error || '保存失败', 'error');
    }
  } catch (err) {
    console.error('❌ 保存告警配置失败:', err);
    showAlertsMessage('保存失败：' + err.message, 'error');
  }
}

/**
 * 测试告警
 */
async function testAlert() {
  const configEnabled = document.getElementById('alertsEnabled').checked;
  
  if (!configEnabled) {
    showAlertsMessage('请先启用告警系统', 'warning');
    return;
  }
  
  const btn = document.getElementById('testAlertBtn');
  const originalText = btn.innerHTML;
  btn.innerHTML = '<span class="btn-icon">⏳</span> 发送中...';
  btn.disabled = true;
  
  try {
    const response = await fetch('/api/alerts/test', { method: 'POST' });
    const result = await response.json();
    
    if (result.success) {
      showAlertsMessage('测试告警已发送，请检查飞书', 'success');
    } else {
      showAlertsMessage(result.error || '发送失败', 'error');
    }
  } catch (err) {
    console.error('❌ 测试告警失败:', err);
    showAlertsMessage('发送失败：' + err.message, 'error');
  } finally {
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
}

/**
 * 加载告警历史
 */
async function loadAlertsHistory() {
  const tbody = document.getElementById('alertsTableBody');
  if (!tbody) return;
  
  const filter = document.getElementById('alertHistoryFilter')?.value || 'all';
  
  try {
    let url = '/api/alerts/history?limit=50';
    if (filter !== 'all') {
      url += `&type=${filter}`;
    }
    
    const response = await fetch(url);
    const result = await response.json();
    
    if (!result.success || !result.data.alerts || result.data.alerts.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-secondary);">暂无告警记录</td></tr>';
      return;
    }
    
    const alerts = result.data.alerts;
    
    tbody.innerHTML = alerts.map(alert => {
      const time = new Date(alert.timestamp).toLocaleString('zh-CN');
      const typeClass = `alert-type-${alert.type}`;
      const typeText = alert.alertType || alert.type;
      const severityClass = `alert-severity-${alert.severity}`;
      const severityText = alert.severity === 'high' ? '高' : '低';
      
      return `
        <tr>
          <td>${time}</td>
          <td>${alert.nodeName || alert.nodeId}</td>
          <td><span class="alert-type-badge ${typeClass}">${typeText}</span></td>
          <td><span class="alert-severity-badge ${severityClass}">${severityText}</span></td>
          <td class="alert-message" title="${alert.message}">${alert.message}</td>
        </tr>
      `;
    }).join('');
    
  } catch (err) {
    console.error('❌ 加载告警历史失败:', err);
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #ff4757;">加载失败</td></tr>';
  }
}

/**
 * 清除告警历史
 */
async function clearAlertsHistory() {
  if (!confirm('确定要清除所有告警历史记录吗？此操作不可恢复。')) {
    return;
  }
  
  try {
    const response = await fetch('/api/alerts/history/clear', { method: 'POST' });
    const result = await response.json();
    
    if (result.success) {
      showAlertsHistoryMessage('告警历史已清除', 'success');
      loadAlertsHistory();
    } else {
      showAlertsHistoryMessage(result.error || '清除失败', 'error');
    }
  } catch (err) {
    console.error('❌ 清除告警历史失败:', err);
    showAlertsHistoryMessage('清除失败：' + err.message, 'error');
  }
}

/**
 * 显示告警配置消息
 */
function showAlertsMessage(message, type = 'info') {
  const messageBox = document.getElementById('alertsConfigMessage');
  if (!messageBox) return;
  
  messageBox.textContent = message;
  messageBox.className = `message-box message-${type}`;
  messageBox.style.display = 'block';
  
  setTimeout(() => {
    messageBox.style.display = 'none';
  }, 3000);
}

/**
 * 显示告警历史消息
 */
function showAlertsHistoryMessage(message, type = 'info') {
  const messageBox = document.getElementById('alertsHistoryMessage');
  if (!messageBox) return;
  
  messageBox.textContent = message;
  messageBox.className = `message-box message-${type}`;
  messageBox.style.display = 'block';
  
  setTimeout(() => {
    messageBox.style.display = 'none';
  }, 3000);
}

// ===== 快速操作功能 =====

/**
 * 显示快速操作消息
 */
function showQuickActionsMessage(message, type = 'info') {
  const messageBox = document.getElementById('quickActionsMessage');
  if (!messageBox) return;
  
  messageBox.textContent = message;
  messageBox.className = `message-box message-${type}`;
  messageBox.style.display = 'block';
  
  setTimeout(() => {
    messageBox.style.display = 'none';
  }, 4000);
}

/**
 * 显示操作确认对话框
 */
function showActionConfirm(action, title, message, onConfirm) {
  const overlay = document.createElement('div');
  overlay.className = 'action-confirm-overlay';
  overlay.innerHTML = `
    <div class="action-confirm-dialog">
      <h3>${title}</h3>
      <p>${message}</p>
      <div class="action-confirm-buttons">
        <button class="btn btn-secondary" id="confirmCancelBtn">
          <span class="btn-icon">✕</span>
          取消
        </button>
        <button class="btn btn-danger" id="confirmOkBtn">
          <span class="btn-icon">✓</span>
          确认
        </button>
      </div>
    </div>
  `;
  
  document.body.appendChild(overlay);
  
  // 播放确认音效
  playSound('error');
  
  // 取消按钮
  document.getElementById('confirmCancelBtn').addEventListener('click', () => {
    overlay.remove();
  });
  
  // 确认按钮
  document.getElementById('confirmOkBtn').addEventListener('click', () => {
    overlay.remove();
    onConfirm();
  });
  
  // ESC 键取消
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      overlay.remove();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);
}

/**
 * 重启服务
 */
async function restartService() {
  showActionConfirm(
    'restart',
    '🔄 确认重启服务？',
    '服务将中断约 3 秒钟，所有连接将会断开。确定要继续吗？',
    async () => {
      try {
        showQuickActionsMessage('正在发送重启指令...', 'info');
        
        const response = await fetch('/api/actions/restart', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        const result = await response.json();
        
        if (result.success) {
          showQuickActionsMessage('✅ 重启指令已发送，服务将在 3 秒后重启', 'success');
          playSound('success');
          
          // 关闭弹窗
          closeQuickActionsModal();
          
          // 显示重启倒计时
          let countdown = 3;
          const countdownInterval = setInterval(() => {
            countdown--;
            if (countdown > 0) {
              showQuickActionsMessage(`⏳ 服务重启中... ${countdown}秒`, 'info');
            } else {
              clearInterval(countdownInterval);
            }
          }, 1000);
          
          // 5 秒后尝试重新连接
          setTimeout(() => {
            showQuickActionsMessage('🔄 尝试重新连接...', 'info');
            // 刷新页面
            window.location.reload();
          }, 5000);
        } else {
          showQuickActionsMessage(result.error || '重启失败', 'error');
          playSound('error');
        }
      } catch (err) {
        console.error('❌ 重启服务失败:', err);
        showQuickActionsMessage('重启失败：' + err.message, 'error');
        playSound('error');
      }
    }
  );
}

/**
 * 清理缓存
 */
async function clearCache() {
  showActionConfirm(
    'clear_cache',
    '🗑️ 确认清理缓存？',
    '将清除节点状态缓存、系统指标缓存和日志缓冲区。此操作不会影响配置数据。',
    async () => {
      try {
        showQuickActionsMessage('正在清理缓存...', 'info');
        
        const response = await fetch('/api/actions/clear-cache', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        const result = await response.json();
        
        if (result.success) {
          const items = result.clearedItems ? result.clearedItems.join(', ') : '缓存';
          showQuickActionsMessage(`✅ 已清理：${items}`, 'success');
          playSound('success');
          
          // 关闭弹窗
          closeQuickActionsModal();
          
          // 刷新状态显示
          setTimeout(() => {
            fetchNodes();
            fetchSystemMetrics();
          }, 500);
        } else {
          showQuickActionsMessage(result.error || '清理失败', 'error');
          playSound('error');
        }
      } catch (err) {
        console.error('❌ 清理缓存失败:', err);
        showQuickActionsMessage('清理失败：' + err.message, 'error');
        playSound('error');
      }
    }
  );
}

/**
 * 强制刷新所有节点
 */
async function refreshAllNodes() {
  showQuickActionsMessage('⏱️ 正在执行健康检查...', 'info');
  
  try {
    const response = await fetch('/api/health-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const result = await response.json();
    
    if (result.success) {
      showQuickActionsMessage(`✅ 健康检查完成：${result.onlineCount || 0}/${result.totalCount || 0} 节点在线`, 'success');
      playSound('success');
      
      // 关闭弹窗
      closeQuickActionsModal();
      
      // 刷新状态显示
      setTimeout(() => {
        fetchNodes();
        fetchSystemMetrics();
        updateStats();
      }, 500);
    } else {
      showQuickActionsMessage(result.error || '刷新失败', 'error');
      playSound('error');
    }
  } catch (err) {
    console.error('❌ 强制刷新失败:', err);
    showQuickActionsMessage('刷新失败：' + err.message, 'error');
    playSound('error');
  }
}

/**
 * 重置配置
 */
async function resetConfig() {
  showActionConfirm(
    'reset_config',
    '🔧 确认重置配置？',
    '⚠️ 警告：此操作将清除所有自定义设置（主题、刷新间隔、音效、收藏等），且不可恢复！\n\n确定要继续吗？',
    () => {
      try {
        // 清除 localStorage 中的配置
        const keysToRemove = [
          'nodeMonitor_theme',
          'nodeMonitor_refreshInterval',
          'nodeMonitor_soundEnabled',
          'nodeMonitor_favorites',
          'nodeMonitor_autoRefresh',
          'nodeMonitor_selectedGroup'
        ];
        
        keysToRemove.forEach(key => localStorage.removeItem(key));
        
        showQuickActionsMessage('✅ 配置已重置，页面将刷新', 'success');
        playSound('success');
        
        // 关闭弹窗
        closeQuickActionsModal();
        
        // 1 秒后刷新页面
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } catch (err) {
        console.error('❌ 重置配置失败:', err);
        showQuickActionsMessage('重置失败：' + err.message, 'error');
        playSound('error');
      }
    }
  );
}

/**
 * 关闭快速操作弹窗
 */
function closeQuickActionsModal() {
  const modal = document.getElementById('quickActionsModal');
  if (modal) {
    modal.classList.remove('modal-active');
    modal.style.display = 'none';
  }
}

/**
 * 初始化快速操作事件监听
 */
function initQuickActions() {
  // 快速操作按钮
  const quickActionsBtn = document.getElementById('quickActionsBtn');
  if (quickActionsBtn) {
    quickActionsBtn.addEventListener('click', () => {
      const modal = document.getElementById('quickActionsModal');
      if (modal) {
        modal.style.display = 'flex';
        setTimeout(() => modal.classList.add('modal-active'), 10);
        playSound('success');
      }
    });
  }
  
  // 关闭按钮
  const closeBtn = document.getElementById('closeQuickActionsModal');
  if (closeBtn) {
    closeBtn.addEventListener('click', closeQuickActionsModal);
  }
  
  // 点击弹窗外部关闭
  const modal = document.getElementById('quickActionsModal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeQuickActionsModal();
      }
    });
  }
  
  // 各个操作卡片
  const restartAction = document.getElementById('restartAction');
  if (restartAction) {
    restartAction.addEventListener('click', restartService);
  }
  
  const clearCacheAction = document.getElementById('clearCacheAction');
  if (clearCacheAction) {
    clearCacheAction.addEventListener('click', clearCache);
  }
  
  const refreshAllAction = document.getElementById('refreshAllAction');
  if (refreshAllAction) {
    refreshAllAction.addEventListener('click', refreshAllNodes);
  }
  
  const resetConfigAction = document.getElementById('resetConfigAction');
  if (resetConfigAction) {
    resetConfigAction.addEventListener('click', resetConfig);
  }
  
  // ESC 键关闭弹窗
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const modal = document.getElementById('quickActionsModal');
      if (modal && modal.style.display === 'flex') {
        closeQuickActionsModal();
      }
    }
  });
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', init);

// 请求通知权限
requestNotificationPermission();
