# RealEstateLens

**What does my budget really buy?** RealEstateLens takes what you are looking for (city,
neighborhood, rooms, must-have features, budget), checks it against real past deals, and shows:

- how many matching apartments actually sold within your budget,
- what the budget typically buys in that city,
- which single compromise (a feature, a room, another neighborhood, a nearby city, a bit more
  budget) would help most, and
- optionally, a **personal** ranking of those compromises written by an LLM, based on what you
  said is easy or hard for you to give up.

The whole product is in Hebrew and right-to-left. The code, API identifiers and logs are in
English.

Live: <https://realestatelens.onrender.com> (registration needs a code from the administrator).

---

## The one rule behind every decision

**Nothing is claimed that the data does not support.** Every number on screen comes from our
deals or from a declared official source (the Central Bureau of Statistics, CBS). This rule
shaped most of the design:

- Too few matching deals (fewer than 3) → no percentage and no conclusion, just "not enough data".
- A deal that doesn't say whether it has parking can't count as "has parking" – it is reported
  separately as "may match, data missing".
- Distances come only from official CBS coordinates. A locality without them is never called
  "nearby"; nothing is estimated.
- The LLM may only **choose and explain** among compromises we computed. It cannot add
  compromises, numbers, or outside knowledge (schools, transport, forecasts). A validator
  enforces this before anything is shown.

---

## Quick start

