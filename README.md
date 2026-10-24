# Coupi — AI shopping companion

Talk to Coupi, explore real Coupang products, and try them on through your camera. This repository contains the current mobile-first web prototype: live AI voice, camera understanding, face/body tracking, and 36 sourced listings/options across six categories.

Each developer runs their own local server and supplies **their own OpenAI API key**. No usable API key is included in this repository.

## Requirements

- **Node.js 22.13.0 or newer**, with npm, and Git.
- A browser with camera, microphone, and WebRTC support.
- Internet access for OpenAI and the face/body tracking models downloaded on first use.
- For the AI call: an OpenAI project with an API key, available API credits, and access to the configured Realtime model.

Local development does not require a Cloudflare account, Sites account, database, or Coupang API key. Product names and images are bundled in the repository.

## 1. Clone and install

```bash
git clone https://github.com/kaylaelishevaa/ai-grand-prix.git
cd ai-grand-prix
git switch feat/coupi-call-discovery
npm ci
cp .env.example .env.local
```

In Windows PowerShell, replace the last command with `Copy-Item .env.example .env.local`. If you already cloned the repository, run `git pull` and `npm ci` from its root. Create `.env.local` only if you do not already have one; keep your existing secrets when updating.

## 2. Add your own secrets

Create an API key in your own [OpenAI project](https://platform.openai.com/api-keys). See the [official API quickstart](https://developers.openai.com/api/docs/quickstart) for account and key setup. API usage is charged to the project associated with your key.

Open `.env.local` in your editor and replace the placeholder:

```dotenv
OPENAI_API_KEY=PASTE_YOUR_OWN_OPENAI_API_KEY_HERE
OPENAI_REALTIME_MODEL=gpt-realtime-2.1
```

| Variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | Your server-side API key. Required for Coupi's live AI call. |
| `OPENAI_REALTIME_MODEL` | Optional model override; the application defaults to `gpt-realtime-2.1`. Your project needs access to this Realtime model. |
| `OPENAI_TRANSCRIPTION_MODEL` | Caption model; defaults to `gpt-4o-transcribe`. Supported overrides are `gpt-4o-mini-transcribe` and `gpt-4o-mini-transcribe-2025-12-15`. |
| `OPENAI_TRANSCRIPTION_LANGUAGE` | Optional two-letter language such as `en` or `ko`. Leave blank for automatic mixed-language detection. |

Keep the key in `.env.local`, never in browser JavaScript or a `NEXT_PUBLIC_` / `VITE_` variable. OpenAI keys belong on the server; see [API authentication guidance](https://developers.openai.com/api/reference/overview). Do not share keys in chat, screenshots, or commits. `.env.local`, `.dev.vars*`, `node_modules/`, and `dist/` are already ignored by Git; build output can contain local preview configuration, so keep it ignored.

Restart the server whenever you change environment variables. If an older `.dev.vars` file exists, Wrangler uses it instead of `.env.local`; consolidate your local settings into one file so stale values do not override the new key.

## 3. Run locally

```bash
npm run dev
```

Open **[http://127.0.0.1:5173](http://127.0.0.1:5173)**. Main (`/`) offers two starting points: **Video call** (`/call`) for shopping and **Explore worlds** (`/explore`) for optional personalization. The bottom navigation connects all three pages. `/camera` remains an alias for the call page. Keep the terminal running; press **Ctrl+C** to stop the server.

This uses Vinext/Vite and a locally emulated Cloudflare Worker. The API routes and browser UI run together; there is no separate backend command or cloud deployment step.

To check that the server loaded your configuration, open [the local voice status endpoint](http://127.0.0.1:5173/api/voice/status). With a nonempty key, it should report `ready: true` and `catalogCount: 36`. This check makes no OpenAI request: it confirms that a key is present, not that the key, credits, or model access are valid. Starting an actual call exercises those checks and incurs API usage.

## 4. Try the demo

1. Open **Video call**, click **Start video call** and allow camera and microphone access.
2. Ask Coupi, for example, “Show me glasses under 30,000 won.”
3. Select **Try it** on a product. Cards and secondary controls minimize during try-on; **Products** or **More** restores them.
4. Use **Flip** to switch between front and back cameras when the device has both.
5. Swipe left for the next related collection; swipe right adds only the selected product. You can also ask Coupi to skip/save a product. The bag is an in-memory demo; nothing is purchased.
6. Click **End call** when finished.

Without an API key, choose **Browse instead → scroll down → a collection → Try on** to test the catalog and local camera overlays. AI voice and AI camera understanding require your own working key.

Camera snapshots are shared with OpenAI during an active call when **Let Coupi see my camera** is enabled. The eye/Pause control stops that sharing while local try-on continues. The app does not write call audio or camera images to persistent storage. Calls end when the page is hidden or after the demo's ten-minute limit.

## Feature branch: call discovery

The current work is on `feat/coupi-call-discovery`; `main` keeps the three-page shell until this branch is merged.

- **Conversation:** a fixed-height, scrollable panel keeps the camera visible. Tap Conversation for the full call history, or the chevron to minimize it. Speech turns are ordered before asynchronous transcription finishes, with streamed updates applied to the same turn.
- **Photo chat:** tap the message icon, then the image icon next to Send. JPG, PNG and WebP files up to 10 MB are resized locally; the photo is sent to OpenAI only when you press Send during a connected call. A failed send keeps the draft ready to retry. Photos and transcripts are not stored in collections.
- **Scrollable collections:** scroll down directly from the camera, or tap Products. Each themed collection starts with six matching products; View more expands to ten when available. Next collection moves to related options: lipstick → lip balm, everyday glasses → sunglasses, basic → branded T-shirts, hoodies → sweaters. Budget and explicit exclusions remain in effect. Restrictive preferences can return fewer than six actual matches. Tap Try on to select that exact item and return to the camera; the call keeps running while browsing. Hand swipes pause while scrolling collections.
- **Collections:** Save collection keeps up to ten products in that group and the selected item in this browser. The bookmark button restores saved groups, even after exploring a different style.
- **Compare:** choose two or three products of the same type, then Compare. The table shows sourced prices, variants, attributes and available review evidence. Ask Coupi to discuss the selection during a call.
- **Reviews:** ratings, a precomputed AI summary, pros/cons and translated review samples are available for 19 product options across 10 families, including the first Romand, MAC and Kate lipsticks and EYELAB glasses. Other products explicitly show missing evidence. These are historical samples from linked public mirrors, not a live Coupang review feed or a summary of every review.
- **Hand swipes:** shorter gestures now register. The neutral reset and cooldown prevent repeated actions from one motion; the hand button turns tracking off.

For a quick review demo, open **Details** on the first Romand lipstick. For more, ask for **pink lipsticks**, scroll below the camera and tap **View more**. Review evidence can span multiple shades or options; this is labeled in the UI. The catalog includes pink/red lipsticks, lip balms, optical glasses, sunglasses, basic/branded T-shirts, hoodies, sweaters, chairs and desk lamps. Sourced brands are shown; seller identities are not inferred. Product-family links may require selecting the pictured option on Coupang. Photos with people, multiple products, or unsuitable scenes are marked **No preview** unless a faithful cutout is available. Prices are historical reference values, and seller/stock details are not invented.

Design references: [NN/g comparison tables](https://www.nngroup.com/articles/comparison-tables/) and [Baymard comparison selection](https://baymard.com/research-articles/provide-comparison-features). The compact selection tray and explicit per-item actions adapt these patterns to the call interface.

Caption transcription is separate from the audio-native conversation model. The full transcription model now receives a concise English/Korean shopping vocabulary hint, with longer speech-boundary padding; finalized text cannot be overwritten by stale partial events. This improves the configuration but does not guarantee perfect recognition. The displayed words remain the actual transcription, not an AI rewrite of what the shopper might have meant. See the [Realtime API reference](https://developers.openai.com/api/reference/resources/realtime/client-events). A specifically rejected caption model gets one compatibility fallback to the previous mini model; authentication, credits and rate-limit failures are not retried as model errors.

Live previews preserve the original product pixels. Exact-photo silhouette masks remove chair floor shadows/gaps and clothing hangers, clean glasses lenses, and adjust tracking anchors after cropping. Thin frames and pale fabric are preserved instead of globally erasing white pixels. This is still an approximate 2D placement/fit preview.

## Optional personalized start

Open **Explore worlds** or **New here? Make your own worlds** on the call screen. New shoppers can answer three swipeable this-or-that prompts, write a short story, or choose **Talk with Coupi** for an optional conversation. They can skip every step and go directly to shopping.

Quick picks and voice conversations both end in an editable review. Only **Build my worlds** saves the chosen interests, style, optional per-item budget and story in this browser. No camera images or conversation transcripts are saved to the profile. Explore then shows real catalog products grouped into worlds; style prioritizes matching catalog color tags, and the budget filters prices. Written stories provide context for later calls; interest choices determine world selection. Preferences can be edited or reset in Explore.

The voice route is `/call?intent=personalize`. Coupi asks short lifestyle questions and uses `draft_preferences` to open review, without saving. **Skip to shopping** or a spoken shopping request exits discovery. Confirming Build ends the call and opens Explore. World cards link to `/call?world=<id>` and seed the matching catalog collection; they never start the camera or microphone automatically. Saved preferences are soft defaults, and an explicit new request takes priority.

## Demo checkout

During a connected call, say **“buy this”** for the product being viewed, **“buy these products”** for an explicitly chosen comparison, or **“pay for my cart”** for all bag items. If the selection is unclear, Coupi asks which items you mean. You can also use **Buy this**, **Buy these products** in comparison, or **Review & checkout** in the bag without an API key.

1. **Review:** select items, change quantities (1–9), or remove them from this checkout. Reference prices come from the catalog; delivery and other fees are not calculated.
2. **Payment:** choose Card or Coupi Pay. The call remains connected. Go back to revise the selection, or press **Pay** yourself.
3. **Confirmation:** see the purchase confirmation and catalog-based pairing ideas. Coupi thanks you and offers complementary picks during an active call. Only completed items are removed from your bag. Canceling leaves the bag unchanged.

This flow collects no card numbers or delivery addresses, creates no merchant order, and charges nothing. Voice can open review but cannot confirm payment. Checkout state stays in memory. Closing the receipt keeps only the latest purchase and pairing IDs in the current call context for follow-up; ending the call or refreshing clears them. Real purchases must be completed separately on Coupang with its current price, stock and delivery details.

## Phone camera testing

`localhost` on a phone refers to the phone, not your laptop. The default development server listens on the laptop's loopback address. A plain LAN address such as `http://192.168.x.x:5173` is not a complete phone setup: camera/microphone access requires a [secure context](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia#privacy_and_security).

For phone testing, use an HTTPS deployment or configure an authenticated HTTPS development tunnel to your local server. A tunnel also needs its exact hostname allowed by Vite and consistent forwarding of the request origin; this repository does not configure that tunnel for you. Anyone who can reach an unprotected copy can potentially use its server-side API key, so do not expose the development server publicly with your key. For the initial setup above, test in a browser on the same computer.

## Checks and local build

```bash
npm run check
npm run build
```

`npm run check` runs syntax checks and automated tests without a real API key or paid OpenAI calls. `npm run build` produces the Worker and browser assets under `dist/`.

## Troubleshooting

| Problem | What to check |
| --- | --- |
| `ready: false` / voice waiting for a key | Put `.env.local` beside `package.json`, fill in `OPENAI_API_KEY`, and restart. Check for an overriding `.dev.vars` file. |
| Invalid key, unavailable model, or exhausted credits | Check your own OpenAI project's key, model access, and API billing. Configuration status alone cannot validate them. |
| Camera or microphone blocked | Allow both in browser site permissions and OS privacy settings. Use localhost or HTTPS and close other apps holding the camera. |
| Voice connection times out | Check microphone permission and network/WebRTC access; retry on another network if a VPN or firewall blocks it. |
| Flip reports no other camera | This is expected on a device with only one usable camera. Test front/back switching on a phone. |
| Tracking or overlay fails to load | Allow downloads from `cdn.jsdelivr.net` and `storage.googleapis.com`; improve lighting and keep your face or torso visible. |
| Port 5173 is in use | Stop the other development server, then run `npm run dev` again. |
| Native dependency install fails | Check the Node version, then try `npm run install:ci`, which includes the project's native-dependency setup. |

## Current scope and source files

Glasses, lipstick, clothes, chairs, and lamps use live image-based previews. Clothing fit, colour, physical scale, and room perspective are approximate. Checkout is a local simulation; no order is sent to Coupang and no payment is processed. There is no generated-photo workflow, live price/stock feed, or persistent shopping profile.

- `site-pages/main.html`, `site-pages/explore.html`, `public/coupi-shell.css`: main entry, personalized worlds page and shared navigation.
- `site-pages/camera.html`, `public/mobile-call.*`, `public/coupi-call.css`: mobile call interface and Coupi theme.
- `public/camera-engine.js`, `public/product-preview.js`: local tracking and product rendering.
- `public/voice-call.js`, `lib/nook-voice.mjs`, `worker/index.ts`: Realtime connection, catalog tools, and server routes.
- `data/catalog.json`, `public/products/`, `public/product-catalog.csv`: 82 listings/options and their images/links.
- `VOICE-CATALOG-SOURCES.txt`: listing provenance and historical reference prices.
- `public/product-discovery.js`, `public/inline-collections.css`, `public/product-evidence.js`: inline related collections, saved groups, comparison and sourced review rendering.
- `public/call-conversation.js`, `public/chat-images.js`: compact transcript rendering and local photo preparation.
- `public/demo-checkout.js`, `public/checkout.css`: local checkout state and review/payment/receipt UI.
- `tests/`: automated checks.
