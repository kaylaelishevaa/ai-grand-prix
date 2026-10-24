import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {title:'COUPI — a little more you',description:'Your shopping companion. Live taste learning, honest evidence, and decisions you control.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><head><link href="/fonts/fonts.css" rel="stylesheet"/></head><body>{children}</body></html>;}
