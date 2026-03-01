FROM oven/bun:1 AS base
WORKDIR /app

COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile --production

COPY src/ src/

EXPOSE 3000
USER bun
CMD ["bun", "run", "src/index.ts"]
