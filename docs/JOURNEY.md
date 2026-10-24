# Coopy's five-step journey

The default app follows **hatch → first call → world → district → delegation → approval**. The last two actions belong to the fifth step: Coopy prepares work and the customer approves it. `/guided` retains the optional day-story and its scripted future chapters.

The Call and Head controls remain available throughout the app. Call has one conversational interface; users supply words, voice input, a camera frame, or an uploaded photo. There is no comparison/scan/buy mode selector. The first call leads five story questions; later calls infer the shopping or conversational intent from the submitted context.

## The returning homepage and its worlds

After the first journey, the default homepage opens on **Your worlds**: the user's personal districts shown as 3D diorama cards with their provenance and saved-moment counts. **Worlds to explore** provides curated starting points for other occasions. These starters are authored previews, not popularity rankings or evidence of other users' behavior.

Opening a starter shows a full diorama with working product hotspots. **Make it mine** submits its scenario plus the user's optional words to live world generation, using current permitted memory and budget. The result becomes a personal district. Previewing a starter alone does not claim it was personalized or add its scenario to memory.

The renderer supports four distinct room types: **kitchen, desk, reading and dressing**. Dressing includes a closet and vanity, with recognizable 3D clothes, a bag and cosmetics. Each type has its own room furniture and semantic product positions; scene selection follows explicit context and validated product categories. All four retain the existing WebGL/performance fallback and accessible hotspot behavior.

Every personal district can become a private journal. **Keep this moment** stores the user's note and the current room snapshot; **revisit this moment** opens that saved version even after a rebuild. Notes can be deleted and are not sent to the AI, converted into preference memory, or used to initiate shopping. Privacy here means separation from AI context within the local profile; the app still has no production account authentication.

## What is live, and what is simulated

| Capability | What actually happens |
| --- | --- |
| Interview and later calls | The server sends the user's current message, optional photo, permitted profile context and catalog evidence to the configured OpenAI model. Structured results are validated. Browser voice input/output depends on available browser support; text remains available. |
| Memory | Sourced memory lines and confidence are saved to the server profile and mirrored in localStorage. Deletion removes the underlying evidence used by subsequent model calls. |
| World generation | One structured call selects catalog products and names districts from surviving memory. Another request genuinely regenerates a district from new words. “Make it mine” uses this live generation path for a curated starter. |
| World journal | Manual notes and server-captured room snapshots persist in the profile. Revisit displays the saved scene; journal text is excluded from model prompts and does not earn XP. |
| Verdicts | Real model outputs refer only to the local catalog and seeded review corpus. Review IDs open those exact local reviews. |
| 3D products | Low-poly product meshes are real 3D geometry. Image frames use the local asset mapping when available, otherwise illustrated placeholders. They are not verified manufacturer 3D assets. |
| Product facts and reviews | The 43-SKU catalog, prices, delivery strings and 498 seeded reviews are synthetic demo data. They are not a live Coupang feed. Each added wardrobe/beauty SKU and the key household products used in curated worlds have 16 stable review IDs. |
| Delegation | Code computes a local proposal, applies the cap and price floor, groups pending delivery plans, and persists a status. No seller agent is contacted. |
| Price watching | The item remains pending above its cap. “Check now” rechecks the local catalog; there is no background price-monitoring service. |
| Haggling | A clearly marked simulated quote uses the deterministic floor described below. It is not a merchant's offer. |
| Approval | The local approval ledger and owned list update only after an explicit approval. No payment, Coupang order, seller negotiation or carrier reservation is executed. |

## API contracts

All mutations use the existing same-origin check and server profile session. Keys remain server-side in `.env.local`; they do not appear in client payloads. Profile mutation is serialized per session by `withSession`.

### `POST /api/call`

JSON accepts `{action: "hatch" | "start" | "message", requestId, message?}`. Multipart form requests use the same fields and may include `file` for a JPEG, PNG or WebP image under 8 MB. The server checks image signatures and routes the conversational intent through one interface. See `lib/server/call.ts` for the current structured schema and guard logic.

