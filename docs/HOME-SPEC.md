# Home page spec (feat/home)

Status: draft for team review. No code until this is agreed.
Layout: **A, COUPI speaks first.**

## 1. What Home is for

Home answers one question for a returning customer: **"What needs me today?"**

It closes the gaps the rest of the app doesn't cover: delivery dates, order status, past orders, decisions waiting for approval, and after-sale problems. It is also the hub that links to the other two tabs.

Home is not a feed. If nothing needs the customer, it says so.

## 2. Where it sits

| Item | Decision |
|---|---|
| Tabs (bottom bar, every main page) | **Home** · **Call** (centre, raised) · **Explore** (the Worlds page) |
| Decisions (the bag) | Icon at the top right of Home, with a count |
| New customer | `index.html` (landing and consent) → first call (`camera.html`) → Home after the call ends |
| Returning customer | Opens on Home |
| How the app knows | `localStorage` key `coupi_first_call_done = "1"`, set when the first call ends |
| New files | `site-pages/home.html`, `public/home.js`, `public/home.css`, `public/tabbar.js` (shared bottom bar), `public/home-demo-data.js` |
| Existing files | Don't restructure `app.js`, `mobile-call.js` or `camera.html`. Only add links to Home and the tab bar. |
| Worlds tab | Links to the Worlds page from `feat/coupi-3d-dioramas`. Path to confirm with that team (assume `worlds.html`). |

## 3. Layout A, top to bottom

Less on screen, all of it useful. Everything fits on one phone screen without scrolling.

1. **Top bar:** on the left, a settings button that opens **Inside COUPI's head** (memories, permissions). On the right, the Decisions icon with a count. No date or time text: the brief greets.
2. **COUPI avatar:** large, centred, about 150 px. Its mood matches the day (section 6). Tapping it starts a call.
3. **COUPI's brief:** one speech bubble, at most 20 words, in the serif face. It summarises the cards below and nothing else.
4. **Cards:** at most three, ordered by the rules in section 4. Each card has the **real product photo** from the catalog (`image` field), a short title, one supporting line and one action button.
5. **Tab bar:** **Home · Call · Explore**. Call sits in the centre as a raised button with COUPI's face.

Removed on purpose: the "Ask COUPI anything" bar (the centre Call button does that job, and the call has a text mode) and the "On the way" strip (arrivals already appear as cards).

## 4. Card rules

Code builds the cards from data. The model never decides what is true; it only writes the brief.

**Card types, in priority order:**

| Priority | Type | Shown when | Title example | Action |
|---|---|---|---|---|
| 1 | **Problem** | A delivery is late, a pickup is due, or a return or exchange needs input | "Office chair now arrives Fri, not Wed" | Fix (opens options) |
| 2 | **Decision** | An item is waiting for approval, or a quote expires within 24 h | "EYELAB glasses · ₩19,900 · waiting for your OK" | Review |
| 3 | **Arrival** | An order arrives today or tomorrow | "Desk lamp arrives today by 12:00" | Track |
| 4 | **Follow-up** | An order was delivered in the last 3 days | "Your lipstick arrived. How's the shade?" | Rate (opens after-sale if unhappy) |
| 5 | **Nudge** | There is evidence: an item held overnight, a saved item back in stock, or a saved item's price dropped | "The KATE lipstick you saved is back" | Look |

**Rules:**
- Maximum 3 cards. Higher priority always wins. If there are several of one type, the most urgent goes first.
- **At most one nudge**, and only if fewer than 3 higher-priority cards exist.
- Every nudge shows **why** on tap ("You saved this on Tue").
- Never a nudge for something the customer already owns, and never on a problem day.
- One action per card. No "Buy now" on Home: buying always goes through Decisions.
- Card facts (names, prices, dates) come only from data. Prices show as in the catalog with ₩ and commas.

## 5. COUPI's brief

- Written by the model from the cards' facts only, passed as structured input. At most 25 words, one or two sentences.
- **Order:** greeting → the most important thing → how many other things need the customer.
- **Example:** "Morning, Mina. Your desk lamp arrives by noon, and one thing is waiting for your OK."
- **Never:** promote products, invent facts, mention anything seen on camera, or comment on the customer.
- **Fallback:** if the model fails or the app is offline, use a template built from the top card ("Morning, Mina. {top card title}."). Home must never show an empty bubble.
- Cache the brief per day plus card set, so it doesn't call the model on every visit.

## 6. States

