FROM node:20-alpine AS deps
WORKDIR /app
COPY apps/web/package.json ./package.json
RUN npm install

FROM deps AS build
WORKDIR /app
COPY tsconfig.base.json /tsconfig.base.json
COPY apps/web ./
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
