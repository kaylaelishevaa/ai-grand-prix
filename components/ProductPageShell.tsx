import type {ReactNode} from 'react';
import Link from 'next/link';
import {Glyph} from './Glyph';
import ProductFooter from './ProductFooter';
import NetworkNotice from './NetworkNotice';
import './product-pages.css';

export default function ProductPageShell({title,eyebrow='COOPY / ON YOUR SIDE',caption,children,backHref='/experience',subtitle}:{title:string;eyebrow?:string;caption:string;children:ReactNode;backHref?:string;subtitle?:string}){
  return <div className="product-page app-shell" data-phase="noon"><div className="ambient-field" aria-hidden="true"><span className="ambient-orb orb-one"/><span className="ambient-orb orb-two"/></div><div className="film-grain" aria-hidden="true"/>
    <header className="product-page-top"><Link href={backHref} aria-label="Back"><Glyph name="arrow-left"/></Link><Link href="/experience" className="product-page-brand">coopy<span>.</span></Link><nav aria-label="Your account and plans"><Link href="/decisions" aria-label="Decisions"><Glyph name="check"/></Link><Link href="/orders" aria-label="Orders"><Glyph name="box"/></Link><Link href="/account" aria-label="Account"><Glyph name="user"/></Link></nav></header>
    <main className="product-page-main"><NetworkNotice/><div className="product-page-heading"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{subtitle&&<p>{subtitle}</p>}</div>{children}<p className="screen-caption"><span className="caption-mark"/>{caption}</p></main>
    <ProductFooter/>
    <nav className="product-page-nav" aria-label="Main navigation"><Link href="/experience"><Glyph name="home"/>Home</Link><Link href="/experience?utility=call"><Glyph name="mic"/>Call</Link><Link href="/experience?utility=world"><Glyph name="scene"/>Explore</Link></nav>
  </div>;
}
