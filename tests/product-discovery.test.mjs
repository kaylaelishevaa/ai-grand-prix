import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import sourcedCatalog from '../data/catalog.json' with {type:'json'};
import {searchProducts} from '../lib/nook-voice.mjs';

const source=readFileSync(new URL('../public/product-discovery.js',import.meta.url),'utf8');
const catalog=[
  ...Array.from({length:12},(_,i)=>({id:`lip-${i}-pink`,name:`Pink lipstick ${i}`,productType:'lipstick',category:'makeup',brand:i%2?'Beta':'Alpha',price:i===11?20000:8000,tags:['pink','lipstick'],verifiedAttributes:['matte']})),
  {id:'red-1',name:'Alpha Red',productType:'lipstick',category:'makeup',brand:'Alpha',price:9000,tags:['red','lipstick']},
  {id:'red-expensive',name:'Red premium',productType:'lipstick',category:'makeup',price:40000,tags:['red','lipstick']},
  {id:'purple-1',name:'Purple',productType:'lipstick',category:'makeup',price:9000,tags:['purple','lipstick']},
  {id:'price-unknown',name:'Pink unknown price',productType:'lipstick',category:'makeup',tags:['pink','lipstick']},
  {id:'optic',name:'Optical glasses',productType:'glasses',category:'glasses',price:12000,tags:['eyeglasses','clear lenses','black']},
  {id:'sun',name:'Sunglasses',productType:'glasses',category:'glasses',price:15000,tags:['sunglasses','black']},
  {id:'lamp',name:'Pink desk lamp',productType:'lamp',category:'desk',price:5000,tags:['pink','lamp']},
];
function storage(initial) {
  const data=new Map(initial?[['coupi.collections.v1',JSON.stringify(initial)]]:[]);
  return {getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value),data};
}
function setup(saved=storage(),products=catalog) {
  const context={window:{}};vm.createContext(context);vm.runInContext(source,context);
  return new context.window.CoupiDiscovery(products,{storage:saved});
}
const ids=products=>Array.from(products,p=>p.id);

test('chair discovery preserves requested use through voice results, browsing, skip and saved collections',()=>{
  const expected={office:['7330605115','7395651009'],floor:['6908241889','8491783776'],dining:['6775922884','6775922884-gray']};
  for(const [style,queries] of Object.entries({office:['office chair','desk chair','책상 의자'],floor:['floor chair','좌식의자'],dining:['dining chair','식탁의자']}))for(const query of queries){
    const saved=storage(),d=setup(saved,sourcedCatalog),voice=searchProducts({query,category:'desk'});
    for(const options of [{query},{...voice,sourceOnly:true}]){
      d.recommend(sourcedCatalog.filter(p=>p.productType==='chair'),options);
      assert.deepEqual(ids(d.products).sort(),expected[style],query);
      d.viewMore();assert(d.visible.every(p=>p.chairStyle===style));
    }
    const record=d.saveCollection(),restored=setup(saved,sourcedCatalog);restored.restoreCollection(record.id);
    assert.deepEqual(ids(restored.products).sort(),expected[style]);
    restored.nextTheme();assert(restored.products.every(p=>p.chairStyle===style));
    restored.nextCollection();assert.equal(restored.productType,'lamp');
    restored.nextCollection();assert.equal(restored.productType,'chair');assert(restored.products.every(p=>p.chairStyle===style),'skip must not reintroduce incompatible chair heights');
  }
  const d=setup(storage(),sourcedCatalog);
  d.recommend([],{query:'chair'});assert.equal(d.total,6);
  d.recommend([],{query:'office chair under 30000'});assert.equal(d.total,0,'do not pad an unavailable office-chair budget with floor seats');
  for(const query of ['chairs without floor chairs','좌식의자 말고 의자']){
    d.recommend([],{query});assert.equal(d.total,4);assert(d.products.every(p=>p.chairStyle!=='floor'));
  }
});

