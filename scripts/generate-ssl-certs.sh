#!/bin/bash

# SSL 证书生成脚本 - 用于开发环境
# 生成自签名证书，仅用于本地开发测试

CERT_DIR="./config/ssl"
CERT_FILE="$CERT_DIR/server.crt"
KEY_FILE="$CERT_DIR/server.key"

echo "🔒 生成 SSL 证书..."

# 创建目录
mkdir -p "$CERT_DIR"

# 检查是否已存在证书
if [ -f "$CERT_FILE" ] && [ -f "$KEY_FILE" ]; then
    echo "⚠️  证书已存在，是否重新生成？(y/n)"
    read -r response
    if [[ "$response" =~ ^[Yy]$ ]]; then
        rm -f "$CERT_FILE" "$KEY_FILE"
    else
        echo "✅ 使用现有证书"
        exit 0
    fi
fi

# 生成自签名证书
# - 有效期 365 天
# - RSA 2048 位密钥
# - 无密码保护（开发环境）
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout "$KEY_FILE" \
    -out "$CERT_FILE" \
    -subj "/C=CN/ST=Beijing/L=Beijing/O=J.A.R.V.I.S./OU=Node Monitor/CN=localhost" \
    -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"

# 检查生成结果
if [ -f "$CERT_FILE" ] && [ -f "$KEY_FILE" ]; then
    echo "✅ SSL 证书生成成功！"
    echo ""
    echo "📁 证书位置:"
    echo "   证书：$CERT_FILE"
    echo "   私钥：$KEY_FILE"
    echo ""
    echo "🔧 使用方法:"
    echo "   npm start:https"
    echo ""
    echo "⚠️  注意：这是自签名证书，浏览器会显示安全警告，点击'继续访问'即可"
else
    echo "❌ 证书生成失败！"
    exit 1
fi
