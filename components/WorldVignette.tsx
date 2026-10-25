import {useId} from 'react';
import {resolveSceneKind} from '@/lib/scenes';
import {resolveSceneContext} from '@/lib/world-context';
import type {SceneResult} from '@/lib/types';

/** Atmospheric wayfinding art; product details remain in the live scene. */
export default function WorldVignette({scene}:{scene:SceneResult}) {
  const id=useId().replace(/:/g,''),kind=resolveSceneKind(scene),setting=resolveSceneContext(scene).setting;
  const river=setting==='riverside',roof=setting==='rooftop',rain=setting==='cafe',dress=kind==='dressing',desk=kind==='desk';
  const colors=river?['#d9ebda','#80b6ab','#2b7b78']:roof?['#e4c9cf','#9a8fa8','#514f76']:rain?['#dce6e7','#8ba7af','#41666b']:dress?['#f6dfd8','#d0a0aa','#976f84']:desk?['#f9e6ce','#b9c1a0','#6f8572']:['#f8eccf','#b9c9b0','#7b9d87'];
  return <svg className="world-vignette" viewBox="0 0 160 114" fill="none" aria-hidden="true">
    <defs><linearGradient id={id} x2="1" y2="1"><stop stopColor={colors[0]}/><stop offset="1" stopColor={colors[1]}/></linearGradient></defs>
    <path d="M18 35C21 10 52 5 77 10c36-19 70 8 66 38 22 27-5 55-35 52-37 18-94 5-94-26C0 61 3 48 18 35Z" fill={`url(#${id})`}/>
    <circle cx={rain?117:35} cy="33" r={roof?10:14} fill="#fff6d9" opacity=".8"/>
    <ellipse cx="81" cy="89" rx="57" ry="12" fill={colors[2]} opacity=".13"/>
    {river?<><path d="M13 76c30-22 47 23 78 10s39-6 57 4" stroke="#68aaa5" strokeWidth="15"/><path d="M21 77c25-14 41 22 68 11" stroke="#e3f2dc" strokeWidth="1.5" strokeDasharray="8 8"/><path d="m57 65 48-9 22 24-51 9Z" fill="#e5b7a4"/><path d="m62 68 47-7m-40 17 47-8M76 63l19 22m-8-25 19 22" stroke="#fff0d8" strokeWidth="2"/><path d="M35 65V38m0 10L25 39m10 8 11-14" stroke="#826e50" strokeWidth="3"/><circle cx="33" cy="30" r="16" fill="#7c9d72"/><circle cx="47" cy="35" r="11" fill="#93b183"/></>
    :roof?<><path d="M28 71V42m103 29V42M28 52h103" stroke="#82758c" strokeWidth="2"/><path d="M37 54v17m13-17v17m13-17v17m13-17v17m13-17v17m13-17v17m13-17v17" stroke="#b69bab"/><path d="M23 29q57 34 115 0" stroke="#756a83" strokeWidth="1.5"/>{[37,58,80,102,123].map((x,i)=><circle key={x} cx={x} cy={35+Math.sin(i/4*Math.PI)*11} r="3" fill="#fff0b7"/>)}<ellipse cx="80" cy="72" rx="30" ry="10" fill="#edd3bc"/><path d="M62 76v16m36-16v16" stroke="#947c81" strokeWidth="3"/><path d="M78 68v-9" stroke="#ffedd4" strokeWidth="3"/><circle cx="78" cy="57" r="2" fill="#ffe09b"/></>
    :dress?<><path d="M33 84V38q0-16 16-16h30v61M33 37h46" stroke="#ba956e" strokeWidth="3"/><path d="M46 43 39 68h24l-7-25-5 4Z" fill="#557f7b"/><path d="M49 43v-7" stroke="#ba956e" strokeWidth="2"/><ellipse cx="111" cy="48" rx="18" ry="25" fill="#f7eee2" stroke="#bd9a78" strokeWidth="3"/><path d="M90 79h40m-35 0v14m30-14v14" stroke="#a77e74" strokeWidth="3"/><ellipse cx="111" cy="76" rx="23" ry="6" fill="#f0d5be"/></>
    :rain?<><path d="M40 71V28h58v44" fill="#bbd0cd" stroke="#f7f0db" strokeWidth="4"/><path d="M69 28v42M40 49h58" stroke="#f7f0db" strokeWidth="3"/><path d="m49 32-3 8m17-7-3 8m20 14-3 8m-24-8-3 8m43-25-3 8" stroke="#8aa5aa" strokeWidth="1.5"/><path d="M29 77q-7-17 9-17h16q12 0 10 17v9H29Z" fill="#8b9f8c"/><ellipse cx="106" cy="80" rx="23" ry="7" fill="#d7b792"/><path d="M106 84v14" stroke="#a58e72" strokeWidth="3"/><path d="M100 75v-7h9v7Z" fill="#f7ecda"/></>
    :<><path d="M39 29h67v41H39Z" fill="#f4f3dd" stroke="#b0c0ac" strokeWidth="3"/><path d="M72 29v41M39 49h67" stroke="#b0c0ac" strokeWidth="2"/><path d="M29 76h98m-89 2v18m78-18v18" stroke="#ad8f66" strokeWidth="4"/><ellipse cx="78" cy="74" rx="51" ry="9" fill="#e6c5a0"/>{desk?<><path d="M45 72V45m0 0 17-7" stroke="#6e8b79" strokeWidth="3"/><path d="m56 38 10-6 10 11H55Z" fill="#d2a46f"/><path d="m73 67 18-6 17 8-19 6Z" fill="#f8f3df"/></>:<><path d="M50 71V60q0-11 9-11t9 11v11Z" fill="#789c8b"/><path d="m68 60 9-5-7 11" fill="#789c8b"/><path d="M88 72v-9h12v9" fill="#fff5de"/></>}</>}
  </svg>;
}
