COUPI is a local Next.js app: a live conversation-to-world shopping journey over a finite synthetic catalog. Free mode is the default at `/`; the optional day story is at `/guided`. New visitors start with the egg and first call. Returning visitors land on the 3D **Your worlds** homepage, alongside **Worlds to explore**, a collection of curated starters. The two video-call chapters and 2030 epilogue remain labeled concept simulations.

Use Node.js 22 or newer. From this directory:

```sh
npm install
npm run dev
```

Open [http://127.0.0.1:3007](http://127.0.0.1:3007). COUPI uses port 3007 to avoid other apps running on 3000. This version needs its local server; double-clicking the old HTML does not launch the live app.

Copy `.env.example` to `.env.local` and set your own `OPENAI_API_KEY` there, server-side, with `OPENAI_MODEL=gpt-5-mini` and `DEMO_OFFLINE=0` for live use. Restart the server after changing these settings. Never prefix the key with `NEXT_PUBLIC_`, put it in browser code, or commit it. `.env*`, `.data/` and `.cache/` are ignored by Git. No key is needed for a fully cached offline replay, but the same model name is still required.

The default journey is now one continuous path:

1. **Hatch** the 3D egg. Coopy invites you to a first call instead of a catalog.
2. **Tell your story** in up to five warm questions. Type, or use browser voice dictation. Each real model response creates source-labelled memory with confidence. The animated companion can speak through browser speech synthesis; text always remains visible.
3. **Enter your world**: one structured call generates 2–4 diorama districts grounded in those memories. Add a district in your own words, or rebuild one. Every object uses a validated catalog ID and each district shows its provenance. The homepage also lets you preview curated starters. **Make it mine** sends the starter's context, your optional words, current memory and budget through live generation to create a personal district.
4. **Wander** into a full district. Open a hotspot for a live verdict, dissent, real IDs from the seeded review corpus, the Why ladder and the unfiltered evidence list. An optional “walk around” deck stays inside the district. Keep a private journal moment with a snapshot of the room, then revisit that version after the world changes.
5. **Assign Coopy** from the verdict. Set a per-item cap and preparation options, then review the proposal in Decisions. Price floors, budget caps, night locks and ownership checks run in code; approval never earns XP.

**Call and Head remain in the corner.** Later calls have one composer: words and photos determine whether to compare, inventory a fridge/desk/shelf, find a product, or just talk. There are no intent-mode buttons. Shopping cards land in Decisions; ordinary talk does not silently create purchases. Photos are uploaded or explicitly captured from a camera preview, then sent with the message. Raw frames are not stored. Realtime audio transport is not implemented; supported browsers provide dictation and speech playback.

The Head retains source/confidence, correction, confirmation, deletion, export and budget controls. **Teach me faster** opens the optional duel mini-game. Deleting a memory removes linked traits, pending clarification context and dependent districts; future calls and world generation use only surviving context. The “pretend it’s 2am” switch still exercises server-enforced sleep-on-it locks. Asking to buy the seeded owned detergent is refused before a model call.

Each personal world has a manual journal. A saved moment keeps its timestamp, text, district name and scene snapshot in the local profile; **revisit this moment** opens the saved room. Notes can be deleted. Journal text is not sent to the AI, turned into preference memory or used to trigger shopping. These are private notes within this local demo's profile, subject to the same local-session limits described below. **Worlds to explore** is editorially curated, with no claim of popularity or other users' activity.

See [the journey implementation notes](docs/JOURNEY.md) for API contracts and the boundary between live AI and simulated commerce.

The critical feedback loop: ask for red socks, choose a pricier, better-reviewed runner-up, then ask for red socks again. The choice writes “weighs reviews over price — from your verdict choice” immediately. The next request gets explicit review/price weights; a deterministic comparison of the returned relevant pair applies them, and the reason names the local weekday you taught it. Current explicit price constraints still take precedence. Tied or absent review evidence records the product choice without inventing a review preference.

Guided mode includes a labeled, scripted life-chapter card after the Head: “lots of baby items this week — new chapter? want me to set up for it?” Both answers persist, but scripted evidence stays out of actual recommendation context. Call chapters accept your own statements into the same memory pipeline.

The app never places real orders or charges money. Approving records ownership locally; it does not contact Coupang. Approval never earns XP. XP comes only from swipes and answered questions. Night additions between 22:00 and 07:00 use the browser’s local timezone and lock until morning. Owned items and quarantined sensitive categories are excluded by code.

Product facts live in `data/catalog.json`: **43 demo SKUs** span the original household catalog and the dressing-room wardrobe/beauty set. The **498 reviews** in `data/reviews.json` are synthetic and have stable IDs. Key products in all four curated worlds have visible review corpora. There is no live product search, price feed, delivery promise or customer-review feed. A verdict’s pick and citations are validated; invalid model output gets one retry, then exposes the raw catalog and reviews. Missing information should produce a clarifying question.

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

The test suite exercises real route handlers with a test-only model transport, guardrails, evidence validation, photo-to-decision mapping, cache replay and zero-fetch offline misses. Renderer tests cover bounded camera motion, spring assembly, semantic placement, sustained slow-frame detection and unavailable WebGL cleanup. Browser checks cover the live interview, world generation, diorama hotspots and evidence sheets; automated tests cover the complete approval and offline replay paths. Production orders remain simulated.

Scenes and the opening hatch use Three.js with an orthographic camera. Four room types have their own furniture and product placements: **kitchen, desk, reading and dressing**. The dressing room includes a closet and vanity for date-night getting ready, with volumetric outfits, bags and makeup objects. Scene furniture and products are stylized low-poly meshes; product frames remain accessible HTML buttons projected through the same camera. The homepage renders its miniature dioramas near the viewport to limit active WebGL contexts. Pointer movement is constrained, there are no camera controls, and a successful rebuild drops and reassembles the room over about 1.5 seconds. Hidden tabs pause rendering. WebGL errors, context loss or sustained rendering below 30 FPS fall back to the existing 2D interface. Reduced-motion preferences suppress orbit and assembly movement.

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
