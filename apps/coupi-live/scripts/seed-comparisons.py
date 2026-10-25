"""Rebuild checked-in synthetic contender facts/reviews; never modifies the original catalog.

No merchant facts are scraped or implied. Every observation below is deliberately
seeded demo evidence. Runtime code reads the resulting JSON, not this generator.
"""
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parent.parent
originals = {s['id']: s for s in json.loads((ROOT / 'data/catalog.json').read_text())}

# Functional group, original anchor, variants: name / price / explicit facts / palette / colour.
GROUPS = [
    ('kettle', 'kettle', [
        ('Everyday straight-spout kettle · 1 L', 24900, {'capacityL': 1, 'material': 'brushed stainless steel', 'pourStyle': 'straight spout', 'heatSource': 'stovetop'}, ['steel', 'cream'], '#BFC4B9'),
    ]),
    ('rice-cooker', 'cooker', [
        ('Small-table rice cooker · 4 cups', 54900, {'capacityCups': 4, 'widthCm': 25, 'idealHousehold': '1–3 people', 'controls': 'cook and keep-warm switch'}, ['cream', 'sage'], '#D7D9BC'),
    ]),
    ('drinkware', 'mugs', [
        ('Daily porcelain mug duo · 300 ml', 12900, {'quantity': 2, 'capacityMlEach': 300, 'material': 'glazed porcelain', 'handle': True}, ['cream', 'blue'], '#DDE2D7'),
    ]),
    ('apron', 'apron', [
        ('Canvas workday apron', 19900, {'material': 'cotton canvas', 'lengthCm': 78, 'adjustableNeck': True, 'pockets': 2}, ['olive', 'sand'], '#879176'),
    ]),
    ('tray', 'tray', [
        ('Easy-clean oval serving tray', 9900, {'material': 'polypropylene', 'widthCm': 30, 'depthCm': 20, 'care': 'hand wash', 'shape': 'oval'}, ['cream', 'sand'], '#E1D5B8'),
    ]),
    ('portable-speaker', 'speaker', [
        ('Pebble portable speaker', 34900, {'connection': 'Bluetooth', 'widthCm': 9, 'charging': 'USB-C', 'finish': 'textured plastic shell'}, ['terracotta', 'cream'], '#B97D68'),
    ]),
    ('desktop-organizer', 'organizer', [
        ('Open bamboo desk organizer', 17900, {'material': 'bamboo', 'widthCm': 22, 'depthCm': 12, 'compartments': 4, 'drawers': 0}, ['bamboo', 'sand'], '#C0A479'),
        ('Soft-grey modular desk drawers', 21900, {'material': 'polypropylene', 'widthCm': 26, 'depthCm': 16, 'drawers': 2, 'finish': 'matte'}, ['grey', 'cream'], '#B9BFBA'),
    ]),
    ('matcha-set', 'matcha', [
        ('Everyday matcha bowl and whisk', 19900, {'contents': 'ceramic bowl + bamboo whisk', 'bowlCapacityMl': 400, 'whiskHolderIncluded': False}, ['cream', 'sage'], '#D6D1AD'),
        ('Speckled matcha ritual set', 34900, {'contents': 'stoneware bowl + bamboo whisk + whisk holder', 'bowlCapacityMl': 500, 'whiskHolderIncluded': True}, ['sage', 'stone'], '#9CA991'),
    ]),
    ('stovetop-coffee', 'espresso', [
        ('Little moka pot and cup · 3 cups', 29900, {'contents': 'aluminium moka pot + ceramic cup', 'capacityCups': 3, 'requires': 'compatible gas or electric stovetop', 'inductionCompatible': False}, ['steel', 'cream'], '#BAC3BF'),
        ('Steel moka pot and cup · 4 cups', 59900, {'contents': 'stainless-steel moka pot + ceramic cup', 'capacityCups': 4, 'requires': 'compatible stovetop', 'inductionCompatible': True}, ['steel', 'teal'], '#7F9490'),
    ]),
    ('vase', 'vase', [
        ('Simple glass stem vase', 12900, {'material': 'clear glass', 'heightCm': 16, 'openingDiameterCm': 4}, ['clear', 'sage'], '#ADC4B6'),
    ]),
    ('scented-candle', 'candle', [
        ('Cedar evenings tin candle', 19900, {'scent': 'cedar and orange peel', 'waxGrams': 120, 'container': 'metal tin', 'quantity': 1}, ['cream', 'amber'], '#CBAB72'),
    ]),
    ('filled-cushion', 'cushion', [
        ('Everyday cotton cushion · filled', 25900, {'material': 'cotton cover', 'sizeCm': '45 × 45', 'insertIncluded': True, 'filling': 'polyester', 'closure': 'zip'}, ['cream', 'oat'], '#DED2B6'),
        ('Washed linen cushion · filled', 49900, {'material': 'linen cover', 'sizeCm': '45 × 45', 'insertIncluded': True, 'filling': 'polyester', 'closure': 'zip'}, ['sage', 'sand'], '#AAB398'),
    ]),
    ('cushion-cover', 'cushionCover', [
        ('Plain cotton cushion cover', 14900, {'material': 'cotton', 'sizeCm': '45 × 45', 'insertIncluded': False, 'closure': 'zip'}, ['cream', 'sand'], '#E1D3B7'),
        ('Linen stripe cushion cover', 29900, {'material': 'linen', 'sizeCm': '45 × 45', 'insertIncluded': False, 'closure': 'zip'}, ['sage', 'cream'], '#A5AD92'),
    ]),
    ('oat-milk', 'milk', [
        ('Everyday unsweetened oat drink · 1 L', 3200, {'pack': '1 L', 'volumeMl': 1000, 'quantity': 1, 'sweetened': False, 'storage': 'refrigerate after opening'}, ['cream', 'oat'], '#D8D2B0'),
        ('Barista oat drink · 1 L', 4900, {'pack': '1 L', 'volumeMl': 1000, 'quantity': 1, 'style': 'barista blend', 'storage': 'refrigerate after opening'}, ['oat', 'teal'], '#BDB98F'),
    ]),
    ('spinach', 'greens', [
        ('Baby spinach leaves · 100 g', 2200, {'pack': '100 g', 'weightG': 100, 'quantity': 1, 'storage': 'refrigerated', 'preWashed': False}, ['green', 'sage'], '#789C66'),
        ('Baby spinach leaves · 250 g', 4300, {'pack': '250 g', 'weightG': 250, 'quantity': 1, 'storage': 'refrigerated', 'preWashed': False}, ['green', 'olive'], '#648856'),
    ]),
    ('enoki', 'mushrooms', [
        ('Enoki mushrooms · single pack', 1100, {'pack': '1 pack · 150 g', 'weightG': 150, 'quantity': 1, 'storage': 'refrigerated'}, ['cream', 'oat'], '#DBD3B6'),
        ('Enoki mushrooms · three packs', 2400, {'pack': '3 packs · 150 g each', 'weightGEach': 150, 'quantity': 3, 'storage': 'refrigerated'}, ['cream', 'sand'], '#D6CAAA'),
    ]),
    ('cherry-tomatoes', 'tomato', [
        ('Cherry tomatoes · small punnet', 2900, {'pack': '300 g', 'weightG': 300, 'quantity': 1, 'container': 'vented punnet'}, ['red', 'green'], '#C56D52'),
        ('Cherry tomatoes · family punnet', 6900, {'pack': '1 kg', 'weightG': 1000, 'quantity': 1, 'container': 'vented punnet'}, ['red', 'green'], '#B95E49'),
    ]),
    ('soft-tofu', 'tofu', [
        ('Soft tofu · single pack', 1400, {'pack': '1 pack · 300 g', 'weightG': 300, 'quantity': 1, 'storage': 'refrigerated'}, ['cream', 'sage'], '#DAD8BE'),
        ('Soft tofu · family three-pack', 3600, {'pack': '3 packs · 300 g each', 'weightGEach': 300, 'quantity': 3, 'storage': 'refrigerated'}, ['cream', 'green'], '#D1D2B3'),
    ]),
    ('midi-dress', 'dateDress', [
        ('Soft jersey midi dress', 29900, {'material': '95% cotton, 5% elastane', 'size': 'M', 'lengthCm': 110, 'closure': 'pull-on', 'care': 'cold gentle wash, line dry'}, ['plum', 'rose'], '#876675'),
        ('Linen-blend wrap midi dress', 59900, {'material': '55% linen, 45% viscose', 'size': 'M', 'lengthCm': 115, 'closure': 'side tie', 'care': 'cold hand wash, line dry'}, ['sage', 'cream'], '#9CAA91'),
    ]),
    ('blouse', 'eveningBlouse', [
        ('Easy cotton evening blouse', 21900, {'material': '100% cotton', 'size': 'M', 'lengthCm': 61, 'closure': 'front buttons', 'care': 'cold gentle wash, line dry'}, ['cream', 'sand'], '#E0D8C1'),
        ('Draped satin evening blouse', 42900, {'material': '100% polyester satin', 'size': 'M', 'lengthCm': 62, 'closure': 'front buttons', 'care': 'cold hand wash, line dry'}, ['plum', 'rose'], '#A27B89'),
    ]),
    ('shoulder-bag', 'littleHandbag', [
        ('Little nylon evening shoulder bag', 17900, {'material': 'nylon with polyester lining', 'widthCm': 23, 'heightCm': 16, 'depthCm': 7, 'closure': 'zip', 'strap': 'adjustable shoulder strap'}, ['teal', 'forest'], '#496962'),
        ('Structured vegan-leather shoulder bag', 39900, {'material': 'PU with polyester lining', 'widthCm': 26, 'heightCm': 19, 'depthCm': 9, 'closure': 'magnetic flap', 'strap': 'adjustable shoulder strap'}, ['cocoa', 'cream'], '#A68468'),
    ]),
    ('lipstick', 'roseLipstick', [
        ('Everyday rose cream lipstick', 8900, {'weightG': 3, 'shade': 'dusty rose', 'finish': 'cream', 'format': 'twist-up bullet', 'packaging': 'plastic case'}, ['rose', 'cream'], '#B57578'),
        ('Soft berry satin lipstick', 19900, {'weightG': 3.5, 'shade': 'soft berry', 'finish': 'satin', 'format': 'twist-up bullet', 'packaging': 'metal case'}, ['berry', 'teal'], '#9F5B72'),
    ]),
    ('pressed-powder', 'softCompact', [
        ('Everyday pressed powder compact', 12900, {'weightG': 8, 'shade': 'warm beige', 'format': 'pressed powder', 'mirrorIncluded': True, 'applicatorIncluded': True, 'diameterCm': 6}, ['sand', 'cream'], '#D4BA99'),
        ('Fine-matte powder compact', 25900, {'weightG': 10, 'shade': 'neutral beige', 'format': 'pressed powder', 'mirrorIncluded': True, 'applicatorIncluded': False, 'diameterCm': 7}, ['sand', 'teal'], '#C6AB88'),
    ]),
    ('perfume', 'eveningPerfume', [
        ('Cedar pocket eau de toilette', 19900, {'volumeMl': 20, 'notes': 'cedar and dry citrus', 'format': 'eau de toilette spray', 'bottle': 'glass with plastic cap'}, ['amber', 'cream'], '#CBA66D'),
        ('Soft amber eau de toilette', 42900, {'volumeMl': 50, 'notes': 'amber, cedar and vanilla', 'format': 'eau de toilette spray', 'bottle': 'glass with metal cap'}, ['amber', 'plum'], '#B88C58'),
    ]),
    ('hoop-earrings', 'smallHoops', [
        ('Little gold-tone hoop pair', 6900, {'quantity': '1 pair', 'diameterMm': 16, 'material': 'gold-tone plated brass', 'closure': 'hinged post', 'finish': 'polished'}, ['gold', 'cream'], '#C6A666'),
        ('Rounded gold-tone hoop pair', 15900, {'quantity': '1 pair', 'diameterMm': 24, 'material': 'gold-tone plated stainless steel', 'closure': 'hinged post', 'finish': 'brushed'}, ['gold', 'sand'], '#C8AD75'),
    ]),
    ('powder-brush', 'blendingBrush', [
        ('Everyday rounded powder brush', 5900, {'lengthCm': 15, 'bristles': 'synthetic fibers', 'handle': 'plastic', 'ferrule': 'aluminium', 'use': 'powder application'}, ['cream', 'sand'], '#C4B499'),
        ('Dense rounded powder brush', 14900, {'lengthCm': 17, 'bristles': 'synthetic fibers', 'handle': 'painted wood', 'ferrule': 'aluminium', 'use': 'powder application'}, ['teal', 'gold'], '#59726B'),
    ]),
]

