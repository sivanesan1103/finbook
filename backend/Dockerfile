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
#
# Seeding only runs when SEED_ON_BOOT=true (set by the local dev compose
# file) — it must never run unattended in production, since it upserts a
# demo login (owner@finbook.dev / demo123) with a password anyone reading
# this repo already knows.
#
# db push is retried rather than chained with `;` — on a cold start, `db`
# passing its own healthcheck (mysqladmin ping) doesn't guarantee MySQL is
# ready for a Prisma connection a moment later. A `;` chain swallowed that
# transient failure silently and the server still started, just against a
# database with no tables at all (every query then failing with "table
# `users` does not exist" instead of anything that looked like a boot
# error). Retrying until it succeeds means the server never starts against
# an unmigrated schema.
CMD sh -c "until npx prisma db push --accept-data-loss --skip-generate; do echo 'prisma db push failed, retrying in 2s...' >&2; sleep 2; done; [ \"$SEED_ON_BOOT\" = \"true\" ] && npm run seed; node src/server.js"
