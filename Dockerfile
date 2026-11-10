# syntax=docker/dockerfile:1
# DEP-1: the production web image — the built Angular app served by Caddy, which also proxies /api,
# /hubs and /health to the API container. Build: docker build -t pera-web .

FROM node:22-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM caddy:2-alpine AS runtime
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /src/dist/dms/browser /srv
ENV SITE_ADDRESS=:80
EXPOSE 80 443
