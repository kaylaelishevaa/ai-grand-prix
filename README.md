COUPI is a local Next.js app: a live conversation-to-world shopping journey with a complete local commerce flow over a finite catalog with explicit synthetic and sourced-reference provenance. The default `/` uses the team main branch’s cyan phone shell. `/call` opens the live companion, `/explore` contains the actual 3D worlds, and `/hatch` opens the egg. `/demo` retains the optional 390px presentation, `/experience` is a direct-app alias, and `/guided` retains the optional day story. New visitors still start with the 3D egg and first call. Returning visitors land on **Home**, a companion brief and up to three updates from their actual local profile. **Explore** contains the 3D **Your worlds** landscape and **This week’s picks**, a collection of curated starters. The two video-call chapters and 2030 epilogue remain labeled concept simulations.

Use Node.js 22 or newer. From this directory:

```sh
npm install
npm run dev
```

Open [http://127.0.0.1:3007](http://127.0.0.1:3007). COUPI uses port 3007 to avoid other apps running on 3000. This version needs its local server; double-clicking the old HTML does not launch the live app.

Development uses Webpack, matching the production build. If an older Turbopack process stalls before “Ready”, stop that process with Ctrl+C in its Terminal and run `npm run dev` again. The startup command should include `--webpack`. Restarting does not require deleting profiles, response caches or API keys.

Copy `.env.example` to `.env.local` and set your own `OPENAI_API_KEY` there, server-side, with `OPENAI_MODEL=gpt-5-mini` and `DEMO_OFFLINE=0` for live use. Restart the server after changing these settings. Never prefix the key with `NEXT_PUBLIC_`, put it in browser code, or commit it. `.env*`, `.data/` and `.cache/` are ignored by Git. No key is needed for a fully cached offline replay, but the same model name is still required.

The default journey is now one continuous path:

1. **Hatch** the 3D egg. Coopy invites you to a first call instead of a catalog.
2. **Tell your story** in up to five optional questions. The teammate’s interview feature is the default after hatch: voice-first with camera off until explicitly enabled, or **Type instead**. Every genuine final turn uses the checked `/api/call` service. Lifestyle facts stay in a server-owned draft, separate from recommendation memory. **Review my story** opens an editable interests/style/per-item-budget/story sheet early or after five answers. Only **Build my worlds** saves the reviewed fields and opens real 3D generation. **Keep talking** leaves edits unconfirmed; **Skip for now** discards the draft and keeps the call available. Shopping, comparison and inventory requests can interrupt without consuming an interview question. There are no Tinder decks, duels or stroll screens.
3. **Enter your world**: one structured call generates personal districts grounded in those memories, including a new geometry blueprint for each one. The model designs the terrain outline, primitive shapes and transforms, palette, lighting and supported product positions. Add a district in your own words, or rebuild one. Every shopping object uses a validated catalog ID and each district shows its provenance. Explore also lets you preview curated starters. **Make it mine** sends the starter's context, your optional words, current memory and budget through live generation to create a new personal scene.
4. **Wander** into a full district. Open a hotspot for a live verdict, dissent, real IDs from the seeded review corpus, the Why ladder and the unfiltered evidence list. Keep a private journal moment with a snapshot of the room, then revisit that version after the world changes.
5. **Assign Coopy** from the verdict. Set a per-item cap and preparation options. Review selected plans in **Decisions**, then use a single-page **Checkout** with sample addresses, delivery promises and mock payment methods. Only final confirmation records an order. Reopening the product restores its pending plan, night lock or approval receipt. Price floors, budget caps, night locks and ownership checks run in code; approval never earns XP.

**Home, Call and Explore remain in the bottom navigation.** Call opens the teammate's live WebRTC voice, camera and try-on experience, integrated into main’s cyan/teal phone interface. Microphone audio goes to OpenAI only after starting a call; camera sharing is a separate opt-in. Genuine final user statements become sourced memory in regular calls; first-call preferences require the explicit review step. Eighteen sourced Coupang reference products retain their original listing links and local photos. Their historical prices are labelled, and their comparisons leave unavailable reviews, delivery and durability unknown. The original call came from `main` commit `fb179e0`. The latest interview/review contract is ported from `feat/coupi-call-discovery` commit `12079ef`, and the page shell follows `main` commit `2db0769`; see [API and privacy boundaries](docs/teammate-voice.md).

Realtime calls use the same validated `/api/call` path as typed calls for memory, clarification, comparison, inventory and pending decisions. Spoken replies wait for the validated turn result. An opted-in camera contributes at most one bounded current frame per final turn. Calls can also search the same eligible catalog used by worlds. Coopy receives permitted district names and exact product IDs, never diary text. Opening one of these world products rechecks eligibility, ends microphone/camera sharing and opens the shared verdict/evidence sheet. Seventeen priced sourced references retain their exact IDs through the shared verdict, delegation and simulated checkout. The eighteenth, unpriced listing stays reference-only. Sourced products never inherit synthetic reviews or delivery promises. New statements saved from calls affect the next **Grow it** or **Reimagine** request; existing scenery is not silently replaced.

**Type instead** opens the existing grounded conversation with one composer: words and photos determine whether to compare, inventory a fridge/desk/shelf, find a product, or just talk. There are no intent-mode buttons. Shopping cards retain a pending proposal with their product; open the card to review or approve it. Ordinary talk does not silently create purchases. Photos are uploaded or explicitly captured from a camera preview, then sent with the message. Raw frames are not stored. Supported browsers provide optional dictation and speech playback here. Offline mode always uses this cached typed path; live calls and try-on are disabled.

The Home implementation follows the teammate’s updated homepage from `main` commit `d2f6843`, verified against the current `2db0769` tree. It keeps the cyan brief, expressive mascot, compact update cards and main typography; the older editorial art direction remains in the optional guided presentation. Live Home prioritizes local plans, morning holds and approval receipts without claiming any merchant order or tracking. The desktop **Home scenarios** control (`/?presenter=1&state=normal`) previews five explicitly labelled prepared days: everyday, problem, first hello, quiet and night. Their tracking, swap and rating sheets work in isolated demo state and never write to the live profile. **Meet Coopy** (`/?utility=hatch`) replays the egg without resetting memories or worlds. The portrait frame contains scrolling, navigation and modal sheets; on an actual narrow phone the decorative outer frame disappears.

**Decisions is back as the approval queue** under the latest page inventory. Head remains removed; sourced memory, deletion and actual JSON export live under **Privacy & Memory**. The Tinder/swipe pages and their guided beats are removed. Asking to buy the seeded owned detergent is refused before a model call.

The app now includes **Checkout → Confirmation → Orders → Tracking → Returns**, **Account**, **Autonomy & Permissions**, **Notification settings**, **About**, **Terms** (including delegation), **Privacy**, **How Coopy Works**, **Help**, a designed 404 and an offline page. Every app page has the same policy/support footer. Read [commerce contracts and source grounding](docs/commerce.md). Checkout, compensation and refund records are real persisted local state, but no money moves and no merchant or courier is contacted.

Account can switch between isolated household taste profiles, choose sample addresses/mock methods, set individual and household budgets, and revoke category preparation permissions. The explicit rehearsal clock previews daylight or night while preserving stored holds; use “Real local time” to return to the normal clock.

Each personal world has a manual journal. A saved moment keeps its timestamp, text, district name and scene snapshot in the local profile; **revisit this moment** opens the saved room. Notes can be deleted. Journal text is not sent to the AI, turned into preference memory or used to trigger shopping. These are private notes within this local demo's profile, subject to the same local-session limits described below. **This week’s picks** is editorially curated, with no claim of popularity or other users' activity. World likes, 1–5 personal reviews and comments are stored privately per profile; recent likes become **Your week’s favorites**. They are not published to a multi-user community. Save up to three products as explicit, deletable preferences, then **Build around my products** calls the real world generator. Code requires every selected product in the new 5–6-item bundle and excludes the original unselected products. Product-led creation works before completing the optional interview and never confirms an interview draft for you.

See [the journey implementation notes](docs/JOURNEY.md) for API contracts and the boundary between live AI and simulated commerce.

Every shared verdict uses the same **Contenders** component, including scene hotspots, typed call cards, Ask and the prepared store chapter. Functional alternatives come from the catalog, not unrelated merchandising categories. Earned badges disclose their scope and ties. Head-to-head shows price, sourced profile fit, raw review averages, catalog delivery and review-backed durability; unavailable evidence stays unknown. Citation chips open the unchanged reviews, and full lists remain unfiltered. The live-camera reference preview also keeps its original source panel; its eligible priced items can open the shared sheet. Comparisons stay within the same provenance and functional group; unavailable evidence stays unavailable.

**Make this my pick** regenerates the trade-off from the selected product's own evidence in code. It saves an observed swap with its date and preference contributions, so deleting that memory changes subsequent fit/ranking. This comparison action needs no model/network call and never awards XP or approves an order. A selection in a call updates its pending proposal through the same ownership and night-lock rules.

Guided mode includes a labeled, scripted life-chapter card in its later chapters: “lots of baby items this week — new chapter? want me to set up for it?” Both answers persist, but scripted evidence stays out of actual recommendation context. Call chapters accept your own statements into the same memory pipeline.

The app never places real orders or charges money. Approving records ownership locally; it does not contact Coupang. Approval never earns XP. XP comes from answered questions; the retained learning API also supports historical swipe records. There are no swipe screens. Night additions between 22:00 and 07:00 use the browser’s local timezone and lock until morning. Owned items and quarantined sensitive categories are excluded by code.

Product facts live in `data/catalog.json`, `data/comparison-catalog.json` and `data/teammate-catalog.json`. The merged catalog has 87 synthetic SKUs and 17 priced references; the 1,202 seeded reviews belong only to synthetic SKUs. The original 43 SKUs and 498 reviews are preserved; the comparison supplement supplies same-purpose alternatives and additional explicitly synthetic reviews. All review IDs are stable and merged by `lib/catalog.ts`. There is no live product search, price feed, delivery promise or customer-review feed. A verdict's pick and citations are validated; invalid model output gets one retry, then exposes the raw catalog and reviews. Missing information should produce a clarifying question.

Profiles persist in `.data/profiles/`, identified by a local session cookie, with a browser `localStorage` mirror. The profile API retains reset, correction and deletion actions; Privacy & Memory and the guided Taste Passport export it. Resetting the profile preserves recorded model responses. Privacy & Memory provides deletion and export controls without bringing back a Head page. This is a local demo with no account authentication, hosted deployment or production commerce integration.

For a reliable offline presentation, first rehearse online from a profile reset through the existing profile API, or use the terminal rehearsal below. Record the exact choices, typed questions, scene commands and photo you intend to use. Reset the profile again, stop the server, and restart in cache-only mode:

```sh
DEMO_OFFLINE=1 npm run dev
```

Repeat the same interactions, in the same mode and order. `.cache/responses/` stores validated outputs under hashes of the request, model, schema and instructions. Changed memories, confidence buckets, wording, mode/deck source or photo bytes can create a new request. Old recordings must be rehearsed again after changes to the call schema, catalog or prompts, including this interruptible-call upgrade. A miss fails loudly with `OFFLINE_CACHE_MISS`; it never falls back to a model network call. Browser voice input is disabled in offline mode because browser speech recognition may use a network service. Type the rehearsed question instead. Photos are sent to vision during live use; the response cache stores the inventory and a hash-based filename, not the image bytes.

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

Scenes and the opening hatch use Three.js with an orthographic camera. Explore begins with one connected landscape with curved paths and numbered destinations, rather than boxed product tiles. Place names have their own wayfinding strip so they cannot cover the scenery. A 3D Coopy floats in this overview and glides toward a world on hover or keyboard focus. Clicking enters immediately, with no interstitial or travel delay.

**World context is separate from furniture layout.** A world can be an event, indoor space, outdoor activity or a place: date preparation at home, rooftop dinner, a quiet kitchen, a creative studio, a rainy café, or a riverside picnic. The six curated starters have distinct architecture, palettes, imagined light and atmosphere. Explicit setting commands override stored context; a small mood edit preserves the place. Specific places are artistic interpretations, not geographic reconstructions.

Four product-placement vocabularies—kitchen, desk, reading and dressing—share pooled geometries. Settings add curved interior walls and arched windows, city terraces, café seating, folded curtains, detailed cabinetry, or riverbanks with branched trees, picnic blankets and low tables. Closer architectural framing, wood and cloth textures, local reflections and cached contact shadows give full scenes more physical depth. The atlas retains the wide view. Products are stylized volumetric low-poly meshes, with small accessible glowing touchpoints that open the existing evidence sheet. There are no permanent photo cards covering the scene.

These authored layouts remain for curated previews and older saved worlds. **Newly generated worlds use model-authored blueprints**, not a fixed room selection. Three.js constructs real meshes from the validated terrain and primitive instances; it never executes model-written JavaScript or shaders. The model composes from a bounded geometry vocabulary rather than producing arbitrary sculpted assets. Product meshes remain recognizable authored models, and product facts still come only from the catalog. See [generated-world contracts](docs/generated-worlds.md).

Blueprints persist in each district and diary snapshot. Reopening a world preserves its exact design; **Reimagine** requests a new one. The atlas, full scene and illustrated fallback use the saved blueprint. Invalid generated geometry gets one retry and then a visible error; it is not silently replaced by a preset. Older cache recordings must be rehearsed again for the new blueprint schema.

Pointer movement is constrained, there are no camera controls, and a successful rebuild drops and reassembles the scene over about 1.5 seconds. Hidden tabs pause rendering. WebGL errors, context loss or sustained rendering below 30 FPS fall back to illustrated scenery. Reduced-motion preferences suppress orbit and assembly movement.

The world catalog uses local product illustrations and stylized 3D meshes, not exact manufacturer scans. The sourced reference catalog includes 18 Coupang listing photos from the teammate's implementation. Seventeen records with known historical prices also enter the shared catalog; these are never represented as live prices or guaranteed delivery. `data/product-images.json` remains an optional mapping for independently verified scene assets; it never changes product facts or review provenance. Changing the catalog changes model request hashes: rehearse the presentation path again after this update before using `DEMO_OFFLINE=1`.

Online typography uses Google-hosted Fraunces, Schibsted Grotesk and Space Mono. Remote font loading is disabled in offline mode, which uses installed browser fonts. Virtual try-on loads MediaPipe from its pinned CDN only after an explicit live action; it is unavailable in offline mode.
