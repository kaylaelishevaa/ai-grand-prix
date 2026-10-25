import {notFound} from 'next/navigation';
import Link from 'next/link';
import ProductPageShell from '@/components/ProductPageShell';
import {getSku} from '@/lib/catalog';

export default async function SellerQuestions({params}:{params:Promise<{skuId:string}>}){
 const {skuId}=await params,sku=getSku(skuId);if(!sku)notFound();
 return <ProductPageShell title="a little more detail." eyebrow="PRODUCT / SELLER Q&A" caption="replaces unanswered product questions"><h2 style={{fontFamily:'var(--display)',fontSize:29}}>{sku.name}</h2><p className="product-notice">The catalog can answer these details. No seller is connected to this concept, so these are seeded product facts, not messages from a merchant.</p><dl>{Object.entries(sku.facts).map(([key,value])=><div key={key} style={{padding:'17px 0',borderBottom:'1px solid var(--line)'}}><dt style={{font:'8px var(--mono)',color:'var(--muted)'}}>{key.replace(/([A-Z])/g,' $1').toUpperCase()}</dt><dd style={{fontSize:13,marginTop:8}}>{String(value)}</dd></div>)}</dl><p className="product-notice">Need something else? Ask Coopy. If this catalog doesn’t say, Coopy should ask or say it doesn’t know.</p><div className="product-inline-links"><Link href="/experience?utility=call">Ask in a call</Link><a href={`https://www.coupang.com/np/search?q=${encodeURIComponent(sku.aliases[0]||sku.name)}`} target="_blank" rel="noopener noreferrer">Find similar products on Coupang</a></div></ProductPageShell>;
}
