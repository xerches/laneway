# Laneway for self-hosting. Builds Next's standalone server and runs the
# database migrations every time the container starts.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 LANEWAY_STANDALONE=1
RUN npx next build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S laneway && adduser -S laneway -G laneway
COPY --from=build --chown=laneway:laneway /app/.next/standalone ./
COPY --from=build --chown=laneway:laneway /app/.next/static ./.next/static
COPY --from=build --chown=laneway:laneway /app/scripts/migrate.mjs ./scripts/migrate.mjs
COPY --from=build --chown=laneway:laneway /app/netlify/database/migrations ./netlify/database/migrations
COPY --from=deps --chown=laneway:laneway /app/node_modules/pg ./node_modules/pg
USER laneway
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/login || exit 1
CMD ["sh", "-c", "node scripts/migrate.mjs && node server.js"]
