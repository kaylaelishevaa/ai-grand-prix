Coupi call interface

Open / for Home, /explore for Explore Worlds, and /call (or /camera) for a single Start call button. Use the round camera, microphone and message controls to set up the call and change how you participate. Camera, voice and typed messages with image uploads share the same conversation and shopping bag. There are no separate Video/Voice/Chat tabs.

New shoppers receive the optional preference interview inside the call or chat, with Skip to shopping in the same screen. Preferences are saved after confirmation. Returning shoppers can use Update preferences on the entry screen.

Products scroll inside a fixed top window. Ask Coupi, search for a product, or use Next collection to explore related choices; category chips and the camera-snapshot status strip are removed. Explicit product buttons select, try on, compare, add to bag, or change collections. Hand and card swipe actions have been removed. Camera-off mode uses a clean conversation layout with the image composer visible. Turning the camera off also stops live camera sharing.

Every product shown in the demo has a supported live-preview recipe. Clothing, glasses and objects use sourced product imagery; lipstick uses an estimated shade. Clear balm preserves natural lip colour with a subtle sheen, while tinted balm adds approximate tint and sheen. All fit, placement, colour and finish previews remain approximate.

The server and browser share the preview eligibility rule in lib/demo-catalog.mjs. Run npm run catalog:build after reviewing catalog or preview changes to regenerate the browser catalog and downloadable CSV. Historical unsupported records remain in data/catalog.json for provenance and are excluded from the demo. Older saved collections resolve only current eligible IDs; retired items and empty groups are omitted. npm run check verifies that generated catalog files are current.

See README.md for local setup, secrets, current catalog details, supported features, and demo limitations. Run npm run check for the automated regression suite.
