# Built from the repository root: docker build -f apps/api/Dockerfile .  (ADR 0026)

FROM node:24-slim AS base
ENV TURBO_TELEMETRY_DISABLED=1
RUN npm install --global pnpm@12.3.4 turbo@2.10.12
WORKDIR /repo

FROM base AS pruner
COPY . .
RUN turbo prune api --docker

FROM base AS builder
COPY --from=pruner /repo/out/json/ ./
RUN pnpm install --frozen-lockfile
COPY --from=pruner /repo/out/full/ ./
RUN turbo run build --filter=api
RUN pnpm --filter=api deploy --prod /deploy
WORKDIR /deploy
RUN rm -rf dist/scripts \
 && for pkg in . node_modules/.pnpm/@repo+*/node_modules/@repo/*; do \
      find "$pkg" -mindepth 1 -maxdepth 1 ! -name package.json ! -name dist ! -name node_modules -exec rm -rf {} + ; \
      rm -rf "$pkg/dist/testing" ; \
    done \
 && if { find . -path ./node_modules -prune -o -print; find -L node_modules/@repo; } | grep -E '[.](test|spec)[.]|/(testing|src)(/|$)'; then exit 1; fi

FROM node:24-slim AS runner
ENV NODE_ENV=production \
    PORT=4321
WORKDIR /app
COPY --from=builder /deploy ./
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 4321
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "require('node:http').get('http://127.0.0.1:' + process.env.PORT + '/healthz', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"]
CMD ["node", "dist/server.js"]
