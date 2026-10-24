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

Keep the key in `.env.local`, never in browser JavaScript or a `NEXT_PUBLIC_` / `VITE_` variable. OpenAI keys belong on the server; see [API authentication guidance](https://developers.openai.com/api/reference/overview). Do not share keys in chat, screenshots, or commits. `.env.local`, `.dev.vars*`, `node_modules/`, and `dist/` are already ignored by Git; build output can contain local preview configuration, so keep it ignored.

Restart the server whenever you change environment variables. If an older `.dev.vars` file exists, Wrangler uses it instead of `.env.local`; consolidate your local settings into one file so stale values do not override the new key.

## 3. Run locally

```bash
npm run dev
```

Open **[http://127.0.0.1:5173](http://127.0.0.1:5173)**. Use the bottom navigation to open **Video call** (`/call`) or **Explore worlds** (`/explore`). Main (`/`) and Explore Worlds are intentionally empty shells for the next phase. `/camera` remains an alias for the call page. Keep the terminal running; press **Ctrl+C** to stop the server.

This uses Vinext/Vite and a locally emulated Cloudflare Worker. The API routes and browser UI run together; there is no separate backend command or cloud deployment step.

To check that the server loaded your configuration, open [the local voice status endpoint](http://127.0.0.1:5173/api/voice/status). With a nonempty key, it should report `ready: true` and `catalogCount: 36`. This check makes no OpenAI request: it confirms that a key is present, not that the key, credits, or model access are valid. Starting an actual call exercises those checks and incurs API usage.

## 4. Try the demo

1. Open **Video call**, click **Start video call** and allow camera and microphone access.
2. Ask Coupi, for example, “Show me glasses under 30,000 won.”
3. Select **Try it** on a product. Cards and secondary controls minimize during try-on; **Products** or **More** restores them.
4. Use **Flip** to switch between front and back cameras when the device has both.
5. Swipe left for another style; swipe right adds only the selected product. You can also ask Coupi to skip/save a product. The bag is an in-memory demo; nothing is purchased.
6. Click **End call** when finished.

Without an API key, choose **Browse instead → Picks → a category → Try it** to test the catalog and local camera overlays. AI voice and AI camera understanding require your own working key.

Camera snapshots are shared with OpenAI during an active call when **Let Coupi see my camera** is enabled. The eye/Pause control stops that sharing while local try-on continues. The app does not write call audio or camera images to persistent storage. Calls end when the page is hidden or after the demo's ten-minute limit.

## Feature branch: call discovery

The current work is on `feat/coupi-call-discovery`; `main` keeps the three-page shell until this branch is merged.

- **Conversation:** a fixed-height, scrollable panel keeps the camera visible. Tap Conversation for the full call history, or the chevron to minimize it. Speech turns are ordered before asynchronous transcription finishes, with streamed updates applied to the same turn.
- **Photo chat:** tap the message icon, then the image icon next to Send. JPG, PNG and WebP files up to 10 MB are resized locally; the photo is sent to OpenAI only when you press Send during a connected call. A failed send keeps the draft ready to retry. Photos and transcripts are not stored in collections.
- **Product groups:** Picks opens six matching products; View more expands to ten when available. Tap a product to select it. Add to bag affects that item only; New style explores another group within the same category and budget.
- **Collections:** Save group keeps the group and selected item in this browser. The bookmark button restores saved groups, even after exploring a different style.
- **Compare:** choose two or three products of the same type, then Compare. The table shows sourced prices, variants, attributes and available review evidence. Ask Coupi to discuss the selection during a call.
- **Reviews:** ratings, a precomputed AI summary, pros/cons and translated review samples are available for two sourced demo listings. Other products explicitly show missing evidence. These are historical samples from linked public mirrors, not a live Coupang review feed or a summary of every review.
- **Hand swipes:** shorter gestures now register. The neutral reset and cooldown prevent repeated actions from one motion; the hand button turns tracking off.

For the richest demo, ask for **pink lipsticks**, open **View more**, then inspect **Revlon Pink in the Afternoon**. Its review evidence spans multiple shades, which is labeled in the UI. There are ten pink options across six brands, seven optical glasses and three sunglasses. Seven newly sourced glasses photos contain models/backgrounds and are marked **Preview unavailable**; the original three glasses previews remain available. Prices are historical reference values, and seller/stock details are not invented.

Design references: [NN/g comparison tables](https://www.nngroup.com/articles/comparison-tables/) and [Baymard comparison selection](https://baymard.com/research-articles/provide-comparison-features). The compact selection tray and explicit per-item actions adapt these patterns to the call interface.

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

Glasses, lipstick, clothes, chairs, and lamps use live image-based previews. Clothing fit, colour, physical scale, and room perspective are approximate. There is no generated-photo workflow, checkout, live price/stock feed, or persistent shopping profile.

- `site-pages/main.html`, `site-pages/explore.html`, `public/coupi-shell.css`: empty page shells and shared navigation.
- `site-pages/camera.html`, `public/mobile-call.*`, `public/coupi-call.css`: mobile call interface and Coupi theme.
- `public/camera-engine.js`, `public/product-preview.js`: local tracking and product rendering.
- `public/voice-call.js`, `lib/nook-voice.mjs`, `worker/index.ts`: Realtime connection, catalog tools, and server routes.
- `data/catalog.json`, `public/products/`, `public/product-catalog.csv`: 36 listings/options and their images/links.
- `VOICE-CATALOG-SOURCES.txt`: listing provenance and historical reference prices.
- `public/product-discovery.js`, `public/product-evidence.js`: grouped browsing, collections, comparison and sourced review rendering.
- `public/call-conversation.js`, `public/chat-images.js`: compact transcript rendering and local photo preparation.
- `tests/`: automated checks.
