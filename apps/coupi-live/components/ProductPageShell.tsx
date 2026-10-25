import type {ReactNode} from 'react';
import Link from 'next/link';
import {Glyph} from './Glyph';
import ProductFooter from './ProductFooter';
import NetworkNotice from './NetworkNotice';
import './product-pages.css';
import './product-page-visual.css';

export type ProductPageArt='account'|'delivery'|'checkout'|'trust'|'quiet'|'help';
function pageArt(eyebrow:string):ProductPageArt {
  if(/account/i.test(eyebrow))return 'account';
  if(/orders?|tracking|returns/i.test(eyebrow))return 'delivery';
  if(/checkout|decisions/i.test(eyebrow))return 'checkout';
  if(/notification|connection|404/i.test(eyebrow))return 'quiet';
  if(/help|q&a|product/i.test(eyebrow))return 'help';
  return 'trust';
}
/** Small symbolic scenery, not a status indicator or a claim about a real order. */
function PageIllustration({kind}:{kind:ProductPageArt}){
 return <svg className="product-header-art" viewBox="0 0 140 120" aria-hidden="true" focusable="false">
   <ellipse cx="73" cy="104" rx="52" ry="8" fill="var(--page-art-shadow)"/>
   {kind==='account'&&<><path d="M31 98V55a41 41 0 0 1 82 0v43Z" fill="var(--page-art-soft)"/><circle cx="105" cy="32" r="14" fill="var(--page-art-light)"/><path d="M25 99c20-14 37-4 52-12 12-7 35-2 49 10l-4 10H30Z" fill="var(--page-art-ground)"/><path d="M61 91c3-13 12-18 21-12 9 6 3 14-8 23" fill="none" stroke="var(--page-art-light)" strokeWidth="9" strokeLinecap="round"/><circle cx="70" cy="47" r="14" fill="var(--page-art-strong)"/><path d="M47 83c0-23 46-23 46 0Z" fill="var(--page-art-strong)"/><path d="M34 99V73m0 13c-13-1-18-13-13-18 10 0 15 8 13 18Zm1-6c2-13 11-17 17-12-1 10-8 14-17 12Z" fill="var(--page-art-leaf)" stroke="var(--page-art-leaf)" strokeWidth="1.5"/><path d="m112 71 2 5 5 2-5 2-2 5-2-5-5-2 5-2Z" fill="var(--page-art-leaf)"/></>}
   {kind==='delivery'&&<><circle cx="79" cy="54" r="43" fill="var(--page-art-soft)"/><path d="M12 96c19-18 52 19 71-1 19-21-5-32 25-44" fill="none" stroke="var(--page-art-ground)" strokeWidth="13" strokeLinecap="round"/><path d="M12 96c19-18 52 19 71-1 19-21-5-32 25-44" fill="none" stroke="var(--page-art-strong)" strokeWidth="1.5" strokeDasharray="3 5"/><path d="m30 48 28-15 29 16v34L58 99 30 82Z" fill="var(--page-art-ground)"/><path d="m30 48 28 16 29-15-29-16Z" fill="var(--page-art-light)"/><path d="M58 65v34m-14-59 29 17v14" stroke="var(--page-art-strong)" strokeWidth="2" fill="none"/><path d="M100 54V32l13-10 14 10v22Z" fill="var(--page-art-strong)"/><path d="M110 54V41h7v13" fill="var(--page-art-light)"/><circle cx="13" cy="96" r="4" fill="var(--page-art-strong)"/><path d="m26 26 2 6 6 2-6 2-2 6-2-6-6-2 6-2Z" fill="var(--page-art-leaf)"/></>}
   {kind==='checkout'&&<><circle cx="72" cy="58" r="44" fill="var(--page-art-soft)"/><path d="m39 23 7 4 7-4 7 4 7-4 7 4 7-4 7 4 7-4v75l-7-4-7 4-7-4-7 4-7-4-7 4-7-4-7 4Z" fill="var(--page-art-light)" stroke="var(--page-art-ground)" strokeWidth="1.5"/><path d="M50 43h34M50 53h22M50 67h34M50 77h15" stroke="var(--page-art-strong)" strokeWidth="2" strokeLinecap="round"/><circle cx="101" cy="84" r="18" fill="var(--page-art-strong)"/><path d="m94 83 5 5 10-12" fill="none" stroke="var(--page-art-light)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M24 90c-3-17-17-16-14-26 16-1 21 13 14 26Zm0 0c-1-16 8-23 17-19 0 12-7 19-17 19Z" fill="var(--page-art-leaf)"/><path d="M24 97V79" stroke="var(--page-art-strong)" strokeWidth="1.5"/></>}
   {kind==='trust'&&<><circle cx="72" cy="57" r="43" fill="var(--page-art-soft)"/><path d="M40 39c13-2 22-8 31-16 9 8 18 14 31 16v30c0 14-17 28-31 35-14-7-31-21-31-35Z" fill="var(--page-art-ground)" stroke="var(--page-art-strong)" strokeWidth="1.3"/><path d="M49 45c9-2 16-7 22-12 6 5 13 10 22 12v22c0 11-12 22-22 27-10-5-22-16-22-27Z" fill="var(--page-art-light)"/><path d="M63 77c-2-21 10-26 20-25 1 17-8 26-20 25Z" fill="var(--page-art-leaf)"/><path d="m63 84 12-23" stroke="var(--page-art-strong)" strokeWidth="1.7" strokeLinecap="round"/><path d="m23 50 2.5 6.5L32 59l-6.5 2.5L23 68l-2.5-6.5L14 59l6.5-2.5Z" fill="var(--page-art-leaf)"/><circle cx="115" cy="79" r="3" fill="var(--page-art-leaf)"/></>}
   {kind==='quiet'&&<><path d="M27 100V57a44 44 0 0 1 88 0v43Z" fill="var(--page-art-soft)"/><path d="M93 31a19 19 0 1 0 10 32c-20 3-27-21-10-32Z" fill="var(--page-art-light)"/><path d="M26 86c24-14 34 6 56-4 14-6 23 1 33 4v15H26Z" fill="var(--page-art-ground)"/><path d="M45 96c-2-23-15-33-12-47 19 4 24 26 12 47Zm1-7c4-22 17-32 29-30 1 18-12 29-29 30Z" fill="var(--page-art-leaf)"/><path d="M46 101V71" stroke="var(--page-art-strong)" strokeWidth="2"/><path d="m27 28 2 5 5 2-5 2-2 5-2-5-5-2 5-2Zm85 17 1.5 4.5L118 51l-4.5 1.5L112 57l-1.5-4.5L106 51l4.5-1.5Z" fill="var(--page-art-light)"/></>}
   {kind==='help'&&<><circle cx="72" cy="58" r="43" fill="var(--page-art-soft)"/><path d="M24 83c16-7 31-6 46 3 15-9 30-10 46-3v18c-16-6-31-6-46 1-15-7-30-7-46-1Z" fill="var(--page-art-ground)"/><path d="M24 72c16-7 31-6 46 3 15-9 30-10 46-3v22c-16-6-31-6-46 1-15-7-30-7-46-1Z" fill="var(--page-art-light)" stroke="var(--page-art-strong)" strokeWidth="1.3"/><path d="M70 75v20m-36-14 20 3m33 0 19-3" stroke="var(--page-art-ground)" strokeWidth="1.5"/><path d="M40 28h58a9 9 0 0 1 9 9v18a9 9 0 0 1-9 9H70L54 76V64H40a9 9 0 0 1-9-9V37a9 9 0 0 1 9-9Z" fill="var(--page-art-strong)"/><g fill="var(--page-art-light)"><circle cx="53" cy="46" r="3"/><circle cx="69" cy="46" r="3"/><circle cx="85" cy="46" r="3"/></g><path d="m117 24 2 5 5 2-5 2-2 5-2-5-5-2 5-2Z" fill="var(--page-art-leaf)"/></>}
 </svg>;
}

