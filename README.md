# Self-Sport

A lean, self-hosted, single-user training app: reads your Strava data, tracks fitness and fatigue,
and will build adaptive running + strength plans. Design: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

**Status:** milestone 1, which covers Strava login, activity sync, the activity list, daily training
load (fitness / fatigue / form, acute:chronic ratio) and weekly running volume.

## Setup

1. Create a Strava API app at <https://www.strava.com/settings/api>.
   Set **Authorization Callback Domain** to `localhost` (or your server's domain when deployed).
2. Configure:
   ```sh
   cp .env.example .env   # then fill in STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET
   npm install
   npm run dev
   ```
3. Open <http://localhost:5173> and click **Connect with Strava**. The first sync imports your
   whole history in the background. The page updates while that runs.

The first athlete to connect becomes the only allowed one, unless you set `ALLOWED_ATHLETE_IDS`.

> npm 10 may crash on install (`Cannot read properties of null (reading 'edgesOut')`). If so, run
> `npx npm@11 install`.

## Scripts

| Command               | What it does                                                    |
| --------------------- | --------------------------------------------------------------- |
| `npm run dev`         | Dev server                                                      |
| `npm test`            | Unit tests (engine + mappers)                                   |
| `npm run check`       | Type check                                                      |
| `npm run build`       | Production build (`node build` to run)                          |
| `npm run db:generate` | Create a migration after changing `src/lib/server/db/schema.ts` |

Migrations in `drizzle/` are applied automatically on startup.

## Deploy (Docker)

```sh
docker build -t self-sport .
docker run -p 3000:3000 -v self-sport-data:/app/data --env-file .env \
  -e ORIGIN=https://your.domain self-sport
```

## Layout

```
src/lib/server/
  db/            Drizzle schema + client (SQLite)
  sources/       DataSource interface; strava/ (OAuth, API, mapper, sync)
  engine/        pure, tested logic — metrics/load.ts (TRIMP, CTL/ATL/TSB), metrics/volume.ts
  jobs/          background sync
  auth.ts        single-user sessions
  dashboard.ts   queries that feed the pages
src/routes/      / (today), /activities, /settings, /auth/*
```

## How load is computed

- **With heart rate:** Banister TRIMP from avg HR, max HR and rest HR. Max HR defaults to the highest
  value recorded in the last year, and rest HR defaults to 55. You can override both in Settings.
- **Without heart rate:** moving time × a per-sport factor, calibrated to roughly match an easy run.
- **Fitness** = 42-day and **fatigue** = 7-day exponentially weighted load. **Form** = yesterday's
  fitness − fatigue.
- The acute:chronic bands (0.8–1.3 "usual") are a common heuristic, not a validated injury
  predictor.

Known gaps: activities deleted on Strava stay here, because there's no webhook yet. Edits are only
picked up if the activity is less than 3 days older than your latest one.
