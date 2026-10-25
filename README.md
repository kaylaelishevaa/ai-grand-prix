# Coupi — AI shopping companion

Talk to Coupi, explore real Coupang products, and try them on through your camera. This repository contains the current mobile-first web prototype: live AI voice, camera understanding, face/body tracking, and 82 sourced Coupang listings/options, plus live Coupang product search.

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
OPENAI_REALTIME_MODEL=gpt-realtime-2.1-mini
```

| Variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | Your server-side API key. Required for Coupi's live AI call. |
| `OPENAI_REALTIME_MODEL` | Optional model override; the application defaults to `gpt-realtime-2.1-mini`. Your project needs access to this Realtime model. |
| `OPENAI_TRANSCRIPTION_MODEL` | Caption model; defaults to `gpt-4o-transcribe`. Supported overrides are `gpt-4o-mini-transcribe` and `gpt-4o-mini-transcribe-2025-12-15`. |
| `OPENAI_TRANSCRIPTION_LANGUAGE` | Optional two-letter language such as `en` or `ko`. Leave blank for automatic mixed-language detection. |

Keep the key in `.env.local`, never in browser JavaScript or a `NEXT_PUBLIC_` / `VITE_` variable. OpenAI keys belong on the server; see [API authentication guidance](https://developers.openai.com/api/reference/overview). Do not share keys in chat, screenshots, or commits. `.env.local`, `.dev.vars*`, `node_modules/`, and `dist/` are already ignored by Git; build output can contain local preview configuration, so keep it ignored.

Restart the server whenever you change environment variables. If an older `.dev.vars` file exists, Wrangler uses it instead of `.env.local`; consolidate your local settings into one file so stale values do not override the new key.

## 3. Run locally

```bash
npm run dev
```

Open **[http://127.0.0.1:5173](http://127.0.0.1:5173)**. Main (`/`) offers **Video call** (`/call`) for shopping and its optional first-call interview, and **Explore worlds** (`/explore`) for worlds built from confirmed preferences. The bottom navigation connects all three pages. `/camera` remains an alias for the call page. Keep the terminal running; press **Ctrl+C** to stop the server.

This uses Vinext/Vite and a locally emulated Cloudflare Worker. The API routes and browser UI run together; there is no separate backend command or cloud deployment step.

To check that the server loaded your configuration, open [the local voice status endpoint](http://127.0.0.1:5173/api/voice/status). With a nonempty key, it should report `ready: true` and `catalogCount: 82`. This check makes no OpenAI request: it confirms that a key is present, not that the key, credits, or model access are valid. Starting an actual call exercises those checks and incurs API usage.

## 4. Try the demo

1. Open **Video call**, click **Start video call** and allow camera and microphone access.
2. New shoppers hear a short welcome and can answer a few lifestyle questions in the same call. Tap **Skip to shopping**, say “skip,” or ask directly for something such as “Show me glasses under 30,000 won.”
3. Scroll recommendations inside the fixed product window at the top of the call. Select **Try on** on a product. The window and secondary controls minimize during try-on; **Products** reopens the window and **Controls** restores controls.
4. Use **Flip** to switch between front and back cameras when the device has both.
5. Tap the top window’s chevron to focus the selected product and use hand swipes: left for the next related collection, right to add only that item. Each list row also has its own **Add to bag** action. The bag is an in-memory demo; nothing is purchased.
6. Click **End call** when finished.

The entry flow is a video call; there is no separate Browse mode or onboarding questionnaire. AI voice and AI camera understanding require your own working API key. The automated checks below run without a key.

At **/setting** (also **/settings**), save a suggested preference or type a custom memory. Saved preferences guide call recommendations and live product searches while memory is on; pause or forget them there. Preferences stay in this browser and are sent to the AI only when used for a call or search.

During a call, tap **Message** to open the full conversation history and a textbox that stays open after sending. Text mode mutes the microphone and Coupi’s spoken replies. Tap it again to return to live captions and restore the previous microphone and speaker settings. History stays in memory for the current call and clears when a new call starts.

Camera snapshots are shared with OpenAI during an active call when **Let Coupi see my camera** is enabled. The eye/Pause control stops that sharing while local try-on continues. The app does not write call audio or camera images to persistent storage. Calls end when the page is hidden or after the demo's ten-minute limit.

## Feature branch: call discovery

The current work is on `feat/coupi-call-discovery`; `main` keeps the three-page shell until this branch is merged.

- **Conversation:** a fixed-height, scrollable panel keeps the camera visible. Tap Conversation for the full call history, or the chevron to minimize it. Speech turns are ordered before asynchronous transcription finishes, with streamed updates applied to the same turn.
- **Photo chat:** tap the message icon, then the image icon next to Send. JPG, PNG and WebP files up to 10 MB are resized locally; the photo is sent to OpenAI only when you press Send during a connected call. A failed send keeps the draft ready to retry. Photos and transcripts are not stored in collections.
- **Scrollable collections:** recommendations open inside a fixed window at the top of the video call. Scroll inside that window; the camera, conversation and call controls stay in place, with no section below the call. Each themed collection starts with six matching products; View more adds up to ten inside the same window. Next collection moves to related options: lipstick → lip balm, everyday glasses → sunglasses, basic → branded T-shirts, hoodies → sweaters. Budget and explicit exclusions remain in effect. Restrictive preferences can return fewer than six actual matches. Tap Try on to preview that exact item and minimize the window. Hand swipes pause while the list is open; focus the selected product to use them.
- **Collections:** Save collection keeps up to ten products in that group and the selected item in this browser. The bookmark button restores saved groups, even after exploring a different style.
- **Compare:** choose two or three products of the same type, then Compare. The table shows sourced prices, variants, attributes and available review evidence. Ask Coupi to discuss the selection during a call.
- **Reviews:** ratings, a precomputed AI summary, pros/cons and translated review samples are available for 19 product options across 10 families, including the first Romand, MAC and Kate lipsticks and EYELAB glasses. Other products explicitly show missing evidence. These are historical samples from linked public mirrors, not a live Coupang review feed or a summary of every review.
- **Hand swipes:** shorter gestures now register. The neutral reset and cooldown prevent repeated actions from one motion; the hand button turns tracking off.

For a quick review demo, open **Details** on the first Romand lipstick. For more, ask for **pink lipsticks**, scroll within the top product window and tap **View more**. Review evidence can span multiple shades or options; this is labeled in the UI. The catalog includes pink/red lipsticks, lip balms, optical glasses, sunglasses, basic/branded T-shirts, hoodies, sweaters, chairs and desk lamps. Sourced brands are shown; seller identities are not inferred. Product-family links may require selecting the pictured option on Coupang. Photos with people, multiple products, or unsuitable scenes are marked **No preview** unless a faithful cutout is available. Prices are historical reference values, and seller/stock details are not invented.

Design references: [NN/g comparison tables](https://www.nngroup.com/articles/comparison-tables/) and [Baymard comparison selection](https://baymard.com/research-articles/provide-comparison-features). The compact selection tray and explicit per-item actions adapt these patterns to the call interface.

Caption transcription is separate from the audio-native conversation model. The full transcription model now receives a concise English/Korean shopping vocabulary hint, with longer speech-boundary padding; finalized text cannot be overwritten by stale partial events. This improves the configuration but does not guarantee perfect recognition. The displayed words remain the actual transcription, not an AI rewrite of what the shopper might have meant. See the [Realtime API reference](https://developers.openai.com/api/reference/resources/realtime/client-events). A specifically rejected caption model gets one compatibility fallback to the previous mini model; authentication, credits and rate-limit failures are not retried as model errors.

Live previews preserve the original product pixels. Exact-photo silhouette masks remove chair floor shadows/gaps and clothing hangers, clean glasses lenses, and adjust tracking anchors after cropping. Thin frames and pale fabric are preserved instead of globally erasing white pixels. This is still an approximate 2D placement/fit preview.

## Optional personalized start

New shoppers enter the interview directly through **Start video call**. Coupi says “Welcome new user! We want to learn more about you to personalize your experience,” then asks one easy question at a time about interests, everyday activities or style. There is no separate onboarding page, quick-pick exercise or story form. **Skip to shopping** is available before and during the call; saying “skip” or asking for a specific product also exits the interview.

After a few useful answers, `draft_preferences` opens a short read-only summary of what the shopper volunteered. Only **Save preferences** stores the confirmed interests, style, optional per-item budget and conversation summary in this browser. **Keep talking** dismisses the draft so corrections can be made conversationally. Saving keeps the camera and voice call connected and continues shopping. No camera images or full conversation transcripts are saved to the profile.

**Explore worlds** displays real catalog products grouped from saved preferences. Interest choices determine the worlds, style prioritizes matching catalog color tags, and the budget filters prices. Before preferences are saved, Explore only offers **Talk with Coupi**. Returning shoppers go straight to shopping; **Talk to update** uses `/call?intent=personalize` to revise preferences through a call. World cards use `/call?world=<id>` and seed their matching collection without automatically starting the camera or microphone. Preferences can be reset in Explore. Saved preferences are soft defaults; an explicit current request takes priority.

## Demo checkout

During a connected call, say **“buy this”** for the product being viewed, **“buy these products”** for an explicitly chosen comparison, or **“pay for my cart”** for all bag items. If the selection is unclear, Coupi asks which items you mean. You can also use **Buy this**, **Buy these products** in comparison, or **Review & checkout** in the bag during the call.

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

Glasses, lipstick, clothes, chairs, and lamps use live image-based previews. Clothing fit, colour, physical scale, and room perspective are approximate. Checkout is a local simulation; no order is sent to Coupang and no payment is processed. There is no generated-photo workflow, live price/stock feed, or cloud-synced shopping profile. Confirmed preferences and saved collections stay in the current browser.

- `site-pages/main.html`, `site-pages/explore.html`, `public/coupi-shell.css`: main entry, personalized worlds page and shared navigation.
- `site-pages/camera.html`, `public/mobile-call.*`, `public/coupi-call.css`: mobile call interface and Coupi theme.
- `public/camera-engine.js`, `public/product-preview.js`: local tracking and product rendering.
- `public/voice-call.js`, `lib/nook-voice.mjs`, `worker/index.ts`: Realtime connection, catalog tools, and server routes.
- `data/catalog.json`, `public/products/`, `public/product-catalog.csv`: 82 listings/options and their images/links.
- `data/catalog-replacements.json`: retired-to-replacement mappings for cleaner live previews; original CDN photos and hashes are documented in `VOICE-CATALOG-SOURCES.txt`.
- `VOICE-CATALOG-SOURCES.txt`: listing provenance and historical reference prices.
- `public/product-discovery.js`, `public/inline-collections.css`, `public/product-evidence.js`: inline related collections, saved groups, comparison and sourced review rendering.
- `public/call-conversation.js`, `public/chat-images.js`: compact transcript rendering and local photo preparation.
- `public/demo-checkout.js`, `public/checkout.css`: local checkout state and review/payment/receipt UI.
- `tests/`: automated checks.
