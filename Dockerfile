# Node Monitor - Dockerfile
# 基于 Node.js 的轻量级节点监控服务

FROM node:18-alpine

# 设置工作目录
WORKDIR /app

# 复制 package 文件
COPY package*.json ./

# 安装依赖
RUN npm ci --only=production

# 复制应用代码
COPY server.js ./
COPY config/ ./config/
COPY public/ ./public/
COPY data/ ./data/

# 创建数据目录（用于持久化）
RUN mkdir -p /app/data/history /app/data/logs /app/data/reports /app/data/alerts

# 暴露端口
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=3000

# 启动应用
CMD ["node", "server.js"]
