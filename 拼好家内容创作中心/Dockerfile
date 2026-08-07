# 使用 22-alpine 浮动标签（NAS 拉取锁定 tag 镜像超时）：node:sqlite 在 22.x 范围内稳定，
# 本地开发环境锁定 node 22.16（见 package.json engines >=22.13）
FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .
RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV PORT=4174
ENV DB_PATH=/app/data/workbench.db

EXPOSE 4174

CMD ["node", "server.js"]
