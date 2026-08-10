FROM node:22-alpine
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY package.json pnpm-workspace.yaml ./
COPY apps/worker/package.json ./apps/worker/
COPY packages/db/package.json ./packages/db/
RUN pnpm install --no-frozen-lockfile
COPY . .
CMD ["pnpm", "--filter", "worker", "start"]
