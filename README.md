COUPI is a local Next.js app: real taste learning, scenes, shopping answers and photo inventory over a finite synthetic catalog. Free mode is the default at `/`; the optional day story is at `/guided`. The two video-call chapters and 2030 epilogue remain labeled concept simulations.

Use Node.js 22 or newer. From this directory:

```sh
npm install
npm run dev
```

Open [http://127.0.0.1:3007](http://127.0.0.1:3007). COUPI uses port 3007 to avoid other apps running on 3000. This version needs its local server; double-clicking the old HTML does not launch the live app.

Copy `.env.example` to `.env.local` and set your own `OPENAI_API_KEY` there, server-side, with `OPENAI_MODEL=gpt-5-mini` and `DEMO_OFFLINE=0` for live use. Restart the server after changing these settings. Never prefix the key with `NEXT_PUBLIC_`, put it in browser code, or commit it. `.env*`, `.data/` and `.cache/` are ignored by Git. No key is needed for a fully cached offline replay, but the same model name is still required.

Try the core loop:

1. Ask, scan, rebuild a scene, or use the optional Idle game. Every meaningful event immediately writes a memory with text, source, confidence (0–1), and createdAt. No swipe count or model summary is needed.
2. Generate a scene, then enter your own “change the vibe” command.
3. Ask a shopping question. Use the microphone in a supported browser, or type in the same box. Open citations, **Why**, and **Read all reviews** to inspect the seeded evidence.
4. Open Its Head to see confidence bars and provenance. Tentative evidence fades with a 14-day half-life (90 days for stronger evidence); **Still true** restores confidence. Correct or erase a line, then ask again. Erasure removes its linked traits and historical vote contributions from future model context.
5. Upload a JPG, PNG or WebP photo, up to 8 MB. Inventory gaps with catalog matches enter Decisions for your approval.
6. Enable **pretend it’s 2am** in Its Head and add an item. The morning lock is enforced by the server. Turn it off during local morning and cancel a held item. Three distinct mornings of cancellations teach “night adds often cancel.” Ask to buy laundry detergent to see the owned-item refusal before any model call.

The critical feedback loop: ask for red socks, choose a pricier, better-reviewed runner-up, then ask for red socks again. The choice writes “weighs reviews over price — from your verdict choice” immediately. The next request gets explicit review/price weights; a deterministic comparison of the returned relevant pair applies them, and the reason names the local weekday you taught it. Current explicit price constraints still take precedence. Tied or absent review evidence records the product choice without inventing a review preference.

Guided mode includes a labeled, scripted life-chapter card after the Head: “lots of baby items this week — new chapter? want me to set up for it?” Both answers persist, but scripted evidence stays out of actual recommendation context. Call chapters accept your own statements into the same memory pipeline.

The app never places real orders or charges money. Approving records ownership locally; it does not contact Coupang. Approval never earns XP. XP comes only from swipes and answered questions. Night additions between 22:00 and 07:00 use the browser’s local timezone and lock until morning. Owned items and quarantined sensitive categories are excluded by code.

Product facts live in `data/catalog.json`; all reviews in `data/reviews.json` are synthetic and have stable IDs. There is no live product search, price feed, delivery promise or customer-review feed. A verdict’s pick and citations are validated; invalid model output gets one retry, then exposes the raw catalog and reviews. Missing information should produce a clarifying question.

Profiles persist in `.data/profiles/`, identified by a local session cookie, with a browser `localStorage` mirror. Its Head can reset the current profile or export it. Resetting the profile preserves recorded model responses. This is a local demo with no account authentication, hosted deployment or production commerce integration.

For a reliable offline presentation, first rehearse online from a reset profile. Record the exact choices, typed questions, scene commands and photo you intend to use. Reset the profile again, stop the server, and restart in cache-only mode:

```sh
DEMO_OFFLINE=1 npm run dev
```

Repeat the same interactions, in the same mode and order. `.cache/responses/` stores validated outputs under hashes of the request, model, schema and instructions. Changed memories, confidence buckets, wording, mode/deck source or photo bytes can create a new request. Old recordings must be rehearsed again after this ambient-memory upgrade. A miss fails loudly with `OFFLINE_CACHE_MISS`; it never falls back to a model network call. Browser voice input is disabled in offline mode because browser speech recognition may use a network service. Type the rehearsed question instead. Photos are sent to vision during live use; the response cache stores the inventory and a hash-based filename, not the image bytes.

There is also a repeatable terminal rehearsal that does not need a listening web server:

```sh
npm run rehearse
DEMO_OFFLINE=1 npm run rehearse
```

To include vision, append the same photo argument to both commands:

```sh
npm run rehearse -- --photo=/absolute/path/fridge.jpg
DEMO_OFFLINE=1 npm run rehearse -- --photo=/absolute/path/fridge.jpg
```

The CLI warms its own fixed path; it does not automatically cover every browser interaction. Each call logs token counts, latency and cache status to the server console. Replayed calls report zero tokens.

Validation commands:

```sh
npm test
npm run typecheck
npm run build
```

The test suite exercises real route handlers with a test-only model transport, guardrails, evidence validation, photo-to-decision mapping, cache replay and zero-fetch offline misses. Renderer tests cover bounded camera motion, spring assembly, semantic placement, sustained slow-frame detection and unavailable WebGL cleanup. Browser checks cover live scene generation, scene rebuilds, hotspot sheets and the 3D hatch. Production orders remain simulated.

Scenes and the opening hatch use Three.js with an orthographic camera. Scene furniture and products are stylized low-poly meshes; product frames remain accessible HTML buttons projected through the same camera. Pointer movement is constrained, there are no camera controls, and a successful rebuild drops and reassembles the room over about 1.5 seconds. Hidden tabs pause rendering. WebGL errors, context loss or sustained rendering below 30 FPS fall back to the existing 2D interface. Reduced-motion preferences suppress orbit and assembly movement.

Coupang currently denies access to the product photo pages from this environment. No real Coupang photos or exact product scans are bundled. Product frames use the existing illustrations as explicit placeholders. To add verified local photos later, place them in `public/products/` and map SKU IDs in `data/product-images.json`:

```json
{
  "kettle": {
    "src": "/products/kettle.jpg",
    "sourceUrl": "the verified source listing URL",
    "alt": "An accurate description of the verified product photo"
  }
}
```

A missing or failed image returns to its illustrated placeholder. Image mappings never alter catalog prices, delivery claims or review evidence.
