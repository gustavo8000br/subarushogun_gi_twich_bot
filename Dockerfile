FROM node:24.20.0-alpine3.24 AS dependencies
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS frontend-build
COPY apps/frontend ./apps/frontend
COPY apps/web/localization/catalogs ./apps/web/localization/catalogs
COPY apps/shared ./apps/shared
RUN npm run build:frontend

FROM node:24.20.0-alpine3.24 AS runtime
ENV NODE_ENV=production
RUN apk add --no-cache openssl
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY apps ./apps
COPY --from=frontend-build /app/apps/frontend/.next ./apps/frontend/.next
COPY prisma.config.mjs ./prisma.config.mjs
COPY VERSION .release-stage ./
ARG PRODUCT_VERSION
RUN test -z "$PRODUCT_VERSION" || printf '%s\n' "$PRODUCT_VERSION" > VERSION
RUN DATABASE_URL=postgresql://queuebot:build-only@db:5432/queuebot npm exec -- prisma generate --schema apps/api/prisma/schema.prisma
USER 10001:10001
EXPOSE 3000
CMD ["node", "apps/infra/scripts/start-product.mjs"]