| State | When | Avatar mood | Brief example | Cards |
|---|---|---|---|---|
| **First Home** | Straight after the first call | Excited | "That was fun, Mina. Your lipstick arrives tomorrow morning." | Arrival · **"I learned 3 things about you"** with one Review button. The list itself lives in Inside COUPI's head. |
| **Normal day** | Default | Calm, smiling | "Morning, Mina. Your desk lamp arrives by noon, and one thing is waiting for your OK." | Arrival · Decision · (Nudge) |
| **Problem day** | Any problem card exists | Attentive | "One thing needs you. Your office chair is late, but I found one that arrives tomorrow." | **Problem first** · then others |
| **Quiet day** | No cards from data | Relaxed | "Nothing needs you today. Enjoy it." | One World card from Explore, built from things she owns. Nothing else. |
| **Night** | 22:00–07:00 local | Sleepy | "Nothing needs you tonight. I'm holding the MAC lipstick until morning." | Held-overnight nudge ("Keep" / "Remove") · others as normal |
| **Loading** | Data or brief pending | Idle | — (show a three-dot bubble) | Skeleton cards |
| **Offline or model error** | Brief can't be generated | Calm | Template brief (section 5) | As normal |

Problem card for the demo: one ready fix as the main button ("Swap", to the Seoul chair arriving tomorrow, +₩7,530) and "Other options" (wait until Fri, cancel this item). On a problem day show at most two cards. Nothing changes until the customer picks.

