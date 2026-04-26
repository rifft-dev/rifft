FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.6.2 --activate

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/package.json
COPY apps/api/package.json ./apps/api/package.json
COPY packages/collector/package.json ./packages/collector/package.json
RUN pnpm install --frozen-lockfile --filter @rifft/api

FROM deps AS build
WORKDIR /app
COPY tsconfig.base.json ./tsconfig.base.json
COPY apps/api ./apps/api
RUN pnpm --filter @rifft/api build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/apps/api/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./dist
COPY apps/api/package.json ./package.json
EXPOSE 4000
CMD ["node", "dist/index.js"]
