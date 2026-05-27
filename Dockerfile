FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY server ./server
COPY shared ./shared
COPY tsconfig.server.json ./

RUN npm run build:server

FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist-server ./dist-server

EXPOSE 3010

CMD ["node", "dist-server/server/index.js"]