Design reference: the "COUPI and Home" page of the Living Plan Screens canvas (https://claude.ai/artifact/PQ1MwQWipy3vGEcoKLzXuV).

## 7. Interactions and links

| Element | Goes to |
|---|---|
| Avatar or centre Call button | `camera.html` (Call) |
| Settings button (top left) | Inside COUPI's head: memories with sources and delete, permissions (ask before buying, hold late-night buys, camera only during calls), pause memory, forget everything |
| Decisions icon or Review | Decisions sheet (existing bag, extended later with totals) |
| Track | Order detail sheet: timeline (Ordered · Packed · Out for delivery · Delivered) |
| Fix | Problem options sheet (section 6) |
| Rate | Quick rating; if 1–2 stars, open after-sale in a call ("What went wrong?") |
| World card | Worlds tab |
| Avatar long-press or profile icon | Inside COUPI's head (memories, permissions) |

## 8. Demo data (`public/home-demo-data.js`)

Use real items from `data/catalog.json` by `id`. Orders, dates and decisions are synthetic and labelled "Demo" in the UI footer.

```js
window.HOME_DEMO = {
  user: { name: "Mina" },
  now: "2026-10-26T08:10:00+09:00",          // lets the demo force a state
  orders: [
    { id: "1042", items: ["1814412512"], status: "delivered", deliveredAt: "2026-10-25T07:02" },   // Romand 09 Shell Nude
    { id: "1043", items: ["55518713"],   status: "out_for_delivery", eta: "2026-10-26T12:00" },    // Duplex LED desk lamp
    { id: "1044", items: ["20145368"],   status: "delayed", eta: "2026-10-30", originalEta: "2026-10-28",
      swap: { item: "7950092256", eta: "2026-10-27", priceDelta: 7530 } }                         // Chair Club MT20 → Seoul chair
  ],
  decisions: [ { item: "7612276799", status: "waiting", addedAt: "2026-10-25T21:10" } ],            // EYELAB glasses ₩19,900
  held: [ { item: "7322824636", heldUntil: "2026-10-27T07:00" } ],                                  // MAC lipstick ₩35,700
  saved: [ { item: "7185725748", event: "back_in_stock", savedAt: "2026-10-21" } ],                 // KATE Lip Monster
  memory: [
    { text: "Likes soft matte shades", source: "your first call" },
    { text: "Works at a desk most days", source: "your first call" },
    { text: "Budget around ₩30,000 for small things", source: "you told me" }
  ],
  demoState: null   // "first" | "normal" | "problem" | "quiet" | "night" to force a state on stage
};
```

The demo switches states with `?state=problem` (and the others) in the URL, so the presenter can show each state without changing data.

## 9. Visual rules

- Reuse the tokens already in `public/styles.css`: forest `#153d33` / `#183e30` background, cream `#f5f3e9` cards, sage `#d2dfb7`, lime `#d5e8a5`, peach `#ecdcc9`, coral `#ee8773` for problems, ink `#243c32`.
- Georgia serif for the brief and the page heading; DM Sans or the system sans for everything else.
- Don't use `--muted: #81867d` for small text on cream; it fails contrast. Use ink at reduced weight instead.
- Card radius 20 px (the existing `--radius`). Touch targets at least 44 px.
- The avatar's idle motion is a slow bob, off when `prefers-reduced-motion` is set.

## 10. Trust and safety on Home

- No card or brief ever infers sensitive traits, or mentions anything seen on camera.
- Nudges need evidence and say why. There's never more than one.
- Late-night additions are held until 07:00, and the brief says so.
- A refund is shown as "after pickup", never as done.
- Buying only happens in Decisions, with an explicit approval.

## 11. Done means

- [ ] Home renders at 390 px wide in all seven states, switchable with `?state=`.
- [ ] Cards follow the priority and limit rules, built from `home-demo-data.js`, not hardcoded in HTML.
- [ ] The brief comes from the model when online, from the template when not, and is never empty.
- [ ] Every card action opens its sheet or page (section 7).
- [ ] The tab bar works on Home, the Worlds page and Call.
- [ ] A new customer sees landing → call → First Home; a returning one opens on Home.
- [ ] No API key in browser code; model calls go through the existing server route.
- [ ] Existing tests still pass.

## 12. Not in this branch

Worlds page (other team), the full Decisions checkout, Compare, real order or delivery data, account login.

## 13. Open questions for the team

1. One name everywhere: **COUPI** (recommended) or Nook/Nori?
2. Confirm the Worlds page path on `feat/coupi-3d-dioramas`.
3. Should Decisions stay as the existing bag sheet, or become its own page in a later branch?
4. Which server route does the site use for model calls today? The brief should reuse it.

---

## 14. Version 2: fit the team shell, speak like a real shop

This section overrides anything above that conflicts with it.

### Fit the shell on main
- Home is the content of the team's **Main** page: render it inside `site-pages/main.html` → `<main class="shell-content">`. Keep their header, brand and bottom bar (**Main · Video call · Explore worlds**) exactly as they are. Do not add our own tab bar.
- In the Main header, add two round icon buttons on the right: **settings** (opens `/settings`) and **bag** with a count. Hide the "Main" heading visually on this page only (keep it for screen readers) so COUPI has room.
- Settings is a new page, `site-pages/settings.html`, on the same shell. Add only a `/settings` route to `worker/index.ts`; leave every other route as the team wrote it.
- Use the shell's colours from `public/coupi-shell.css` (canvas `#edf8fa`, surface `#f8fdfe`, cyan `#d9f1f4`, ink `#234b52`, teal `#347d7e`, line `#dcedef`). Problems use coral (`#fbe3dc` background, `#8e3320` text). Night uses a dark teal background with light text.
- COUPI on Main and Settings is our SVG (`public/coupi.js`), which matches `/assets/coupi.png`. Settings shows COUPI **calm**, never thinking or worried.

### Words a customer would use (exact copy)

No demo language anywhere a customer can see it: no "demo", "sample", "reference price", "simulated", "synthetic", "test".

| Card | Title | Line | Button(s) |
|---|---|---|---|
| Arrival | Desk lamp arrives today | By 12:00 | **Track order** |
| Waiting for approval | Blue-light glasses | ₩19,900 · waiting for your OK | **Review** → sheet with **Buy for ₩19,900** and **Not now** |
| Back in stock | Lip Monster 03 is back in stock | You saved it on Wednesday | **View** |
| Late delivery | Your chair is running late | Now Friday, not Wednesday. A similar chair can come tomorrow for ₩7,530 more. | **Get it tomorrow** · **Wait for Friday** |
| Delivered | Your lipstick arrived | How's the shade? | **Rate it** |
| First time | I learned 3 things about you | Make sure I got them right | **Check** |
| Night hold | MAC Powder Kiss | I'll ask you again at 7am · ₩35,700 | **Remove** |
| Quiet day world | A little world of your own | Built from things you have | **Explore** |

Short product names (use these, not the long catalog titles): Romand Zero Matte 09 · Desk lamp · Blue-light glasses · Office chair · Lip Monster 03 · MAC Powder Kiss.

COUPI's line per state (exact):
- Everyday: "Morning, Mina. Your desk lamp arrives today, and your glasses need your OK."
- Delivery issue: "Your chair is running late, Mina. I found one that can come tomorrow."
- After first call: "That was fun, Mina! Your lipstick arrives tomorrow morning."
- Quiet: "Nothing needs you today, Mina. Enjoy it."
- Night: "It's late, Mina. I'll hold the lipstick until morning."

### Settings page ("What I know about you")
- Title: **What I know about you**. COUPI calm, line: "You're in charge of what I remember."
- Memories: text, source in small type, and a small **Forget** text button.
- Permissions as compact switches (track about 44 × 26 px, `role="switch"`, whole row is the 44 px touch target): "Ask me before buying anything", "Hold late-night buys until morning", "Only use my camera during calls".
- Bottom: **Pause memory** and **Forget everything**.

### Presenter switch (for us, invisible to customers)
- Open with `/?presenter=1`, or press and hold COUPI on Main for one second.
- Shows a small segmented control at the top of Main: **Everyday · Delivery issue · After first call · Night**. The choice is kept for the browser tab (sessionStorage). Nothing about it shows without the switch opened.
- For the pitch, show **Everyday** (the happy path) and **Delivery issue** (the notification moment). **After first call** appears by itself when the live call ends.

### After the first call
- When a call ends for the first time, go to `/?state=first` (Main). Make the smallest possible change in the team's current `public/mobile-call.js`.

### Bottom bar names (team decision)
- Rename the shell's bottom bar on every page (main.html, camera.html, explore.html, settings.html) to **Home · Call · Explore**, same order, same flat style and icons.
- Page headings and titles: "Main" → "Home" (`Home — Coupi`), "Explore worlds" → "Explore" (`Explore — Coupi`). The call page keeps its own heading.