# Per-purpose observations. These are fictional reviewer experiences, not certified specifications.
# Each entry: successful use, repeat-use detail, detailed negative, mild tradeoff, complaint tag.
OBS = {
    'kettle': ('The straight spout was easier for filling my mug than for drawing tiny circles over a coffee filter.', 'I boiled water for two small cups on October 14 and again on October 16; the handle stayed comfortable after I switched the heat off.', 'The stream splashed over the rim of my narrow coffee dripper when I tipped it quickly. I tried three pours on October 15 and had to clean the counter each time.', 'Fine for tea, but I need a slower wrist movement for my little coffee filter.', 'pour-control'),
    'rice-cooker': ('One measured cup of dry rice made enough for my dinner and a lunch box, without filling the pot to the top.', 'I cooked short-grain rice on October 12, 15 and 18, rinsed it first, and used the inside water mark each time.', 'Rice stuck around the bottom after I left keep-warm on for four hours. On October 17 I soaked the pot before washing and still spent ten minutes loosening that ring.', 'The keep-warm setting dries the edge if I leave dinner waiting for a long time.', 'keep-warm-drying'),
    'drinkware': ('The handle fits two of my fingers and I can set both cups beside my small breakfast plate.', 'I have used one for coffee and one for tea since October 10, then hand-washed both after breakfast.', 'One handle had a rough patch underneath. It catches my finger when I carry a full cup; I photographed the spot beside a coin on October 16 and requested an exchange.', 'I expected a heavier mug; this one feels light in my hand.', 'handle-finish'),
    'apron': ('The neck adjustment let me move the top edge higher while chopping onions at my narrow counter.', 'I washed it three times on a cold cycle and hung it from the waist tie rather than using a dryer.', 'The neck strap twisted and the adjuster crept down while I kneaded dough on October 18. I reset it twice in twenty minutes; the pockets were empty, so they were not pulling it down.', 'The fabric needed a quick press after line drying.', 'strap-adjustment'),
    'tray': ('My two breakfast cups and a small plate fit if I leave the handles pointing towards the corners.', 'I carried tea from the counter to the desk on October 11, 13 and 17, and wiped the surface straight afterwards.', 'The underside rocked on my flat dining table. I turned it around and tested the same corner again on October 15; a full glass wobbled enough that I stopped carrying drinks on it.', 'There is less usable space around the curved edge than I first pictured.', 'base-rock'),
    'portable-speaker': ('It paired with my phone after I held the power button and appeared in the Bluetooth list.', 'I played a podcast while cooking on October 12 and 16, with the phone on the other side of the same kitchen.', 'The connection dropped three times during one twenty-minute playlist with my phone two metres away. I re-paired it on October 18 and it still cut out when I opened a second app.', 'Voices are clear to me, but the bass sounds small in my room.', 'connection-drop'),
    'desktop-organizer': ('I separated pens, sticky notes and charging leads instead of leaving all three tangled together.', 'After a week on my desk I moved the notes to the front section; my long ruler still needs to sit beside it.', 'The bottom edge had a raised seam that caught the desk mat. I ran a folded sheet of paper underneath on October 16 and it snagged in the same place, so I put felt under it.', 'My larger scissors need their own cup beside the organizer.', 'rough-base'),
    'matcha-set': ('The bowl gives me room to whisk a small serving without hitting the rim with every movement.', 'I made matcha on three mornings after October 11, rinsed the whisk immediately, and left it upright to dry.', 'Several whisk tips were bent out of the packet. When I tried a second drink on October 17, two tips caught the rim and snapped; I took a close photo before asking for a replacement.', 'The bowl is wider than my usual mug, so it takes more cupboard space.', 'whisk-finish'),
    'stovetop-coffee': ('I used the compatible stovetop listed for this version and stopped heating when the coffee began sputtering.', 'On October 12 and 15 I used medium-fine grounds without tamping and rinsed the pot after it cooled.', 'The handle screw on my pot loosened during the second use. I noticed movement while pouring on October 16, set it down, and stopped using it rather than trying a third pot.', 'The stated cups are little coffee servings, not three or four full mugs.', 'handle-fastener'),
    'vase': ('Two short stems stood upright when I trimmed them to suit the narrow opening.', 'I changed the water on October 11, 14 and 17 and used a small brush to reach the inside bottom.', 'There was a small chip along the rim when I opened it. I found it while wiping the edge on October 16, took two close photos, and left the stems out while I arranged a return.', 'The opening is better for a few stems than a whole bouquet.', 'rim-damage'),
    'scented-candle': ('I noticed the scent beside my reading chair after the candle had been lit for about twenty minutes.', 'I trimmed the wick before my second and third evenings with it and let the melted surface settle before moving it.', 'The scent was much stronger to me than I expected in my small room. After twenty minutes on October 17 I put it out and opened the door; I will not use this scent there again.', 'I like the scent, although I only use it for a short time in my small room.', 'scent-intensity'),
    'filled-cushion': ('It arrived with an insert inside, so I could put it straight on the chair after taking off the packaging.', 'I removed the cover for a cold wash three times, dried it on the line and put it back around the same insert.', 'The insert flattened under my elbow after a week on the sofa. I shook it out on October 16 and again the next day, but the middle still felt thinner than the corners to me.', 'The filled shape is softer than the upright look I had in mind.', 'fill-support'),
    'cushion-cover': ('I used my own 45 by 45 centimetre insert; there is no filling supplied with this cover.', 'I washed the cover three times on cold, let it line-dry and put it back on my existing insert each time.', 'The zipper jammed halfway when I fitted my insert on October 16. I removed the insert and tried again with no pressure on the fabric; it caught at the same two teeth.', 'It needs an insert you already own or buy separately.', 'zipper-jam'),
    'oat-milk': ('I used it in iced coffee and gave the carton a shake before pouring it over the ice.', 'This is my repeat order; I opened it on October 14 and wrote that date on the side before putting it in the fridge.', 'The carton corner was crushed and damp inside the delivery bag. I took photos before opening it on October 17, contacted support, and did not use that carton for my coffee.', 'The oat flavour is more noticeable in plain tea than in my coffee.', 'damaged-carton'),
    'spinach': ('I washed and sorted the leaves, then used half with scrambled eggs and saved the rest in the fridge.', 'I ordered this pack again for two weekday dinners; on October 15 I trimmed the longer stems before cooking.', 'A cluster of leaves at the bottom was dark and wet when I opened the bag on October 16. I spread everything on a plate for a photo; the top layer had hidden the damaged part.', 'There were a few long stems to trim before I cooked it.', 'leaf-condition'),
    'enoki': ('I cut away the joined root end and split the stems before adding them to a pot of tofu stew.', 'This is a repeat order for sundubu; on October 14 I checked the sealed packet, opened it and separated the stems into two portions for dinner.', 'The packet seam had split inside the delivery bag. I photographed the open edge and the wet paper around it on October 16 and asked for a refund instead of cooking that pack.', 'I need to cut off the firm joined base before separating the mushrooms.', 'pack-seal'),
    'cherry-tomatoes': ('I rinsed them and cut a handful in half for lunch; there was enough left for another bowl.', 'I ordered the same size again for weekday lunches, kept them in the fridge, and sorted them when the order arrived on October 14.', 'Six tomatoes at the bottom were split and leaking when I opened the punnet on October 16. The top looked fine, so I photographed both layers and counted the damaged ones for support.', 'The tomatoes in my pack varied in size, which made neat halves a bit slower.', 'split-fruit'),
    'soft-tofu': ('I slid the tofu into simmering broth after cutting the pack open with scissors rather than pulling it apart.', 'This is my second order; I checked the seal before opening the pack for sundubu on October 13 and added it after the broth started simmering.', 'The outer bag was wet and one pack had a split seam on arrival. I photographed the seam beside the label on October 17, kept it unopened, and requested a replacement.', 'It breaks into soft pieces when stirred; I add it near the end of cooking.', 'pack-seal'),
    'midi-dress': ('I am 164 centimetres tall; size M ended below my knee and I could sit down without pulling the skirt straight first.', 'I wore it to dinner on October 12, then washed it cold three times and line-dried it as the care note says.', 'The seam at one side of the waist puckered on my dress. I tried it on twice on October 17 and photographed it both standing and sitting; steaming the fabric did not smooth that section.', 'The listed length is useful; I would measure a dress I own before choosing.', 'seam-finish'),
    'blouse': ('At 162 centimetres tall the size M hem covered the waistband of my trousers without needing a full tuck.', 'I wore it for two dinners after October 10 and hand-washed it three times, leaving it on a hanger to dry.', 'The buttonhole stitching had a loose loop that caught the third button. I photographed it on October 16 before wearing it out; unfastening that button pulled the loop longer.', 'I needed to smooth the sleeve creases after it came out of the parcel.', 'buttonhole-finish'),
    'shoulder-bag': ('My phone, a small card holder and lipstick fit together; I left my water bottle at home.', 'I carried it for dinner on October 12 and a cafe visit on October 16, with the same small items inside both times.', 'The strap attachment squeaked and showed a rough edge against my blouse. I photographed the join after a single evening on October 17 and asked to exchange it instead of trimming it myself.', 'I would check the listed dimensions if you want to carry a long wallet.', 'strap-finish'),
    'lipstick': ('I applied one layer before dinner; the shade looked warmer under the restaurant lights than beside my window.', 'I used it on October 10, 12 and 17, blotting once with a tissue each time, and touched it up after eating.', 'The bullet leaned against the case when I twisted it up. I extended it only a little on October 16 and it still scraped one side, leaving a mark inside the cap before I could wear it out.', 'Colour transferred to my coffee cup, so I brought it along for a touch-up.', 'bullet-alignment'),
    'pressed-powder': ('I used a light layer on the centre of my face and checked the shade in daylight before leaving home.', 'I carried the compact on October 11, 14 and 17; I used my own brush and wiped the mirror before putting it away.', 'The powder arrived cracked around one edge. I opened the parcel on October 16, photographed the compact before touching the pan, and requested an exchange because loose powder fell into the hinge.', 'The shade looks a little different in my warm bathroom light than in daylight.', 'pan-damage'),
    'perfume': ('I sprayed it once on a paper strip before using it; to me the cedar became more noticeable after the first few minutes.', 'I used one spray before dinner on October 11 and 17 and kept the capped bottle upright in my bag pocket.', 'The spray head dribbled down the neck instead of making an even mist. I tested it on paper three times on October 16 and photographed the wet ring under the nozzle for an exchange.', 'The scent is a personal choice; I would try a small amount first.', 'spray-nozzle'),
    'hoop-earrings': ('The size in the listing helped me compare these with a pair I already own before ordering.', 'I wore the pair to dinner on October 12 and again on October 17, then wiped them with a dry cloth before putting them away.', 'One hinged post did not click shut securely. I opened and closed it five times over a tray on October 16 and it still came loose with a light pull, so I did not wear that pair outside.', 'The finish reads warmer under indoor lights than beside my window.', 'closure-fit'),
    'powder-brush': ('I used it with pressed powder, tapping off the extra before sweeping it across my cheeks.', 'I washed it three times with a mild cleanser, rinsed the bristles and dried it flat with the head over the counter edge.', 'The metal ferrule turned against the handle after the second wash. I let it dry fully and checked again on October 17; it still moved when I applied powder, so I stopped using it.', 'The head is broader than my small travel brush, so I use less powder.', 'ferrule-fit'),
}

