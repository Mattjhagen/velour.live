FROM node:22-alpine
RUN corepack enable && corepack prepare pnpm@latest --activate && npm install -g tsx
WORKDIR /app
COPY package.json pnpm-workspace.yaml ./
COPY apps/worker/package.json ./apps/worker/
COPY packages/db/package.json ./packages/db/
RUN pnpm install --no-frozen-lockfile
COPY . .
CMD ["tsx", "apps/worker/src/index.ts"]
