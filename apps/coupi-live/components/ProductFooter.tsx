import Link from 'next/link';
import './product-pages.css';

export default function ProductFooter(){return <footer className="product-footer">
  <nav aria-label="About and support"><Link href="/about">About</Link><Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link><Link href="/how-coopy-works">How Coopy Works</Link><Link href="/help">Help</Link></nav>
  <p>Concept simulation built at AI Grand Prix 2026</p>
</footer>;}
