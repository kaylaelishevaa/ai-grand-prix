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
5. **Assign Coopy** from the verdict. Set a per-item cap and preparation options, then review and explicitly approve the plan in that same product sheet. Reopening the product restores its pending plan, night lock or approval receipt. Price floors, budget caps, night locks and ownership checks run in code; approval never earns XP.

**Call and Your world remain in the corner.** After the first interview, Call opens the teammate's live WebRTC voice, camera and try-on experience, restyled in COUPI's warm visual language. Microphone audio goes to OpenAI only after starting a call; camera sharing is a separate opt-in. Genuine final user transcripts become sourced memory. Eighteen sourced Coupang reference products retain their original listing links and local photos. Their historical prices are labelled, and their comparisons leave unavailable reviews, delivery and durability unknown. The integration comes from `main` commit `fb179e0`; see [its API and privacy boundaries](docs/teammate-voice.md).

**Type instead** opens the existing grounded conversation with one composer: words and photos determine whether to compare, inventory a fridge/desk/shelf, find a product, or just talk. There are no intent-mode buttons. Shopping cards retain a pending proposal with their product; open the card to review or approve it. Ordinary talk does not silently create purchases. Photos are uploaded or explicitly captured from a camera preview, then sent with the message. Raw frames are not stored. Supported browsers provide optional dictation and speech playback here. Offline mode always uses this cached typed path; live calls and try-on are disabled.

The separate Head and Decisions pages and their navigation buttons are currently removed. Sourced memory remains visible in calls and comparisons; profile persistence, correction/deletion APIs, budget checks and the rehearsal clock setting are preserved. Deleting a memory through the profile API still removes linked traits, pending clarification context and dependent districts. The optional stroll remains inside each district. Asking to buy the seeded owned detergent is refused before a model call.

Each personal world has a manual journal. A saved moment keeps its timestamp, text, district name and scene snapshot in the local profile; **revisit this moment** opens the saved room. Notes can be deleted. Journal text is not sent to the AI, turned into preference memory or used to trigger shopping. These are private notes within this local demo's profile, subject to the same local-session limits described below. **Worlds to explore** is editorially curated, with no claim of popularity or other users' activity.

See [the journey implementation notes](docs/JOURNEY.md) for API contracts and the boundary between live AI and simulated commerce.

Every synthetic-catalog verdict uses the same **Contenders** component, including scene hotspots, typed call cards, Ask and the prepared store chapter. Functional alternatives come from the catalog, not unrelated merchandising categories. Earned badges disclose their scope and ties. Head-to-head shows price, sourced profile fit, raw review averages, catalog delivery and review-backed durability; unavailable evidence stays unknown. Citation chips open the unchanged reviews, and full lists remain unfiltered. The live-camera reference catalog has its own sourced comparison panel; it never borrows synthetic review evidence.

**Make this my pick** regenerates the trade-off from the selected product's own evidence in code. It saves an observed swap with its date and preference contributions, so deleting that memory changes subsequent fit/ranking. This comparison action needs no model/network call and never awards XP or approves an order. A selection in a call updates its pending proposal through the same ownership and night-lock rules.

Guided mode includes a labeled, scripted life-chapter card after the late-night stroll: “lots of baby items this week — new chapter? want me to set up for it?” Both answers persist, but scripted evidence stays out of actual recommendation context. Call chapters accept your own statements into the same memory pipeline.

The app never places real orders or charges money. Approving records ownership locally; it does not contact Coupang. Approval never earns XP. XP comes only from swipes and answered questions. Night additions between 22:00 and 07:00 use the browser’s local timezone and lock until morning. Owned items and quarantined sensitive categories are excluded by code.

Product facts live in `data/catalog.json` plus `data/comparison-catalog.json`. The original 43 SKUs and 498 reviews are preserved; the comparison supplement supplies same-purpose alternatives and additional explicitly synthetic reviews. All review IDs are stable and merged by `lib/catalog.ts`. There is no live product search, price feed, delivery promise or customer-review feed. A verdict's pick and citations are validated; invalid model output gets one retry, then exposes the raw catalog and reviews. Missing information should produce a clarifying question.

Profiles persist in `.data/profiles/`, identified by a local session cookie, with a browser `localStorage` mirror. The profile API retains reset, correction and deletion actions; the guided Taste Passport still exports it. Resetting the profile preserves recorded model responses. These profile-management APIs are retained even though the Head page is not in the current navigation. This is a local demo with no account authentication, hosted deployment or production commerce integration.

For a reliable offline presentation, first rehearse online from a profile reset through the existing profile API, or use the terminal rehearsal below. Record the exact choices, typed questions, scene commands and photo you intend to use. Reset the profile again, stop the server, and restart in cache-only mode:

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

Scenes and the opening hatch use Three.js with an orthographic camera. The homepage is one connected landscape with curved paths and numbered destinations, rather than boxed product tiles. Place names have their own wayfinding strip so they cannot cover the scenery.

**World context is separate from furniture layout.** A world can be an event, indoor space, outdoor activity or a place: date preparation at home, rooftop dinner, a quiet kitchen, a creative studio, a rainy café, or a riverside picnic. The six curated starters have distinct architecture, palettes, imagined light and atmosphere. Explicit setting commands override stored context; a small mood edit preserves the place. Specific places are artistic interpretations, not geographic reconstructions.

Four product-placement vocabularies—kitchen, desk, reading and dressing—share pooled geometries. Settings add curved interior walls and arched windows, city terraces, café awnings or riverbanks with picnic blankets. Products are stylized volumetric low-poly meshes, with small accessible glowing touchpoints that open the existing evidence sheet. There are no permanent photo cards covering the scene.

Pointer movement is constrained, there are no camera controls, and a successful rebuild drops and reassembles the scene over about 1.5 seconds. Hidden tabs pause rendering. WebGL errors, context loss or sustained rendering below 30 FPS fall back to illustrated scenery. Reduced-motion preferences suppress orbit and assembly movement.

The world catalog uses local product illustrations and stylized 3D meshes, not exact manufacturer scans. The separate live-camera reference catalog includes 18 Coupang listing photos from the teammate's implementation. `data/product-images.json` remains an optional mapping for independently verified scene assets; it never changes product facts or review provenance. Changing the catalog changes model request hashes: rehearse the presentation path again after this update before using `DEMO_OFFLINE=1`.

Online typography uses Google-hosted Fraunces, Schibsted Grotesk and Space Mono. Remote font loading is disabled in offline mode, which uses installed browser fonts. Virtual try-on loads MediaPipe from its pinned CDN only after an explicit live action; it is unavailable in offline mode.
