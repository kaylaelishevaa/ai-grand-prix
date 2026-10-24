export interface ElementSize {width:number;height:number;}

/** A queued observer callback may outlive the element or React effect that created it. */
export function observeElementSize(
  element:HTMLElement|null,
  onSize:(size:ElementSize)=>void,
  Observer:typeof ResizeObserver|undefined=typeof ResizeObserver==='undefined'?undefined:ResizeObserver,
):()=>void {
  if(!element)return()=>{};
  let disposed=false;
  const measure=()=>{
    if(disposed||!element.isConnected)return;
    const box=element.getBoundingClientRect();
    if(box.width>0&&box.height>0)onSize({width:box.width,height:box.height});
  };
  measure();
  const observer=Observer?new Observer(measure):undefined;
  observer?.observe(element);
  return()=>{disposed=true;observer?.disconnect();};
}
