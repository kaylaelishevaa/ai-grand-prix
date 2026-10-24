import type {SVGProps} from 'react';

export type GlyphName = 'home'|'heart'|'scene'|'search'|'scan'|'check'|'head'|'arrow-right'|'arrow-left'|'arrow-up'|'clock'|'refresh'|'spark'|'flower'|'close'|'minus'|'plus'|'mic'|'stop'|'camera'|'sun'|'moon'|'lock'|'download'|'swap'|'star'|'image'|'help'|'rocket';
const paths:Record<GlyphName,React.ReactNode>={
 home:<><path d="m3 10 9-7 9 7"/><path d="M5 9v11h5v-6h4v6h5V9"/></>,
 heart:<path d="M20.2 5.8a5 5 0 0 0-7.1 0L12 7l-1.1-1.2a5 5 0 0 0-7.1 7.1L12 21l8.2-8.1a5 5 0 0 0 0-7.1Z"/>,
 scene:<><path d="M12 2 9.6 9.6 2 12l7.6 2.4L12 22l2.4-7.6L22 12l-7.6-2.4Z"/></>,
 search:<><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></>,
 scan:<><path d="M3 8V4a1 1 0 0 1 1-1h4m8 0h4a1 1 0 0 1 1 1v4M3 16v4a1 1 0 0 0 1 1h4m8 0h4a1 1 0 0 0 1-1v-4M3 12h18"/></>,
 check:<path d="m5 12 4 4L19 6"/>,
 head:<><path d="M9 21v-4H6a2 2 0 0 1-2-2v-3H2l3-5a7 7 0 0 1 13 5l-1 2v7"/><circle cx="11" cy="8" r="2"/></>,
 'arrow-right':<path d="M4 12h16m-6-6 6 6-6 6"/>,
 'arrow-left':<path d="M20 12H4m6-6-6 6 6 6"/>,
 'arrow-up':<path d="M5 19 19 5M6 5h13v13"/>,
 clock:<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/></>,
 refresh:<><path d="M20 8a9 9 0 1 0 .2 7M20 3v5h-5"/></>,
 spark:<><path d="M12 3v5m0 8v5M3 12h5m8 0h5M5.5 5.5l3 3m7 7 3 3m0-13-3 3m-7 7-3 3"/></>,
 flower:<><path d="M12 12C5-2 20-2 12 12c14-7 14 8 0 0 7 14-8 14 0 0-14 7-14-8 0 0Z"/></>,
 close:<path d="m6 6 12 12M18 6 6 18"/>,
 minus:<path d="M5 12h14"/>,
 plus:<path d="M5 12h14M12 5v14"/>,
 mic:<><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M6 11v1a6 6 0 0 0 12 0v-1m-6 7v3m-4 0h8"/></>,
 stop:<rect x="6" y="6" width="12" height="12" rx="2"/>,
 camera:<><path d="m8 5 1-2h6l1 2h4a1 1 0 0 1 1 1v14H3V6a1 1 0 0 1 1-1Z"/><circle cx="12" cy="12" r="4"/></>,
 sun:<><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19m0-14-1.5 1.5m-11 11L5 19"/></>,
 moon:<path d="M20 15.5A9 9 0 0 1 8.5 4 9 9 0 1 0 20 15.5Z"/>,
 lock:<><rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/></>,
 download:<><path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/></>,
 swap:<><path d="M4 7h16l-4-4m4 14H4l4 4M20 7l-4 4M4 17l4-4"/></>,
 star:<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z"/>,
 image:<><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 4-6 5 7"/></>,
 help:<><circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 1 1 4 2.8c-.8.3-1 1-1 1.7M12 17h.01"/></>,
 rocket:<><path d="M9 15c-1-5 3-10 12-12 0 9-5 13-10 12l-2-2M9 9H5l-3 5 6 1m7 0v4l-5 3-1-6M6 18l-3 3"/><circle cx="16" cy="8" r="1.5"/></>
};
export function Glyph({name,className='',...props}:SVGProps<SVGSVGElement>&{name:GlyphName}){return <svg {...props} className={`glyph ${className}`} viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[name]}</svg>;}
