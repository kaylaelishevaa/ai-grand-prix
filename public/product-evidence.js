/* Evidence-first product details and comparison. No HTML is taken from listing/review text. */
(() => {
  'use strict';
  const text=value=>typeof value==='string'?value.trim():'';
  function node(tag,className,value) {
    const element=document.createElement(tag);if(className)element.className=className;
    if(value!==undefined)element.textContent=String(value);return element;
  }
  function sourceUrl(value) {
    try {const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:null;}catch{return null;}
  }
  function sourceLink(url,label='View review source') {
    const href=sourceUrl(url);if(!href)return null;
    const anchor=node('a','evidence-source',label);anchor.href=href;anchor.target='_blank';anchor.rel='noopener noreferrer';return anchor;
  }
  function appendSource(parent,url,label) {const link=sourceLink(url,label);if(link)parent.append(link);}
  function evidence(product) {
    const raw=product?.reviewEvidence||{},url=sourceUrl(raw.sourceUrl);
    const reviews=(Array.isArray(raw.reviews)?raw.reviews:[]).filter(review=>review&&text(review.text)&&sourceUrl(review.sourceUrl||url)).slice(0,20);
    return {raw,url,reviews,rating:url&&typeof raw.rating==='number'&&Number.isFinite(raw.rating)&&raw.rating>=0&&raw.rating<=5?raw.rating:null,count:url&&Number.isInteger(raw.reviewCount)&&raw.reviewCount>=0?raw.reviewCount:null};
  }
  const ratingText=e=>e.rating===null?'Rating unavailable':`${e.rating.toFixed(1)} / 5`;
  const countText=e=>e.count===null?'Review count unavailable':`${e.count.toLocaleString('en-US')} reviews`;
  function reviewStats(product) {
    const e=evidence(product),sampleCount=e.reviews.length;
    const label=e.rating!==null?`★ ${e.rating.toFixed(1)}${e.count!==null?` · ${e.count.toLocaleString('en-US')} reviews`:''}`:
      e.count!==null?`${e.count.toLocaleString('en-US')} reviews`:sampleCount?`${sampleCount} review ${sampleCount===1?'sample':'samples'}`:'Reviews unavailable';
    return {available:sampleCount>0,rating:e.rating,count:e.count,sampleCount,label};
  }
  function list(values,className,emptyText) {
    const entries=(Array.isArray(values)?values:[]).filter(value=>text(value)).slice(0,6);
    if(!entries.length)return node('p','review-unavailable',emptyText);
    const ul=node('ul',className);for(const value of entries)ul.append(node('li','',value));return ul;
  }
  function renderReviews(container,product) {
    const e=evidence(product),section=node('section','review-summary review-panel');
    const heading=node('div','review-panel-heading');heading.append(node('h3','','Ratings & reviews'));
    if(e.reviews.length)heading.append(node('span','review-sample-badge',`${e.reviews.length} ${e.reviews.length===1?'sample':'samples'}`));
    section.append(heading);
    if(e.rating!==null||e.count!==null) {
      const rating=node('div','review-rating-overview');
      if(e.rating!==null){const score=node('strong','review-rating-value',ratingText(e));rating.append(score);}
      else rating.append(node('span','review-rating-missing','Rating unavailable'));
      if(e.count!==null)rating.append(node('span','review-total-count',countText(e)));
      section.append(rating);
    }
    if(e.reviews.length) {
      const summary=node('section','review-ai-summary');
      summary.append(node('h4','',e.raw.summaryKind==='ai-curated'?'AI review summary':'Review sample summary'));
      summary.append(node('p','review-scope',`Based on ${e.reviews.length} sourced review ${e.reviews.length===1?'sample':'samples'}, not every review.`));
      if(text(e.raw.summary))summary.append(node('p','',e.raw.summary));
      else summary.append(node('p','review-unavailable','A review summary has not been prepared for this product.'));
      const prosCons=node('div','review-pros-cons');
      const pros=node('section','review-pros');pros.append(node('h4','','Pros'),list(e.raw.pros,'comparison-facts','Not summarized for this sample.'));
      const cons=node('section','review-cons');cons.append(node('h4','','Cons'),list(e.raw.cons,'comparison-facts','Not summarized for this sample.'));
      prosCons.append(pros,cons);summary.append(prosCons);section.append(summary);
      const provenance=node('div','review-provenance');
      if(text(e.raw.scopeNote))provenance.append(node('p','review-scope',e.raw.scopeNote));
      if(text(e.raw.checkedAt))provenance.append(node('p','review-scope',`Source snapshot checked ${text(e.raw.checkedAt)}.`));
      appendSource(provenance,e.url,'View review source ↗');section.append(provenance);
      section.append(node('h4','review-list-heading','Customer review samples'));
      const reviews=node('div','review-list');
      for(const [index,review] of e.reviews.entries()) {
        const article=node('article','review-item');
        const top=node('div','review-item-heading');
        top.append(node('strong','review-item-label',`Review ${index+1}`));
        if(typeof review.rating==='number'&&Number.isFinite(review.rating)&&review.rating>=0&&review.rating<=5)top.append(node('span','review-item-rating',`★ ${review.rating.toFixed(1)} / 5`));
        article.append(top);
        const parts=[];if(text(review.variant))parts.push('Option: '+text(review.variant));if(text(review.date))parts.push(text(review.date));
        const kind=text(review.kind||review.format);
        parts.push(review.translated||/translat/i.test(kind)?'Translated paraphrase':/excerpt|quote/i.test(kind)?'Review excerpt':'Review paraphrase');
        article.append(node('p','review-text',review.text),node('p','review-meta',parts.join(' · ')));
        appendSource(article,review.sourceUrl||e.url,'Review source ↗');reviews.append(article);
      }
      section.append(reviews);
    } else {
      const empty=node('div','review-empty');
      empty.append(node('p','review-empty-title','Reviews not available here yet'),node('p','review-scope','Open the listing to read current customer reviews.'));
      section.append(empty);
      if(e.rating!==null||e.count!==null) {
        section.append(node('p','review-scope',`Rating snapshot${text(e.raw.checkedAt)?` · checked ${text(e.raw.checkedAt)}`:''}. Written review samples are not available here.`));
        appendSource(section,e.url,'View rating source ↗');
      }
    }
    appendSource(section,product?.url,'Read reviews on Coupang ↗');
    if(text(e.raw.note))section.append(node('p','review-scope',e.raw.note));
    container.replaceChildren(section);return section;
  }
  function productImage(product) {
    const value=text(product?.image);if(/^\/products\/[a-zA-Z0-9_.-]+$/.test(value))return value;
    const url=sourceUrl(value);if(!url)return null;
    const host=new URL(url).hostname;return host==='coupangcdn.com'||host.endsWith('.coupangcdn.com')?url:null;
  }
  function renderComparison(container,products,{onTry,onDetails,onRemove}={}) {
    const selected=(Array.isArray(products)?products:[]).filter(p=>p&&p.id!==null&&p.id!==undefined).slice(0,3);
    if(!selected.length){container.replaceChildren(node('p','review-unavailable','Select two or three products to compare.'));return null;}
    const table=node('table','comparison-table'),caption=node('caption','comparison-caption','Compare selected products');table.append(caption);
    const head=node('thead'),header=node('tr');header.append(node('th','','Product'));
    for(const product of selected) {
      const th=node('th','comparison-product');th.scope='col';
      const imageUrl=productImage(product);if(imageUrl){const image=node('img');image.src=imageUrl;image.alt=text(product.name);image.loading='lazy';th.append(image);}
      th.append(node('strong','',text(product.name)||'Catalog product'));
      if(typeof onRemove==='function'){const remove=node('button','comparison-remove','Remove');remove.type='button';remove.setAttribute('aria-label',`Remove ${text(product.name)||'product'} from comparison`);remove.onclick=()=>onRemove(product);th.append(remove);}
      header.append(th);
    }
    head.append(header);table.append(head);const body=node('tbody');
    function row(label,render) {const tr=node('tr'),th=node('th','',label);th.scope='row';tr.append(th);for(const product of selected){const td=node('td');const value=render(product);if(value&&typeof value==='object'&&value.nodeType)td.append(value);else td.textContent=String(value??'Unavailable');tr.append(td);}body.append(tr);}
    row('Reference price',p=>typeof p.price==='number'&&Number.isFinite(p.price)?`₩${p.price.toLocaleString('en-US')} · historical`:'Check price on Coupang');
    row('Brand',p=>text(p.brand)||'Brand not verified');
    row('Variant / type',p=>text(p.preview?.shadeLabel)||text(p.variant)||text(p.productType)||'Not verified');
    row('Verified listing details',p=>list(p.verifiedAttributes,'comparison-facts','No additional details verified.'));
    row('Ratings',p=>{const e=evidence(p);return `${ratingText(e)} · ${countText(e)}`;});
    row('Review sample positives',p=>{const e=evidence(p);return e.reviews.length?list(e.raw.pros,'comparison-facts','No positive theme established.'):'Written review evidence unavailable';});
    row('Review sample concerns',p=>{const e=evidence(p);return e.reviews.length?list(e.raw.cons,'comparison-facts','No recurring concern established.'):'Written review evidence unavailable';});
    row('Evidence',p=>{const e=evidence(p),cell=node('div');if(text(e.raw.scopeNote))cell.append(node('p','review-scope',e.raw.scopeNote));if(e.reviews.length)cell.append(node('p','review-scope',`${e.reviews.length} sourced review ${e.reviews.length===1?'sample':'samples'}; not all reviews.`));appendSource(cell,e.url,'Review source ↗');appendSource(cell,p.url,'Coupang listing ↗');return cell;});
    row('Take a closer look',p=>{const actions=node('div','comparison-actions');for(const [label,callback] of [['Details',onDetails],['Try it',onTry]])if(typeof callback==='function'){const unavailable=label==='Try it'&&p.preview?.available===false;const button=node('button','',unavailable?'No preview':label);button.type='button';button.disabled=unavailable;if(unavailable)button.setAttribute('aria-label','Preview unavailable for '+text(p.name));else button.onclick=()=>callback(p);actions.append(button);}return actions;});
    table.append(body);container.replaceChildren(table);return table;
  }
  window.CoupiEvidence={renderReviews,renderComparison,reviewStats};
})();
