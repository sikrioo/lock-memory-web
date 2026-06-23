# Lock Memory Web

This repository contains the split web version of Lock Memory:

- `frontend/`: GitHub Pages-friendly static client
- `backend/`: Node.js + Express + SQLite API

The frontend keeps rendering, touch input, demo playback, and UI effects.
The backend owns pattern generation, session creation, score validation, leaderboard writes, and daily challenge generation.

## Structure

```text
lock-memory-web/
  frontend/
    index.html
    style.css
    game.js
    config.js
  backend/
    package.json
    data/
    migrations/
      0001_init.sql
    src/
      db.js
      index.js
      pattern-engine.js
```

## Frontend Notes

- By default `frontend/config.js` uses the current HTTP origin, or `http://127.0.0.1:3000` when opened outside a server context.
- The frontend is plain HTML/CSS/JS and can still be deployed separately, but when it is not served by the same Node app you should point `frontend/config.js` at your API server origin.
- When you open the frontend with VS Code Live Server on a `5500`-series localhost port, it now automatically targets `http://127.0.0.1:3000` for API requests.
- The frontend now includes persisted `NEON`, `SIMPLE`, and `WILD` themes, tighter mobile touch handling, timer text throttling, and a particle cap for long sessions.
- Ranked score submission only happens in `DOUBT` mode.
- `ZEN` mode still requests protected patterns from the API, but keeps score locally as practice-only.

## Backend Notes

- `Express` handles HTTP routes and can also serve the `frontend/` files directly.
- `better-sqlite3` stores data in `backend/data/lock-memory.db` by default.
- The SQLite schema auto-initializes from `backend/migrations/0001_init.sql` on startup.
- Pattern generation now uses the `v2` tier-progress difficulty curve and cached MASTER symmetry variants.
- `POST /api/pattern`
- `POST /api/score/submit`
- `GET /api/leaderboard?mode=DOUBT&period=daily`
- `GET /api/daily`
- `GET /api/health`

The server stores stage sessions in SQLite and uses those stored values to verify:

- session existence
- no resubmission for the same session
- stage and mode consistency
- exact pattern match
- plausible elapsed time
- combo progression
- server-side score recalculation

## Local Run

1. From `backend/`, run `npm install`.
2. Start the local server with `npm run dev` or `npm start`.
3. Open `http://127.0.0.1:3000`.
4. If you want a different port or DB file, set `PORT`, `HOST`, `CORS_ORIGIN`, or `DB_FILE`.

## Simple Demo Deploy

The easiest split deploy for this repository is:

- backend: host `backend/` on a Node host such as Render
- frontend: publish `frontend/` with GitHub Pages

### 1. Deploy the full app

This project can be hosted as a single service because the Express backend also serves the static frontend.

For a Render-style deploy from the repository root:

- Build Command: `cd backend && npm install`
- Start Command: `cd backend && npm start`

Recommended environment variables:

- `HOST=0.0.0.0`
- `CORS_ORIGIN=*`

Optional:

- `PORT` is usually injected by the host automatically
- `DB_FILE=/var/data/lock-memory.db` if your host provides a persistent disk mount

After deploy, confirm:

- `https://your-backend-host/api/health`

### 2. Publish the frontend on GitHub Pages

If you want to deploy the frontend separately, the cleanest approach is to publish with a GitHub Actions Pages workflow that uploads:

- `frontend`

If you prefer branch-based Pages publishing, GitHub Pages only supports the branch root or `/docs`, so you would need to copy this frontend into one of those locations first.

### 3. Point the frontend at the hosted backend

This frontend now accepts an API origin through the URL:

- `https://<your-pages-site>/?api=https://<your-backend-host>`

The `api` value is saved to `localStorage`, so you only need to open that URL once per browser. To clear it:

- `https://<your-pages-site>/?api=reset`

If you want to hardcode the API instead, set it directly in `frontend/config.js`.

### 4. Demo caveat for SQLite

- If your backend host uses an ephemeral filesystem, leaderboard and daily cache data can reset on restart or redeploy.
- If you need the data to survive restarts, mount persistent storage and point `DB_FILE` at that mounted path.

## Assumptions

- I added a `runId` field to keep ranked score progression verifiable across stages.
- The SQLite schema extends the original `sessions` table with server-owned run and score state fields needed for validation.
- Daily challenge generation is deterministic by date and cached in SQLite after first request.
