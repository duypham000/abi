# Build Stage
FROM golang:alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache build-base

# Cache dependencies
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build static binary
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o tomo-server ./cmd/server/main.go

# Production Stage
FROM alpine:3.19

WORKDIR /app

RUN apk add --no-cache ca-certificates tzdata

COPY --from=builder /app/tomo-server /app/tomo-server
COPY --from=builder /app/.env.production /app/.env.production

EXPOSE 8080

ENV APP_ENV=production

ENTRYPOINT ["/app/tomo-server"]
