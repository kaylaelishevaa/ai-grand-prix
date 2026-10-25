# Main + live worlds integration

This is an explicit **Node / Next.js runtime integration**, preserving the inspected latest main source at `7e5b085e28ee598ddb3afb9edc69a50ae8d51bc5`. The first-call discovery and editable preference review remain a selective port from `12079efb0b9359314232ff2bcfb71efe511d321f`. It runs one server: main-styled Home, Call and the formerly empty Explore surface now share the live profile, generated worlds, evidence and approval flow. It does not run a second frontend, proxy the world app, or require a Cloudflare worker for the live journey.

The integrated call also carries the caption, camera and manual hang-up improvements from main `b3ed680`: the latest spoken text stays readable in the caption panel, camera controls remain explicit, and the shopper's hang-up action ends the call. These are selective updates to the embedded call, alongside the existing checked transcript bridge and server-backed draft review. They do not replace the canonical profile with main's separate local preference store, bypass the review confirmation, or enable camera/microphone automatically.

The newer camera-ready call controls from main `7e5b085` remain intact in the preserved root source. The integrated Next.js call currently uses the selective port described above; this package does not claim every later call change has been ported.

The complete app is under `apps/coupi-live/`. Its explicit, empty `postcss.config.mjs` keeps plain-CSS builds isolated from main’s Tailwind/PostCSS plugins. Main's original source files, worker, HTML pages, product assets, connector scaffolding and dependency lock remain in place. The two intentional root changes are `package.json` scripts and appended `.gitignore` entries. Exact originals are preserved under `integration/`; its manifest records SHA-256 hashes of original main and copied application source files. Existing main and app catalogs are separate files; no synthetic reviews are silently assigned to sourced products.

## Run the integrated app

Use Node 22.13 or newer. From the integration root:

```sh
npm run setup:worlds
cp apps/coupi-live/.env.example .env.local
# Edit .env.local locally: OPENAI_API_KEY and OPENAI_MODEL are server-only.
npm run dev
```

Open `http://127.0.0.1:3007/`. Home, `/call`, and `/explore` use the main shell; `/demo` provides the separate phone presentation. A fresh profile starts with the hatch and optional first conversation. Preference proposals remain drafts until the editable review is explicitly confirmed. User stories and saved state are local to this Node app.

The launcher loads root `.env.local` without logging its contents, then invokes the app with its working directory under `apps/coupi-live`. Ambient environment variables take precedence. The child's `.data/` and `.cache/` remain local and ignored. All checkout, delivery, return and negotiation actions are clearly labelled simulations; no merchant order or payment is placed.

```sh
npm run test:worlds
npm run typecheck:worlds
npm run build
npm run start
```

`setup:worlds` installs the nested app from its own lockfile. Root `npm ci` alone installs main's legacy dependencies, not the new app. The launcher fails with the setup instruction if the child dependencies are missing. API keys and rehearsal caches are never bundled. `DEMO_OFFLINE=1` requires rehearsing the exact path into that app's cache first; a cache miss fails visibly.

## Original Sites runtime

The original commands are retained as `dev:sites`, `build:sites` and `start:sites`. Their original dependencies and deployment scripts remain available. That legacy worker still serves its original static Explore page and does **not** gain the Node filesystem profile/cache APIs. Do not present the legacy deployment as the integrated live app.

The runtime switch is deliberate because the live app requires server-side API keys and persistent local `.data` / `.cache` files. Deploying it requires a Node host with writable durable storage. A future Cloudflare deployment would need an explicit storage adapter and worker route integration; this package does not imply that work has happened.

## Prepare and review without changing main

From the live app workspace, using a trusted extracted main archive:

```sh
node scripts/prepare-main-integration.mjs --main /path/to/extracted-main --out /private/tmp/coupi-main-integration
```

The output must be new or empty and separate from both inputs. The packager uses an allowlist for application source and excludes secrets, runtime state/cache, dependencies, builds, symlinks and artifact bundles. It does not copy an active `.env.local`, install packages, make provider requests, deploy, or publish to GitHub.

Publish only from a branch created from the actual current main commit. Copy the reviewed integration tree onto that branch, verify main has not advanced, inspect the manifest/diff, run the app checks, then create a pull request explaining the default Node runtime switch. The old independent feature history must not be force-merged into main. Archive commit labels in the manifest are provenance, not a fabricated parent commit or proof that Git ancestry was fetched.
