# 锁定 Node 具体版本：node:sqlite 仍是实验特性，避免 22.x 小版本升级引入行为变化
FROM node:22.16-alpine

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
