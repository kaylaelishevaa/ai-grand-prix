/* Browser-local browsing groups. Listing facts always come from the trusted catalog. */
(() => {
  'use strict';
  const TYPES = {lipstick:'Lipsticks',glasses:'Glasses',chair:'Chairs',lamp:'Desk lamps',tshirt:'T-shirts',hoodie:'Hoodies'};
  const COLORS = {
    pink:['pink','핑크','분홍'],red:['red','레드','빨강','빨간'],purple:['purple','plum','violet','lilac','퍼플','보라','바이올렛'],
    nude:['nude','누드'],peach:['peach','피치','복숭아'],coral:['coral','코랄'],brown:['brown','브라운','갈색'],
    black:['black','블랙','검정'],white:['white','화이트','흰색'],gray:['gray','grey','charcoal','그레이','회색'],
    blue:['blue','블루','파랑','파란'],green:['green','olive','그린','녹색','초록'],yellow:['yellow','옐로','노랑','노란'],beige:['beige','베이지'],silver:['silver','실버'],gold:['gold','골드'],
  };
  const STYLE = {sunglasses:['sunglasses','선글라스'],optical:['optical','eyeglasses','spectacles','clear lenses','normal glasses','regular glasses','일반 안경','투명 렌즈']};
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
        const negative=/(?:not|no|except|excluding|without|don t want|do not want)\s+(?:a\s+)?$/u.test(before)||/^\s*(?:색)?\s*(?:말고|제외|빼고)/u.test(after);
        (negative?exclude:include).push(key);
      }
    }
    return {include:unique(include).filter(key=>!exclude.includes(key)),exclude:unique(exclude)};
  }
  function constraintsFor(query,supplied) {
    const result={};for(const [key,map] of [['colors',COLORS],['eyewear',STYLE]]){
      const provided=supplied?.[key];result[key]=provided&&Array.isArray(provided.include)&&Array.isArray(provided.exclude)?{include:unique(provided.include.filter(value=>Object.hasOwn(map,value))),exclude:unique(provided.exclude.filter(value=>Object.hasOwn(map,value)))}:requested(query,map);
    }return result;
  }
  function facets(product) {
    const text=[...(product.tags||[]),product.color,product.colour,product.style].filter(x=>typeof x==='string').join(' ').toLowerCase();
    const values=themes(text);
    if(product.productType==='glasses')values.unshift(themes(text,STYLE).includes('sunglasses')?'sunglasses':'optical');
    return values;
  }
  function typeFrom(query) {
    if(/lipstick|lip tint|립스틱|립틴트|틴트/.test(query))return 'lipstick';
    if(/sunglasses|eyeglasses|glasses|선글라스|안경/.test(query))return 'glasses';
    if(/hoodie|후드/.test(query))return 'hoodie';
    if(/t-?shirts?|\btee\b|티셔츠|반팔/.test(query))return 'tshirt';
    if(/chair|의자/.test(query))return 'chair';
    if(/lamp|스탠드|조명/.test(query))return 'lamp';
    return '';
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
      .replace(/\b(show|find|me|my|some|a|an|the|i|want|like|please|recommend|looking|for|can|could|would|you|need|trying|try|to|buy|not|no|except|excluding|without|don|do|t|products?|options?|different|normal|everyday|brands?|sellers?|and|or|of|with)\b/g,' ')
      .replace(/추천|찾아|보여|주세요|제품|상품|일반|말고|제외|빼고/g,' ');
    for(const words of [...Object.values(COLORS),...Object.values(STYLE)])for(const word of words)value=/[a-z]/i.test(word)?value.replace(new RegExp(`\\b${word}\\b`,'g'),' '):value.replaceAll(word,' ');
    value=value.replace(/lipsticks?|lip tints?|t-?shirts?|hoodies?|chairs?|desk lamps?|table lamps?|lamps?|glasses|립스틱|립틴트|틴트|티셔츠|반팔|후드티?|의자|스탠드|조명|안경|선글라스/g,' ');
    return value.split(/[^\p{L}\p{N}-]+/u).filter(word=>word.length>1).slice(0,12);
  }
  function limitFrom(options,query) {
    const explicit=options.maxPrice ?? options.max_price;
    if(explicit!==null && explicit!==undefined && Number.isFinite(Number(explicit)) && Number(explicit)>=0)return Number(explicit);
    const match=query.match(/(?:under|below|less than|up to|max(?:imum)?|budget(?: of)?)\s*₩?\s*([\d,.]+)/i)||query.match(/([\d,.]+)\s*(?:원|won|krw)?\s*(?:이하|미만)/i);
    return match ? Number(match[1].replaceAll(',','')) : null;
  }
  function labelFor(type,theme) {
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
      this.compareIds=[];this._collections=[];this.sequence=0;this.persistenceAvailable=Boolean(this.storage);this._load();
    }
    get current() {return this.catalog.get(this.selectedId)||null;}
    get visible() {return this.products.slice(0,this.limit);}
    get total() {return this.products.length;}
    get hasMore() {return this.limit<Math.min(10,this.total);}
    get label() {return labelFor(this.productType,this.theme);}
    get comparison() {return this.compareIds.map(id=>this.catalog.get(id)).filter(Boolean);}
    get collections() {return this._collections.map(item=>({...item,ids:[...item.ids],products:item.ids.map(id=>this.catalog.get(id)).filter(Boolean),productCount:item.ids.length}));}
    snapshot() {return {label:this.label,query:this.query,theme:this.theme,productType:this.productType,category:this.category,maxPrice:this.maxPrice,total:this.total,hasMore:this.hasMore,limit:this.limit,products:[...this.products],visible:this.visible,current:this.current,selectedId:this.selectedId};}
    _matches(product,theme=this.theme,ignoreIncludes=this.themeChanged) {
      if(this.productType && product.productType!==this.productType)return false;
      if(this.category && this.category!=='all' && product.category!==this.category)return false;
      if(this.maxPrice!==null && (!Number.isFinite(product.price)||product.price>this.maxPrice))return false;
      const values=facets(product);
      if(theme && !values.includes(theme))return false;
      for(const [kind,rule] of Object.entries(this.constraints)){
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
      this.productType=clean(options.productType)||typeFrom(this.query)||seeds[0]?.productType||'';
      this.category=clean(options.category)||seeds[0]?.category||'';
      this.constraints=constraintsFor(this.query,options.constraints);this.sourceOnly=options.sourceOnly===true;this.themeChanged=false;
      this.theme=clean(options.theme)||queryTheme(this.constraints,this.productType);
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
      const record={id:existing?.id||`collection_${Date.now()}_${++this.sequence}`,name:(clean(name)||this.label).slice(0,80),ids,selectedId:this.selectedId,query:this.query,productType:this.productType,category:this.category,theme:this.theme,maxPrice:this.maxPrice,limit:this.limit,constraints:this.constraints,sourceOnly:this.sourceOnly,themeChanged:this.themeChanged,createdAt:existing?.createdAt||new Date().toISOString()};
      this._collections=[record,...this._collections.filter(item=>item.id!==record.id)].slice(0,24);
      return {...record,persisted:this._persist()};
    }
    restoreCollection(id) {
      const item=this._collections.find(entry=>entry.id===String(id));if(!item)return null;
      this.query=item.query;this.productType=item.productType;this.category=item.category;this.theme=item.theme;this.maxPrice=item.maxPrice;this.sourceOnly=item.sourceOnly===true;this.themeChanged=item.themeChanged===true;this.constraints=constraintsFor(this.query,item.constraints);this.terms=this.sourceOnly?[]:queryTerms(this.query);
      this.products=item.ids.map(productId=>this.catalog.get(productId)).filter(Boolean);
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
          const productType=clean(item.productType)||first.productType;
          const safeIds=ids.filter(id=>this.catalog.get(id).productType===productType);if(!safeIds.length)continue;
          seen.add(item.id);
          this._collections.push({id:clean(item.id),name:clean(item.name).slice(0,80)||'Saved picks',ids:safeIds,selectedId:safeIds.includes(item.selectedId)?item.selectedId:safeIds[0],query:clean(item.query),productType,category:clean(item.category)||first.category,theme:clean(item.theme),maxPrice:typeof item.maxPrice==='number'&&Number.isFinite(item.maxPrice)&&item.maxPrice>=0?item.maxPrice:null,limit:item.limit===10?10:6,constraints:constraintsFor(clean(item.query),item.constraints),sourceOnly:item.sourceOnly===true,themeChanged:item.themeChanged===true,createdAt:clean(item.createdAt)});
        }
      } catch {this.persistenceAvailable=false;}
    }
  }
  window.CoupiDiscovery=CoupiDiscovery;
})();
