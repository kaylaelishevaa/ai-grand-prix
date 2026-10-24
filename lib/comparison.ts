import {catalog, comparisonCandidatesForSku, getSku, reviewsForSku} from './catalog';
import {comparisonGroupForSku, samePurpose} from './comparison-groups';
import {addDecision, ownedMessage, ownsSku, validatedTimezone} from './guardrails';
import {memoryConfidence, PRICE_TRAIT, remember, REVIEW_TRAIT} from './memory';
import {eligibleCatalog, sanitizeProfileForAI, skuTraitKeys} from './profile';
import type {MemoryLine, Profile, Review, SKU, Verdict} from './types';

export interface ComparisonBadge {
  kind:'cheapest'|'most-loved'|'best-for-you'|'fastest'|'best-value'|'your-choice';
  label:string; basis:string; tied:boolean; reviewIds:string[]; memoryIds:string[];
}
export interface ComparisonOption {
  skuId:string; badge:ComparisonBadge;
  fitReasons:{memoryId:string;text:string;source:string}[];
  reviewSummary:{count:number;average:number|null;criticalIds:string[]};
  delivery:string;
}
export interface ComparisonResult {
  main:ComparisonOption; contenders:ComparisonOption[]; groupId:string; scope:string; limits:string[];
}
export interface ComparisonDimension {
  key:'price'|'fit'|'quality'|'delivery'|'durability'; label:string;
  left:string; right:string; note:string; leftReviewIds:string[]; rightReviewIds:string[]; memoryIds:string[]; delta?:number;
}
export interface ProductComparison {leftSkuId:string;rightSkuId:string;dimensions:ComparisonDimension[];}
export interface SelectContenderInput {fromSkuId:string;skuId:string;requestId:string;origin:'call'|'ask'|'scene';}
export class ComparisonError extends Error {
  constructor(public code:string,message:string,public status=400){super(message);this.name='ComparisonError';}
}

