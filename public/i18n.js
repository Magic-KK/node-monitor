/**
 * 多语言支持配置文件
 * 支持中文（zh）和英文（en）
 */

const i18n = {
  zh: {
    // 标题和副标题
    title: 'J.A.R.V.I.S. 节点监控',
    subtitle: 'CYBERPUNK EDITION // 团队节点状态实时监控面板',
    
    // 统计卡片
    statTotal: '总节点',
    statOnline: '在线',
    statOffline: '离线',
    
    // 系统指标
    metricCPU: 'CPU 使用率',
    metricMemory: '内存使用率',
    metricUptime: '运行时间',
    metricLastUpdate: '最后更新',
    metricUnit: '%',
    
    // 控制栏
    filterGroup: '分组筛选',
    allGroups: '全部分组',
    filterFavorites: '⭐ 收藏',
    searchPlaceholder: '搜索节点...',
    clearSearch: '清除搜索',
    
    // 按钮
    btnRefresh: '刷新状态',
    btnHealthCheck: '健康检查',
    btnExport: '导出报告',
    btnHistory: '历史趋势',
    btnReports: '自动化报告',
    btnAlerts: '告警管理',
    btnLogs: '实时日志',
    btnSettings: '配置管理',
    btnQuickActions: '快速操作',
    
    // 开关和选项
    autoRefresh: '自动刷新',
    refreshInterval: '刷新间隔',
    theme: '主题',
    fontSize: '字体大小',
    language: '语言',
    
    // 主题选项
    themeCyberpunk: '🌃 赛博朋克',
    themeScifi: '🚀 科幻深空',
    themeMinimal: '✨ 极简现代',
    themeLight: '☀️ 明亮简洁',
    
    // 字体大小选项
    fontSizeSmall: '小',
    fontSizeStandard: '标准',
    fontSizeLarge: '大',
    fontSizeXLarge: '超大',
    
    // 刷新间隔选项
    interval10s: '10 秒',
    interval30s: '30 秒',
    interval1m: '1 分钟',
    interval5m: '5 分钟',
    interval10m: '10 分钟',
    
    // 节点状态
    statusOnline: '在线',
    statusOffline: '离线',
    statusUnknown: '未知',
    lastCheck: '最后检查',
    responseTime: '响应时间',
    ms: '毫秒',
    noDescription: '暂无描述',
    
    // 节点角色
    roleMain: '主脑',
    roleCoder: '编码专家',
    roleWriter: '写作专家',
    roleResearcher: '调研专家',
    roleCustom: '自定义',
    
    // 空状态
    noNodes: '暂无节点',
    noNodesFound: '未找到匹配的节点',
    noFavorites: '暂无收藏节点',
    noFavoritesHint: '点击节点卡片上的 ☆ 按钮收藏节点',
    
    // 加载动画
    loadingInit: '系统初始化中',
    loadingConfig: '加载配置',
    loadingNodes: '获取节点状态',
    loadingMetrics: '加载系统指标',
    loadingControls: '初始化控件',
    loadingComplete: '完成',
    
    // 通知消息
    notifySuccess: '成功',
    notifyError: '错误',
    notifyWarning: '警告',
    notifyInfo: '信息',
    
    notifyRefreshSuccess: '状态刷新成功',
    notifyRefreshError: '刷新失败，请检查网络连接',
    notifyHealthCheckStart: '开始健康检查...',
    notifyHealthCheckSuccess: '健康检查完成，{online} 个节点在线，{offline} 个节点离线',
    notifyHealthCheckError: '健康检查失败',
    notifyExportSuccess: '报告导出成功',
    notifyExportError: '导出失败',
    notifySettingsSaved: '设置已保存',
    notifySettingsError: '保存设置失败',
    notifyLanguageChanged: '语言已切换为 {lang}',
    notifyThemeChanged: '主题已切换为 {theme}',
    notifyFontSizeChanged: '字体大小已设置为 {size}',
    notifyRemovedFromFavorites: '已从收藏移除 ⭐',
    notifyAddedToFavorites: '已添加到收藏 ⭐',
    notifyThemeSwitched: '主题已切换为 {theme}',
    notifyScanComplete: '扫描完成：{online}/{total} 个节点在线',
    notifySearchCleared: '搜索已清除',
    notifyAutoRefreshEnabled: '自动刷新已启用',
    notifyAutoRefreshDisabled: '自动刷新已禁用',
    notifyRefreshInterval: '刷新间隔：{interval}',
    notifySoundEnabled: '音效已开启 🔊',
    notifySoundDisabled: '音效已关闭 🔇',
    notifyFilter: '筛选：{group}',
    notifyFavoritesOnly: '仅显示收藏 ({count} 个节点) ⭐',
    notifyShowAllNodes: '显示全部节点',
    notifyNoEndpoint: '无可用端点 URL',
    notifyPingSuccess: 'PING 成功：{time}ms',
    notifyPingFailed: 'PING 失败：{status}',
    notifyPingError: 'PING 失败：连接错误',
    notifyCopySuccess: '节点信息已复制',
    notifyExportSuccess: '报告导出成功 📊',
    notifyExportError: '导出失败：{error}',
    notifyLogsCleared: '日志已清除',
    notifyClearFailed: '清除失败：{error}',
    notifyDailyReportSuccess: '日报生成成功{feishu}',
    notifyWeeklyReportSuccess: '周报生成成功{feishu}',
    feishuSent: '，已发送飞书',
    
    // 确认对话框
    confirmTitle: '确认操作',
    confirmRestart: '确定要重启服务吗？服务将会短暂不可用。',
    confirmClearCache: '确定要清理缓存吗？这将清除所有临时数据。',
    confirmForceRefresh: '确定要强制刷新吗？这将重新加载所有节点数据。',
    confirmResetConfig: '确定要重置配置吗？这将恢复所有默认设置。',
    confirmYes: '确认',
    confirmNo: '取消',
    
    // 快速操作
    quickActionsTitle: '⚡ 快速操作',
    actionRestart: '重启服务',
    actionRestartDesc: '重启 Node Monitor 服务',
    actionClearCache: '清理缓存',
    actionClearCacheDesc: '清除节点状态和系统指标缓存',
    actionForceRefresh: '强制刷新',
    actionForceRefreshDesc: '重新加载所有节点数据',
    actionResetConfig: '重置配置',
    actionResetConfigDesc: '恢复所有默认设置',
    
    // 告警管理
    alertsTitle: '🚨 告警管理',
    alertsConfig: '告警配置',
    alertsHistory: '告警历史',
    webhookURL: '飞书 Webhook URL',
    webhookPlaceholder: '请输入飞书 Webhook 地址',
    notifyOffline: '节点离线时通知',
    notifyOnline: '节点上线时通知',
    cooldownTime: '冷却时间（分钟）',
    cooldownHint: '同一节点重复告警的间隔时间',
    testAlert: '测试告警',
    clearHistory: '清除历史',
    noAlertHistory: '暂无告警记录',
    alertTypeOffline: '离线告警',
    alertTypeOnline: '上线通知',
    alertTime: '告警时间',
    alertNode: '节点名称',
    alertMessage: '告警内容',
    
    // 日志查看
    logsTitle: '📋 实时日志',
    logsTab: '实时日志流',
    logsAggregate: '聚合统计',
    logsTrend: '趋势分析',
    logsSearch: '搜索',
    logsLevel: '级别',
    logsSource: '来源',
    logsTime: '时间',
    logsContent: '内容',
    logsAllLevels: '全部级别',
    logsAllSources: '全部来源',
    logsAutoScroll: '自动滚动',
    logsSearchPlaceholder: '搜索日志内容...',
    
    // 日志级别
    logLevelINFO: '信息',
    logLevelWARNING: '警告',
    logLevelERROR: '错误',
    logLevelSUCCESS: '成功',
    
    // 日志来源
    logSourceSystem: '系统',
    logSourceHealth: '健康检查',
    logSourceAPI: 'API',
    logSourceConsole: '控制台',
    
    // 历史记录
    historyTitle: '📈 历史趋势',
    historyDays: '天数',
    historyDay1: '1 天',
    historyDay3: '3 天',
    historyDay7: '7 天',
    historyDay14: '14 天',
    historyDay30: '30 天',
    historyAvgOnlineRate: '平均在线率',
    historyAvgResponseTime: '平均响应时间',
    historyTotalChecks: '总检查次数',
    historyClear: '清除历史',
    historyClearConfirm: '确定要清除所有历史记录吗？此操作不可恢复。',
    
    // 自动化报告
    reportsTitle: '📊 自动化报告',
    reportsDaily: '日报',
    reportsWeekly: '周报',
    reportsConfig: '配置',
    reportsGenerate: '生成报告',
    reportsSendNow: '立即发送',
    reportsSchedule: '生成时间',
    reportsDailyTime: '日报时间',
    reportsWeeklyTime: '周报时间',
    reportsEnabled: '启用',
    reportsDisabled: '禁用',
    reportsNoReports: '暂无报告',
    reportsViewDetail: '查看详情',
    reportsStats: '统计概览',
    reportsNodeDetails: '节点详情',
    reportsDailyTrend: '每日趋势',
    
    // 配置管理
    settingsTitle: '⚙️ 配置管理',
    settingsBasic: '基础设置',
    settingsNodes: '节点管理',
    settingsAddNode: '添加节点',
    settingsNodeName: '节点名称',
    settingsNodeURL: '节点地址',
    settingsNodeRole: '节点角色',
    settingsNodeGroup: '分组',
    settingsNodeDesc: '描述',
    settingsSave: '保存',
    settingsCancel: '取消',
    settingsDelete: '删除',
    settingsAdd: '添加',
    settingsRequired: '必填项',
    
    // WebSocket 状态
    wsConnected: '已连接',
    wsDisconnected: '未连接',
    
    // 错误消息
    errorLoadConfig: '加载配置失败',
    errorFetchStatus: '获取状态失败',
    errorSaveSettings: '保存设置失败',
    errorNetwork: '网络连接错误',
    errorUnknown: '未知错误',
    
    // 其他
    copySuccess: '复制成功',
    copyError: '复制失败',
    soundEnabled: '音效已开启',
    soundDisabled: '音效已关闭'
  },
  
  en: {
    // Title and subtitle
    title: 'J.A.R.V.I.S. Node Monitor',
    subtitle: 'CYBERPUNK EDITION // Real-time Team Node Status Dashboard',
    
    // Stat cards
    statTotal: 'Total Nodes',
    statOnline: 'Online',
    statOffline: 'Offline',
    
    // System metrics
    metricCPU: 'CPU Usage',
    metricMemory: 'Memory Usage',
    metricUptime: 'Uptime',
    metricLastUpdate: 'Last Update',
    metricUnit: '%',
    
    // Controls
    filterGroup: 'Group Filter',
    allGroups: 'All Groups',
    filterFavorites: '⭐ Favorites',
    searchPlaceholder: 'Search nodes...',
    clearSearch: 'Clear Search',
    
    // Buttons
    btnRefresh: 'Refresh Status',
    btnHealthCheck: 'Health Check',
    btnExport: 'Export Report',
    btnHistory: 'History Trend',
    btnReports: 'Auto Reports',
    btnAlerts: 'Alert Management',
    btnLogs: 'Live Logs',
    btnSettings: 'Settings',
    btnQuickActions: 'Quick Actions',
    
    // Toggles and options
    autoRefresh: 'Auto Refresh',
    refreshInterval: 'Refresh Interval',
    theme: 'Theme',
    fontSize: 'Font Size',
    language: 'Language',
    
    // Theme options
    themeCyberpunk: '🌃 Cyberpunk',
    themeScifi: '🚀 Sci-Fi Space',
    themeMinimal: '✨ Minimal Modern',
    themeLight: '☀️ Bright Clean',
    
    // Font size options
    fontSizeSmall: 'Small',
    fontSizeStandard: 'Standard',
    fontSizeLarge: 'Large',
    fontSizeXLarge: 'X-Large',
    
    // Refresh interval options
    interval10s: '10s',
    interval30s: '30s',
    interval1m: '1min',
    interval5m: '5min',
    interval10m: '10min',
    
    // Node status
    statusOnline: 'Online',
    statusOffline: 'Offline',
    statusUnknown: 'Unknown',
    lastCheck: 'Last Check',
    responseTime: 'Response Time',
    ms: 'ms',
    noDescription: 'No description',
    
    // Node roles
    roleMain: 'Main Brain',
    roleCoder: 'Coder Bot',
    roleWriter: 'Writer Bot',
    roleResearcher: 'Researcher Bot',
    roleCustom: 'Custom',
    
    // Empty states
    noNodes: 'No nodes',
    noNodesFound: 'No matching nodes found',
    noFavorites: 'No favorite nodes',
    noFavoritesHint: 'Click the ☆ button on node cards to favorite',
    
    // Loading animation
    loadingInit: 'System Initializing',
    loadingConfig: 'Loading Config',
    loadingNodes: 'Fetching Node Status',
    loadingMetrics: 'Loading System Metrics',
    loadingControls: 'Initializing Controls',
    loadingComplete: 'Complete',
    
    // Notifications
    notifySuccess: 'Success',
    notifyError: 'Error',
    notifyWarning: 'Warning',
    notifyInfo: 'Info',
    
    notifyRefreshSuccess: 'Status refreshed successfully',
    notifyRefreshError: 'Refresh failed, please check network connection',
    notifyHealthCheckStart: 'Starting health check...',
    notifyHealthCheckSuccess: 'Health check complete, {online} nodes online, {offline} nodes offline',
    notifyHealthCheckError: 'Health check failed',
    notifyExportSuccess: 'Report exported successfully',
    notifyExportError: 'Export failed',
    notifySettingsSaved: 'Settings saved',
    notifySettingsError: 'Failed to save settings',
    notifyLanguageChanged: 'Language switched to {lang}',
    notifyThemeChanged: 'Theme switched to {theme}',
    notifyFontSizeChanged: 'Font size set to {size}',
    
    // Confirm dialogs
    confirmTitle: 'Confirm Action',
    confirmRestart: 'Are you sure you want to restart the service? It will be temporarily unavailable.',
    confirmClearCache: 'Are you sure you want to clear cache? This will remove all temporary data.',
    confirmForceRefresh: 'Are you sure you want to force refresh? This will reload all node data.',
    confirmResetConfig: 'Are you sure you want to reset config? This will restore all default settings.',
    confirmYes: 'Confirm',
    confirmNo: 'Cancel',
    
    // Quick actions
    quickActionsTitle: '⚡ Quick Actions',
    actionRestart: 'Restart Service',
    actionRestartDesc: 'Restart Node Monitor service',
    actionClearCache: 'Clear Cache',
    actionClearCacheDesc: 'Clear node status and system metrics cache',
    actionForceRefresh: 'Force Refresh',
    actionForceRefreshDesc: 'Reload all node data',
    actionResetConfig: 'Reset Config',
    actionResetConfigDesc: 'Restore all default settings',
    
    // Alert management
    alertsTitle: '🚨 Alert Management',
    alertsConfig: 'Alert Config',
    alertsHistory: 'Alert History',
    webhookURL: 'Feishu Webhook URL',
    webhookPlaceholder: 'Enter Feishu Webhook URL',
    notifyOffline: 'Notify on node offline',
    notifyOnline: 'Notify on node online',
    cooldownTime: 'Cooldown Time (minutes)',
    cooldownHint: 'Interval for repeated alerts on same node',
    testAlert: 'Test Alert',
    clearHistory: 'Clear History',
    noAlertHistory: 'No alert history',
    alertTypeOffline: 'Offline Alert',
    alertTypeOnline: 'Online Notification',
    alertTime: 'Alert Time',
    alertNode: 'Node Name',
    alertMessage: 'Alert Message',
    
    // Logs viewer
    logsTitle: '📋 Live Logs',
    logsTab: 'Live Stream',
    logsAggregate: 'Aggregate Stats',
    logsTrend: 'Trend Analysis',
    logsSearch: 'Search',
    logsLevel: 'Level',
    logsSource: 'Source',
    logsTime: 'Time',
    logsContent: 'Content',
    logsAllLevels: 'All Levels',
    logsAllSources: 'All Sources',
    logsAutoScroll: 'Auto Scroll',
    logsSearchPlaceholder: 'Search log content...',
    
    // Log levels
    logLevelINFO: 'Info',
    logLevelWARNING: 'Warning',
    logLevelERROR: 'Error',
    logLevelSUCCESS: 'Success',
    
    // Log sources
    logSourceSystem: 'System',
    logSourceHealth: 'Health Check',
    logSourceAPI: 'API',
    logSourceConsole: 'Console',
    
    // History
    historyTitle: '📈 History Trend',
    historyDays: 'Days',
    historyDay1: '1 Day',
    historyDay3: '3 Days',
    historyDay7: '7 Days',
    historyDay14: '14 Days',
    historyDay30: '30 Days',
    historyAvgOnlineRate: 'Avg Online Rate',
    historyAvgResponseTime: 'Avg Response Time',
    historyTotalChecks: 'Total Checks',
    historyClear: 'Clear History',
    historyClearConfirm: 'Are you sure you want to clear all history? This cannot be undone.',
    
    // Auto reports
    reportsTitle: '📊 Auto Reports',
    reportsDaily: 'Daily',
    reportsWeekly: 'Weekly',
    reportsConfig: 'Config',
    reportsGenerate: 'Generate Report',
    reportsSendNow: 'Send Now',
    reportsSchedule: 'Schedule',
    reportsDailyTime: 'Daily Time',
    reportsWeeklyTime: 'Weekly Time',
    reportsEnabled: 'Enabled',
    reportsDisabled: 'Disabled',
    reportsNoReports: 'No reports',
    reportsViewDetail: 'View Details',
    reportsStats: 'Statistics',
    reportsNodeDetails: 'Node Details',
    reportsDailyTrend: 'Daily Trend',
    
    // Settings
    settingsTitle: '⚙️ Settings',
    settingsBasic: 'Basic Settings',
    settingsNodes: 'Node Management',
    settingsAddNode: 'Add Node',
    settingsNodeName: 'Node Name',
    settingsNodeURL: 'Node URL',
    settingsNodeRole: 'Node Role',
    settingsNodeGroup: 'Group',
    settingsNodeDesc: 'Description',
    settingsSave: 'Save',
    settingsCancel: 'Cancel',
    settingsDelete: 'Delete',
    settingsAdd: 'Add',
    settingsRequired: 'Required',
    
    // WebSocket status
    wsConnected: 'Connected',
    wsDisconnected: 'Disconnected',
    
    // Error messages
    errorLoadConfig: 'Failed to load config',
    errorFetchStatus: 'Failed to fetch status',
    errorSaveSettings: 'Failed to save settings',
    errorNetwork: 'Network error',
    errorUnknown: 'Unknown error',
    
    // Other
    copySuccess: 'Copied successfully',
    copyError: 'Copy failed',
    soundEnabled: 'Sound enabled',
    soundDisabled: 'Sound disabled',
    notifyRemovedFromFavorites: 'Removed from favorites ⭐',
    notifyAddedToFavorites: 'Added to favorites ⭐',
    notifyThemeSwitched: 'Theme switched to {theme}',
    notifyScanComplete: 'Scan complete: {online}/{total} nodes online',
    notifySearchCleared: 'Search cleared',
    notifyAutoRefreshEnabled: 'Auto-refresh enabled',
    notifyAutoRefreshDisabled: 'Auto-refresh disabled',
    notifyRefreshInterval: 'Refresh interval: {interval}',
    notifySoundEnabled: 'Sound enabled 🔊',
    notifySoundDisabled: 'Sound disabled 🔇',
    notifyFilter: 'Filter: {group}',
    notifyFavoritesOnly: 'Showing favorites only ({count} nodes) ⭐',
    notifyShowAllNodes: 'Showing all nodes',
    notifyNoEndpoint: 'No endpoint URL available',
    notifyPingSuccess: 'PING success: {time}ms',
    notifyPingFailed: 'PING failed: {status}',
    notifyPingError: 'PING failed: connection error',
    notifyCopySuccess: 'Node info copied',
    notifyExportSuccess: 'Report exported 📊',
    notifyExportError: 'Export failed: {error}',
    notifyLogsCleared: 'Logs cleared',
    notifyClearFailed: 'Clear failed: {error}',
    notifyDailyReportSuccess: 'Daily report generated{feishu}',
    notifyWeeklyReportSuccess: 'Weekly report generated{feishu}',
    feishuSent: ', sent via Feishu'
  }
};

