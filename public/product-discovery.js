/* Browser-local browsing groups. Listing facts always come from the trusted catalog. */
(() => {
  'use strict';
  const TYPES = {lipstick:'Lipsticks',lipbalm:'Lip balms',sweater:'Sweaters',glasses:'Glasses',chair:'Chairs',lamp:'Desk lamps',tshirt:'T-shirts',hoodie:'Hoodies'};
  const COLORS = {
    pink:['pink','핑크','분홍'],red:['red','레드','빨강','빨간'],purple:['purple','plum','violet','lilac','퍼플','보라','바이올렛'],
    nude:['nude','누드'],peach:['peach','피치','복숭아'],coral:['coral','코랄'],brown:['brown','브라운','갈색'],
    black:['black','블랙','검정'],white:['white','화이트','흰색'],gray:['gray','grey','charcoal','그레이','회색'],
    blue:['blue','블루','파랑','파란'],green:['green','olive','그린','녹색','초록'],yellow:['yellow','옐로','노랑','노란'],beige:['beige','베이지'],silver:['silver','실버'],gold:['gold','골드'],
  };
  const STYLE = {sunglasses:['sunglasses','선글라스'],optical:['optical','eyeglasses','spectacles','clear lenses','normal glasses','regular glasses','일반 안경','투명 렌즈']};
  const APPAREL={basic:['basic','plain','solid','unbranded','무지','베이직'],branded:['branded','logo','브랜드','로고']};
  const CHAIR={office:['office','desk','study','computer','사무용 의자','사무용의자','사무 의자','사무의자','책상 의자','책상의자','컴퓨터 의자','컴퓨터의자','공부 의자','공부의자','독서실 의자','독서실의자','사무용','사무','책상','컴퓨터','공부','독서실'],floor:['floor','좌식 의자','좌식의자','바닥 의자','바닥의자','좌식','바닥'],dining:['dining','식탁 의자','식탁의자','식탁']};
  const TYPE_FACETS={lipbalm:['lip balm','lip balms','lipbalm','립밤'],lipstick:['lipstick','lipsticks','lip tint','립스틱','립틴트','틴트'],sweater:['sweater','sweaters','knit','pullover','니트','스웨터'],hoodie:['hoodie','hoodies','후드','후드티'],tshirt:['t-shirt','t-shirts','tshirt','tshirts','tee','티셔츠','반팔'],glasses:['glasses','eyeglasses','eyewear','안경'],chair:['chair','chairs','의자'],lamp:['lamp','lamps','스탠드','조명']};
  const clean = value => typeof value === 'string' ? value.trim().slice(0,300) : '';
  const unique = values => [...new Set(values)];
  const has = (text,term) => /[a-z]/i.test(term) ? new RegExp(`(?:^|[^a-z])${term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}(?:$|[^a-z])`,'i').test(text) : text.includes(term);
  function themes(text, map=COLORS) {return Object.keys(map).filter(key=>map[key].some(term=>has(text,term)));}
  function requested(query,map) {
    const include=[],exclude=[];
    for(const [key,terms] of Object.entries(map))for(const term of terms){
      const escaped=term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      const expression=new RegExp(/[a-z]/i.test(term)?`\\b${escaped}\\b`:escaped,'giu');
      for(const match of query.matchAll(expression)){
        const before=query.slice(0,match.index).replace(/[’']/g,' '),after=query.slice(match.index+match[0].length);
        // "좌식의자 말고" excludes floor seating, not the entire chair category.
        const styledChair=map===TYPE_FACETS&&key==='chair'&&/(?:\b(?:office|desk|study|computer|floor|dining)|사무용?|책상|컴퓨터|공부|독서실|좌식|바닥|식탁)\s*$/u.test(before);
        const negative=!styledChair&&(/(?:not|no|except|excluding|without|don t want|do not want)\s+(?:a\s+)?$/u.test(before)||/^\s*(?:색)?\s*(?:말고|제외|빼고)/u.test(after));
        (negative?exclude:include).push(key);
      }
    }
    return {include:unique(include).filter(key=>!exclude.includes(key)),exclude:unique(exclude)};
  }
  function constraintsFor(query,supplied) {
    const result={};for(const [key,map] of [['colors',COLORS],['eyewear',STYLE],['apparel',APPAREL],['chair',CHAIR],['types',TYPE_FACETS]]){
      const provided=supplied?.[key];result[key]=provided&&Array.isArray(provided.include)&&Array.isArray(provided.exclude)?{include:unique(provided.include.filter(value=>Object.hasOwn(map,value))),exclude:unique(provided.exclude.filter(value=>Object.hasOwn(map,value)))}:requested(query,map);
    }return result;
  }
  function matchesChairStyle(product,rule) {
    return product.productType!=='chair'||(!rule.include.length||rule.include.includes(product.chairStyle))&&!rule.exclude.includes(product.chairStyle);
  }
  function facets(product) {
    const text=[...(product.tags||[]),product.color,product.colour,product.style].filter(x=>typeof x==='string').join(' ').toLowerCase();
    const values=themes(text);
    if(product.productType==='glasses')values.unshift(themes(text,STYLE).includes('sunglasses')?'sunglasses':'optical');
    if(product.collectionStyle&&Object.hasOwn(APPAREL,product.collectionStyle))values.push(product.collectionStyle);
    return values;
  }
  function typeFrom(query) {
    const rule=requested(query,TYPE_FACETS);
    return rule.include[0]||(/sunglasses|선글라스/.test(query)?'glasses':'');
  }
  function queryTheme(constraints,type) {
    if(type==='glasses'&&constraints.eyewear.include.length===1)return constraints.eyewear.include[0];
    if(constraints.colors.include.length===1)return constraints.colors.include[0];
    return '';
  }
  function queryTerms(query) {
    // Retain brands and requested attributes; only discard navigation words and explicit budgets.
    let value=query.toLowerCase().replace(/(?:under|below|less than|up to|max(?:imum)?|budget(?: of)?)\s*[₩$]?\s*[\d,.]+\s*(?:won|krw)?/g,' ')
      .replace(/[\d,.]+\s*(?:원|won|krw)?\s*(?:이하|미만)/g,' ')
      .replace(/\b(show|find|me|my|some|a|an|the|i|want|like|please|recommend|looking|for|can|could|would|you|need|trying|try|to|buy|not|no|except|excluding|without|don|do|products?|options?|different|normal|everyday|brands?|sellers?|and|or|of|with)\b/g,' ')
      .replace(/추천|찾아|보여|주세요|제품|상품|일반|말고|제외|빼고/g,' ');
    for(const words of [...Object.values(COLORS),...Object.values(STYLE),...Object.values(APPAREL),...(typeFrom(query)==='chair'?Object.values(CHAIR):[])])for(const word of words)value=/[a-z]/i.test(word)?value.replace(new RegExp(`\\b${word}\\b`,'g'),' '):value.replaceAll(word,' ');
    value=value.replace(/lip balms?|lipbalms?|sweaters?|knit|pullovers?|립밤|스웨터|니트|lipsticks?|lip tints?|t-?shirts?|hoodies?|chairs?|desk lamps?|table lamps?|lamps?|glasses|립스틱|립틴트|틴트|티셔츠|반팔|후드티?|의자|스탠드|조명|안경|선글라스/g,' ');
    return value.split(/[^\p{L}\p{N}-]+/u).filter(word=>word.length>1).slice(0,12);
  }
  function limitFrom(options,query) {
    const explicit=options.maxPrice ?? options.max_price;
    if(explicit!==null && explicit!==undefined && Number.isFinite(Number(explicit)) && Number(explicit)>=0)return Number(explicit);
    const match=query.match(/(?:under|below|less than|up to|max(?:imum)?|budget(?: of)?)\s*₩?\s*([\d,.]+)/i)||query.match(/([\d,.]+)\s*(?:원|won|krw)?\s*(?:이하|미만)/i);
    return match ? Number(match[1].replaceAll(',','')) : null;
  }
  function labelFor(type,theme,style='') {
    if(type==='tshirt'&&style)return style==='branded'?'Branded T-shirts':'Everyday T-shirts';
    if(theme==='sunglasses')return 'Sunglasses';
    if(theme==='optical')return 'Everyday glasses';
    const label=TYPES[type]||'Your picks';
    return theme ? `${theme[0].toUpperCase()+theme.slice(1)} ${label.toLowerCase()}` : label;
  }
  class CoupiDiscovery {
    constructor(catalog=[],options={}) {
      this.catalog=new Map(catalog.filter(p=>p && p.id!==null && p.id!==undefined).map(p=>[String(p.id),p]));
      this.storageKey=options.storageKey||'coupi.collections.v1';
      try {this.storage=Object.prototype.hasOwnProperty.call(options,'storage')?options.storage:window.localStorage;} catch {this.storage=null;}
      this.products=[];this.selectedId=null;this.limit=6;this.query='';this.productType='';this.category='';this.theme='';this.maxPrice=null;this.terms=[];this.constraints=constraintsFor('');this.sourceOnly=false;this.themeChanged=false;
      this.mixed=false;this.groupLabel='';this.collectionStyle='';this.collectionTrail=[];this.compareIds=[];this._collections=[];this.sequence=0;this.persistenceAvailable=Boolean(this.storage);this._load();
    }
    get current() {return this.catalog.get(this.selectedId)||null;}
    get visible() {return this.products.slice(0,this.limit);}
    get total() {return this.products.length;}
    get hasMore() {return this.limit<Math.min(10,this.total);}
    get label() {return this.mixed&&this.groupLabel?this.groupLabel:labelFor(this.productType,this.theme,this.collectionStyle);}
    get comparison() {return this.compareIds.map(id=>this.catalog.get(id)).filter(Boolean);}
    get collections() {return this._collections.map(item=>({...item,ids:[...item.ids],products:item.ids.map(id=>this.catalog.get(id)).filter(Boolean),productCount:item.ids.length}));}
    snapshot() {return {label:this.label,query:this.query,theme:this.theme,productType:this.productType,collectionStyle:this.collectionStyle,category:this.category,maxPrice:this.maxPrice,total:this.total,hasMore:this.hasMore,limit:this.limit,products:[...this.products],visible:this.visible,current:this.current,selectedId:this.selectedId};}
    _matches(product,theme=this.theme,ignoreIncludes=this.themeChanged) {
      // Chair height/use is a compatibility constraint, retained even on Skip.
      if(!matchesChairStyle(product,this.constraints.chair))return false;
      if(this.constraints.types.exclude.includes(product.productType))return false;
      if(this.collectionStyle&&product.collectionStyle!==this.collectionStyle)return false;
      if(this.productType && product.productType!==this.productType)return false;
      if(this.category && this.category!=='all' && product.category!==this.category)return false;
      if(this.maxPrice!==null && (!Number.isFinite(product.price)||product.price>this.maxPrice))return false;
      const values=facets(product);
      if(theme && !values.includes(theme))return false;
      for(const [kind,rule] of Object.entries(this.constraints)){
        if(kind==='types'||kind==='chair')continue;
        if(kind==='apparel'&&product.productType!=='tshirt')continue;
        if(kind==='eyewear'&&product.productType!=='glasses')continue;
        if(rule.exclude.some(value=>values.includes(value)))return false;
        if(!ignoreIncludes&&rule.include.length&&!rule.include.some(value=>values.includes(value)))return false;
      }
      const text=[product.name,product.brand,...(product.aliases||[]),...(product.tags||[]),...(product.verifiedAttributes||[])].filter(Boolean).join(' ').toLowerCase();
      return this.terms.every(term=>text.includes(term));
    }
    recommend(products,options={}) {
      const seeds=unique((products||[]).map(p=>String(typeof p==='object'?p?.id:p))).map(id=>this.catalog.get(id)).filter(Boolean);
      this.query=clean(options.query).toLowerCase();
      // Worlds are an explicit, bounded list spanning categories; ordinary searches stay typed.
      this.mixed=options.mixed===true&&options.sourceOnly===true;this.groupLabel=this.mixed?clean(options.groupLabel).slice(0,80):'';
      this.productType=this.mixed?'':clean(options.productType)||typeFrom(this.query)||seeds[0]?.productType||'';
      this.category=this.mixed?'':clean(options.category)||seeds[0]?.category||'';
      this.constraints=constraintsFor(this.query,options.constraints);this.sourceOnly=options.sourceOnly===true;this.themeChanged=false;
      this.theme=clean(options.theme)||queryTheme(this.constraints,this.productType);
      this.collectionStyle=clean(options.collectionStyle)||(this.productType==='tshirt'&&this.constraints.apparel.include.length===1?this.constraints.apparel.include[0]:'');this.collectionTrail=[];
      this.maxPrice=limitFrom(options,this.query);this.terms=this.sourceOnly?[]:queryTerms(this.query);
      // Empty results stay empty when no trustworthy category can be inferred.
      const eligible=[...seeds,...(!this.sourceOnly&&this.productType?[...this.catalog.values()]:[])].filter(p=>this._matches(p));
      this.products=unique(eligible.map(p=>String(p.id))).map(id=>this.catalog.get(id));
      this.limit=6;this.selectedId=this.products[0]?String(this.products[0].id):null;
      return this.snapshot();
    }
    setRecommendations(products,options={}) {return this.recommend(products,options);}
    select(id) {
      id=String(id);const index=this.products.findIndex(p=>String(p.id)===id);
      if(index<0||index>=10)return null;
      this.selectedId=id;if(index>=this.limit)this.limit=10;return this.current;
    }
    viewMore() {this.limit=10;return this.snapshot();}
    nextTheme() {
      const available=unique([...this.catalog.values()].filter(p=>this._matches(p,'',true)).flatMap(facets));
      const preferred=this.productType==='lipstick'?['pink','red','purple','nude','peach','coral','brown']:this.productType==='glasses'?['optical','sunglasses']:Object.keys(COLORS);
      const ordered=preferred.filter(theme=>available.includes(theme));
      const index=ordered.indexOf(this.theme);
      const next=ordered[(index+1)%ordered.length];
      if(!next||next===this.theme)return {...this.snapshot(),changed:false};
      this.theme=next;this.themeChanged=true;
      this.products=[...this.catalog.values()].filter(p=>this._matches(p));
      this.limit=6;this.selectedId=this.products[0]?String(this.products[0].id):null;
      return {...this.snapshot(),changed:true};
    }
    nextCollection() {
      // A deliberate skip broadens positive style choices, while retaining the
      // budget, exclusions and explicit brand/attribute terms from the request.
      if(this.sourceOnly){
        const brands=new Set([...this.catalog.values()].flatMap(p=>[...queryTerms(p.brand||''),...(p.aliases||[]).map(alias=>queryTerms(alias)[0]).filter(Boolean)]));
        this.terms=queryTerms(this.query).filter(term=>brands.has(term));
      }
      const group=(productType,theme='',collectionStyle='')=>({productType,theme,collectionStyle});
      const productType=this.mixed?this.current?.productType:this.productType;
      const family=['lipstick','lipbalm'].includes(productType)?[group('lipstick','pink'),group('lipbalm'),group('lipstick','red'),group('lipstick','nude')]:
        productType==='glasses'?[group('glasses','optical'),group('glasses','sunglasses')]:
        productType==='tshirt'?[group('tshirt','','basic'),group('tshirt','','branded'),group('hoodie'),group('sweater')]:
        ['hoodie','sweater'].includes(productType)?[group('hoodie'),group('sweater'),group('tshirt','','basic'),group('tshirt','','branded')]:
        ['chair','lamp'].includes(productType)?[group('chair'),group('lamp')]:[];
      const key=value=>[value.productType,value.theme,value.collectionStyle].join(':');
      const current=key({...this,productType}),seen=new Set([...this.collectionTrail,current]);
      const exact=family.findIndex(value=>key(value)===current);
      const sameType=family.findIndex(value=>value.productType===productType);
      const index=exact>=0?exact:sameType;
      const ordered=[...family.slice(index+1),...family.slice(0,index+1)];
      const previous={productType:this.productType,theme:this.theme,category:this.category,collectionStyle:this.collectionStyle,themeChanged:this.themeChanged};
      const candidates=[];
      for(const candidate of ordered){
        if(key(candidate)===current)continue;
        Object.assign(this,candidate,{category:({lipstick:'makeup',lipbalm:'makeup',glasses:'glasses',hoodie:'clothes',sweater:'clothes',tshirt:'clothes',chair:'desk',lamp:'desk'})[candidate.productType],themeChanged:true});
        const products=[...this.catalog.values()].filter(p=>this._matches(p));
        if(products.length)candidates.push({...candidate,category:this.category,products});
      }
      Object.assign(this,previous);
      const next=candidates.find(candidate=>!seen.has(key(candidate)))||candidates[0];
      if(!next)return {...this.snapshot(),changed:false};
      if(seen.has(key(next)))this.collectionTrail=[];
      this.collectionTrail.push(current);
      Object.assign(this,next,{mixed:false,groupLabel:'',themeChanged:true,sourceOnly:false,limit:6});
      this.selectedId=this.products[0]?String(this.products[0].id):null;
      return {...this.snapshot(),changed:true};
    }
    toggleCompare(id) {
      id=String(id);const existing=this.compareIds.indexOf(id);
      if(existing>=0){this.compareIds.splice(existing,1);return {ok:true,selected:false,products:this.comparison};}
      const product=this.catalog.get(id);
      if(!product)return {ok:false,error:'This product is no longer in the catalog.'};
      if(this.compareIds.length>=3)return {ok:false,error:'Compare up to 3 products. Remove one to add another.'};
      if(this.comparison[0] && this.comparison[0].productType!==product.productType)return {ok:false,error:'Compare the same kind of product. Clear your selection to switch categories.'};
      this.compareIds.push(id);return {ok:true,selected:true,products:this.comparison};
    }
    clearCompare() {this.compareIds=[];}
    saveCollection(name) {
      if(!this.products.length)return null;
      const ids=this.products.slice(0,10).map(p=>String(p.id));
      const existing=this._collections.find(item=>item.name===(clean(name)||this.label) && item.ids.join('|')===ids.join('|'));
      const record={id:existing?.id||`collection_${Date.now()}_${++this.sequence}`,name:(clean(name)||this.label).slice(0,80),ids,selectedId:this.selectedId,query:this.query,productType:this.productType,category:this.category,theme:this.theme,collectionStyle:this.collectionStyle,mixed:this.mixed,groupLabel:this.groupLabel,maxPrice:this.maxPrice,limit:this.limit,constraints:this.constraints,sourceOnly:this.sourceOnly,themeChanged:this.themeChanged,terms:[...this.terms],createdAt:existing?.createdAt||new Date().toISOString()};
      this._collections=[record,...this._collections.filter(item=>item.id!==record.id)].slice(0,24);
      return {...record,persisted:this._persist()};
    }
    restoreCollection(id) {
      const item=this._collections.find(entry=>entry.id===String(id));if(!item)return null;
      this.query=item.query;this.productType=item.productType;this.category=item.category;this.theme=item.theme;this.collectionStyle=item.collectionStyle||'';this.mixed=item.mixed===true&&item.sourceOnly===true;this.groupLabel=this.mixed?clean(item.groupLabel):'';this.collectionTrail=[];this.maxPrice=item.maxPrice;this.sourceOnly=item.sourceOnly===true;this.themeChanged=item.themeChanged===true;this.constraints=constraintsFor(this.query,item.constraints);this.terms=Array.isArray(item.terms)?item.terms.filter(term=>typeof term==='string').slice(0,12):this.sourceOnly?[]:queryTerms(this.query);
      this.products=item.ids.map(productId=>this.catalog.get(productId)).filter(p=>p&&matchesChairStyle(p,this.constraints.chair));
      this.limit=item.limit===10?10:6;this.selectedId=this.products.some(p=>String(p.id)===item.selectedId)?item.selectedId:this.products[0]?String(this.products[0].id):null;
      return this.snapshot();
    }
    removeCollection(id) {const before=this._collections.length;this._collections=this._collections.filter(item=>item.id!==String(id));if(before!==this._collections.length)this._persist();return before!==this._collections.length;}
    _persist() {
      try {if(!this.storage)return false;this.storage.setItem(this.storageKey,JSON.stringify({version:1,collections:this._collections}));this.persistenceAvailable=true;return true;}
      catch {this.persistenceAvailable=false;return false;}
    }
    _load() {
      try {
        const raw=this.storage?.getItem(this.storageKey);if(!raw||raw.length>150000)return;
        const data=JSON.parse(raw);if(data?.version!==1||!Array.isArray(data.collections))return;
        const seen=new Set();
        for(const item of data.collections.slice(0,24)) {
          if(!item || typeof item!=='object' || !clean(item.id) || seen.has(item.id) || !Array.isArray(item.ids))continue;
          const ids=unique(item.ids.filter(id=>typeof id==='string'&&this.catalog.has(id))).slice(0,10);if(!ids.length)continue;
          const first=this.catalog.get(ids[0]);
          const mixed=item.mixed===true&&item.sourceOnly===true,groupLabel=mixed?clean(item.groupLabel).slice(0,80):'';
          const productType=mixed?'':clean(item.productType)||first.productType;
          const safeIds=mixed?ids:ids.filter(id=>this.catalog.get(id).productType===productType);if(!safeIds.length)continue;
          seen.add(item.id);
          this._collections.push({id:clean(item.id),name:clean(item.name).slice(0,80)||'Saved picks',ids:safeIds,selectedId:safeIds.includes(item.selectedId)?item.selectedId:safeIds[0],query:clean(item.query),productType,category:mixed?'':clean(item.category)||first.category,theme:clean(item.theme),collectionStyle:clean(item.collectionStyle),mixed,groupLabel,maxPrice:typeof item.maxPrice==='number'&&Number.isFinite(item.maxPrice)&&item.maxPrice>=0?item.maxPrice:null,limit:item.limit===10?10:6,constraints:constraintsFor(clean(item.query),item.constraints),sourceOnly:item.sourceOnly===true,themeChanged:item.themeChanged===true,terms:Array.isArray(item.terms)?item.terms.filter(term=>typeof term==='string'&&term.length<80).slice(0,12):undefined,createdAt:clean(item.createdAt)});
        }
      } catch {this.persistenceAvailable=false;}
    }
  }
  window.CoupiDiscovery=CoupiDiscovery;
})();
