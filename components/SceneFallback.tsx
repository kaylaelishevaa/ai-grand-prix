'use client';

import {useId,type CSSProperties} from 'react';
import {getSku} from '@/lib/catalog';
import {resolveSceneKind,type SceneKind} from '@/lib/scenes';
import {resolveSceneContext,type SceneSetting} from '@/lib/world-context';
import type {SceneResult} from '@/lib/types';
import {productArt} from './art';
import {Glyph} from './Glyph';
import './scene-fallback.css';

function Tree({x,y,scale=1,color='#6f9174'}:{x:number;y:number;scale?:number;color?:string}) {
  return <g transform={`translate(${x} ${y}) scale(${scale})`}><path d="M0 15Q-7-50 3-117" fill="none" stroke="#6c7966" strokeWidth="9"/><path d="M2-62-32-91M2-40 34-75" stroke="#6c7966" strokeWidth="6"/><ellipse cx="0" cy="-127" rx="53" ry="64" fill={color}/><ellipse cx="-33" cy="-89" rx="39" ry="45" fill={color}/><ellipse cx="34" cy="-91" rx="38" ry="46" fill={color}/><path d="M-20-159q-22 18-20 43" stroke="#fff8f0" strokeOpacity=".18" strokeWidth="9" strokeLinecap="round" fill="none"/></g>;
}

