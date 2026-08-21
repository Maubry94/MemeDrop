FROM node:22-alpine AS workspace-dependencies

WORKDIR /workspace

COPY package.json package-lock.json ./
COPY apps/desktop/package.json ./apps/desktop/package.json
COPY apps/server/package.json ./apps/server/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/protocol/package.json ./packages/protocol/package.json

RUN npm ci --workspace @memedrop/server --include-workspace-root=false

FROM workspace-dependencies AS builder

COPY tsconfig.base.json ./tsconfig.base.json
COPY apps/desktop/package.json ./apps/desktop/package.json
COPY apps/server ./apps/server
COPY packages/protocol ./packages/protocol

RUN npm run build --workspace @memedrop/server

FROM node:22-alpine AS production-dependencies

WORKDIR /workspace

COPY package.json package-lock.json ./
COPY apps/desktop/package.json ./apps/desktop/package.json
COPY apps/server/package.json ./apps/server/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/protocol/package.json ./packages/protocol/package.json

RUN npm ci --omit=dev --workspace @memedrop/server --include-workspace-root=false

FROM node:22-alpine

WORKDIR /workspace/apps/server

ENV NODE_ENV=production

COPY --from=production-dependencies /workspace/node_modules /workspace/node_modules
COPY --from=builder /workspace/apps/server/package.json ./package.json
COPY --from=builder /workspace/apps/server/dist ./dist

EXPOSE 3010

CMD ["node", "dist/index.js"]
