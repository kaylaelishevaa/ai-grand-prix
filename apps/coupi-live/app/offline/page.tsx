'use client';
import Link from 'next/link';
import ProductPageShell from '@/components/ProductPageShell';
import {Pet} from '@/components/CoupiApp';
export default function OfflinePage(){return <ProductPageShell title="still here. a little quieter." eyebrow="CONNECTION / TAKING A BREATH" caption="replaces a connection error"><section className="product-empty"><Pet size="large"/><p>Your saved plans and worlds live on the local server. When that server is running, you can still revisit them. New AI answers need a connection or an exact rehearsed cache entry.</p><button className="button" onClick={()=>location.assign('/experience')}>Try my home again</button><p>Camera calls and voice recognition stay off in offline replay. Nothing is bought or retried on your behalf.</p><Link href="/orders">See saved orders →</Link><br/><Link href="/help">What works offline? →</Link></section></ProductPageShell>;}
