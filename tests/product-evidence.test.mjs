import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../public/product-evidence.js',import.meta.url),'utf8');
class Element {
  constructor(tag){this.tagName=tag;this.children=[];this.nodeType=1;this._text='';this.attributes={};}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=children;this._text='';}
  set textContent(value){this._text=String(value);this.children=[];}
  get textContent(){return this._text+this.children.map(child=>child.textContent).join(' ');}
  set innerHTML(_){throw Error('Unsafe HTML insertion');}
  setAttribute(key,value){this.attributes[key]=value;}
}
function setup(){const context={window:{},URL,document:{createElement:tag=>new Element(tag)}};vm.createContext(context);vm.runInContext(source,context);return context.window.CoupiEvidence;}
const flatten=node=>[node,...node.children.flatMap(flatten)];
const product={id:'lip-1',name:'Lipstick',productType:'lipstick',brand:'Example',price:8000,image:'/products/lip-1.png',url:'https://www.coupang.com/vp/products/123',verifiedAttributes:['Pink shade']};

test('ratings without written review evidence never present unsupported AI summary or pros and cons',()=>{
  const {renderReviews}=setup(),container=new Element('div');
  renderReviews(container,{...product,reviewEvidence:{rating:4.5,reviewCount:120,sourceUrl:product.url,summary:'Unsupported claim',pros:['Invented benefit'],cons:['Invented drawback'],reviews:[]}});
  assert.match(container.textContent,/4.5 \/ 5/);assert.match(container.textContent,/120 reviews/);assert.match(container.textContent,/Reviews not available here yet/);
  assert.doesNotMatch(container.textContent,/Unsupported claim|Invented benefit|Invented drawback/);
});
test('sourced review samples display scoped AI summary, source links and translated paraphrase labels',()=>{
  const {renderReviews}=setup(),container=new Element('div');
  renderReviews(container,{...product,reviewEvidence:{rating:4.5,reviewCount:120,sourceUrl:product.url,summaryKind:'ai-curated',summary:'This sample liked the color.',pros:['Color'],cons:['Wear'],scopeNote:'Across listing variants.',reviews:[{rating:5,text:'Color suited me.',date:'2026-01-01',translated:true,sourceUrl:product.url}]}});
  assert.match(container.textContent,/AI review summary/);assert.match(container.textContent,/1 sourced review sample, not every review/);assert.match(container.textContent,/Translated paraphrase/);assert.match(container.textContent,/Across listing variants/);
  for(const link of flatten(container).filter(n=>n.tagName==='a')){assert.match(link.href,/^https:/);assert.equal(link.rel,'noopener noreferrer');}
});
test('unsafe source URLs and hostile review text cannot inject HTML or source unsupported ratings',()=>{
  const {renderReviews}=setup(),container=new Element('div');
  renderReviews(container,{...product,reviewEvidence:{rating:5,reviewCount:999,sourceUrl:'javascript:alert(1)',reviews:[{text:'<img src=x onerror=alert(1)>',sourceUrl:product.url}]}});
  assert.doesNotMatch(container.textContent,/5.0 \/ 5|999 reviews/);assert.match(container.textContent,/<img src=x onerror=alert\(1\)>/);
  assert.equal(flatten(container).filter(n=>n.tagName==='img').length,0);assert.equal(flatten(container).some(n=>n.href?.startsWith('javascript:')),false);
});

test('review shortcuts distinguish written samples from aggregate-only ratings and missing data',()=>{
  const {reviewStats}=setup();
  const missing=reviewStats(product);assert.equal(missing.available,false);assert.equal(missing.rating,null);assert.equal(missing.count,null);assert.equal(missing.sampleCount,0);assert.equal(missing.label,'Reviews unavailable');
  const rated=reviewStats({...product,reviewEvidence:{sourceUrl:product.url,rating:4.8,reviewCount:250,reviews:[]}});assert.equal(rated.available,false);assert.equal(rated.label,'★ 4.8 · 250 reviews');
  const sampled=reviewStats({...product,reviewEvidence:{sourceUrl:product.url,reviews:[{text:'Verified sample',sourceUrl:product.url}]}});assert.equal(sampled.available,true);assert.equal(sampled.sampleCount,1);assert.equal(sampled.rating,null);assert.equal(sampled.label,'1 review sample');
});

test('unavailable reviews offer a safe retailer link without invented ratings, review themes, or empty lists',()=>{
  const {renderReviews}=setup(),container=new Element('div');renderReviews(container,product);
  assert.match(container.textContent,/Reviews not available here yet/);assert.match(container.textContent,/Read reviews on Coupang/);assert.doesNotMatch(container.textContent,/0.0 \/ 5|AI review summary|No recurring concern|Rating unavailable/);
  assert.equal(flatten(container).filter(n=>n.className==='review-item').length,0);
  const link=flatten(container).find(n=>n.textContent==='Read reviews on Coupang ↗');assert.equal(link.href,product.url);assert.equal(link.target,'_blank');
});
test('comparison limits columns to three, renders missing facts honestly, and dispatches the right product',()=>{
  const {renderComparison}=setup(),container=new Element('div'),clicked=[];
  const products=Array.from({length:4},(_,i)=>({...product,id:`p-${i}`,name:`Product ${i}`,image:'data:image/svg+xml,<svg onload=alert(1)>'}));
  renderComparison(container,products,{onTry:p=>clicked.push(['try',p.id]),onDetails:p=>clicked.push(['details',p.id]),onRemove:p=>clicked.push(['remove',p.id])});
  assert.equal(flatten(container).filter(n=>n.className==='comparison-product').length,3);assert.equal(flatten(container).filter(n=>n.tagName==='img').length,0);
  assert.match(container.textContent,/Written review evidence unavailable/);assert.match(container.textContent,/₩8,000 · historical/);
  const buttons=flatten(container).filter(n=>n.tagName==='button');buttons.find(n=>n.textContent==='Try it').onclick();buttons.find(n=>n.textContent==='Remove').onclick();
  assert.deepEqual(clicked,[['try','p-0'],['remove','p-0']]);
});
