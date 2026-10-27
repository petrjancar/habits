# syntax=docker/dockerfile:1

# PocketBase release to bundle. Override with:
#   docker compose build --build-arg PB_VERSION=x.y.z
ARG PB_VERSION=0.40.6

# ---------------------------------------------------------------------------
# 1. Build the frontend (Vite writes to ../pb_public, i.e. /app/pb_public)
# ---------------------------------------------------------------------------
# Image tags are literal (not build args) so Dependabot can update them.
FROM node:24-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ---------------------------------------------------------------------------
# 2. Collect the optional backend folders. pb_hooks/ and pb_migrations/ may
#    not exist in a fresh clone (git doesn't track empty or ignored dirs),
#    so make sure they exist before copying them into the final image.
# ---------------------------------------------------------------------------
FROM alpine:3.22 AS backend-src
WORKDIR /src
COPY . .
RUN mkdir -p pb_hooks pb_migrations

# ---------------------------------------------------------------------------
# 3. Download PocketBase (verified against the release checksums)
# ---------------------------------------------------------------------------
FROM alpine:3.22 AS pocketbase
ARG PB_VERSION
# Set automatically by BuildKit (amd64, arm64, ...)
ARG TARGETARCH
WORKDIR /tmp/pb
RUN apk add --no-cache unzip \
 && ZIP="pocketbase_${PB_VERSION}_linux_${TARGETARCH}.zip" \
 && BASE="https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}" \
 && wget -q "${BASE}/${ZIP}" "${BASE}/checksums.txt" \
 && grep " ${ZIP}\$" checksums.txt | sha256sum -c - \
 && unzip -q "${ZIP}" pocketbase

# ---------------------------------------------------------------------------
# 4. Runtime image
# ---------------------------------------------------------------------------
FROM alpine:3.22
RUN apk add --no-cache ca-certificates \
 && adduser -D -H -u 1000 pocketbase \
 && mkdir -p /pb/pb_data \
 && chown pocketbase:pocketbase /pb/pb_data

WORKDIR /pb
COPY --from=pocketbase /tmp/pb/pocketbase /pb/pocketbase
COPY --from=backend-src /src/pb_hooks /pb/pb_hooks
COPY --from=backend-src /src/pb_migrations /pb/pb_migrations
COPY --from=frontend /app/pb_public /pb/pb_public
COPY --chmod=755 docker-entrypoint.sh /pb/docker-entrypoint.sh

USER pocketbase
EXPOSE 8090

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8090/api/health >/dev/null || exit 1

# --automigrate=false: schema changes made in the dashboard on the server live
# in pb_data; generating migration files inside the container would be lost.
# The entrypoint creates the superuser from PB_ADMIN_EMAIL / PB_ADMIN_PASSWORD
# (if set), then runs PocketBase with CMD.
ENTRYPOINT ["/pb/docker-entrypoint.sh"]
CMD ["serve", "--http=0.0.0.0:8090", "--dir=/pb/pb_data", "--publicDir=/pb/pb_public", "--hooksDir=/pb/pb_hooks", "--migrationsDir=/pb/pb_migrations", "--automigrate=false"]
