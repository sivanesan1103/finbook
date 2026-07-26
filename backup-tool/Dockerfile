FROM node:20-slim

# default-mysql-client (MariaDB client on Debian) provides mysql/mysqldump —
# it talks the standard MySQL wire protocol to the 8.4 server over the
# network, so no dependency on the server container's own binaries.
RUN apt-get update \
    && apt-get install -y --no-install-recommends default-mysql-client ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY src ./src
COPY public ./public

ENV NODE_ENV=production
EXPOSE 4100
CMD ["node", "src/server.js"]