// 当前语言
let currentLanguage = 'zh';

/**
 * 获取翻译文本
 * @param {string} key - 翻译键
 * @param {Object} params - 替换参数
 * @returns {string} 翻译后的文本
 */
function t(key, params = {}) {
  const lang = i18n[currentLanguage] || i18n.zh;
  let text = lang[key] || i18n.zh[key] || key;
  
  // 替换参数
  Object.keys(params).forEach(param => {
    text = text.replace(`{${param}}`, params[param]);
  });
  
  return text;
}

/**
 * 设置语言
 * @param {string} lang - 语言代码 (zh/en)
 */
function setLanguage(lang) {
  if (i18n[lang]) {
    currentLanguage = lang;
    localStorage.setItem('node-monitor-language', lang);
    document.documentElement.setAttribute('lang', lang);
    updatePageLanguage();
    console.log(`🌐 Language switched to: ${lang}`);
  }
}

/**
 * 获取当前语言
 * @returns {string} 当前语言代码
 */
function getLanguage() {
  const saved = localStorage.getItem('node-monitor-language');
  return saved && i18n[saved] ? saved : 'zh';
}

/**
 * 更新页面语言
 */
function updatePageLanguage() {
  // 更新所有带 data-i18n 属性的元素
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const params = {};
    
    // 获取参数属性
    Array.from(el.attributes).forEach(attr => {
      if (attr.name.startsWith('data-i18n-')) {
        const paramName = attr.name.replace('data-i18n-', '');
        params[paramName] = attr.value;
      }
    });
    
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      el.placeholder = t(key, params);
    } else if (el.tagName === 'IMG') {
      el.alt = t(key, params);
    } else if (el.tagName === 'SELECT') {
      // Select 选项在初始化时设置
    } else {
      el.textContent = t(key, params);
    }
  });
  
  // 更新动态内容
  updateDynamicContent();
}

