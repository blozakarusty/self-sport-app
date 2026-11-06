# Self-Sport

A lean, self-hosted, single-user training app: reads your Strava data, tracks fitness and fatigue,
and will build adaptive running + strength plans. Design: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

**Status:** milestones 1–4.

- **Today:** fitness / fatigue / form, acute:chronic ratio, weekly running volume, running fitness summary
- **Activities:** list plus a detail page with splits, laps and best efforts
- **Performance:** VDOT estimate, Daniels training paces (overridable), race predictions, pace at easy HR
  trend, personal records by year, manually entered race results
- **Insights:** hours per month by sport, running intensity mix, longest run per week, load by sport
- **Plan:** a week-by-week plan to race day inside the macro phases. Runs follow progression ladders
  (strides and fartlek → threshold and intervals → goal-pace work; long runs with goal-pace finishes),
  paces come from your current fitness. Strength: legs and core on Thursday, upper body on the weekend,
  with sets × rep ranges, your kettlebells and a focus tag per exercise; grease-the-groove pull-ups on
  weekdays. Strava activities are matched to sessions; move or skip sessions with rule warnings; season
  overview of planned vs actual km
- **Goals:** a race goal (distance, date, target time) with the VDOT it needs, a progress bar against an
  "expected by now" path, readiness bars (weekly volume, longest road run, km at goal pace) and macro
  phases (base → build → peak → taper) with running and strength focus per phase
- **Strength:** working weights per exercise (they feed the plan); tag Strava strength sessions as push / pull / legs with an effort score (session RPE turns
  into training load); benchmarks such as strict pull-ups (target 10), push-ups, KB swings, pistols,
  plank and body weight, with suggested targets and re-tests at the end of each phase

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

Run details (splits, laps, best efforts) are fetched 40 runs per sync, newest first, to stay inside
Strava's daily rate limit; a long history takes a few hours of hourly syncs to fill in.

**VDOT** is the best effort ≥ 1.5 km in the last 120 days (best efforts within runs, plus results you
enter), minus 0.5 points per 30 days of age. Training runs are usually submaximal, so without a recent
race it tends to underestimate fitness; enter a race or time trial on the Performance page to correct it.

**Intensity mix** classifies runs by average HR (zone 1–2 easy, zone 3 moderate, above hard); on road runs
with laps, any lap at threshold pace or faster counts as hard.

Known gaps: activities deleted on Strava stay here, because there's no webhook yet. Edits are only
picked up if the activity is less than 3 days older than your latest one.