test('initial six and expanded ten retain explicit selection without duplicate or invented catalog items',()=>{
  const d=setup();d.recommend([catalog[2],catalog[2],{id:'invented'}],{query:'show me pink lipsticks'});
  assert.equal(d.visible.length,6);assert.equal(d.current.id,catalog[2].id);assert.equal(d.hasMore,true);
  d.viewMore();assert.equal(d.visible.length,10);assert.equal(d.hasMore,false);
  const chosen=d.visible[8];assert.equal(d.select(chosen.id),chosen);assert.equal(d.current,chosen);
  assert.equal(d.select('invented'),null);assert.equal(d.current,chosen);
  assert.equal(new Set(ids(d.products)).size,d.products.length);
});
test('six-to-ten expansion preserves exact requested color, budget, type and brand constraints',()=>{
  const d=setup();d.recommend([catalog[11],catalog.at(-1)],{query:'Find me Alpha pink lipsticks under 10,000 won',category:'makeup',maxPrice:10000});
  assert.equal(d.products.length,6);
  for(const p of d.products){assert.equal(p.brand,'Alpha');assert(p.tags.includes('pink'));assert.equal(p.productType,'lipstick');assert(p.price<=10000);}
  d.viewMore();assert.equal(d.visible.length,6);assert.equal(d.hasMore,false);
  assert.equal(d.products.some(p=>p.id==='price-unknown'),false);
});
test('next theme changes color within product type and preserves budget and brand',()=>{
  const d=setup();d.recommend(catalog.slice(0,3),{query:'Alpha pink lipstick under 10000',maxPrice:10000});
  const next=d.nextTheme();assert.equal(next.changed,true);assert.equal(next.theme,'red');
  assert.deepEqual(ids(d.products),['red-1']);assert.equal(d.current.id,'red-1');assert.equal(d.maxPrice,10000);
  assert.equal(d.nextTheme().theme,'pink');
});
test('glasses can switch optical to sunglasses without leaving glasses or widening an unavailable budget',()=>{
  const d=setup();d.recommend([catalog.find(p=>p.id==='optic')],{query:'normal glasses',maxPrice:13000});
  assert.equal(d.theme,'optical');assert.deepEqual(ids(d.products),['optic']);assert.equal(d.nextTheme().changed,false);
  d.recommend([],{query:'normal glasses',maxPrice:20000});assert.equal(d.nextTheme().theme,'sunglasses');assert.deepEqual(ids(d.products),['sun']);
});
test('collections preserve whole group, selected variant, and view-more state across reload and theme changes',()=>{
  const saved=storage(),d=setup(saved);d.recommend([catalog[0]],{query:'pink lipstick',maxPrice:10000});d.viewMore();d.select('lip-8-pink');
  const record=d.saveCollection();assert.equal(record.persisted,true);assert.equal(record.name,'Pink lipsticks');assert.equal(record.ids.length,10);
  d.nextTheme();assert.equal(d.theme,'red');
  const reloaded=setup(saved);assert.equal(reloaded.collections.length,1);assert.equal(reloaded.collections[0].productCount,10);
  const restored=reloaded.restoreCollection(record.id);assert.equal(restored.theme,'pink');assert.equal(restored.current.id,'lip-8-pink');assert.equal(restored.visible.length,10);
  assert.equal(reloaded.removeCollection(record.id),true);assert.equal(setup(saved).collections.length,0);
});
test('invalid collection schema and unknown IDs are ignored; removed catalog items never reappear',()=>{
  const broken=storage({version:1,collections:[null,{id:'bad',ids:'not an array'},{id:'good',name:'Test',ids:['invented','lip-1-pink','lip-1-pink','lamp'],selectedId:'invented',productType:'lipstick',query:'pink lipstick',maxPrice:-5}]});
  const d=setup(broken);assert.equal(d.collections.length,1);assert.deepEqual(ids(d.collections[0].products),['lip-1-pink']);
  assert.equal(d.restoreCollection('good').current.id,'lip-1-pink');assert.equal(d.maxPrice,null);
  const unsupported=setup(storage({version:999,collections:[{id:'x',ids:['lip-1-pink']}]}));assert.equal(unsupported.collections.length,0);
  const malformed=storage();malformed.data.set('coupi.collections.v1','{broken');assert.equal(setup(malformed).collections.length,0);
});
test('blocked browser storage keeps collection usable in this session and reports persistence failure',()=>{
  const d=setup({getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}});
  d.recommend([catalog[0]],{query:'pink lipstick'});const result=d.saveCollection();
  assert.equal(result.persisted,false);assert.equal(d.collections.length,1);assert.equal(d.restoreCollection(result.id).current.id,catalog[0].id);
});
test('explicit mixed worlds preserve their exact sourced items, title and selected product across save and reload',()=>{
  const saved=storage(),d=setup(saved),seeds=[catalog[0],catalog.find(p=>p.id==='lamp'),catalog.find(p=>p.id==='optic')];
  d.recommend(seeds,{mixed:true,sourceOnly:true,groupLabel:'Your cozy corner',maxPrice:10000});
  assert.deepEqual(ids(d.products),['lip-0-pink','lamp']);assert.equal(d.label,'Your cozy corner');assert.equal(d.select('lamp').id,'lamp');
  const record=d.saveCollection(),restored=setup(saved);restored.restoreCollection(record.id);
  assert.deepEqual(ids(restored.products),['lip-0-pink','lamp']);assert.equal(restored.current.id,'lamp');assert.equal(restored.label,'Your cozy corner');
  d.recommend(seeds,{mixed:true});assert(d.products.every(p=>p.productType==='lipstick'),'Mixed types require an explicit source-only group');
});
test('skipping a mixed world finds a related group for its selected product and retains its budget',()=>{
  const products=[...catalog,{id:'chair',name:'Chair',productType:'chair',category:'desk',price:9000,tags:['chair']}],d=setup(storage(),products);
  d.recommend([products[0],products.find(p=>p.id==='lamp')],{mixed:true,sourceOnly:true,groupLabel:'Your world',maxPrice:10000});d.select('lamp');
  assert.equal(d.nextCollection().changed,true);assert.equal(d.productType,'chair');assert.deepEqual(ids(d.products),['chair']);assert.equal(d.label,'Chairs');assert.equal(d.maxPrice,10000);
  d.recommend([products[0]],{productType:'lipstick',maxPrice:d.maxPrice});assert.equal(d.mixed,false);assert.equal(d.label,'Lipsticks');
});
test('comparison is explicit, limited to three compatible products, and independent of current browsing group',()=>{
  const d=setup();assert.equal(d.toggleCompare('lip-0-pink').ok,true);assert.equal(d.toggleCompare('optic').ok,false);
  assert.equal(d.toggleCompare('lip-1-pink').ok,true);assert.equal(d.toggleCompare('red-1').ok,true);assert.equal(d.toggleCompare('purple-1').ok,false);
  d.recommend([],{query:'sunglasses'});assert.equal(d.comparison.length,3);
  assert.equal(d.toggleCompare('lip-1-pink').selected,false);assert.equal(d.comparison.length,2);assert.equal(d.toggleCompare('purple-1').ok,true);
  d.clearCompare();assert.equal(d.comparison.length,0);assert.equal(d.toggleCompare('optic').ok,true);assert.equal(d.toggleCompare('invented').ok,false);
});


