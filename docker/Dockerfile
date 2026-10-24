# One image, three commands: server (default), worker, migrate. See docs/adr/0005.
FROM node:24.22.1-bookworm-slim AS base
# Node >= 25 no longer ships corepack; pnpm is installed explicitly.
RUN npm install -g pnpm@12.14.0 turbo@2.11.10
WORKDIR /app
# Git hooks are for contributors, not for image builds.
ENV LEFTHOOK=0

FROM base AS prune
COPY . .
RUN turbo prune @goodresearch/api @goodresearch/web --docker

FROM base AS build
COPY --from=prune /app/out/json/ .
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile
COPY --from=prune /app/out/full/ .
RUN pnpm --filter @goodresearch/web build

FROM base AS deps
COPY --from=prune /app/out/json/ .
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile --prod

FROM node:24.22.1-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
# Git hooks are for contributors, not for image builds.
ENV LEFTHOOK=0
COPY --from=deps --chown=node:node /app/ ./
COPY --from=prune --chown=node:node /app/out/full/apps/api ./apps/api
COPY --from=prune --chown=node:node /app/out/full/packages ./packages
COPY --from=build --chown=node:node /app/apps/web/dist ./apps/web/dist
COPY --chown=node:node docker/entrypoint.sh /entrypoint.sh
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
ENTRYPOINT ["/entrypoint.sh"]
CMD ["server"]