AUTHORS = ['윤**', 'ji**', '박**', '소소한아침', 'Mina', '정**', 'dail***', '김**', '하루한번', '이**', 'min***', 'S***', '최**', '초록**', 'yoon***', '오**']

def band(price):
    return 'under-10k' if price < 10000 else 'under-30k' if price < 30000 else 'under-70k' if price < 70000 else 'premium'

def facts_text(facts):
    return '; '.join(f'{k}: {str(v).lower() if isinstance(v, bool) else v}' for k, v in facts.items())

skus, reviews = [], []
for gi, (group, base_id, variants) in enumerate(GROUPS):
    base = originals[base_id]
    for vi, (name, price, facts, palette, color) in enumerate(variants):
        sku_id = f'compare-{group}-{vi+1}'
        slow = vi == 1 or gi % 4 == 0
        delivery = 'Standard delivery · in 3 days (simulation)' if slow else 'Rocket delivery · tomorrow by 7am'
        sku = {
            'id': sku_id, 'name': name, 'type': base['type'], 'color': color,
            'price': price, 'category': base['category'],
            'vibeTags': list(base['vibeTags']), 'palette': palette, 'priceBand': band(price),
            'aliases': [name.lower(), group.replace('-', ' '), f'{base["type"]} alternative'],
            'description': f'{name}. {facts_text(facts)}. Synthetic comparison catalog item for this concept demo.',
            'facts': {**facts, 'comparisonGroup': group,
                      'dataOrigin': 'Synthetic demo catalog; not a verified merchant listing'},
            'reviewIds': [f'{sku_id}-R{i:02}' for i in range(1,17)], 'delivery': delivery,
        }
        skus.append(sku)
        good, repeat, bad, tradeoff, tag = OBS[group]
        size_note = facts_text(facts)
        # Four substantive reviews; dates and experiences are intentionally seeded, never claims of live transactions.
        detail_good = f'10/12 purchase, writing after a few uses. I checked the version before ordering: {size_note}. {good} I kept the packaging until I had tried it at home, because the photos alone did not tell me how it would fit my routine.'
        detail_repeat = f'재구매 / repeat order, same listed version. {repeat} {good} This is about my own use, not just the delivery. I attached a photo next to the things I normally use it with; please check your own space and the listed measurements.'
        detail_bad = f'배송은 문제 없었는데 상품은 아쉬워요. {bad} This is the exact version I received: {size_note}. I am leaving the close-up photo because the five-star delivery comments did not show this detail. One star for the item I received, not the courier.'
        detail_middle = f'보통이에요, depends what you need. {tradeoff} {good} I read the listed details ({size_note}) but imagined it a little differently. I have added a photo in ordinary room light so the next person can compare it with their own setup before choosing.'
        rows = [
            (5, '배송 빠름', '배송 빠름 👍 포장도 괜찮아요', 0, False, ['delivery'], False),
            (5, '잘 받았어요', '잘 받았습니다. 아직 오래 안써봄', 1, False, ['delivery'], False),
            (5, 'fits my routine', detail_good, 47 + gi, True, ['in-use', 'fit'], True),
            (1, '사진 보고 결정하세요', detail_bad, 214 + gi * 3 + vi, True, [tag], True),
            (5, 'good', 'good good 배송 굿', 0, False, ['delivery'], False),
            (5, '선물용', '선물이라 아직 안뜯었어요. gift, unopened, 5 stars', 0, False, ['gift', 'unopened'], False),
            (5, '또 주문했어요', detail_repeat, 26 + gi, True, ['repeat-purchase', 'in-use'], True),
            (5, '배송 만족', '주문한 날짜에 왔어요 기사님 감사합니다', 2, False, ['delivery'], False),
            (5, '괜찮네요', '괜찮네요 생각보다 무난함', 0, False, ['in-use'], True),
            (3, '기대랑은 조금 달라요', detail_middle, 12 + vi, True, ['tradeoff'], True),
            (5, 'ok', 'ok 잘쓰는중요', 0, False, ['in-use'], True),
            (5 if vi == 1 else 4, '한번 써봄', tradeoff, 3, False, ['tradeoff'], True),
            (5, '포장 깔끔', '포장이 깔끔해서 좋앗어요. delivery만 일단 별다섯', 0, False, ['delivery'], False),
            (1, '교환 신청', f'제것도 {tag} 문제가 있었어요. {bad} 교환 접수했고 답변 기다리는 중입니다.', 8 + vi, True, [tag], True),
            (5, '사진 남겨요', '받자마자 찍은 사진이에요. 색은 집 조명이라 참고만', 4, True, ['arrival-photo'], False),
            (5, '만족', '무난하고 잘 쓰고 있어요 ㅎㅎ', 1, False, ['in-use'], True),
        ]
        for ri, (stars, title, text, helpful, photo, tags, relevant) in enumerate(rows):
            reviews.append({'id': sku['reviewIds'][ri], 'skuId': sku_id, 'stars': stars,
                            'date': f'2026-10-{20 + ri % 6:02}', 'author': AUTHORS[(ri+gi+vi)%len(AUTHORS)],
                            'title': title, 'text': text, 'helpful': helpful,
                            'photo': photo, 'tags': tags, 'relevant': relevant})

for filename, records in [('comparison-catalog.json', skus), ('comparison-reviews.json', reviews)]:
    (ROOT / 'data' / filename).write_text(json.dumps(records, ensure_ascii=False, indent=2) + '\n')
print(f'{len(skus)} comparison SKUs; {len(reviews)} seeded reviews')
