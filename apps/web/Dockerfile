FROM node:22-alpine AS builder

WORKDIR /workspace

COPY package.json package-lock.json ./
COPY apps/desktop/package.json ./apps/desktop/package.json
COPY apps/server/package.json ./apps/server/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/protocol/package.json ./packages/protocol/package.json
RUN npm ci --workspace @memedrop/web --include-workspace-root=false

COPY tsconfig.base.json ./
COPY apps/web ./apps/web

RUN npm run build --workspace @memedrop/web

FROM nginx:1.28.0-alpine

COPY apps/web/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY apps/web/nginx/snippets /etc/nginx/snippets
RUN nginx -t
COPY --from=builder /workspace/apps/web/dist /usr/share/nginx/html
RUN find /usr/share/nginx/html -type d -exec chmod 755 {} \; \
    && find /usr/share/nginx/html -type f -exec chmod 644 {} \;

EXPOSE 80
