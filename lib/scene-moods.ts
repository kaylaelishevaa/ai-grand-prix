import type {SceneKind} from './scenes';
import type {RoomMaterial} from '../components/diorama/rooms';
import type {SceneContext} from './world-context';

export interface SceneMood {
  label:string; subtitle:string; time:string; weather:string;
  phase:'dawn'|'noon'|'store'|'night'; background:string; ink:string; muted:string; accent:string;
  sky:string; ground:string; key:string; keyIntensity:number;
  palette:Record<RoomMaterial,string>;
  atmosphere:'pollen'|'fireflies'|'rain'|'paper';
}

/** Art direction describes an imagined place, not a claim about the user's real weather or time. */
export const SCENE_MOODS:Record<SceneKind,SceneMood>={
  kitchen:{
    label:'the sun found your table',subtitle:'a slow morning in the citrus garden',time:'08:12 / MORNING LIGHT',weather:'sun-warmed leaves',
    phase:'dawn',background:'radial-gradient(ellipse at 32% 22%,#fff7cd 0%,#f3edce 43%,#d4e0ba 100%)',ink:'#244B3C',muted:'#6C7E61',accent:'#C47D26',
    sky:'#FFF5CC',ground:'#879C61',key:'#FFE3A0',keyIntensity:2.7,atmosphere:'pollen',
    palette:{paper:'#FFF7DF',floor:'#E8DBAD',wall:'#F5E7C4',teal:'#3E6F5B',sage:'#ABC18C',wood:'#C59A59',clay:'#CB8E54',orange:'#F0AF36',brass:'#D8B66B',leaf:'#6E995C',window:'#FFF1AB',ray:'#FFF3BB',blush:'#EBD1A0',mirror:'#BED7BF',ink:'#426344'},
  },
  dressing:{
    label:'a little before the butterflies',subtitle:'a velvet evening above the city',time:'18:46 / GOLDEN HOUR',weather:'lanterns, just coming on',
    phase:'dawn',background:'radial-gradient(ellipse at 25% 12%,#F7D5B5 0%,#E4B8BA 40%,#A88BAA 100%)',ink:'#573650',muted:'#876B7F',accent:'#A25270',
    sky:'#EDC8DD',ground:'#71566F',key:'#FFD5AA',keyIntensity:2.25,atmosphere:'fireflies',
    palette:{paper:'#FBE8D5',floor:'#D8AFA6',wall:'#D8A4A8',teal:'#61415F',sage:'#A37B98',wood:'#B67E79',clay:'#CF8F91',orange:'#F1B36F',brass:'#DDBB86',leaf:'#946F87',window:'#FFDBA3',ray:'#FFDDA8',blush:'#E8B6BA',mirror:'#C8B8CC',ink:'#684563'},
  },
  reading:{
    label:'the rain can wait outside',subtitle:'a small shelter between the trees',time:'16:08 / A RAINY AFTERNOON',weather:'soft rain, warm pages',
    phase:'store',background:'radial-gradient(ellipse at 62% 24%,#8AA9AF 0%,#547889 45%,#244B62 100%)',ink:'#F3EEE1',muted:'#C2D6D7',accent:'#E7BB7A',
    sky:'#BCD6DF',ground:'#294E61',key:'#B9D3E0',keyIntensity:1.65,atmosphere:'rain',
    palette:{paper:'#E0E3D6',floor:'#547F78',wall:'#4C7183',teal:'#31566A',sage:'#77978D',wood:'#A58970',clay:'#C5A273',orange:'#E2B471',brass:'#D5B47D',leaf:'#527E74',window:'#FFD795',ray:'#E9BE78',blush:'#B19F9C',mirror:'#739FA9',ink:'#375C71'},
  },
  desk:{
    label:'room for a new idea',subtitle:'an open studio, somewhere by the sea',time:'11:23 / CREATIVE HOURS',weather:'bright air, wandering thoughts',
    phase:'noon',background:'radial-gradient(ellipse at 65% 15%,#D4EBE3 0%,#E8DCC7 45%,#EAB69B 100%)',ink:'#225B62',muted:'#687F79',accent:'#C9694D',
    sky:'#D9F1EC',ground:'#A98571',key:'#FFEDCE',keyIntensity:2.5,atmosphere:'paper',
    palette:{paper:'#FFF3DA',floor:'#E2BA96',wall:'#DB8E75',teal:'#347E87',sage:'#A5CCB7',wood:'#C18C65',clay:'#E38C6B',orange:'#E7B858',brass:'#CDA866',leaf:'#599C8F',window:'#FCE9AE',ray:'#FFE6B2',blush:'#F0C3AC',mirror:'#A4D5CC',ink:'#3B747C'},
  },
};
export function getSceneMood(kind:SceneKind,context?:SceneContext):SceneMood {
  const base=SCENE_MOODS[kind];
  if(context?.setting==='rooftop')return{...SCENE_MOODS.dressing,label:'dinner above the city',subtitle:'a rooftop, a little light, a whole evening',weather:'the city lights are coming on'};
  if(context?.setting==='cafe')return{...SCENE_MOODS.reading,label:'your table by the window',subtitle:'a rainy cafe, a warm little pause',weather:'rain on the cafe windows',palette:{...SCENE_MOODS.reading.palette,wall:'#648B8B',floor:'#A6B5A0',clay:'#BF8A69',teal:'#3D7475'}};
  if(context?.setting==='riverside')return{...SCENE_MOODS.kitchen,label:'a little time by the water',subtitle:'a riverside picnic, nowhere to rush',time:'15:32 / BY THE RIVER',weather:'sun on the water',background:'radial-gradient(ellipse at 65% 18%,#D5ECDF 0%,#C6E1D4 45%,#8ABBB4 100%)',palette:{...SCENE_MOODS.kitchen.palette,floor:'#BCD0A1',sage:'#A6C9A1',mirror:'#6BB4BB',blush:'#E7B59C'}};
  if(context?.setting==='home')return{...base,label:kind==='dressing'?'a little before the butterflies':kind==='reading'?'the rain can wait outside':kind==='desk'?'your own little thinking space':'a morning that belongs to you',subtitle:kind==='dressing'?'your dressing room, in the last light':kind==='reading'?'a quiet reading room, warm and familiar':kind==='desk'?'a private studio for wandering thoughts':'a sunlit kitchen, an unhurried beginning',weather:kind==='reading'?'rain at the window':kind==='dressing'?'last light through the curtains':'soft light through the window'};
  return base;
}
