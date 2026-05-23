FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY server ./server

EXPOSE 3010

CMD ["node", "server/index.js"]
