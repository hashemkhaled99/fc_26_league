# FC26 Backend Service

API routes (`/api/*`), Socket.io, auction workers, and Prisma — deployed as a single Northflank service.

## Architecture

```
server.ts          → HTTP server + Socket.io + background workers
src/app/api/       → Next.js API route handlers
src/lib/           → Server-side business logic only
prisma/            → Database schema
```

The frontend UI lives in `/frontend`. Do **not** copy client-only helpers into this folder.

## `src/lib/` rules

| Keep in backend | Keep in frontend only |
|-----------------|----------------------|
| `prisma.ts`, `session.ts`, `timerStore.ts` | `motion.ts` (framer-motion) |
| `auction/`, `cards/`, `admin/`, etc. | `formations.ts` (squad UI) |
| `players/faceStats.ts` (used by API) | `room-socket.ts` (socket.io-client) |
| `socket-emit.ts` (server → socket bridge) | `api-base.ts` |

Before adding a file to `backend/src/lib/`, confirm no imports from:
- `framer-motion`
- `socket.io-client`
- `@/components/*`

Run `npm run check:lib` to verify.

## Environment variables

See `.env.example`. Required at runtime:

- `DATABASE_URL` — Postgres (link Northflank addon)
- `SESSION_SECRET` — 32+ char random string
- `FRONTEND_URL` — frontend public URL (CORS + Socket.io origin)

Optional:

- `REDIS_URL` — leave unset on free tier (in-memory timer fallback)

## Commands

```bash
npm run dev              # local: tsx watch server.ts
npm run build            # prisma generate + next build (Docker)
npm run start            # production: tsx server.ts
npm run migrate:deploy   # run once after first deploy
npm run check:lib        # fail if frontend deps leaked in
```

## Docker

Built from `Dockerfile` in this directory. Northflank build context must point at `/backend`.

After first deploy, open the service shell and run:

```bash
npx prisma db push
```

Then verify: `GET /health` → `{"status":"ok","db":true}`
