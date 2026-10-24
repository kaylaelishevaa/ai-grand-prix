The live-call backend was ported from `kaylaelishevaa/ai-grand-prix` commit `fb179e0670aea97dd1e16d5d149815a42a7fb38c`. The original tool names and camera/try-on behavior are retained. First-interview and typed calls continue to use `/api/call`.

Routes:

| Route | Input | Response |
| --- | --- | --- |
| `GET /api/voice/status` | Same app session cookie | `{ ready, offline, model, catalogCount, reason? }`. Presence of a key is not proof of credits/model access. No provider request occurs. |
| `POST /api/voice/session` | `application/sdp`; audio-only WebRTC offer, at most 65,536 bytes | Raw `application/sdp` answer, or a short safe JSON error. |
| `POST /api/products/search` | JSON `{ query, category, max_price }`; categories `all`, `makeup`, `clothes`, `desk`, `glasses`; at most 4,096 bytes | Up to three sourced listings, historical-reference disclosure and Coupang search URL. This is local retrieval. |

POSTs require an exact same-origin `Origin` and reject `Sec-Fetch-Site: cross-site`. The session uses server-only `OPENAI_API_KEY`, and `OPENAI_REALTIME_MODEL` or the teammate default `gpt-realtime-2.1`. No credential is sent to the browser. `DEMO_OFFLINE=1` reports `ready:false, offline:true` and refuses a session before any network request; local catalog retrieval remains available.

`data/teammate-catalog.json` contains the teammate’s 18 sourced product references, with original provenance URLs and historical price limitations. Only local image paths were moved to `/live-call/products/`. These records are **not merged** into the synthetic scene catalog or seeded review corpus. Their prices, product IDs, reviews and delivery facts must not be borrowed from that separate database.

Each new session receives only `sanitizeProfileForAI` output (at most 32 active memory lines), never the raw profile, quarantine log, decisions or ownership dates. Erased and excluded memories do not enter a new handshake. Product retrieval also excludes owned reference IDs and quarantined category mappings. Changes made during a running WebRTC conversation take effect on the next session; previously transmitted context cannot be unsent by this handshake route.

The four existing tools remain `search_products`, `set_tryon`, `product_action`, and `look_at_camera`. Only `search_products` calls the server; overlay/card/camera actions remain in the client. Save is a reversible local demo-cart action, never a purchase. The peer connection closes when the call ends; as in the original backend, no call ID or separate remote-end endpoint is exposed.

No audio, camera frame, SDP, profile content or key is logged. The server logs handshake model/status/latency and marks token usage unavailable because the SDP response has no usage totals. Upstream error details are bounded and replaced with safe funding/rate/access messages.

`npm test` includes the teammate’s original server and voice-client suites through `tests/teammate-voice.test.ts`. Their `.mjs` fixtures run against the ported backend and `/public/live-call/voice-call.js`, with fake fetch, fake WebRTC and fake microphone objects. No camera, microphone, credential or provider is used by these tests. A catalog consistency check also verifies that local asset namespacing never rewrites real retailer URLs.