/**
 * 更新动态内容（需要在页面加载后调用的翻译）
 */
function updateDynamicContent() {
  // 更新 Select 选项
  updateSelectOptions();
  
  // 更新通知语言（如果有正在显示的通知）
  // 更新模态框内容（如果打开）
}

/**
 * 更新 Select 选项的文本
 */
function updateSelectOptions() {
  // 主题选择器
  const themeSelect = document.getElementById('themeSelect');
  if (themeSelect) {
    themeSelect.options[0].text = t('themeCyberpunk');
    themeSelect.options[1].text = t('themeScifi');
    themeSelect.options[2].text = t('themeMinimal');
    themeSelect.options[3].text = t('themeLight');
  }
  
  // 字体大小选择器
  const fontSizeSelect = document.getElementById('fontSizeSelect');
  if (fontSizeSelect) {
    fontSizeSelect.options[0].text = t('fontSizeSmall');
    fontSizeSelect.options[1].text = t('fontSizeStandard');
    fontSizeSelect.options[2].text = t('fontSizeLarge');
    fontSizeSelect.options[3].text = t('fontSizeXLarge');
  }
  
  // 刷新间隔选择器
  const refreshIntervalSelect = document.getElementById('refreshInterval');
  if (refreshIntervalSelect) {
    refreshIntervalSelect.options[0].text = t('interval10s');
    refreshIntervalSelect.options[1].text = t('interval30s');
    refreshIntervalSelect.options[2].text = t('interval1m');
    refreshIntervalSelect.options[3].text = t('interval5m');
    refreshIntervalSelect.options[4].text = t('interval10m');
  }
  
  // 语言选择器
  const languageSelect = document.getElementById('languageSelect');
  if (languageSelect) {
    languageSelect.options[0].text = '🇨🇳 中文';
    languageSelect.options[1].text = '🇬🇧 English';
  }
  
  // 分组筛选器
  const groupFilter = document.getElementById('groupFilter');
  if (groupFilter) {
    groupFilter.options[0].text = t('allGroups');
  }
}

// 导出供外部使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { i18n, t, setLanguage, getLanguage, updatePageLanguage };
}
