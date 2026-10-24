import type {WorldBlueprint} from '../../lib/scene-blueprint';

/** Synthetic test geometry only. Production generation never substitutes this fixture for model output. */
export function fixtureBlueprint(skuIds:string[],variant=0):WorldBlueprint {
  const locations=[{x:-1.5,z:-1},{x:0,z:-1},{x:1.5,z:-1},{x:-1.5,z:1},{x:0,z:1},{x:1.5,z:1}];
  return {version:1,designNote:variant?'A different test courtyard with taller columns.':'A test courtyard with a broad round table.',
    terrain:{outline:[{x:-3.5,z:-2},{x:-2.7,z:-2.9},{x:0,z:-3.1},{x:2.7,z:-2.9},{x:3.5,z:-2},{x:3.5,z:2},{x:2.7,z:2.9},{x:0,z:3.1},{x:-2.7,z:2.9},{x:-3.5,z:2}],depth:.5},
    palette:{ground:variant?'#C9DDD8':'#EADCC2',structure:'#FFF8F0',wood:'#A97D5D',foliage:'#537B69',accent:variant?'#B56B8A':'#E8681A',water:'#87C1C1'},
    atmosphere:{skyTop:variant?'#514C73':'#F5DDCD',skyBottom:'#FFF8F0',lightColor:'#FFF0D5',intensity:1.1,timeLabel:variant?'blue hour':'soft morning',weatherLabel:'imagined calm'},
    nodes:[{id:'table',label:'shared round surface',shape:'cylinder',material:'wood',position:{x:0,y:.5,z:0},scale:{x:5.8,y:.16,z:4.7},rotation:{x:0,y:0,z:0},motion:'none',support:true},
      ...Array.from({length:7},(_,index)=>({id:'column-'+index,label:'garden column',shape:'cylinder' as const,material:'foliage' as const,position:{x:-2.5+index*.8,y:variant?1.1:.8,z:-2.3},scale:{x:.2,y:variant?1.6:1,z:.2},rotation:{x:0,y:0,z:0},motion:'none' as const,support:false as const}))],
    anchors:skuIds.map((skuId,index)=>({skuId,supportId:'table',...locations[index],yaw:0,scale:.8})),
  };
}

export function withFixtureBlueprint<T extends {items:{skuId:string}[]}>(scene:T,variant=0){return {...scene,blueprint:fixtureBlueprint(scene.items.map(item=>item.skuId),variant)};}
