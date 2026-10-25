/** Real app locations; detail views stay within the Explore route. */
export type MainView='hatch'|'home'|'call'|'search'|'world'|'district'|'preview'|'archive';
export type InitialMainView='auto'|'hatch'|'home'|'call'|'search'|'world';
export interface MainLocation {view:MainView|'auto';districtId?:string;templateId?:string;archiveId?:string;momentId?:string;}
const id=(value:string|null)=>value&&/^[A-Za-z0-9][A-Za-z0-9:_-]{0,119}$/.test(value)?value:undefined;
export function mainLocation(pathname:string,search='',initial:InitialMainView='auto'):MainLocation {
  const query=new URLSearchParams(search),utility=query.get('utility');
  if(pathname==='/home'||utility==='home')return{view:'home'};
  if(pathname==='/hatch'||utility==='hatch')return{view:'hatch'};
  if(pathname==='/call'||utility==='call')return{view:'call'};
  if(pathname==='/search'||utility==='search')return{view:'search'};
  if(pathname==='/explore'||utility==='world'){
    const districtId=id(query.get('district')),templateId=id(query.get('world')),archiveId=id(query.get('archive')),momentId=id(query.get('moment'));
    if(districtId)return{view:'district',districtId,momentId};
    if(templateId)return{view:'preview',templateId};
    if(archiveId)return{view:'archive',archiveId,momentId};
    return{view:'world'};
  }
  return{view:initial};
}
export function mainHref(view:MainView,detail:Omit<MainLocation,'view'>={}) {
  if(view==='home')return'/home';if(view==='hatch')return'/hatch';if(view==='call')return'/call';if(view==='search')return'/search';
  const query=new URLSearchParams();
  if(view==='district'&&detail.districtId){query.set('district',detail.districtId);if(detail.momentId)query.set('moment',detail.momentId);}
  if(view==='preview'&&detail.templateId)query.set('world',detail.templateId);
  if(view==='archive'&&detail.archiveId){query.set('archive',detail.archiveId);if(detail.momentId)query.set('moment',detail.momentId);}
  return'/explore'+(query.size?'?'+query.toString():'');
}
export function initialMainView(route:MainLocation,journey?:{hatched?:boolean;interviewComplete?:boolean;interviewPaused?:boolean},presenter=false):MainView {
  if(route.view!=='auto')return route.view;
  return presenter||journey?.interviewComplete||journey?.interviewPaused?'home':journey?.hatched?'call':'hatch';
}
