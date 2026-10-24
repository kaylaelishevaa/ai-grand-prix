'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
export default function NetworkNotice(){const[offline,setOffline]=useState(false);useEffect(()=>{const refresh=()=>setOffline(!navigator.onLine);refresh();window.addEventListener('online',refresh);window.addEventListener('offline',refresh);return()=>{window.removeEventListener('online',refresh);window.removeEventListener('offline',refresh);};},[]);return offline?<aside className="product-notice" role="status"><span className="mono">CONNECTION / OFFLINE</span><p>i’m still here. new answers may need a connection.</p><Link href="/offline">See what still works →</Link></aside>:null;}
