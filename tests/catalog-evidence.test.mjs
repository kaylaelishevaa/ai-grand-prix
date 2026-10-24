import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import catalog from '../data/catalog.json' with {type:'json'};
import replacements from '../data/catalog-replacements.json' with {type:'json'};
const root=new URL('../',import.meta.url);

test('source catalog and public catalog agree; every listing retains an unchanged local source image',async()=>{
 const browser={window:{}};vm.runInNewContext(await readFile(new URL('public/coupang-products.js',root),'utf8'),browser);
 assert.deepEqual(JSON.parse(JSON.stringify(browser.window.COUPANG_PRODUCTS)),catalog);
 assert.equal(new Set(catalog.map(p=>p.id)).size,catalog.length);
 for(const product of catalog){
  assert.equal(new URL(product.url).hostname,'www.coupang.com');
  assert.match(product.url,/\/vp\/products\/\d+/);
  assert.match(new URL(product.sourceImageUrl).hostname,/^thumbnail\d*\.coupangcdn\.com$/);
  assert.match(product.image,/^\/products\/[a-z0-9._-]+\.(jpg|png)$/);
  const bytes=await readFile(new URL('public'+product.image,root));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),product.imageSha256,product.id);
  assert(Array.isArray(product.verifiedAttributes));
 }
});

test('demo keeps product groups while retired preview listings resolve to distinct sourced replacements',()=>{
 const pink=catalog.filter(p=>p.productType==='lipstick'&&p.tags.includes('pink'));
 assert.equal(pink.length,10);assert(new Set(pink.map(p=>p.brand)).size>=6);
 assert(catalog.filter(p=>p.tags.includes('optical')).length>=6);
 assert(catalog.filter(p=>p.tags.includes('sunglasses')).length>=3);
 for(const id of ["1814412512", "7322824636", "7185725748", "55518713", "9026994633", "9474375760", "6431292464", "8533828112", "6285676894", "7612276799", "6274724147", "8561267958"]) assert(catalog.some(p=>p.id===id),id);
 assert.equal(replacements.length,14);
 assert.equal(new Set(replacements.map(p=>p.replacementId)).size,replacements.length);
 for(const replacement of replacements){
  assert(!catalog.some(p=>p.id===replacement.retiredId),'Retired preview must not be recommended');
  const current=catalog.find(p=>p.id===replacement.replacementId);
  assert(current,replacement.replacementId);
  assert.equal(current.productType,replacement.productType);
  assert.equal(current.preview.available,true);
 }
 for(const p of pink){assert.equal(p.preview.available,true);assert.match(p.preview.color,/^#[a-f0-9]{6}$/);assert.equal(p.preview.shadeVerified,false);assert.equal(p.preview.sampleRegionPixels.length,4);}
});

test('related collections each have six distinct sourced options and lip balm supports view more',()=>{
 const groups={
  redLipstick:catalog.filter(p=>p.productType==='lipstick'&&p.tags.includes('red')),
  lipbalm:catalog.filter(p=>p.productType==='lipbalm'),
  optical:catalog.filter(p=>p.productType==='glasses'&&p.tags.includes('optical')),
  sunglasses:catalog.filter(p=>p.productType==='glasses'&&p.tags.includes('sunglasses')),
  basicTshirts:catalog.filter(p=>p.productType==='tshirt'&&p.collectionStyle==='basic'),
  brandedTshirts:catalog.filter(p=>p.productType==='tshirt'&&p.collectionStyle==='branded'),
  hoodies:catalog.filter(p=>p.productType==='hoodie'),
  sweaters:catalog.filter(p=>p.productType==='sweater'),
  chairs:catalog.filter(p=>p.productType==='chair'),
  lamps:catalog.filter(p=>p.productType==='lamp'),
 };
 for(const [name,products] of Object.entries(groups)){
  assert(new Set(products.map(p=>p.id)).size>=6,`${name} needs six distinct options`);
  assert(new Set(products.map(p=>p.imageSha256)).size>=6,`${name} needs six distinct source photos`);
 }
 assert(groups.lipbalm.length>=10);
 for(const p of groups.brandedTshirts)assert(p.brand,`Branded collection needs an identified brand: ${p.id}`);
 for(const p of catalog.filter(p=>p.productType==='tshirt'))assert(['basic','branded'].includes(p.collectionStyle));
});

test('review summaries require sourced samples; unavailable evidence stays empty and unusable preview photos are explicit',()=>{
 const sourced=catalog.filter(p=>p.reviewEvidence.reviews.length);
 assert(sourced.length>=19,'Core recommendation options need real review samples');
 assert(new Set(sourced.map(p=>p.url.match(/\/products\/(\d+)/)[1])).size>=10,'Review coverage must include distinct product families');
 for(const id of ['1814412512','7322824636','7185725748','7612276799','6431292464','6285676894']){
  assert(sourced.some(p=>p.id===id),`Default recommendation needs review samples: ${id}`);
 }
 for(const p of catalog){
  const e=p.reviewEvidence;assert.equal(new URL(e.sourceUrl).protocol,'https:');
  if(e.status==='unavailable'){
   assert.equal(e.rating,null);assert.equal(e.reviewCount,null);assert.equal(e.summary,null);assert.deepEqual(e.pros,[]);assert.deepEqual(e.cons,[]);assert.deepEqual(e.reviews,[]);
  }else{
   assert.equal(e.summaryKind,'ai-curated');assert.match(e.scopeNote,/sample/i);
   assert(e.rating===null||(Number.isFinite(e.rating)&&e.rating>=1&&e.rating<=5));
   assert(Number.isInteger(e.reviewCount)&&e.reviewCount>=e.reviews.length);
   if(e.sourceProductId){
    assert.equal(new URL(e.sourceCoupangUrl).hostname,'www.coupang.com');
    assert.equal(e.sourceCoupangUrl.match(/\/products\/(\d+)/)[1],e.sourceProductId);
    assert.equal(p.url.match(/\/products\/(\d+)/)[1],e.sourceProductId,'Reviews must belong to the same retailer product family');
   }
   for(const r of e.reviews){assert.equal(r.translated,true);assert.equal(r.kind,'translated-paraphrase');assert.equal(r.sourceUrl,e.sourceUrl);assert.match(r.date,/^\d{4}-\d{2}-\d{2}$/);assert(r.text.length>10);assert(r.rating>=1&&r.rating<=5);}
  }
  if(p.preview.available===false)assert(p.preview.unavailableReason.length>20);
 }
});
