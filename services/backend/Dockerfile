FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY services/backend/package.json services/backend/package.json
RUN npm ci --workspace @ancv/shared --workspace @ancv/backend --include-workspace-root
COPY packages/shared packages/shared
COPY services/backend services/backend
RUN npm run build -w @ancv/shared && npm run build -w @ancv/backend

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /app/services/backend/dist ./services/backend/dist
COPY --from=build /app/services/backend/package.json ./services/backend/package.json
USER node
EXPOSE 8080
CMD ["node", "services/backend/dist/server.js"]

