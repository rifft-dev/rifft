FROM node:20-alpine AS deps
WORKDIR /app
COPY apps/api/package.json ./package.json
RUN npm install

FROM deps AS build
WORKDIR /app
COPY tsconfig.base.json /tsconfig.base.json
COPY apps/api ./
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY apps/api/package.json ./package.json
EXPOSE 4000
CMD ["node", "dist/index.js"]
