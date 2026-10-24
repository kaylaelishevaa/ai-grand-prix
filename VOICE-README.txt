Nook camera + real AI voice

The mobile call at /camera supports a real OpenAI Realtime WebRTC call alongside local camera overlays. Answer starts camera and microphone with browser permission. Audio goes directly to OpenAI after a server-created session. With camera sharing enabled, the data channel also sends compressed camera snapshots about every three seconds and when fresh visual context is requested. A separate image labels the virtual try-on preview. Nori can understand these images, search a curated catalog of 15 actual Coupang listings and adjust supported product-photo preview settings. No shopping orders are placed.

Camera privacy: sharing is disclosed on the incoming screen and can be paused in the call while local overlays continue. No images are sent outside an active, visible call or when camera sharing/camera is off. The application never writes audio/images to storage or logs; earlier snapshot conversation items are pruned to bound context, not to promise provider-side erasure. Frames are JPEGs up to 480px on the longest edge, capped at 44,000 data-URL characters per raw/preview pair. Still frames are not full-motion video, exact product identification or physical fit measurement.

Product grounding: data/catalog.json is the source of truth. Prices are historical indexed references, not a live scrape, live availability feed, exact shade match, or fit guarantee. See VOICE-CATALOG-SOURCES.txt for provenance. Rebuild public/coupang-products.js when changing the catalog.

Runtime: supported Sites Vinext/Cloudflare Worker. Worker serves site-pages/*.html and /api/voice/status, /api/voice/session, /api/products/search. Browser assets live in public/. Backend module: lib/nook-voice.mjs. Native Sites owner-private access is the access boundary; preserve it. POST endpoints also enforce same-origin Origin headers and bounded bodies. No secret, audio, or SDP is logged.

Secrets: OPENAI_API_KEY is server-only. Local .env.local is ignored. Hosted value must be set as a Sites secret. OPENAI_REALTIME_MODEL defaults to gpt-realtime-2.1. No key is included in the source. Voice remains disabled until a server key is available. Voice sessions stop on user End, page close/hide, connection failure, or the ten-minute demo limit. Browser microphone tracks are released separately from the camera.

Verification: npm run check; npm run dev. Final production packaging uses the Sites build helper and source workflow. Mock tests cover protocol lifecycle and catalog validation; they do not prove a live authenticated audio call.
