# Build Stage
FROM --platform=$BUILDPLATFORM golang:alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache build-base ca-certificates git tzdata

# Cache dependencies
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Ensure .env.production exists so COPY in production stage does not fail if ignored by git
RUN if [ ! -f .env.production ]; then touch .env.production; fi

# Build static binary supporting multi-architecture cross-compilation
ARG TARGETOS
ARG TARGETARCH
RUN CGO_ENABLED=0 GOOS=${TARGETOS:-linux} GOARCH=${TARGETARCH:-amd64} go build -a -installsuffix cgo -o tomo-server ./cmd/server/main.go

# Production Stage
FROM alpine:3.19

WORKDIR /app

RUN apk add --no-cache ca-certificates tzdata

COPY --from=builder /app/tomo-server /app/tomo-server
COPY --from=builder /app/.env.production /app/.env.production

EXPOSE 8080

ENV APP_ENV=production

ENTRYPOINT ["/app/tomo-server"]
