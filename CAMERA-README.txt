NOOK PRODUCT-PHOTO CAMERA PREVIEWS

Open /camera on the deployed HTTPS Site in Chrome or Safari. Answer the call
or choose Browse instead, then open “18 picks”. Three listings per category:
lipstick, chair, desk lamp, T-shirt, hoodie and glasses. Every listing has a locally served
copy of its original product image, a source record and a Coupang product link.

Try it uses that selected product, not a generic garment or lamp drawing.
- Lipstick: colour estimate from visible pigment in the listing photo, applied
  to tracked lips only. Lighting, finish and exact shade are not reproduced.
- Glasses: actual frame pixels align to the eye line and nose with smoothed
  landmarks, bounded perspective/roll and transparent or tinted lens apertures.
  Face forward for best results; there is no prescription or measured-fit claim.
- T-shirt/hoodie: product pixels warp between shoulder/hip landmarks and visible
  hands can appear over the garment. This is not fabric physics or verified fit.
- Chair/lamp: a 2D product image placed with its base at the selected screen
  point. Tap the floor/desk or ask Nori to adjust it. No physical scale, surface
  anchoring, depth or occlusion guarantee. A contact shadow helps placement.

Light neutral backgrounds are removed locally from compatible packshots.
Glasses also use reviewed lens apertures so listing backdrops do not cover eyes. Images load from
verified same-origin /products paths so canvas snapshots remain usable.
Missing/failed photos show an error, never a substitute generic product.

Camera processing and MediaPipe tracking run in the browser. With camera sharing
enabled during a connected call, raw snapshots and a separately labeled virtual
preview go to OpenAI so Nori can understand the scene. The sharing pill pauses
image sharing while local try-on continues. Ending/closing the call releases
camera and microphone. The app does not write camera images or audio to storage.

MediaPipe Tasks Vision 0.10.14, Apache-2.0:
https://github.com/google-ai-edge/mediapipe
Models/WASM download from official Google storage and jsDelivr on first use.

Catalog evidence: VOICE-CATALOG-SOURCES.txt and data/catalog.json. Direct Coupang
scraping may be blocked; publicly indexed listings/CDN images are used with
source provenance. Reference prices are not a current stock/price feed.

Checks: npm run check, then the Sites build helper. Unit/integration tests cover
photo loading/cancellation, background removal, placement, catalog grounding,
voice controls and media lifecycle. Real phone-camera tracking requires device QA.

Flip changes the physical front/back camera without restarting the voice call.
If the opposite camera is unavailable, the original camera is restored.
Try-on minimizes cards and secondary controls; Products/More expands them.
Generated stills and upload/photo-generation controls are removed.