function Landscape({kind,id,setting}:{kind:SceneKind;id:string;setting:SceneSetting}) {
  const night=kind==='reading'||kind==='dressing'||setting==='rooftop';
  const ground=kind==='reading'?'#536d80':kind==='dressing'?'#bc8093':kind==='desk'?'#e5a48b':'#d9c7a2';
  return <svg className="fallback-landscape" viewBox="0 0 900 620" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id={`${id}-land`} x1="0" y1="0" x2="0.7" y2="1"><stop stopColor={ground}/><stop offset="1" stopColor={kind==='reading'?'#2e4d62':kind==='dressing'?'#785d7d':kind==='desk'?'#d58477':'#b4bb91'}/></linearGradient><radialGradient id={`${id}-glow`}><stop stopColor={night?'#f8c18d':'#fff8da'} stopOpacity=".7"/><stop offset="1" stopColor={night?'#f8c18d':'#fff8da'} stopOpacity="0"/></radialGradient><linearGradient id={`${id}-water`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#9dbbcc"/><stop offset="1" stopColor="#456b84"/></linearGradient></defs>
    <ellipse cx="480" cy="514" rx="300" ry="53" fill={night?'#182c47':'#a58f70'} opacity=".09"/>
    <circle className="fallback-orb" cx={kind==='reading'?700:kind==='dressing'?640:220} cy={kind==='reading'?104:150} r={kind==='reading'?35:68} fill={kind==='reading'?'#c9d5e7':kind==='dressing'?'#f4ad87':kind==='desk'?'#f4c979':'#f9df9f'}/>
    {setting==='rooftop'&&<g opacity=".23" fill="#4f4667"><path d="M548 301V227h28v-37h33v111h16V180h45v121h19V213h24v-35h27v123h23V228h44v73h22V192h21v109Z"/><path d="M570 238h5m55-32h8m55 40h10m55-10h8" stroke="#f9c69c" strokeWidth="5"/></g>}
    <path d="M129 422C97 346 190 294 280 295c40-68 184-82 246-42 109-24 253 25 253 103 83 72 26 155-55 177-78 62-206 30-271 16-101 36-276 10-324-127Z" fill={`url(#${id}-land)`}/>
    <path d="M162 431C124 369 205 317 286 324c50-65 162-73 235-36 115-24 222 20 225 79 78 54 19 120-64 143-72 30-169 18-231 5-108 35-250 7-289-84Z" fill={kind==='reading'?'#78938d':kind==='dressing'?'#e0b1b2':kind==='desk'?'#f4c3aa':'#ece4bf'}/>
    <path d="M262 547c59-76 99-33 130-94s-12-90 59-114" fill="none" stroke={kind==='reading'?'#aec2b5':kind==='dressing'?'#eec7c4':kind==='desk'?'#ffe2bb':'#fff6da'} strokeWidth="28" strokeLinecap="round" opacity=".8"/>
    <g fill={kind==='reading'?'#8495a2':kind==='dressing'?'#c69caa':'#c0b592'}>{[0,1,2,3,4].map(n=><ellipse key={n} cx={218-n*15} cy={537+n*12} rx={17-n} ry="5" transform={`rotate(-20 ${218-n*15} ${537+n*12})`}/>)}</g>
    {kind==='kitchen'&&setting!=='riverside'&&setting!=='rooftop'&&<>
      <g fill="#b5c69b" opacity=".55"><ellipse cx="175" cy="326" rx="90" ry="37"/><ellipse cx="746" cy="367" rx="66" ry="34"/></g>
      <Tree x={199} y={352} scale={.98} color="#789967"/><Tree x={745} y={373} scale={.76} color="#8ba776"/>
      <g fill="#e6b857">{[[180,211],[217,235],[157,246],[749,269],[725,293]].map(([x,y],i)=><circle key={i} cx={x} cy={y} r="9"/>)}</g>
      <path d="M290 364V184q0-48 44-48h290q46 0 46 48v166" fill="none" stroke="#bba880" strokeWidth="12"/><path d="M291 189q176 44 379-2l-9 30q-182 41-366 0Z" fill="#f4eccf"/>
      <g stroke="#cfbf95" strokeWidth="7">{[330,395,460,525,590,650].map(x=><path key={x} d={`M${x} 149v47`}/>)}</g>
      <path d="M312 340q173-66 318 2v47q-149 63-318 0Z" fill="#88a48a"/><ellipse cx="471" cy="338" rx="159" ry="45" fill="#f8efd8"/>
      <path d="M323 436v66m214-66v66" stroke="#b59168" strokeWidth="13"/><ellipse cx="433" cy="427" rx="140" ry="51" fill="#cda579"/><ellipse cx="433" cy="422" rx="141" ry="47" fill="#ecd1a5"/><path d="M402 378q25 50 3 93l52 4q25-47-2-97Z" fill="#faf2d7"/>
      <ellipse cx="672" cy="464" rx="45" ry="17" fill="#a8b69b"/><path d="M649 470v35m45-35v35" stroke="#ad916a" strokeWidth="8"/><path d="M227 382v56m0-34-24-15m24 2 25-20" stroke="#87976b" strokeWidth="6"/><ellipse cx="228" cy="448" rx="28" ry="16" fill="#bc8c70"/>
    </>}
    {setting==='riverside'&&<>
      <path d="M91 372c72-63 98 7 146 45s91 65 132 58c57-11 102-59 174-45 90 20 145 33 216-18l42 38c-110 79-167 43-268 36-58-9-91 49-162 55-75 6-114-35-168-65-43-25-76-36-108 1Z" fill={`url(#${id}-water)`}/>
      <path d="M119 416q45-28 96 18m284 34q84-17 132 13m39-21 72-26" fill="none" stroke="#e7f0e7" strokeWidth="3" opacity=".6"/>
      <Tree x={221} y={330} scale={1.1} color="#71a18c"/><Tree x={732} y={340} scale={.88} color="#8eaf8b"/>
      <path d="m289 344 274-44 112 114-278 48Z" fill="#f2d1ad"/><path d="m307 351 248-39 97 97-249 43Z" fill="#dca396"/><path d="m350 335 101 111m-54-119 103 112m-50-120 102 112m-53-119 102 111M312 379l275-45m-244 75 276-45" stroke="#f8e4c3" strokeWidth="5" opacity=".6"/>
      <path d="M582 356v-38q0-29 28-29t28 29v38" stroke="#b78a62" strokeWidth="8" fill="none"/><path d="M570 347h83l-8 48h-67Z" fill="#c8a475"/><path d="M582 359h59m-56 13h54m-50 12h47" stroke="#a97e58" strokeWidth="3"/>
    </>}
    {setting==='rooftop'&&<>
      <path d="M204 379V242m491 136V242M205 284h490" stroke="#bba5a8" strokeWidth="7" fill="none"/><path d="M221 293v67m48-67v67m48-67v67m48-67v67m48-67v67m48-67v67m48-67v67m48-67v67m48-67v67m48-67v67" stroke="#c8b1b2" strokeWidth="3"/>
      <path d="M341 394v91m229-91v91" stroke="#8a6d79" strokeWidth="12"/><ellipse cx="456" cy="385" rx="160" ry="65" fill="#c59b8f"/><ellipse cx="456" cy="379" rx="161" ry="61" fill="#ead1be"/>
      <path d="M267 387q-37-26-37 14v59h69v-59q0-33-32-14m367 0q-37-26-37 14v59h69v-59q0-33-32-14" fill="#8e778c"/><path d="M236 462v38m56-38v38m311-38v38m56-38v38" stroke="#887084" strokeWidth="7"/>
      <path d="M198 199q267 103 504 0" stroke="#8c6d80" strokeWidth="3" fill="none"/>{[260,340,420,500,580,660].map((x,i)=><g key={x}><circle cx={x} cy={217+Math.sin(i/5*Math.PI)*34} r="33" fill={`url(#${id}-glow)`}/><circle cx={x} cy={217+Math.sin(i/5*Math.PI)*34} r="5" fill="#ffdda0"/></g>)}
      <Tree x={738} y={411} scale={.65} color="#8f7290"/>
    </>}
    {kind==='dressing'&&<>
      <Tree x={211} y={384} scale={.83} color="#755d83"/><Tree x={744} y={400} scale={.69} color="#a86f91"/>
      <path d="M247 398V187q1-42 41-42h108q42 0 42 42v216" fill="none" stroke="#e6bc9e" strokeWidth="9"/><path d="M240 176q32 39 22 112t-19 108l50-4q-8-75-4-149 3-42-10-70Z" fill="#c58ea4"/><path d="M406 173q-10 68 4 126l24 95 29-1q-13-73-14-149-2-46-11-70Z" fill="#d9a8b7"/><path d="M276 207h137" stroke="#efd1ab" strokeWidth="7"/>
      <path d="M538 339V231c0-105 135-105 135 0v108Z" fill="#e9bc9a"/><path d="M550 333V232c0-84 110-84 110 0v101Z" fill="#9a91aa"/><path d="m574 228 46-40m-55 76 58-49" stroke="#e8cfce" strokeWidth="6" opacity=".5"/>
      <ellipse cx="602" cy="377" rx="127" ry="35" fill="#efd1bb"/><path d="M501 377v88m206-88v88" stroke="#bd957d" strokeWidth="9"/><path d="M502 391q100 28 205 0" stroke="#d5a18f" strokeWidth="13" fill="none"/>
      <ellipse cx="415" cy="463" rx="98" ry="33" fill="#b97592"/><path d="M349 476v32m130-33v30" stroke="#b58b82" strokeWidth="10"/>
      <path d="M199 182q265 135 550 46" stroke="#74536e" strokeWidth="3" fill="none"/>{[[255,208],[342,239],[436,259],[536,269],[634,260],[715,238]].map(([x,y],i)=><g key={i}><circle cx={x} cy={y+10} r="28" fill={`url(#${id}-glow)`}/><path d={`M${x} ${y}v10`} stroke="#74536e" strokeWidth="2"/><circle cx={x} cy={y+12} r="5" fill="#ffdfa9"/></g>)}
    </>}
    {kind==='reading'&&<>
      {setting!=='cafe'&&<><path d="M540 450c34-54 140-70 188-22 67 47-36 96-99 84-63 6-113-19-89-62Z" fill={`url(#${id}-water)`}/><path d="M568 469q45-20 104-6m-73 23q51-6 82-26" fill="none" stroke="#c4d6d9" strokeOpacity=".45" strokeWidth="3"/></>}
      {setting==='cafe'?<g><path d="M204 381V190q0-68 67-68h295q65 0 65 68v190" fill="#526d80" stroke="#ccaa87" strokeWidth="11"/><path d="M343 133v215m145-215v215M218 257h400" stroke="#c3a88b" strokeWidth="7"/><path d="M229 204q74-91 151-5t225-5" fill="none" stroke="#93aebe" strokeWidth="3" opacity=".4"/><Tree x={730} y={385} scale={.67} color="#638b82"/></g>:<><Tree x={191} y={389} scale={1.4} color="#3c6174"/><Tree x={718} y={347} scale={1.15} color="#466778"/><Tree x={633} y={310} scale={.8} color="#6b8590"/></>}
      <path d="M277 405q-31-231 123-231 153-2 157 227" fill="none" stroke="#c9ad82" strokeWidth="13"/><path d="M279 299q18-119 123-119 99 3 140 119-134-65-263 0Z" fill="#637d8b"/>
      <path d="M316 418V301q0-40 40-40h76q40 0 40 40v117Z" fill="#b88876"/><rect x="330" y="336" width="131" height="91" rx="34" fill="#d6b39a"/><path d="M312 351q-24-15-25 17v62q89 40 197 0v-62q-4-29-26-13" fill="none" stroke="#c09b82" strokeWidth="25"/><path d="M326 435v32m124-32v32" stroke="#866c5e" strokeWidth="9"/>
      <ellipse cx="392" cy="496" rx="80" ry="23" fill="#ad8b79"/><ellipse cx="585" cy="383" rx="70" ry="26" fill="#d7b98b"/><path d="M586 389v66" stroke="#bf9b71" strokeWidth="9"/>
      <path d="M266 407V277" stroke="#bc9a6d" strokeWidth="7"/><path d="m238 278 12-42h33l18 42Z" fill="#e1c79c"/><circle cx="266" cy="288" r="69" fill={`url(#${id}-glow)`}/>
      <g className="fallback-rain" stroke="#c6d9e6" strokeWidth="1.5" opacity=".34">{Array.from({length:22},(_,i)=><path key={i} d={`m${115+i*31} ${75+(i*47)%290}-10 29`}/>)}</g>
    </>}
    {kind==='desk'&&<>
      <Tree x={738} y={379} scale={.94} color="#448a82"/><Tree x={176} y={401} scale={.7} color="#69a18e"/>
      <path d="M257 402V196q0-85 87-85h93q88 0 88 85v206h-36V204q0-59-59-59h-79q-58 0-58 59v198Z" fill="#d8796d"/><path d="M276 399V203q0-77 75-77h77q76 0 77 77v196" fill="none" stroke="#efb295" strokeWidth="3"/>
      <path d="M315 338q128-53 284 0v35q-143 56-284 0Z" fill="#c2876b"/><ellipse cx="459" cy="336" rx="145" ry="38" fill="#f4dfbf"/><path d="M345 367v102m225-102v102" stroke="#50867f" strokeWidth="12"/><path d="M408 448v-35q0-22 23-22h55q23 0 23 22v35" fill="#3b7f79" stroke="#3b7f79" strokeWidth="12"/><ellipse cx="458" cy="453" rx="63" ry="24" fill="#5d9c91"/><path d="M416 467v38m79-38v38" stroke="#447d76" strokeWidth="9"/>
      <g transform="translate(631 256) rotate(10)"><path d="M-34 112 0-33 33 111" stroke="#ae8065" strokeWidth="8" fill="none"/><path d="M-48-20H49V76H-48Z" fill="#fae7c7"/><path d="M-39 59q23-71 78-21v29h-78Z" fill="#6a9d8a"/><circle cx="19" cy="3" r="16" fill="#db8c73"/><path d="M-55 80H55" stroke="#b78c6c" strokeWidth="8"/></g>
      <path d="m225 435 48-12 18 27-49 13Z" fill="#faeacb"/><path d="m620 482 39 11 19-23-42-13Z" fill="#f7dbac"/><path d="M317 157q20-14 39-1m206 42q18-15 38-2" fill="none" stroke="#bd7063" strokeWidth="3" opacity=".45"/>
    </>}
    <g fill={night?'#b7be9d':'#9cae80'} opacity=".8">{[[190,442],[729,463],[686,520],[244,485]].map(([x,y],i)=><g key={i} transform={`translate(${x} ${y})`}><ellipse cx="0" cy="0" rx="22" ry="10"/><ellipse cx="12" cy="-12" rx="12" ry="23" transform="rotate(32 12 -12)"/><ellipse cx="-9" cy="-9" rx="10" ry="20" transform="rotate(-28 -9 -9)"/></g>)}</g>
  </svg>;
}

const placements:Record<SceneKind,{x:number;y:number;w?:number;h?:number}[]>={
  kitchen:[{x:44,y:46},{x:36,y:62},{x:25,y:34,w:16,h:30},{x:53,y:65},{x:65,y:48},{x:65,y:69}],
  dressing:[{x:29,y:33,w:17,h:34},{x:38,y:34,w:17,h:32},{x:59,y:50,w:12,h:19},{x:72,y:50,w:12,h:19},{x:43,y:69,w:15,h:21},{x:65,y:66,w:12,h:19},{x:29,y:70,w:12,h:19},{x:79,y:67,w:12,h:19}],
  reading:[{x:63,y:51},{x:40,y:55},{x:50,y:68},{x:28,y:52},{x:66,y:69},{x:34,y:73}],
  desk:[{x:39,y:45},{x:53,y:47},{x:66,y:65},{x:27,y:63},{x:50,y:70},{x:65,y:38}],
};

/** A complete scenic world, including every product action, survives without WebGL. */
export default function SceneFallback({scene,onSelect}:{scene:SceneResult;onSelect:(id:string)=>void}) {
  const kind=resolveSceneKind(scene),context=resolveSceneContext(scene),id=useId().replaceAll(':','');
  let clothingIndex=0,otherIndex=0;
  return <div className={`scene-room fallback-room scenic-fallback room-${kind} setting-${context.setting}`} data-kind={kind} data-setting={context.setting} role="group" aria-label={`${scene.name}, illustrated world`}>
    <Landscape kind={kind} id={id} setting={context.setting}/>
    {scene.items.slice(0,6).map((item,index)=>{const sku=getSku(item.skuId);if(!sku)return null;
      const clothing=['dress','blouse','apron'].includes(sku.type);
      const slot=context.setting==='riverside'?[{x:43,y:57},{x:57,y:58},{x:47,y:66},{x:64,y:68},{x:36,y:65},{x:68,y:53}][index]:context.setting==='rooftop'?[{x:43,y:51},{x:57,y:53},{x:47,y:66},{x:61,y:65},{x:36,y:62},{x:65,y:52}][index]:kind==='dressing'?placements.dressing[clothing?clothingIndex++%2:2+otherIndex++%6]:placements[kind][index];
      return <button className={`fallback-object fallback-${sku.type}`} key={sku.id} onClick={()=>onSelect(sku.id)} aria-label={`Explore ${sku.name}`} style={{'--object-x':`${slot.x}%`,'--object-y':`${slot.y}%`,'--object-w':`${('w' in slot?slot.w:undefined)||16}%`,'--object-h':`${('h' in slot?slot.h:undefined)||24}%`} as CSSProperties}><span className="fallback-product-art" dangerouslySetInnerHTML={{__html:productArt(sku.type,sku.color)}}/><span className="fallback-product-dot"><Glyph name="plus"/></span><span className="fallback-product-name">{sku.name}</span></button>;
    })}
    <span className="fallback-atmosphere-label">{context.setting==='rooftop'?'a little evening above the city':context.setting==='riverside'?'the river takes the long way. so can you.':context.setting==='cafe'?'a window seat, somewhere in your world':kind==='dressing'?'a little before the evening':kind==='reading'?'rain outside. a little quiet here.':kind==='desk'?'room for an idea':'the morning can wait'}</span>
  </div>;
}
