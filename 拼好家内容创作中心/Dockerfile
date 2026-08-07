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
