FROM node:20-slim

WORKDIR /app

# OpenSSL 3 is required by the Prisma query engine on Debian-based images.
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --omit=dev && npm install prisma --no-save

COPY prisma ./prisma
RUN npx prisma generate

COPY . .

ENV NODE_ENV=production
EXPOSE 4000

# This project has no prisma/migrations history (schema is kept in sync via
# `db push`, not versioned migrations) — `prisma migrate deploy` is a no-op
# with nothing to apply when that directory doesn't exist, so the old
# `migrate deploy || db push` fallback here never actually reached db push,
# and schema drift (e.g. a column added to schema.prisma) silently never
# landed in the database across container restarts. Push directly instead.
CMD sh -c "npx prisma db push --accept-data-loss --skip-generate; npm run seed || true; node src/server.js"
