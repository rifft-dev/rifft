FROM node:20-alpine AS deps
WORKDIR /app
COPY packages/collector/package.json ./package.json
RUN npm install

FROM deps AS build
WORKDIR /app
COPY tsconfig.base.json /tsconfig.base.json
COPY packages/collector ./
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY packages/collector/package.json ./package.json
EXPOSE 4318 4317
CMD ["node", "dist/index.js"]