### `POST /api/world`

```json
{"requestId":"unique-request-id","command":"a quiet desk under ₩100k","districtId":"optional-existing-district-id"}
```

- No existing districts: produces 2–4 districts after the first interview is complete.
- Existing districts with a command: adds one district.
- `districtId` with a command: rebuilds that district, retaining its identity.
- Each district contains 2–6 distinct eligible SKU IDs. Owned items and quarantined categories are excluded.
- The scene kind is derived in code after validation: kitchen, desk, reading or dressing. Explicit new commands take precedence over previous naming; an existing kind keeps ordinary renders stable. Negated objects such as “no makeup” do not create dressing intent by themselves.
- Explicit getting-ready/closet/makeup requests restrict candidates to wardrobe, beauty and contextual home lighting or mirrors. Asking for both a closet/outfit and makeup/vanity requires both wardrobe and beauty products. “No makeup” excludes cosmetic product types. A date dinner stays a kitchen context; a date alone does not establish a dressing-room need.
- A district's total uses catalog prices and cannot exceed the profile budget or a lower explicitly parsed command cap.
- Every provenance reference must correspond to current permitted memory. Returned references are mapped back to the actual memory IDs.
- Request IDs prevent duplicate mutations. They are excluded from the model request so an otherwise identical rehearsal can replay from cache.

Response: `{districts, profile, meta?}`. State is persisted in `profile.journey`. There is a 12-district limit to keep the local app bounded.

### `POST /api/world/journal`

Add a private manual note with `{action:"add", districtId, requestId, text}`. Delete one with `{action:"delete", districtId, requestId, entryId}`. The response always contains `{profile}` with an optional current `district` or `archive` convenience field. Deletion uses the same contract for active and archived journals.

Each district allows 100 notes of up to 1,000 characters. Every saved note captures the district name and scene from the server's current profile, plus its timestamp; the client cannot supply a forged snapshot. A rebuild preserves the district's original creation date and existing note snapshots, so the journal can revisit its earlier room. Request IDs prevent duplicated writes and prevent an old add retry from resurrecting a deleted note.

Journal notes do not become memory, enter model prompts, earn XP or trigger shopping. If deleting a source memory invalidates a district, its manual notes and saved snapshots move to `profile.journey.archivedJournals`. The current recommendations and provenance are removed; the archive never recreates them or supplies AI context. Archived notes remain independently deletable, and deleting the last note removes that archive.

### `POST /api/delegate`

```json
{
  "action":"assign",
  "skuId":"kettle",
  "budgetCap":39000,
  "watchPrice":true,
  "haggle":true,
  "bundle":true,
  "scheduleDelivery":true,
  "source":"your morning district"
}
```

`budgetCap` applies **to this item**, not every pending item. Bundling records the IDs of other pending eligible items for a delivery plan; their caps and approvals remain independent. Refreshing uses `{action:"refresh", id:"decision-id"}`.

Response: `{profile, decision?, blocked?}`. A decision's optional `delegation` contains the selected options, cap, quote, discount, floor, status, bundle IDs, delivery plan, last checked time, and `simulation: true`.

The local negotiated floor is `max(catalogPrice − 4000, ceil(catalogPrice × 0.85 / 100) × 100)`. A haggle proposal uses that floor; an ordinary proposal uses catalog price. If the quote is over the cap, price watching must be enabled and the decision stays `watching`. Otherwise it becomes `haggled` or `ready`.

### `POST /api/decisions`

Approval stays in the existing route: `{action:"approve", ids:[...]}`. The guard runs again at approval time, checking ownership, quarantine, sleep-on-it, delegation status, cap, quote arithmetic and floor. Calling this route directly cannot approve a watching or out-of-budget item. Approval never awards XP.