test('natural phrasing and explicit exclusions do not turn a negative color into a positive theme',()=>{
  const d=setup();d.recommend([],{query:'Can you show me pink lipstick please',maxPrice:10000});assert.equal(d.products.length,11);assert.equal(d.theme,'pink');
  d.recommend([],{query:'I need lipstick, not pink',maxPrice:10000});assert.equal(d.theme,'');assert(d.products.length>0);assert(d.products.every(p=>!p.tags.includes('pink')));
  for(let i=0;i<6;i++){d.nextTheme();assert.notEqual(d.theme,'pink');assert(d.products.every(p=>!p.tags.includes('pink')));assert(d.products.every(p=>p.price<=10000));}
});

test('trusted server candidates retain ranking and known constraints without strict natural-language refiltering or catalog padding',()=>{
  const d=setup();const seeds=[catalog[4],catalog[0],catalog[2]];
  d.recommend(seeds,{query:'Can you help me find pink lipstick that suits my next big date',sourceOnly:true,maxPrice:10000,constraints:{colors:{include:['pink'],exclude:[]},eyewear:{include:[],exclude:[]}}});
  assert.deepEqual(ids(d.products),ids(seeds));assert.equal(d.total,3);assert.equal(d.theme,'pink');
  d.recommend([catalog[0],catalog.find(p=>p.id==='red-1')],{query:'lipstick but not pink',sourceOnly:true,maxPrice:10000,constraints:{colors:{include:[],exclude:['pink']},eyewear:{include:[],exclude:[]}}});
  assert.deepEqual(ids(d.products),['red-1']);assert.equal(d.theme,'');d.nextTheme();assert(d.products.every(p=>!p.tags.includes('pink')));
});

test('collections retain exclusions across a reload and never save invisible products past the demo cap',()=>{
  const saved=storage(),d=setup(saved);d.recommend([],{query:'not pink lipstick',maxPrice:10000});const group=d.saveCollection();
  const reloaded=setup(saved);reloaded.restoreCollection(group.id);for(let i=0;i<5;i++){reloaded.nextTheme();assert(reloaded.products.every(p=>!p.tags.includes('pink')));}
  d.recommend([],{query:'pink lipstick'});const pink=d.saveCollection();assert.equal(pink.ids.length,10);assert(pink.ids.every(id=>d.select(id)));
});

test('negative eyewear requests never reintroduce sunglasses while switching style groups',()=>{
  const d=setup();d.recommend([],{query:'Can you show me glasses without sunglasses',maxPrice:20000});assert.deepEqual(ids(d.products),['optic']);
  assert.equal(d.nextTheme().theme,'optical');assert.deepEqual(ids(d.products),['optic']);assert.equal(d.nextTheme().changed,false);
});

