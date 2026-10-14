# Multi-stage build for the Tomo Node.js service (tomo-node).
# One image, three roles (server | worker | api) selected at runtime by YHUB_ROLE.
#
# Debian (glibc) base: uWebSockets.js (uws, via @y/redis) ships glibc-only
# prebuilt binaries that need ld-linux-x86-64.so.2 — Alpine/musl cannot load them.

# --- build: compile TS → dist/ (yjs .js modules pass through via allowJs) ---
FROM node:20-slim AS build
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm ci
COPY src/ ./src/
RUN npm run build

# --- runtime: prod deps only + compiled dist/ ---
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist

# YHUB_ROLE selects the entrypoint: "server" | "worker" | "api".
# (K8s overrides command/args; this CMD is the compose/default path.)
ARG YHUB_ROLE=server
ENV YHUB_ROLE=$YHUB_ROLE
CMD ["sh", "-c", "node --import ./dist/tracing.js dist/roles/${YHUB_ROLE}.js"]
