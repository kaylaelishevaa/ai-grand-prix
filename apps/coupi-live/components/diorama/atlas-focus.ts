import {damp} from './math';

type Place={x:number;y:number;z:number;scale:number};
export type AtlasCameraFocus={x:number;y:number;z:number;zoom:number};
export const ATLAS_OVERVIEW_FOCUS:AtlasCameraFocus={x:0,y:-.15,z:0,zoom:1};

/** Hover is a bounded closer look, never a free camera or a navigation action. */
export function createAtlasCameraFocus(layout:Place[],reducedMotion=false){
  const current={...ATLAS_OVERVIEW_FOCUS},target={...ATLAS_OVERVIEW_FOCUS};
  let selected:number|null=null,view:{span:number;aspect:number}|null=null;
  function focus(index:number|null){
    selected=index;const place=index===null?undefined:layout[index];
    Object.assign(target,place&&!reducedMotion?{x:place.x*.38,y:-.15+place.y*.38,z:place.z*.38,zoom:1.28}:ATLAS_OVERVIEW_FOCUS);
    if(place&&view&&!reducedMotion){
      let extent=0;
      for(const orbit of [-1,0,1]){
        const yaw=Math.PI/4+orbit*.054,pitch=.65+orbit*.025;
        for(const x of [-4.15,4.15])for(const y of [-1,4])for(const z of [-3.6,3.6]){
          const dx=place.x+x*place.scale-target.x,dy=place.y+y*place.scale-target.y,dz=place.z+z*place.scale-target.z;
          const horizontal=Math.cos(yaw)*dx-Math.sin(yaw)*dz,vertical=-Math.sin(yaw)*Math.sin(pitch)*dx+Math.cos(pitch)*dy-Math.cos(yaw)*Math.sin(pitch)*dz;
          extent=Math.max(extent,Math.abs(horizontal)/(view.span*view.aspect/2),Math.abs(vertical)/(view.span/2));
        }
      }
      target.zoom=Math.max(1,Math.min(1.28,.98/Math.max(.01,extent)));
    }
  }
  return{
    focus,
    resize(span:number,aspect:number){view={span,aspect};focus(selected);},
    update(delta:number):AtlasCameraFocus{
      const dt=Math.max(0,Math.min(.05,delta));
      for(const key of ['x','y','z','zoom'] as const)current[key]=reducedMotion?target[key]:damp(current[key],target[key],4.2,dt);
      return current;
    },
  };
}

/** Pointer-up uses the original target even if its canvas keeps animating. */
export function createAtlasPointerActivation(){
  let pressed:{id:string;pointerId:number;x:number;y:number}|null=null,suppressClick=false;
  return{
    start(id:string,pointerId:number,x:number,y:number){pressed={id,pointerId,x,y};suppressClick=false;},
    finish(pointerId:number,x:number,y:number){
      if(!pressed||pressed.pointerId!==pointerId)return null;
      const down=pressed;pressed=null;suppressClick=true;
      return Math.hypot(x-down.x,y-down.y)<=10?down.id:null;
    },
    cancel(){pressed=null;suppressClick=true;},
    consumeClick(detail:number){const consume=detail>0&&suppressClick;suppressClick=false;return consume;},
  };
}
