# Built from the repository root: docker build -f apps/microtask/Dockerfile .  (ADR 0026)

FROM node:24-slim AS base
ENV TURBO_TELEMETRY_DISABLED=1 \
    NEXT_TELEMETRY_DISABLED=1
RUN npm install --global pnpm@12.3.4 turbo@2.10.12
WORKDIR /repo

FROM base AS pruner
COPY . .
RUN turbo prune microtask --docker

FROM base AS builder
COPY --from=pruner /repo/out/json/ ./
RUN pnpm install --frozen-lockfile
COPY --from=pruner /repo/out/full/ ./
RUN turbo run build --filter=microtask

FROM node:24-slim AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=builder /repo/apps/microtask/.next/standalone ./
COPY --from=builder /repo/apps/microtask/.next/static ./apps/microtask/.next/static
COPY --from=builder /repo/apps/microtask/public ./apps/microtask/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "-e", "require('node:http').get('http://127.0.0.1:' + process.env.PORT + '/login', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"]
CMD ["node", "apps/microtask/server.js"]
