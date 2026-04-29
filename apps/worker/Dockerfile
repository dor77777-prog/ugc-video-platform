FROM node:20-slim

# ffmpeg is the only runtime system dep — needed for final video composition
# (concat-filter, libass caption burn-in). openssl is required by Prisma 6
# at runtime on slim images.
RUN apt-get update && apt-get install -y ffmpeg openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps with dev included — tsx (used to run worker TS at runtime)
# lives in devDependencies, and Railway defaults NODE_ENV=production which
# would otherwise skip it.
COPY package*.json ./
COPY apps/worker/package.json ./apps/worker/
COPY packages/shared/package.json ./packages/shared/
COPY packages/prompts/package.json ./packages/prompts/
COPY prisma ./prisma/

RUN npm ci --include=dev --workspace=@ugc-video/worker --workspace=@ugc-video/shared --workspace=@ugc-video/prompts --include-workspace-root

COPY apps/worker ./apps/worker/
COPY packages/shared ./packages/shared/
COPY packages/prompts ./packages/prompts/
COPY tsconfig.base.json ./

RUN npx prisma generate

CMD ["sh", "-c", "echo '=== src/ contents ==='; ls -la apps/worker/src/; echo '=== launching ==='; exec npx tsx apps/worker/src/index.ts"]