const relatedCatalog=[...catalog,
  ...Array.from({length:10},(_,i)=>({id:`balm-${i}`,name:`Lip balm ${i}`,productType:'lipbalm',category:'makeup',brand:i%2?'Alpha':'Beta',price:6000+i*100,tags:['lipbalm']})),
  ...['basic','branded'].flatMap(style=>Array.from({length:6},(_,i)=>({id:`shirt-${style}-${i}`,name:`${style} T-shirt ${i}`,productType:'tshirt',category:'clothes',collectionStyle:style,price:15000,tags:['tshirt',style]}))),
  ...['hoodie','sweater'].flatMap(type=>Array.from({length:6},(_,i)=>({id:`${type}-${i}`,name:`${type} ${i}`,productType:type,category:'clothes',price:18000,tags:[type]}))),
];
test('next collection changes lipstick to lip balm, shows six then ten, and restores the exact saved group',()=>{
  const saved=storage(),d=setup(saved,relatedCatalog);d.recommend([],{query:'pink lipstick',maxPrice:10000});const pink=d.saveCollection();
  const next=d.nextCollection();assert.equal(next.productType,'lipbalm');assert.equal(next.label,'Lip balms');assert.equal(next.visible.length,6);assert(next.products.every(p=>p.price<=10000));
  d.viewMore();assert.equal(d.visible.length,10);d.select('balm-8');const balm=d.saveCollection();
  d.nextCollection();assert.notEqual(d.productType,'lipbalm');
  const restored=setup(saved,relatedCatalog);restored.restoreCollection(balm.id);assert.equal(restored.productType,'lipbalm');assert.equal(restored.current.id,'balm-8');assert.equal(restored.visible.length,10);
  restored.restoreCollection(pink.id);assert.equal(restored.theme,'pink');assert.equal(restored.productType,'lipstick');assert(restored.products.every(p=>p.tags.includes('pink')));
});
test('related collections preserve exclusions and budget, with no padding using unrelated products',()=>{
  const d=setup(storage(),relatedCatalog);d.recommend([],{query:'lipstick not pink',maxPrice:6500});
  assert.equal(d.total,0);assert.equal(d.nextCollection().productType,'lipbalm');assert.equal(d.visible.length,6);assert(d.products.every(p=>p.price<=6500&&!p.tags.includes('pink')));
  d.recommend([],{query:'glasses without sunglasses',maxPrice:20000});d.nextCollection();assert(d.products.every(p=>p.id==='optic'));
  d.recommend([],{query:'Alpha pink lipstick',maxPrice:10000});d.nextCollection();assert.equal(d.productType,'lipbalm');assert(d.products.every(p=>p.brand==='Alpha'));
});
test('basic shirts lead to branded shirts; hoodies lead to sweaters; saved style survives reload',()=>{
  const saved=storage(),d=setup(saved,relatedCatalog);d.recommend([],{query:'basic t-shirts'});assert.equal(d.collectionStyle,'basic');assert.equal(d.visible.length,6);
  d.nextCollection();assert.equal(d.collectionStyle,'branded');assert.equal(d.visible.length,6);assert(d.visible.every(p=>p.collectionStyle==='branded'));const branded=d.saveCollection();
  const restored=setup(saved,relatedCatalog);restored.restoreCollection(branded.id);assert.equal(restored.label,'Branded T-shirts');assert.equal(restored.collectionStyle,'branded');
  d.recommend([],{query:'hoodies'});assert.equal(d.nextCollection().productType,'sweater');assert.equal(d.visible.length,6);
});

test('related browsing retains explicit brands from ranked voice results and excludes refused product types',()=>{
  const saved=storage(),d=setup(saved,relatedCatalog);
  d.recommend(catalog.slice(0,4),{query:'Find me Alpha pink lipstick for my next big date',sourceOnly:true});
  d.nextCollection();assert.equal(d.productType,'lipbalm');assert(d.products.every(p=>p.brand==='Alpha'));
  const record=d.saveCollection(),restored=setup(saved,relatedCatalog);restored.restoreCollection(record.id);restored.nextCollection();assert(restored.products.every(p=>p.brand==='Alpha'));
  d.recommend(catalog.slice(0,4),{query:'pink lipstick, not lip balm',productType:'lipstick',sourceOnly:true});
  for(let i=0;i<5;i++){d.nextCollection();assert.notEqual(d.productType,'lipbalm');}
  d.recommend([],{query:'hoodies without sweaters'});assert.equal(d.productType,'hoodie');d.nextCollection();assert.notEqual(d.productType,'sweater');
});
