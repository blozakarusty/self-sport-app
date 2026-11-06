# Self-Sport — Architecture (v0 proposal)

A lean, single-user, self-hosted Runna-style app: reads Strava, builds and adapts
hybrid running + strength plans, exports structured runs to Garmin.

## Decisions so far

| Area        | Choice                                                                                                     |
| ----------- | ---------------------------------------------------------------------------------------------------------- |
| Plan engine | Hybrid: deterministic rules engine builds the plan; Claude (optional) tweaks and explains it within limits |
| Stack       | SvelteKit (adapter-node) + SQLite (Drizzle + better-sqlite3), TypeScript everywhere                        |
| Strength    | Programmed **and** logged in-app (exercises, sets, reps, load, progression)                                |
| Users       | Single user, self-hosted (Docker on a small VPS / Fly.io with a volume)                                    |
| Goals v1    | Race goals (distance + date + optional target time + elevation) and hybrid strength+run balance            |
| Adaptation  | Weekly auto-adjust (planned vs actual)                                                                     |
| Delivery    | Mobile-friendly PWA, Garmin structured workouts (.FIT)                                                     |
| Insights v1 | Load & fatigue, pace zones & PRs, strength progression                                                     |

## What your Strava data says (shapes the defaults)

From Strava, last ~3.5 months:

- **Metric**, 83 kg, HR zones based on max HR (Z2 130–161 bpm).
- **Ultra/trail runner**: 104.6 km "FTC 202" on 2026-10-10, 58.9 km trail (1,911 m gain) on 2026-08-01.
  → Goals must support **any distance + elevation**, not only 5K–marathon.
- Typical week: 4–5 runs, long runs 20–33 km, easy pace ~5:10–5:30 /km, some intervals (400 m x 10, 5x3 min).
- **Tennis 1–3x/week** and occasional rides → the load model must be **multi-sport**, and tennis should be modeled as fixed weekly commitments.
- WeightTraining ~1x/week, 20–60 min, no detail in Strava → confirms in-app logging.
- PRs: 5K 19:38 (2025-11), 10K 43:54 (2025-03), HM 1:43:06 (2023). The Strava "marathon PR" (5:42:26) is a split from inside the ultra.
  → The pace engine should use **recent short efforts**, not all-time bests from long efforts.
- You are ~4 weeks after the 104 km and running ~2x/week easy → the first plan should start with a **recovery/rebuild phase**.

## Project layout

```
src/
  lib/
    server/
      db/            schema.ts (Drizzle), migrations/, client.ts
      sources/       DataSource interface + strava/ (oauth, sync, mapper)
      engine/        PURE TS, no I/O, unit-testable
        metrics/     load.ts (TRIMP → CTL/ATL/TSB, ACWR), pace.ts (VDOT → zones, predictions),
                     strength.ts (e1RM, volume per muscle group)
        workouts/    registry: one file per workout type (easy, long, tempo, intervals,
                     hills, strength-lower, strength-upper, ...)
        planner/     phases.ts, progression.ts, scheduler.ts (constraints), generate.ts
        adapt/       reconcile.ts (planned vs actual → adjustments)
      coach/         Claude layer: prompt + zod-validated JSON patch, guardrails, explanations
      export/        Exporter interface + fit/ (Garmin workout file); ics/ later
      jobs/          sync + weekly adaptation (in-process scheduler or cron → endpoint)
  routes/
    /                today: next session, readiness (TSB), quick log
    /plan            week + calendar view, edit or move sessions
    /log/strength    live gym logging (sets, rest timer)
    /activities      synced history
    /insights        load, pace zones/PRs, strength progression
    /settings        availability, goals, zones, connections
```

## Extension points (how you grow it)

Everything you'd want to add goes behind a small interface, so new features are new files, not rewrites:

