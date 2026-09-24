FROM node:20-alpine AS client-build

WORKDIR /app

COPY client/package*.json ./client/
RUN npm ci --prefix client

# The client imports the shared activity catalogue at build time.
COPY shared ./shared
COPY client ./client
RUN npm --prefix client run build


FROM node:20-alpine AS production

WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    NPM_CONFIG_CACHE=/tmp/.npm

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src
COPY shared ./shared
COPY migrations ./migrations
COPY scripts ./scripts
COPY --from=client-build /app/client/dist ./client/dist

# The application is read-only at runtime; uploads are stored in PostgreSQL.
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Migrations are versioned and run before each start. Already-applied files are skipped.
CMD ["sh", "-c", "node src/db/migrate.js && exec node src/index.js"]
