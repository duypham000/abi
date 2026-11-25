# Multi-stage build for Tomo Web SPA (tomo-web)
# Build runs on the CI host architecture ($BUILDPLATFORM) to avoid slow QEMU
# emulation when targeting linux/arm64, then copies static dist/ to nginx.

FROM --platform=$BUILDPLATFORM node:20-slim AS build

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.33.4 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile || pnpm install

COPY . .

ARG VITE_API_BASE_URL=/api/v1
ARG VITE_GO_API_URL
ARG VITE_NODE_API_URL
ARG VITE_NODE_WS_URL
ARG VITE_YJS_SERVER_URL

ENV NODE_OPTIONS=--max-old-space-size=4096

RUN pnpm run build

FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
