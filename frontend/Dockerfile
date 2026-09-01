# syntax=docker/dockerfile:1

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG NEXT_PUBLIC_API_URL=https://p01--fc26-backend--xxwmnabgfpdk.code.run
ARG NEXT_PUBLIC_SOCKET_URL=https://p01--fc26-backend--xxwmnabgfpdk.code.run
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_SOCKET_URL=$NEXT_PUBLIC_SOCKET_URL

RUN echo "Busting build cache: v1.0.2" && \
    export NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-https://p01--fc26-backend--xxwmnabgfpdk.code.run}" && \
    export NEXT_PUBLIC_SOCKET_URL="${NEXT_PUBLIC_SOCKET_URL:-https://p01--fc26-backend--xxwmnabgfpdk.code.run}" && \
    echo "NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL" && \
    echo "NEXT_PUBLIC_SOCKET_URL=$NEXT_PUBLIC_SOCKET_URL" && \
    npm run build

FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ARG NEXT_PUBLIC_API_URL=https://p01--fc26-backend--xxwmnabgfpdk.code.run
ARG NEXT_PUBLIC_SOCKET_URL=https://p01--fc26-backend--xxwmnabgfpdk.code.run
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_SOCKET_URL=$NEXT_PUBLIC_SOCKET_URL

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nodejs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nodejs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nodejs:nodejs /app/.next/static ./.next/static

USER nodejs
EXPOSE 3000

ENV HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
