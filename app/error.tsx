'use client';
import Link from 'next/link';
import ProductPageShell from '@/components/ProductPageShell';
import {Pet} from '@/components/CoupiApp';
export default function AppErrorPage({reset}:{error:Error;reset:()=>void}){return <ProductPageShell title="one little pause." eyebrow="CONNECTION / LET’S TRY AGAIN" caption="replaces an error wall"><section className="product-empty"><Pet size="large"/><p>That page didn’t arrive properly. Your saved plans remain on the local server.</p><button className="button" onClick={reset}>Try this page again</button><br/><Link href="/offline">Connection help →</Link></section></ProductPageShell>;}