Requirements: **Node 24** (see `.nvmrc`). Nothing else – without `DATABASE_URL` the server
uses an embedded Postgres ([PGlite](https://pglite.dev)) stored in `apps/server/.pglite`.

```bash
npm install
npm run build -w @rel/shared                      # server and web import its build
cp apps/server/.env.example apps/server/.env      # defaults work as-is

# first user (prompts for a password, min. 10 characters)
npm run user:add -w @rel/server -- you@example.com

# two terminals
npm run dev -w @rel/server                        # API on http://localhost:3000
npm run dev -w @rel/web                           # app on http://localhost:5173
```

On first start the server applies migrations, imports the deals spreadsheet, loads the official
localities and the CBS price index, then builds the in-memory market. To manage users and the
registration code, put your email in `ADMIN_EMAILS` and restart; an "ניהול" link appears.

Personal recommendations need `GEMINI_API_KEY` (and/or `OPENAI_API_KEY`). Without a key the
app works fully and shows the automatic ranking instead.

| Command                                      | What it does                                  |
| -------------------------------------------- | --------------------------------------------- |
| `npm test`                                   | all tests (server, web, shared)               |
| `npm run lint` / `npm run typecheck`         | ESLint / TypeScript across the workspaces     |
| `npm run format:check`                       | Prettier                                      |
| `npm run build`                              | shared → server → web                         |
| `npm run seed -w @rel/server`                | re-import the spreadsheet (idempotent)        |
| `npm run localities:snapshot -w @rel/server` | refresh the committed CBS localities snapshot |

---

## Repository layout

```
packages/shared   Zod schemas, enums and DTO types – one contract for server and client
apps/server       Express 5 + TypeScript, Drizzle ORM, Postgres (Supabase) / PGlite
  services/assessment/       the engine: pure functions over the in-memory market
  services/recommendation/   the LLM layer: input, prompt, validator, fallback, caching
  clients/                   CBS, data.gov.il, Gemini, OpenAI – timeouts, retries, circuit breaker
  import/                    spreadsheet reader + normalizers (cities, dates, numbers, booleans)
  repositories/  controllers/  routes/  middleware/  db/  scripts/
apps/web          React 19 + Vite, TanStack Query, Tailwind 4, Motion
```

---

## How it works

### 1. Data in

| Source                                  | Used for                               | If it is unavailable        |
| --------------------------------------- | -------------------------------------- | --------------------------- |
| `apps/server/data/madlan-sample.xlsx`   | 530 rows → 518 deals                   | –                           |
| CBS dwelling price index (series 40010) | expressing prices in today's terms     | last stored values are used |
| CBS localities file (data.gov.il)       | 1,484 localities, official coordinates | committed snapshot is used  |

The spreadsheet is messy: 29 spellings for 18 cities, stray spaces, mixed
Hebrew/English, duplicate deal ids with different prices, an empty `has_parking` in 20 rows,
prices of 0. The import normalizes every field (Unicode, quotes, spacing, date formats, number
formats), matches city names through aliases and typo tolerance, treats an empty value as
**unknown** (never as "no"), keeps the later of two duplicates, and records every rejected row,
warning and removed duplicate in `import_runs` / `import_issues`. It is idempotent – running it
again updates the same rows.

Static reference data follows one pattern: **memory → database → external source**, storing
whatever is fetched, with a committed snapshot as the last resort. The price index is refreshed
monthly (CBS revises its latest months); the localities file is checked at most every 6 months.

### 2. The assessment engine (no LLM involved)

`GET /api/v1/market-assessments` – pure functions over a market snapshot held in memory:

1. **Adjusted price** = price × (latest index ÷ index in the deal's month). The UI says these are
   estimates and shows the original price next to them.
2. **Comparable pool** – deals in the city (and neighborhood) that meet every _required_
   feature, regardless of price. Rooms match within ±0.5.
3. **Match rate** – the share of the pool sold at or below the budget, with a confidence level by
   pool size: under 3 = none, 3–4 low, 5–14 medium, 15+ high.
4. **Compromises** – each relaxes exactly one requirement and is kept only if its own pool has
   at least 3 deals and it actually improves the rate: drop a feature, one room less, any or the
   best other neighborhood, a city within 25 km, or the budget at which half the pool becomes
   affordable (offered only up to 1.5× the budget).
5. **What the budget buys** (middle 50% of rooms and size), **the "house"** (how many affordable
   deals have each part), and up to 10 **reference deals** – the evidence behind the numbers.

Every threshold lives in one file (`services/assessment/config.ts`) and is returned with the
result, so the UI can explain it.

### 3. The personal recommendation (LLM)

`POST /api/v1/compromise-recommendations` – only when the user asks for it.

- **Input:** the top 6 computed compromises as short ids with display-ready facts, plus the
  user's 1–5 ratings of how hard each requirement is to give up. Compact JSON, English
  instructions (fewer tokens), Hebrew answer.
- **Output:** up to 3 picks with a one-sentence reason, enforced by a JSON schema.
- **Validation before anything is shown:** every pick is one of our candidates, cites at least
  one of its facts and one of the user's ratings, and **every number in the reason appears in
  what it cited**. It must also be Hebrew only, short, and free of forecast or outside-knowledge
  phrases. One repair attempt with the errors; if still wrong → the automatic ranking.
- **Order is ours, not the model's:** easiest to give up first.
- **Cost:** answers are cached by a hash of exactly what the model saw (memory, then database),
  so identical questions are free; 20 personal recommendations per user per day; at most 300
  model calls per day for everyone together (`LLM_DAILY_CALL_LIMIT`), after which everyone gets
  the automatic ranking until midnight (Israel time).
- **Failure:** 8 s timeout, no retries while the user waits, a circuit breaker per provider
  (Gemini first, OpenAI second), and `LLM_ENABLED=false` as a kill switch. The UI labels the
  result "המלצה אישית" or "המלצה אוטומטית" – it never pretends.

---

## Decisions and why

| Decision                                                    | Why                                                                                                              |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| One service: Express serves the API and the built React app | One deploy, one origin – the session cookie needs no cross-site setup and there is no CORS.                      |
| The market lives in memory, priced once per load            | Assessments never touch the database; 518 deals fit easily, and results are cached per query (LRU).              |
| Postgres via Drizzle; PGlite locally and in tests           | The same SQL and migrations everywhere, with zero setup for a new developer.                                     |
| Supabase for the database (not Neon)                        | Neon's free tier counts compute hours, and steady traffic would exhaust it mid-month.                            |
| Gemini Flash first, OpenAI second                           | Cheapest model that answers this well; a second provider for outages.                                            |
| The LLM ranks, never computes                               | Numbers come from code we can test; the model adds what code can't – weighing _this_ user's priorities in words. |
| Stateless JWT in an httpOnly cookie, 24 h                   | No session store; a stolen copy stops working within a day. A blocked user is locked out within 60 s.            |
| Registration with one shared code, replaceable at any time  | Simple to share; if it leaks, replacing it kills the old one instantly. Plus per-IP limits.                      |
| 204 when there is nothing at all to show                    | "No data" is an answer, not an error; the client shows a clear message.                                          |
| Database unreachable → 503 + `Retry-After`                  | It is temporary, not the user's fault; users stay logged in and cached data keeps being served.                  |

---

## Reliability, scale and security

- **Built for 10,000+ requests a day.** Locally the full app on real data handled ~700 requests
  per second with 50 concurrent connections, p99 112 ms, no errors (mostly uncached queries).
  10,000 a day is about 0.1 per second on average.
- **When data is missing or wrong:** unknown values stay unknown, too-small samples draw no
  conclusion, failed external sources fall back to stored data or snapshots, a failed market
  reload keeps serving the previous one, and cache/usage bookkeeping never breaks a request.
- **Errors:** one shape, `{ "error": { "code", "message" } }`, with the message in Hebrew and
  the right status (400 / 401 / 403 / 404 / 409 / 413 / 414 / 429 / 503 / 500).
- **Logs:** pino JSON to stdout; everything from `info` up is also stored for 30 days and shown
  on the administrator's log screen, with request id, user, status and duration. Cookies,
  authorization headers and passwords are redacted.
- **Security:** Argon2 password hashes, the same answer and similar timing whether or not an
  email exists, login limited per IP and email, Helmet with a strict CSP, the registration code
  stored only hashed and encrypted, API keys only in headers (never in URLs that get logged).

---

## Tests and CI

About 475 tests (Vitest; React Testing Library on the client). Every push runs format check,
lint, build, typecheck and all tests on GitHub Actions; Render deploys only after CI passes.
Server tests run against a real in-memory Postgres, not mocks, including an end-to-end test on
the real spreadsheet that checks the engine's guarantees. LLM providers are faked in tests and
the validator is tested against invented numbers, outside knowledge and malformed answers.

---

## Deployment

[`render.yaml`](render.yaml) defines one free web service on Render (Frankfurt), with the
database on Supabase (Frankfurt) through the **Session pooler** connection string (Render has
no IPv6). Render generates `JWT_SECRET`; three secrets are entered in its dashboard:
`DATABASE_URL`, `GEMINI_API_KEY`, `ADMIN_EMAILS`.

The first administrator is created from a developer machine, directly in production:

```bash
cd apps/server
# .env.production holds DATABASE_URL (git-ignored)
npx tsx --env-file=.env.production src/scripts/addUser.ts you@example.com
```

Free-tier notes: the Render service sleeps after 15 minutes without traffic (the first request
then takes about a minute), and Supabase pauses a project after a week without activity.

All other settings have safe defaults – see
[`apps/server/.env.example`](apps/server/.env.example) and
[`apps/server/src/config/env.ts`](apps/server/src/config/env.ts).

---

## Known limits

- The deals are a small sample (518 deals, 20–40 per city, apparently synthetic), so many
  searches honestly end with "not enough data".
- Rate limits are kept in memory – correct for one instance; several instances would need a
  shared store (Postgres or Redis).
- Each assessment scans all deals per compromise. That takes milliseconds at this size; a much
  larger dataset would need an index by city.
