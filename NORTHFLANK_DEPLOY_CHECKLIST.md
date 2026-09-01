# FC26 Auction League — Northflank Deployment Checklist

Manual steps to deploy on [Northflank](https://northflank.com) **Developer Sandbox** (free tier: 2 always-on services + 1 database addon).

---

## 1. Sign up

1. Go to [northflank.com](https://northflank.com) and create an account.
2. Verify with a card (no charge on the free Developer Sandbox tier).

## 2. Create a project

1. Create a new **Project** (e.g. `fc26-league`).

## 3. Add Postgres (uses your 1 free database addon)

1. In the project, add a **Postgres addon**.
2. Note the connection string — Northflank can inject it into services via secret groups.

> **Free-tier constraint:** You get **one** database addon. Do **not** add a Redis addon unless you upgrade or replace Postgres. The app uses an in-memory timer fallback when `REDIS_URL` is unset.

## 4. Service 1 — Backend (`/backend`)

1. **Create service** → connect your GitHub repo.
2. Set **build context / source directory** to `/backend`.
3. Build method: **Dockerfile**.
4. Link the Postgres addon connection string → `DATABASE_URL` (via secret group / linked addon).
5. Set environment variables:

   | Variable | Value |
   |----------|--------|
   | `DATABASE_URL` | Auto-injected from Postgres addon |
   | `SESSION_SECRET` | Long random string (32+ chars) |
   | `FRONTEND_URL` | *Set after step 6* — frontend public URL |
   | `TELEGRAM_BOT_TOKEN` | Optional (future use) |
   | `NODE_ENV` | `production` |
   | `REDIS_URL` | **Leave unset** on free tier |

   Do **not** set `PORT` — Northflank injects it automatically.

6. Deploy and wait until the service is **Running**.
7. Copy the backend **public URL** (e.g. `https://backend--fc26-league--yourteam.code.run`).

## 5. Service 2 — Frontend (`/frontend`)

1. **Create service** → same GitHub repo.
2. Source directory: `/frontend`.
3. Build method: **Dockerfile**.
4. Set environment variables:

   | Variable | Value |
   |----------|--------|
   | `NEXT_PUBLIC_API_URL` | Backend public URL from step 4 |
   | `NEXT_PUBLIC_SOCKET_URL` | Same backend URL (API + Socket.io share one service) |

   Do **not** set `PORT` manually.

5. Deploy and copy the frontend **public URL**.

## 6. Finalize CORS (backend)

1. Open the **backend** service → **Environment**.
2. Set `FRONTEND_URL` to the frontend public URL from step 5.
3. Redeploy the backend (or restart) so Socket.io + API CORS allow the frontend origin.

## 7. Database schema (one-time)

1. Open the backend service **Shell / Run command** in Northflank.
2. Run:

   ```bash
   npm run migrate:deploy
   ```

   If this is the first deploy and no migrations exist yet, use instead:

   ```bash
   npx prisma db push
   ```

3. Confirm `/health` returns `{"status":"ok","db":true}` on the backend URL.

## 8. Smoke test

1. Visit the **frontend** public URL.
2. Create a room.
3. Open a second browser/tab (or incognito), join the same room code.
4. Start bidding and place a bid — confirm both tabs see the update in real time (Socket.io through Northflank’s proxy).

## 9. (Optional) Custom domain

1. In the frontend service → **Domains**, attach your custom domain.
2. Update `FRONTEND_URL` on the backend to the custom domain.
3. Rebuild the frontend with `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_SOCKET_URL` pointing at your backend (custom domain or Northflank URL).

## 10. Future: enabling Redis (Phase 2 scaling)

When you need Redis for multi-instance scaling:

1. Upgrade Northflank plan **or** adjust addon limits so you can run Redis alongside Postgres.
2. Add a Redis addon and set `REDIS_URL` on the backend service.
3. Redeploy — the app automatically switches from in-memory timers to Redis (`src/lib/timerStore.ts`).

No code changes required; just set `REDIS_URL`.

---

## Quick reference — health & logs

- **Backend health:** `GET https://<backend-url>/health` → `{ "status": "ok", "db": true }` (and `"redis": true/false` only if `REDIS_URL` is set).
- **Misconfigured DB:** Backend exits immediately with `FATAL: DATABASE_URL is required` in logs.

## Repo layout

| Path | Northflank service |
|------|-------------------|
| `/backend` | API + Socket.io + workers + Prisma |
| `/frontend` | Next.js UI (standalone) |

Root-level `server/` and `src/app/api/` remain for local monolith dev (`npm run dev` at repo root).

---

## Troubleshooting — backend build failures

| Error in `RUN npm run build` | Fix |
|------------------------------|-----|
| `Please manually install OpenSSL` | Fixed in Dockerfile — ensure latest commit (`apk add openssl`) |
| `Cannot find module 'framer-motion'` | Frontend-only file in `backend/src/lib/` — run `npm run check:lib` locally |
| `Type error` in `useCard.ts` / `effects.ts` | Prisma JSON types — ensure latest commit |
| `Cannot find module '../src/lib/...'` in Docker | Import paths must be `./src/lib/...` from `server.ts` |

**Backend `/backend` uses Next.js for API routes only** — `.next` in the Dockerfile is expected. UI is in `/frontend`.

Before pushing backend changes locally:

```bash
cd backend
npm run check:lib
npm run build
```
