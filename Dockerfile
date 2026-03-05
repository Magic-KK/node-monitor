# Node Monitor - Dockerfile
# 基于 Node.js 的轻量级节点监控服务
# 🔒 支持 HTTPS 安全连接

FROM node:18-alpine

# 安装 OpenSSL（用于 SSL 证书）
RUN apk add --no-cache openssl

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
COPY scripts/ ./scripts/

# 创建数据目录（用于持久化）
RUN mkdir -p /app/data/history /app/data/logs /app/data/reports /app/data/alerts
RUN mkdir -p /app/config/ssl

# 暴露端口（HTTP + HTTPS）
EXPOSE 3000 3443

# 健康检查（支持 HTTP 和 HTTPS）
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=3000
ENV HTTPS_PORT=3443
# 默认不启用 HTTPS，可通过环境变量启用
# ENV HTTPS_ENABLED=true

# 启动应用
CMD ["node", "server.js"]
