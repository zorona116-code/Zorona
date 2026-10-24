# syntax=docker/dockerfile:1
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps ./apps
RUN npm ci
RUN npm run build --workspace apps/admin

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app/apps/admin ./apps/admin
USER node
EXPOSE 4174
CMD ["node", "apps/admin/server.js"]
