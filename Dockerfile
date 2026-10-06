FROM node:24.20.0-alpine3.24 AS dependencies
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24.20.0-alpine3.24 AS runtime
ENV NODE_ENV=production
RUN apk add --no-cache openssl
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY apps ./apps
COPY prisma.config.mjs ./prisma.config.mjs
COPY VERSION .release-stage ./
ARG PRODUCT_VERSION
RUN test -z "$PRODUCT_VERSION" || printf '%s\n' "$PRODUCT_VERSION" > VERSION
RUN DATABASE_URL=postgresql://queuebot:build-only@db:5432/queuebot npm exec -- prisma generate --schema apps/api/prisma/schema.prisma
USER 10001:10001
EXPOSE 3000
CMD ["node", "apps/api/src/server.mjs"]
