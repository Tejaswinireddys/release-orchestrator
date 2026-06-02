# syntax=docker/dockerfile:1
FROM node:20-alpine AS base
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev || true
COPY src ./src
EXPOSE 8084
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:8084/health || exit 1
USER node
CMD ["node", "src/index.js"]
