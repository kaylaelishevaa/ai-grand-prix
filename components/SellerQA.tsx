import Link from 'next/link';
import {Glyph} from './Glyph';
export default function SellerQA({skuId}:{skuId:string}){return <Link className="seller-qa-link" href={`/products/${encodeURIComponent(skuId)}/questions`}><Glyph name="help"/>Seller Q&amp;A <Glyph name="arrow-up"/></Link>;}