`lib/delegation-policy.ts` exposes `decisionPrice`, `decisionApprovalIssue` and `negotiationFloor` for consistent presentation of the server rules.

## Cache and data boundaries

World and call generation reuse `structuredCall` and the response cache. The cache key includes the operation, model, instructions, structured schema and grounded request; image requests use an image hash rather than image bytes. Responses log token counts and latency to the server console.

`DEMO_OFFLINE=1` permits only validated cache hits. A missing rehearsed request returns `OFFLINE_CACHE_MISS` without contacting the provider. A different profile, deleted memory, changed catalog, new image or different wording can correctly produce a cache miss. Rehearse the intended path again after changing those inputs.

Generated responses and profile state are local files. Images are processed for the submitted vision request; the app does not add uploaded image bytes to its profile or response cache. Provider-side handling follows the configured API service, rather than a claim that no remote processing occurs.

## Coupang integration boundary

`data/product-images.json` currently has no verified merchant images. A demo SKU must not be silently linked to a similarly shaped real product: its model, attributes, price and review corpus would not match. The app's external link therefore says **“Find similar products on Coupang”** and opens a search, rather than pretending the seeded reviews belong to a real listing.

On 25 October 2026, direct checks of three official Coupang product pages returned HTTP 403 in the available research tool. Search results exposed indexed product pages but included old delivery dates; those results are not sufficient to claim current price, availability or fulfillment. Coupang's [Open API FAQ](https://developers.coupang.com/en/faq/do-i-have-to-pay-for-coupang-open-api-service) describes a seller-facing service, and its [API key guide](https://developers.coupang.com/en/faq/where-can-i-issue-check-api-keyaccesskey-secretkey) requires Wing-issued credentials. That is not evidence that this demo has a consumer catalog, reviews or checkout API connected.

A real integration must introduce verified listing/variant IDs, a source URL and retrieval timestamp for each product, licensed or permitted image assets, a provenance-labelled review corpus, and actual authorized merchant/price/fulfillment adapters. Keep the synthetic dataset separate until those mappings exist. Do not reuse seeded reviews as if they were merchant reviews.

## Verification

Record the full journey with the configured real model, then replay it from the response cache:

```sh
npm run rehearse:journey
DEMO_OFFLINE=1 npm run rehearse:journey
```

The script runs hatch, five predetermined **input answers** interpreted by the real model, world generation, a focused product verdict, delegation, and explicit approval. It also checks the owned-detergent refusal before a provider call, the 2am approval lock, and unchanged XP on approval. There are no canned model outputs. Its demo profile lives only in the CLI process; it does not overwrite browser profiles. Negotiations and orders remain the same clearly labelled local simulation as the app.

The CLI freezes its clock at `2026-10-25T03:00:00.000Z` (noon in Seoul), including confidence-decay calculations, so dates and profile inputs do not silently change between rehearsals. This affects only that CLI process. Offline mode also blocks any attempted `fetch`; a successful replay reports zero network requests. Run with the same model, code, catalog and answers to reuse the cache. A genuine model refusal, invalid output or cache miss fails loudly instead of substituting a scripted result.

To include the permanent photo call, use the identical photo bytes and message in both runs:

```sh
npm run rehearse:journey -- --photo=/absolute/path/fridge.jpg --photo-message="Can you look for visible gaps?"
DEMO_OFFLINE=1 npm run rehearse:journey -- --photo=/absolute/path/fridge.jpg --photo-message="Can you look for visible gaps?"
```

The photo call may return a grounded inventory, comparison, verdict or one clarification according to the image and context. `npm run rehearse:journey -- --help` lists the options.

`tests/world.test.ts`, `tests/delegation.test.ts` and `tests/world-routes.test.ts` cover grounded district references, hard budgets, deletion and quarantine, additions/rebuilds, idempotency, simulated price floors, approval bypass attempts, ownership, nighttime locks, persistence and offline cache replay with no network request.

These tests use provider fixtures; they do not establish a live merchant connection or real-world model quality.