1. **`DataSource`** — `sync(since) → NormalizedActivity[]`. Strava now; Garmin Connect, Hevy, Apple Health later.
2. **`WorkoutType`** (registry) — `{ id, discipline, build(params, athlete) → StructuredWorkout, estimateLoad() }`. A new session type is one file.
3. **`Exporter`** — `export(session) → file`. FIT now; ICS, Apple WorkoutKit later.
4. **`PlanTemplate` / phases** — data-driven periodization (base → build → peak → taper → recovery), so new goal types (ultra, trail, "get stronger") are config plus a few rules.
5. **Scheduler constraints** — a list of `(week) → violations` functions, e.g. "no heavy lower body < 48 h before a long run or quality session", "tennis is fixed", "max 10% weekly volume increase", "strength taper in the last 2 weeks". Add a rule by adding a function.
6. **Coach layer** — optional; it can only propose changes within limits the engine checks, so it never breaks the plan.

## Data model (core tables)

- `settings` — units, availability per weekday, long-run day, fixed commitments (tennis), max HR, threshold pace override
- `activities` — normalized (sport, start, duration, distance, elev, avg HR, relative effort, load) + `raw_json`; `source`, `source_id` unique
- `activity_streams` — lazily fetched HR/pace streams for detailed analysis
- `goals` — type, distance, elevation, date, target time, priority (A/B/C race)
- `plans` → `plan_weeks` (phase, target volume, target load) → `planned_sessions`
  - `planned_sessions`: date, discipline (run|strength|other), `workout_type`, `structure_json` (versioned), status (planned|done|skipped|moved), `activity_id` / `strength_session_id` link
- `plan_revisions` — what the weekly adaptation changed and why (audit plus coach explanation)
- `exercises` — name, pattern (squat/hinge/push/pull/carry/core), muscles, unilateral, equipment
- `strength_sessions` → `strength_sets` — exercise, set #, reps, kg, RPE, rest
- `metrics_daily` — cached CTL/ATL/TSB, ACWR, per-discipline load

**Structured workout JSON** (shared by runs and strength, versioned):

- Run: `steps: [{kind: warmup|work|recover|cooldown|repeat, duration|distance, target: {pace|hr|rpe range}}]` maps 1:1 to FIT workout steps.
- Strength: `blocks: [{exercise_id, sets, reps, load: {pct_e1rm|rpe|kg}, rest_s}]`.

## Key flows

- **Sync**: Strava OAuth (login = your athlete ID allowlist) → initial backfill (paged, within Strava's rate limits) → incremental on app open + nightly. Webhook later, if you want per-activity updates.
- **Generate plan**: goal + current fitness (CTL, recent volume, VDOT) + availability → phases → weekly volume curve → place key sessions (long, quality, strength) → fill easy runs → check constraints → optional coach pass.
- **Weekly adapt** (Sunday night): match activities to planned sessions → compliance %, load vs target, TSB trend, missed key sessions → rules adjust the coming 1–2 weeks (repeat a week, cut volume, push or pull a strength block) → coach writes the explanation.
- **Strength load**: sRPE × duration (logged RPE) feeds the same daily load as runs and tennis (from HR / relative effort).

## Notes / caveats

- Strava's API agreement restricts how API data may be used with AI (notably model training). For personal use, the coach layer sends only **aggregated summaries** and is optional, so the app works fully without it. Check the current terms before deploying.
- Garmin: a `.FIT` workout file can be copied to the watch over USB, or imported via Garmin Connect. Pushing directly through the Garmin Training API needs developer program approval, so that's a later module.

## Milestones

1. ✅ Scaffold, Strava OAuth, sync, activity list, daily load metrics (load computed on demand, no cache table yet)
2. ✅ Pace zones / VDOT, insights dashboards (run details sync, Performance + Insights + activity detail pages)
3. ✅ Goals + strength: race goal with fitness gap, readiness and macro phases; push/pull/legs tagging with session-RPE load; strength and muscular-endurance benchmarks (kettlebell, bodyweight, paralettes)
4. ✅ Planner: week-by-week runs (progression ladders, flat-terrain friendly), push/pull/legs strength with rep ranges and focus, grease-the-groove pull-ups, plan vs actual matching, week and season views
5. Weekly adaptation + Claude coach layer
6. Garmin FIT export

## Open questions (for the next round)

- Next goal race? (distance, date, elevation, target)
- Weekly availability: which days, how much time, preferred long-run day, fixed tennis slots?
- Strength focus: running-support (single-leg, posterior chain, core) vs general strength/hypertrophy; equipment (gym vs home)?
- Should completed in-app strength sessions also be posted to Strava (needs the `activity:write` scope)?
