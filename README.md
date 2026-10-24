# Coupi — AI shopping companion

Talk to Coupi, explore real Coupang products, and try them on through your camera. This repository contains the current mobile-first web prototype: live AI voice, camera understanding, face/body tracking, 18 default Coupang products across six categories, and live Coupang product search.

Each developer runs their own local server and supplies **their own OpenAI API key**. No usable API key is included in this repository.

## Requirements

- **Node.js 22.13.0 or newer**, with npm, and Git.
- A browser with camera, microphone, and WebRTC support.
- Internet access for OpenAI and the face/body tracking models downloaded on first use.
- For the AI call: an OpenAI project with an API key, available API credits, and access to the configured Realtime model.

Local development does not require a Cloudflare account, Sites account, database, or Coupang API key. Default product names and preview images are bundled in the repository. Live search uses OpenAI web search restricted to Coupang, with KRW prices and photos when available. It requests 10 matching products by default and accepts at most 15. Fewer products may be returned when fewer matches can be verified.

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
OPENAI_REALTIME_MODEL=gpt-realtime-2.1-mini
```

| Variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | Your server-side API key. Required for Coupi's live AI call. |
| `OPENAI_REALTIME_MODEL` | Optional model override; the application defaults to `gpt-realtime-2.1-mini`. Your project needs access to this Realtime model. |

Keep the key in `.env.local`, never in browser JavaScript or a `NEXT_PUBLIC_` / `VITE_` variable. OpenAI keys belong on the server; see [API authentication guidance](https://developers.openai.com/api/reference/overview). Do not share keys in chat, screenshots, or commits. `.env.local`, `.dev.vars*`, `node_modules/`, and `dist/` are already ignored by Git; build output can contain local preview configuration, so keep it ignored.

Restart the server whenever you change environment variables. If an older `.dev.vars` file exists, Wrangler uses it instead of `.env.local`; consolidate your local settings into one file so stale values do not override the new key.

## 3. Run locally

```bash
npm run dev
```

Open **[http://127.0.0.1:5173](http://127.0.0.1:5173)**. Use the bottom navigation to open **Video call** (`/call`) or **Explore worlds** (`/explore`). Main (`/`) and Explore Worlds are intentionally empty shells for the next phase. `/camera` remains an alias for the call page. Keep the terminal running; press **Ctrl+C** to stop the server.

This uses Vinext/Vite and a locally emulated Cloudflare Worker. The API routes and browser UI run together; there is no separate backend command or cloud deployment step.

To check that the server loaded your configuration, open [the local voice status endpoint](http://127.0.0.1:5173/api/voice/status). With a nonempty key, it should report `ready: true` and `catalogCount: 18`. This check makes no OpenAI request: it confirms that a key is present, not that the key, credits, or model access are valid. Starting an actual call exercises those checks and incurs API usage.

## 4. Try the demo

1. Open **Video call**, click **Start video call** and allow camera and microphone access.
2. Ask Coupi, for example, “Show me glasses under 30,000 won.”
3. Select **Try it** on a product. Cards and secondary controls minimize during try-on; **Products** or **More** restores them.
4. Use **Flip** to switch between front and back cameras when the device has both.
5. Swipe or ask Coupi to skip/save a product. The bag is an in-memory demo; nothing is purchased.
6. Click **End call** when finished.

Without an API key, choose **Browse instead → a category → Try it** to test the catalog and local camera overlays. AI voice, camera understanding, and live product search require your own working key. Use **Search Coupang** to search with saved preferences, or **None of these? Show different products** to request unseen items of the same type. The download link is replaced by the product list.

At **/setting** (also **/settings**), save a suggested preference or type a custom memory. Saved preferences guide call recommendations and live product searches while memory is on; pause or forget them there. Preferences stay in this browser and are sent to the AI only when used for a call or search.

During a call, tap **Message** to open the full conversation history and a textbox that stays open after sending. Text mode mutes the microphone and Coupi’s spoken replies. Tap it again to return to live captions and restore the previous microphone and speaker settings. History stays in memory for the current call and clears when a new call starts.

Camera snapshots are shared with OpenAI during an active call when **Let Coupi see my camera** is enabled. The eye/Pause control stops that sharing while local try-on continues. The app does not write call audio or camera images to persistent storage. Calls end when the page is hidden or after the demo's ten-minute limit.

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
- `data/catalog.json`, `public/products/`, `public/product-catalog.csv`: 18 products and their images/links.
- `VOICE-CATALOG-SOURCES.txt`: listing provenance and historical reference prices.
- `tests/`: automated checks.
