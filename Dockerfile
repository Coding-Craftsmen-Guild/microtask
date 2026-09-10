# --- build: bundle Tiptap into public/vendor/tiptap.js -----------------------
FROM node:22-alpine AS build
WORKDIR /app

COPY apps/legacy/package.json ./
RUN npm install
COPY apps/legacy/src ./src
COPY apps/legacy/public ./public
RUN npm run build

# --- runtime: the server itself has no dependencies --------------------------
FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data
WORKDIR /app

# package.json is needed at runtime only for "type": "module".
COPY apps/legacy/package.json ./
COPY apps/legacy/server.js ./
COPY apps/legacy/lib ./lib
COPY apps/legacy/public ./public
COPY --from=build /app/public/vendor ./public/vendor

RUN mkdir -p /data && chown -R node:node /data /app
USER node

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