export default function ProductPageShell({title,eyebrow='COOPY / ON YOUR SIDE',caption,children,backHref='/home',subtitle,art}:{title:string;eyebrow?:string;caption:string;children:ReactNode;backHref?:string;subtitle?:string;art?:ProductPageArt}){
  const illustration=art||pageArt(eyebrow);
  return <div className="product-page app-shell" data-phase="noon" data-page-art={illustration}><div className="ambient-field" aria-hidden="true"><span className="ambient-orb orb-one"/><span className="ambient-orb orb-two"/></div><div className="film-grain" aria-hidden="true"/>
    <header className="product-page-top"><Link href={backHref} aria-label="Back"><Glyph name="arrow-left"/></Link><Link href="/home" className="product-page-brand">coupi</Link><nav aria-label="Account and plans"><Link href="/decisions" aria-label="Decisions"><Glyph name="check"/></Link><Link href="/orders" aria-label="Orders"><Glyph name="box"/></Link><Link href="/account" aria-label="Account"><Glyph name="user"/></Link></nav></header>
    <main className="product-page-main"><NetworkNotice/><div className="product-page-heading"><div className="product-heading-copy"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1></div><PageIllustration kind={illustration}/>{subtitle&&<p className="product-heading-subtitle">{subtitle}</p>}</div>{children}<p className="screen-caption"><span className="caption-mark"/>{caption}</p></main>
    <ProductFooter/>
    <nav className="product-page-nav" aria-label="Main navigation"><Link href="/home"><Glyph name="home"/>Home</Link><Link href="/call"><Glyph name="mic"/>Call</Link><Link href="/explore"><Glyph name="scene"/>Explore</Link></nav>
  </div>;
}
