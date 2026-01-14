#!/bin/bash
set -e

echo "🚀 Starting WebSocket Service deployment..."

cd websocket
npm ci --only=production
npm run build

echo "✅ WebSocket service build completed!"
