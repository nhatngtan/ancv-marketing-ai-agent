FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY services/backend/package.json services/backend/package.json
RUN pnpm install --frozen-lockfile --filter @ancv/shared --filter @ancv/backend
COPY packages/shared packages/shared
COPY services/backend services/backend
RUN pnpm --filter @ancv/shared build && pnpm --filter @ancv/backend build

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
RUN corepack enable
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/services/backend/node_modules ./services/backend/node_modules
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /app/services/backend/dist ./services/backend/dist
COPY --from=build /app/services/backend/package.json ./services/backend/package.json
USER node
EXPOSE 8080
CMD ["node", "services/backend/dist/server.js"]

