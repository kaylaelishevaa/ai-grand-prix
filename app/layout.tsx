import type { Metadata } from 'next';
import './globals.css';
// Offline can be enabled when starting an already-built server; never bake remote font loading into HTML.
export const dynamic='force-dynamic';
export const metadata: Metadata = {title:'COUPI — a little more you',description:'Your shopping companion. Live taste learning, honest evidence, and decisions you control.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><head>{process.env.DEMO_OFFLINE!=='1'&&<link href="/fonts/fonts.css" rel="stylesheet"/>}</head><body>{children}</body></html>;}
