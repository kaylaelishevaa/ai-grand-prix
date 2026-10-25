# Integrated Home, Call and Explore

The public Site builds the app in `apps/coupi-live` with Vinext and runs it on Cloudflare Workers. Home, the embedded call and Explore share one profile, confirmed preferences, generated worlds and product evidence. The current call controls and reviewed preview catalog are preserved. The original root HTML implementation remains as source history; the Worker no longer intercepts routes to serve those old pages.

## Run the public-site runtime locally

From the repository root, use Node 22.13 or newer:

```sh
npm ci
npm run setup:worlds
cp .env.example .env.local
# Fill in your own OPENAI_API_KEY; keep OPENAI_MODEL and OPENAI_REALTIME_MODEL server-side.
npm run build
# Once per fresh local database, apply the initial schema:
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_coupi_storage.sql
npm run dev
```

Open `http://127.0.0.1:5173/`. Keep an existing `.env.local` when updating. Root and nested dependencies have separate lockfiles, so both installation commands are needed. Local database state lives in ignored `.wrangler/state`; API keys and runtime data are never committed or packaged.

`npm run build` creates `dist/server/index.js` and the associated client assets. `npm start` runs that built Worker locally. `dev:sites`, `build:sites` and `start:sites` are explicit aliases. Do not package an old `dist` directory after a failed build.

## Persistence and request isolation

`.openai/hosting.json` declares the `DB` D1 binding. Sites provisions the database and applies the committed schema-only Drizzle migration at publication. Local and hosted databases are separate; local test records are not uploaded.

The server stores profiles, households, household membership indexes and model-response cache entries in D1. Worker bindings and secrets are carried by request-scoped AsyncLocalStorage. They never mutate global `process.env` or reach browser code. An absent Worker database binding fails explicitly instead of falling back to ephemeral files.

Profile and household updates compare independent storage versions and commit in one D1 batch. A stale version aborts the entire batch with HTTP 409. Expensive model calls are not automatically repeated after conflicts. Unchanged reads do not write or increment versions. HTTPS session cookies are HttpOnly, SameSite=Strict and Secure.

## Optional Node runtime

The same app still supports a conventional Node server with local file storage:

```sh
npm run dev:node
# Or:
npm run build:node
npm run start:node
```

This uses `http://127.0.0.1:3007/`. The launcher loads root `.env.local` without logging it. Profiles and response caches stay under the nested app's ignored `.data` and `.cache` directories. This is a separate local store; it is not synchronized with D1.

## Validation

```sh
npm run check
npm run test:worlds
npm run typecheck:worlds
npm run build
```

The storage tests use real local D1 through Miniflare and cover isolation, version conflicts and rollback of multi-document household writes. The call tests retain the parent bridge's checked-response, preference-review and world-navigation contracts.

`source-manifest.json` records the original integration archives and their hashes. It is provenance for that import, not a claim that later edited files are unchanged. The Git history records subsequent call updates and the Worker/storage port.
