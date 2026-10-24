# syntax=docker/dockerfile:1
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps ./apps
RUN npm ci
RUN npm run build --workspace apps/web
RUN npm prune --omit=dev

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/apps/web ./apps/web
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
