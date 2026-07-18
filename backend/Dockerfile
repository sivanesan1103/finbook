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

# Apply migrations (or push schema on first boot), seed, then start.
CMD sh -c "npx prisma migrate deploy || npx prisma db push; npm run seed || true; node src/server.js"
