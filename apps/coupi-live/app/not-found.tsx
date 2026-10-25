import Link from 'next/link';
import ProductPageShell from '@/components/ProductPageShell';
import {Pet} from '@/components/CoupiApp';
export default function NotFound(){return <ProductPageShell title="a little off the path." eyebrow="404 / A QUIET DETOUR" caption="replaces a dead end"><section className="product-empty"><Pet size="large"/><p>this place isn’t here. your world is still right where you left it.</p><Link href="/experience?utility=world">Back to your world →</Link></section></ProductPageShell>;}