const won=(price:number)=>'₩'+price.toLocaleString('en-US');
const unique=<T,>(values:T[])=>[...new Set(values)];
const normal=(value:string)=>value.normalize('NFKC').toLocaleLowerCase().replace(/[’']/g,"'").replace(/[-_]/g,' ').replace(/[^\p{L}\p{N}'₩$.,;!?]+/gu,' ').trim();
const rawAverage=(rows:Review[])=>rows.length?rows.reduce((sum,row)=>sum+row.stars,0)/rows.length:null;
const displayAverage=(rows:Review[])=>rows.length?Number(rawAverage(rows)!.toFixed(2)):null;
function requireEligible(profile:Profile,id:string,now=new Date()):SKU {
  const sku=getSku(id);
  if(!sku)throw new ComparisonError('UNKNOWN_SKU','That item is not in the demo catalog.');
  if(ownsSku(profile,id))throw new ComparisonError('OWNED_ITEM',ownedMessage(profile,id,now),409);
  if(!eligibleCatalog(profile,'ask').some(item=>item.id===id))throw new ComparisonError('QUARANTINED','This category is quarantined and cannot be recommended.',409);
  return sku;
}
function purposePool(profile:Profile,pick:SKU):SKU[] {
  return [pick,...comparisonCandidatesForSku(pick.id,eligibleCatalog(profile,'ask'))];
}
function activeMemory(profile:Profile):MemoryLine[] {
  const safe=sanitizeProfileForAI(profile).memoryLines;
  return profile.memoryLines.filter(line=>!line.excludedFromAI&&line.kind!=='scripted'&&memoryConfidence(line)>=0.2&&safe.some(item=>item.text===line.text&&item.source===line.source));
}

/** First-call quotes can be unstructured. Match only explicit catalog phrases, never inferred personality or health. */
function phrasePolarity(text:string,phrase:string):number {
  const needle=normal(phrase);
  if(needle.length<3)return 0;
  let result=0;
  for(const clause of normal(text).split(/[.!?;,]|\bbut\b|\binstead\b/)){
    const index=(' '+clause+' ').indexOf(' '+needle+' ');
    if(index<0)continue;
    const before=clause.slice(0,Math.max(0,index)).split(/\s+/).slice(-6).join(' ');
    const after=clause.slice(Math.max(0,index)+needle.length).split(/\s+/).slice(0,4).join(' ');
    if(/\b(no|not|never|avoid|hate|dislike|don't|doesn't|isn't|isnt|without)\b/.test(before)||/\b(isn't|isnt|not for me|too much)\b/.test(after))result--;
    // A cup of cream is not evidence that someone wants a cream-colored appliance.
    else if(needle.includes(' ')||/\b(like|love|prefer|want|need|enjoy|favorite|favourite|colour|color|palette|style)\b/.test(clause))result++;
  }
  return Math.sign(result);
}
interface Fit {positive:MemoryLine[];negative:MemoryLine[];}
function referencedGroups(text:string):Set<string> {
  const normalized=' '+normal(text)+' ';
  const matches=catalog.flatMap(sku=>[sku.name,...sku.aliases].map(normal).filter(term=>term.length>=3&&(normalized.includes(' '+term+' ')||(/^[a-z ]+$/.test(term)&&!term.endsWith('s')&&normalized.includes(' '+term+'s ')))).map(term=>({term,group:comparisonGroupForSku(sku)})));
  return new Set(matches.filter(match=>!matches.some(other=>other.term.length>match.term.length&&other.term.includes(match.term))).map(match=>match.group));
}
function fitFor(profile:Profile,sku:SKU,pool:SKU[]):Fit {
  const traits=sanitizeProfileForAI(profile).traits;
  const keys=new Set([...skuTraitKeys(sku),'choice:'+sku.id]);
  const rows=reviewsForSku(sku.id),avg=rawAverage(rows);
  const minPrice=Math.min(...pool.map(item=>item.price));
  const maxAverage=Math.max(...pool.map(item=>rawAverage(reviewsForSku(item.id))??-Infinity));
  const positive:MemoryLine[]=[],negative:MemoryLine[]=[];
  for(const line of activeMemory(profile)){
    let direction=0,hasConflict=false;
    const references=referencedGroups(line.text),scopeMatches=!references.size||references.has(comparisonGroupForSku(sku));
    const sceneTotal=/\b(total|whole (?:world|scene|district|area)|(?:each|per) (?:little )?(?:world|scene|district|area))\b/.test(normal(line.text));
    const matched=line.traitKeys.filter(key=>keys.has(key));
    // The polarity belongs to this source line, not the net tally from unrelated earlier swipes.
    const sourceWeights=matched.map(key=>line.contributions?line.contributions[key]||0:traits[key]||0);
    if(sourceWeights.some(value=>value<0))hasConflict=true;
    if(sourceWeights.some(value=>value>0))direction=1;
    const sourceTrait=(key:string)=>line.contributions?line.contributions[key]||0:traits[key]||0;
    if(scopeMatches&&!sceneTotal&&line.traitKeys.includes(PRICE_TRAIT)&&sourceTrait(PRICE_TRAIT)>0)direction+=sku.price===minPrice?1:0;
    if(scopeMatches&&line.traitKeys.includes(REVIEW_TRAIT)&&sourceTrait(REVIEW_TRAIT)>0&&avg!==null)direction+=avg===maxAverage?1:0;
    if(scopeMatches&&!line.traitKeys.length&&line.kind!=='decision'&&!/\b(health|sensitive skin|allerg\w*|medical|diagnos\w*|pregnan\w*)\b/i.test(line.text)){
      const phrases=unique([...sku.vibeTags,...sku.palette,...['material','style','shadeMaterial','finish','power','format'].flatMap(key=>typeof sku.facts[key]==='string'?[String(sku.facts[key])]:[])]);
      const signs=phrases.map(phrase=>phrasePolarity(line.text,phrase));
      if(signs.some(sign=>sign<0))hasConflict=true;
      else if(signs.some(sign=>sign>0))direction=1;
      const cap=normal(line.text).match(/\b(?:under|below|budget(?: of)?|up to)\s*[₩$]?\s*(\d[\d,]*)(k)?\b/);
      // Dollar amounts have no supplied conversion, so only explicit won / k-won-style budgets qualify.
      const explicitItemScope=references.has(comparisonGroupForSku(sku))||/\b(?:per item|each item|any item|every item|per product|each product)\b/.test(normal(line.text));
      if(cap&&!sceneTotal&&explicitItemScope&&!/\$/.test(cap[0])&&!/\b(?:not|never|no|don't)\b/.test(normal(line.text).split(cap[0])[0])){
        const amount=Number(cap[1].replace(/,/g,''))*(cap[2]?1000:1);
        if(amount>=1000){if(sku.price<=amount)direction++;else hasConflict=true;}
      }
      if(!sceneTotal&&/\b(?:cheapest|lowest price|price sensitive|affordable|tight budget)\b/.test(normal(line.text))&&!/\b(?:not|no|don't|never)\b/.test(normal(line.text)))direction+=sku.price===minPrice?1:0;
    }
    if(direction>0&&!hasConflict)positive.push(line);
    if(hasConflict||direction<0)negative.push(line);
  }
  return {positive,negative};
}

/** Hours are used only when explicitly recorded. A delivery slogan is not converted into an invented duration. */
function deliveryFacts(sku:SKU):{hours:number|null;window:string;day:number|null} {
  const hours=sku.facts.deliveryHours;
  const window=normal(sku.delivery).replace(/\bsimulation\b/g,'').replace(/\s+/g,' ').trim();
  const days=window.match(/\bin (\d+) days?\b/);
  return {hours:typeof hours==='number'&&Number.isFinite(hours)&&hours>=0?hours:null,window,day:/\btomorrow by 7am\b/.test(window)?1:days?Number(days[1]):null};
}
function commonUseValue(pool:SKU[]):Map<string,number>|null {
  // The only seeded price/use calculation has an explicit common 30-wear assumption.
  if(!pool.every(sku=>typeof sku.facts.pricePerWearAt30Uses==='number'&&Math.abs(Number(sku.facts.pricePerWearAt30Uses)-sku.price/30)<0.01))return null;
  return new Map(pool.map(sku=>[sku.id,Number(sku.facts.pricePerWearAt30Uses)]));
}
function earnedBadges(profile:Profile,sku:SKU,pool:SKU[]):ComparisonBadge[] {
  const badges:ComparisonBadge[]=[];
  const make=(kind:ComparisonBadge['kind'],label:string,basis:string,tied=false,reviewIds:string[]=[],memoryIds:string[]=[])=>badges.push({kind,label,basis,tied,reviewIds,memoryIds});
  const cheapest=Math.min(...pool.map(item=>item.price));
  if(sku.price===cheapest)make('cheapest','cheapest',`${won(sku.price)} is the lowest listed price among ${pool.length} eligible ${comparisonGroupForSku(sku).replace(/-/g,' ')} options.`,pool.filter(item=>item.price===cheapest).length>1);
  const ownRows=reviewsForSku(sku.id),average=rawAverage(ownRows);
  const bestAverage=Math.max(...pool.map(item=>rawAverage(reviewsForSku(item.id))??-Infinity));
  if(average!==null&&average===bestAverage)make('most-loved','most loved',`${displayAverage(ownRows)}★ from ${ownRows.length} seeded reviews: the highest raw average in this ${pool.length}-item comparison.`,pool.filter(item=>rawAverage(reviewsForSku(item.id))===average).length>1,ownRows.map(row=>row.id));
  const fits=pool.map(item=>({id:item.id,fit:fitFor(profile,item,pool)}));
  const own=fits.find(item=>item.id===sku.id)!.fit;
  const conflictFree=fits.filter(item=>!item.fit.negative.length);
  const mostMatches=Math.max(0,...conflictFree.map(item=>item.fit.positive.length));
  if(!own.negative.length&&own.positive.length>0&&own.positive.length===mostMatches)make('best-for-you','best for you',`Matches ${own.positive.length} active memory line${own.positive.length===1?'':'s'}, with no explicit conflicts; the most sourced matches in this group.`,conflictFree.filter(item=>item.fit.positive.length===mostMatches).length>1,[],own.positive.map(line=>line.id));
  const delivery=pool.map(item=>({id:item.id,...deliveryFacts(item)}));
  const hoursComparable=delivery.every(item=>item.hours!==null);
  const sameWindow=delivery.every(item=>item.window===delivery[0].window&&item.window.length>0);
  if(hoursComparable){
    const minimum=Math.min(...delivery.map(item=>item.hours!)),ownDelivery=delivery.find(item=>item.id===sku.id)!;
    if(ownDelivery.hours===minimum)make('fastest','fastest',`${minimum}h is the shortest explicit simulated delivery estimate in this group; this is not a live booking.`,delivery.filter(item=>item.hours===minimum).length>1);
  }else if(sameWindow)make('fastest','fastest',`All ${pool.length} options list the same delivery window: ${sku.delivery}. No speed advantage is established.`,pool.length>1);
  else if(delivery.every(item=>item.day!==null)){
    const minimum=Math.min(...delivery.map(item=>item.day!)),earliest=delivery.filter(item=>item.day===minimum);
    // Only tie equal windows; two different deadlines on the same day are not interchangeable.
    if(earliest.every(item=>item.window===earliest[0].window)&&earliest.some(item=>item.id===sku.id))make('fastest','fastest',`Earliest listed window in this group: ${sku.delivery}. Later options list delivery in more calendar days; no exact hour difference is claimed.`,earliest.length>1);
  }
  const values=commonUseValue(pool);
  if(values){const minimum=Math.min(...values.values());if(values.get(sku.id)===minimum)make('best-value','best value',`${won(minimum)} per wear assuming exactly 30 wears for every option. This is arithmetic, not a durability promise.`,[...values.values()].filter(value=>value===minimum).length>1);}
  return badges;
}
function option(profile:Profile,sku:SKU,pool:SKU[],badge:ComparisonBadge):ComparisonOption {
  const rows=reviewsForSku(sku.id);
  return {skuId:sku.id,badge,fitReasons:fitFor(profile,sku,pool).positive.map(line=>({memoryId:line.id,text:line.text,source:line.source})),reviewSummary:{count:rows.length,average:displayAverage(rows),criticalIds:rows.filter(row=>row.stars<=2).sort((a,b)=>b.helpful-a.helpful).map(row=>row.id)},delivery:sku.delivery};
}
const awardOrder:ComparisonBadge['kind'][]=['best-for-you','cheapest','most-loved','best-value','fastest'];
export function buildComparison(profile:Profile,pickSkuId:string):ComparisonResult {
  const pick=getSku(pickSkuId);
  if(!pick)throw new ComparisonError('UNKNOWN_SKU','That item is not in the demo catalog.');
  if(!eligibleCatalog(profile,'ask').some(sku=>sku.id===pick.id)){
    const owned=ownsSku(profile,pick.id),basis=owned?ownedMessage(profile,pick.id):'This item belongs to an excluded sensitive category.';
    return {main:option(profile,pick,[pick],{kind:'your-choice',label:owned?'already owned':'unavailable',basis,tied:false,reviewIds:[],memoryIds:[]}),contenders:[],groupId:comparisonGroupForSku(pick),scope:'This item is unavailable for a new recommendation.',limits:[basis]};
  }
  const pool=purposePool(profile,pick);
  const awards=new Map(pool.map(sku=>[sku.id,earnedBadges(profile,sku,pool)]));
  const sortAwards=(a:ComparisonBadge,b:ComparisonBadge)=>awardOrder.indexOf(a.kind)-awardOrder.indexOf(b.kind);
  const mainBadge=awards.get(pick.id)!.sort(sortAwards)[0]||{kind:'your-choice' as const,label:'your choice',basis:'Your selected item. It does not win a comparison award from the available facts.',tied:false,reviewIds:[],memoryIds:[]};
  const used=new Set([mainBadge.kind]);
  const candidates=pool.filter(sku=>sku.id!==pick.id&&awards.get(sku.id)!.length).sort((a,b)=>{
    const aBest=awards.get(a.id)!.sort(sortAwards)[0],bBest=awards.get(b.id)!.sort(sortAwards)[0];
    return sortAwards(aBest,bBest)||a.price-b.price||a.id.localeCompare(b.id);
  });
  const contenders:ComparisonOption[]=[];
  for(const sku of candidates.slice(0,4)){
    const badges=awards.get(sku.id)!.sort(sortAwards),badge=badges.find(item=>!used.has(item.kind))||badges[0];
    used.add(badge.kind);contenders.push(option(profile,sku,pool,badge));
  }
  return {main:option(profile,pick,pool,mainBadge),contenders,groupId:comparisonGroupForSku(pick),scope:`${pool.length} eligible ${comparisonGroupForSku(pick).replace(/-/g,' ')} options in the seeded demo catalog`,limits:['Prices, reviews and delivery estimates are seeded demo facts, not live merchant data.','Fit uses only active, sourced memory; an unmatched preference stays unknown.',...(contenders.length<pool.length-1?['Only alternatives earning a comparison badge are shown. The full catalog remains available.']:[])]};
}

const durabilityTags=new Set(['pilling','wash','wash-test','wear','daily-use','in-use','repeat-order','repeat-buy','repeat-purchase','loose-lid','seam-fault','charging-fault','button-fault','stitching','construction','zipper','clasp','leak','fragile','latch','cap-fit','sprayer','bristle-shedding','ferrule-fit','fill-support','connection-drop','strap-adjustment','handle-fastener','zipper-jam','keep-warm-drying','spray-nozzle','closure-fit','seam-finish','buttonhole-finish','strap-finish','handle-finish','base-rock','pour-control']);
function durability(rows:Review[]) {
  const relevant=rows.filter(row=>row.tags.some(tag=>durabilityTags.has(tag))).sort((a,b)=>b.helpful-a.helpful);
  return {text:relevant.length?relevant.slice(0,2).map(row=>`“${row.text}” (${row.id})`).join('\n'):'No specific use-over-time evidence in the seeded reviews.',ids:relevant.slice(0,2).map(row=>row.id)};
}
export function compareProducts(profile:Profile,leftId:string,rightId:string):ProductComparison {
  const left=requireEligible(profile,leftId),right=requireEligible(profile,rightId);
  if(!samePurpose(left,right)||left.id===right.id)throw new ComparisonError('DIFFERENT_PURPOSE','Choose a different item that does the same job.');
  const pool=purposePool(profile,left),a=reviewsForSku(left.id),b=reviewsForSku(right.id);
  const fitA=fitFor(profile,left,pool),fitB=fitFor(profile,right,pool),deliveryA=deliveryFacts(left),deliveryB=deliveryFacts(right),durabilityA=durability(a),durabilityB=durability(b);
  const fitText=(fit:Fit)=>[...fit.positive.map(line=>`Matches: “${line.text}” · ${line.source}`),...fit.negative.map(line=>`Conflicts with: “${line.text}” · ${line.source}`)].join('\n')||'No active memory explicitly matches these listed attributes.';
  const deliveryDelta=deliveryA.hours!==null&&deliveryB.hours!==null?deliveryB.hours-deliveryA.hours:undefined;
  const empty={leftReviewIds:[] as string[],rightReviewIds:[] as string[],memoryIds:[] as string[]};
  return {leftSkuId:left.id,rightSkuId:right.id,dimensions:[
    {...empty,key:'price',label:'price',left:won(left.price),right:won(right.price),delta:right.price-left.price,note:left.price===right.price?'Same listed price.':`${right.name} is ${won(Math.abs(right.price-left.price))} ${right.price<left.price?'less':'more'}.`},
    {...empty,key:'fit',label:'fit for you',left:fitText(fitA),right:fitText(fitB),memoryIds:unique([...fitA.positive,...fitA.negative,...fitB.positive,...fitB.negative].map(line=>line.id)),note:'Exact catalog attributes and explicit constraints matched to the memory shown. No inferred personality or health claim.'},
    {...empty,key:'quality',label:'review evidence',left:a.length?`${displayAverage(a)}★ · ${a.length} seeded reviews`:'No seeded reviews',right:b.length?`${displayAverage(b)}★ · ${b.length} seeded reviews`:'No seeded reviews',leftReviewIds:a.map(row=>row.id),rightReviewIds:b.map(row=>row.id),note:'Raw averages include delivery praise, irrelevant gifts and angry reviews. They are not a product-quality score.'},
    {...empty,key:'delivery',label:'delivery',left:left.delivery,right:right.delivery,...(deliveryDelta===undefined?{}:{delta:deliveryDelta}),note:deliveryDelta===0?'Same explicit delivery estimate; tied.':deliveryDelta!==undefined?`${right.name} lists ${Math.abs(deliveryDelta)}h ${deliveryDelta<0?'sooner':'later'}. Simulated estimate, not a live booking.`:deliveryA.window===deliveryB.window?'Same listed delivery window; tied.':'No common delivery duration is recorded, so a speed difference cannot be calculated.'},
    {...empty,key:'durability',label:'durability · reported use',left:durabilityA.text,right:durabilityB.text,leftReviewIds:durabilityA.ids,rightReviewIds:durabilityB.ids,note:'Individual reports, quoted directly. No lifetime score or failure probability is inferred.'},
  ]};
}

const negativeLabels:Record<string,string>={'pilling':'pilling','loose-lid':'a loose lid','wrinkles':'wrinkles','fragile':'fragility','charging-fault':'a charging fault','button-fault':'a button fault','seam-fault':'a seam fault','handle-hot':'a hot handle','arrived-damaged':'arrival damage','wrong-item':'a wrong item','missing-item':'a missing item','delivery-problem':'a delivery problem','zipper':'the zipper','stitching':'stitching','clasp':'the clasp','leak':'a leak','broken-pan':'a broken powder pan','bristle-shedding':'bristle shedding'};
function dissentFor(sku:SKU):{text:string;ids:string[]} {
  const rows=reviewsForSku(sku.id),negative=rows.filter(row=>row.stars<=2).sort((a,b)=>b.helpful-a.helpful);
  for(const row of negative){
    const tag=row.tags.find(item=>negativeLabels[item]);
    if(tag){const mentions=rows.filter(item=>item.tags.includes(tag));return {text:`${mentions.length} of ${rows.length} seeded reviews mention ${negativeLabels[tag]} (${Math.round(mentions.length/rows.length*100)}%). Mentions, not a failure rate.`,ids:mentions.map(item=>item.id)};}
  }
  return negative.length?{text:`One seeded reviewer wrote: “${negative[0].text}”`,ids:[negative[0].id]}:{text:rows.length?'No 1–2-star review in this seeded set. That does not establish reliability.':'No seeded reviews are available for this item.',ids:[]};
}
function choiceVerdict(profile:Profile,chosen:SKU,previous:SKU):Verdict {
  const pool=purposePool(profile,chosen),dissent=dissentFor(chosen);
  const runner=pool.find(sku=>sku.id===previous.id)||pool.find(sku=>sku.id!==chosen.id);
  const priceComparison=runner?(runner.price===chosen.price?'the listed price is the same':`${runner.price>chosen.price?'costs':'saves'} ${won(Math.abs(runner.price-chosen.price))}`):'';
  const tradeoff=chosen.price===previous.price?'Same listed price as your previous pick.':`${won(Math.abs(chosen.price-previous.price))} ${chosen.price<previous.price?'less':'more'} than your previous pick.`;
  return {pickSkuId:chosen.id,reason:`Your choice: ${chosen.name}, ${won(chosen.price)}. The review evidence below belongs to this item.`,dissent:`${tradeoff} ${dissent.text}`,citations:dissent.ids,runnerUpSkuId:runner?.id||null,whyRunnerUpLost:runner?`You chose ${chosen.name}. ${runner.name} ${priceComparison}; no hidden quality tradeoff is assumed.`:'No other eligible same-purpose item is recorded.',clarifyingQuestion:null};
}

/** The swap is observed preference, never a purchase. Every effect is code-enforced and needs no provider. */
export function selectContender(profile:Profile,input:SelectContenderInput,now=new Date()):{verdict:Verdict;profile:Profile} {
  if(!input.requestId||input.requestId.length>80||!['call','ask','scene'].includes(input.origin))throw new ComparisonError('INVALID_REQUEST','A valid swap request is required.');
  const chosen=requireEligible(profile,input.skuId,now),previous=requireEligible(profile,input.fromSkuId,now);
  if(chosen.id===previous.id||!samePurpose(chosen,previous))throw new ComparisonError('DIFFERENT_PURPOSE','Choose a different item that does the same job.');
  const verdict=choiceVerdict(profile,chosen,previous),eventId='comparison-swap:'+input.requestId;
  if(profile.memoryEventIds?.includes(eventId)||profile.memoryLines.some(line=>line.id===eventId)){
    const receipt=profile.comparisonReceipts?.find(item=>item.requestId===input.requestId);
    if(!receipt)throw new ComparisonError('REQUEST_EXPIRED','This old swap cannot be replayed. Make a new choice with a new request.',409);
    if(receipt.skuId!==input.skuId||receipt.fromSkuId!==input.fromSkuId||receipt.origin!==input.origin)throw new ComparisonError('REQUEST_CONFLICT','This swap request was already used for a different choice.',409);
    return {profile,verdict};
  }
  const date=new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:validatedTimezone(profile.timezone)}).format(now);
  const contributions:Record<string,number>={['choice:'+chosen.id]:1};
  // Choosing a less expensive substitute is observed price evidence, not a claim about someone's finances.
  if(chosen.price<previous.price)contributions[PRICE_TRAIT]=1;
  const chosenAverage=rawAverage(reviewsForSku(chosen.id)),previousAverage=rawAverage(reviewsForSku(previous.id));
  const reviewTradeoff=chosen.price>previous.price&&chosenAverage!==null&&previousAverage!==null&&chosenAverage>previousAverage;
  if(reviewTradeoff)contributions[REVIEW_TRAIT]=1;
  let next=remember(profile,{id:eventId,text:`chose ${chosen.name} over ${previous.name}${chosen.price<previous.price?` · saved ${won(previous.price-chosen.price)} on the listed price`:reviewTradeoff?' · paid more for the higher seeded review average':''}`,source:`from your swap, ${date}`,confidence:0.65,kind:'swap',contributions},now);
  if(input.origin==='call'){
    const replaceable=next.decisions.filter(item=>item.skuId===previous.id&&!item.approvedAt&&!item.delegation&&/^from (?:your|our first) call\b/.test(item.source)).map(item=>item.id);
    const addition=addDecision(next,chosen.id,`from your call, ${date} · swapped`,now);
    if(addition.blocked)throw new ComparisonError('DECISION_BLOCKED',addition.blocked,409);
    next=addition.profile;
    if(replaceable.length)next={...next,decisions:next.decisions.filter(item=>!replaceable.includes(item.id))};
  }
  next.lastVerdict={requestId:input.requestId,pickSkuId:chosen.id,runnerUpSkuId:verdict.runnerUpSkuId};
  // Transaction identity is retained separately from deletable taste evidence and is never used for fit.
  next.comparisonReceipts=[...(next.comparisonReceipts||[]),{...input}].slice(-100);
  return {profile:next,verdict};
}
