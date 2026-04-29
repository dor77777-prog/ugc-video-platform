FROM node:20-slim

RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
COPY apps/worker/package.json ./apps/worker/
COPY packages/shared/package.json ./packages/shared/
COPY packages/prompts/package.json ./packages/prompts/
COPY prisma ./prisma/

RUN npm ci --workspace=@ugc-video/worker --workspace=@ugc-video/shared --workspace=@ugc-video/prompts --include-workspace-root

COPY apps/worker ./apps/worker/
COPY packages/shared ./packages/shared/
COPY packages/prompts ./packages/prompts/
COPY tsconfig.base.json ./

RUN npm run prisma:generate

CMD ["node", "--import", "tsx/esm", "apps/worker/src/index.ts"]
