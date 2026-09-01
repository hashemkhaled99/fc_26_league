# syntax=docker/dockerfile:1

FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY package.json package-lock.json* ./
# Install devDependencies (typescript, prisma CLI) without forcing NODE_ENV=development
RUN npm install --include=dev

FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-alpine AS runner
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nodejs

COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/src ./src
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/next.config.mjs ./next.config.mjs

USER nodejs
EXPOSE 4000

CMD ["npx", "tsx", "server.ts"]
