import type {SceneResult} from '../lib/types';
import type {SceneContext} from '../lib/world-context';
import {getSku} from '../lib/catalog';

export interface WorldTemplate {
  id:string; name:string; subtitle:string; chapter:string; description:string;
  prompt:string; journalPrompt:string; scene:SceneResult;
}
function scene(name:string,kind:SceneResult['kind'],context:SceneContext,ids:string[],explanation:string):SceneResult {
  return {name,kind,context,explanation,items:ids.map(skuId=>({skuId,oneLiner:getSku(skuId)?.description||''}))};
}

/** Editorial starting points, never a claim about other people's activity or the user's tastes. */
export const worldTemplates:WorldTemplate[]=[
  {
    id:'before-the-date',name:'Before the date',subtitle:'the butterflies, before the evening',chapter:'01 / AN OCCASION',
    description:'A favorite-looking layer, a little color at the mirror. A casual evening starts here, with room for the butterflies and the story afterwards.',
    prompt:'An event world: getting ready at home for a casual date, with a clothes rail and a small mirror. Choose a simple top, a layer, glasses or a lip color only if relevant to my preferences, using supplied photo-backed reference products. Keep the total under ₩150,000. Do not invent sizing, fit, reviews or delivery.',
    journalPrompt:'What do you want to remember about tonight?',
    scene:scene('Before the date','dressing',{type:'event',setting:'home',label:'a little before the evening'},['8310483629-brown','6994027284','1814412512','7612276799'],'A casual getting-ready scene with four real listing references. Your version can change the clothes, color and pace.'),
  },
  {
    id:'dinner-under-lights',name:'Dinner under the lights',subtitle:'a rooftop evening, made for lingering',chapter:'02 / AN EVENING TO KEEP',
    description:'The city below, a little table above it. Dinner becomes another cup and a longer conversation. Bring a layer for the imagined evening.',
    prompt:'An event world: an imagined rooftop evening after dinner, under decorative scenery lights, with mugs, a seat cushion and a clothing layer if relevant. Use supplied photo-backed reference products under ₩100,000 total. Keep the rooftop setting; do not invent a venue, reservation, outdoor-use rating or actual weather. The lights and meal are scenery, not products for sale.',
    journalPrompt:'What would you keep from this evening?',
    scene:scene('Dinner under the lights','kitchen',{type:'event',setting:'rooftop',label:'dinner above the city'},['7434051500','8059518763','6994027284'],'Three real listing references for staying a little longer. The rooftop, meal and lights belong to the imagined scene.'),
  },
  {
    id:'slow-sunday',name:'A slower Sunday',subtitle:'breakfast without a deadline',chapter:'03 / A PLACE AT HOME',
    description:'A warm cup, a comfortable pause, nowhere to rush. Make a place at home for the mornings you want more of, and keep a few words from the ones you loved.',
    prompt:'An indoor home space for a slow Sunday warm-drink ritual, using the supplied photo-backed kettle, mug or seating references when they fit my routine. Keep the total under ₩100,000. Do not invent food, materials, performance, reviews or delivery facts.',
    journalPrompt:'What made this morning feel like yours?',
    scene:scene('A slower Sunday','kitchen',{type:'space',setting:'home',label:'a slow morning at home'},['1539744911','7434051500','8059518763'],'A kettle, a mug set and a seat cushion: three real references for a slower morning at home.'),
  },
  {
    id:'creative-corner',name:'Room for an idea',subtitle:'a studio for your next chapter',chapter:'04 / A LITTLE SPACE',
    description:'The thing you keep meaning to start deserves a little room. Bring a project, leave a note, and watch this studio become a record of small beginnings.',
    prompt:'An indoor creative studio with a calm desk for a project I want to start. Choose supplied photo-backed chair, lamp, mug or cushion references under ₩200,000 total. Use my stated interests without assuming a profession, physical fit or ergonomic benefits. The desk and project materials are imagined scenery, not invented listings.',
    journalPrompt:'What did you make a little progress on today?',
    scene:scene('Room for an idea','desk',{type:'space',setting:'studio',label:'your little creative studio'},['7395651009','7915055185','7434051500','8059518763'],'Four real listing references around an imagined worktable. Bring the idea; make the corner yours.'),
  },
  {
    id:'rainy-day-cafe',name:'Rainy-day cafe',subtitle:'a window seat, somewhere in your world',chapter:'05 / A PLACE TO PAUSE',
    description:'An imagined cafe, rain at the window, a warm cup in reach. Keep a line that stayed with you, or just how the afternoon felt.',
    prompt:'A place world: an imagined rainy-day cafe reading corner by a window. Use supplied photo-backed mug, lamp, cushion or clothing references under ₩100,000 total. Keep it a cafe setting and adapt it to my preferences without naming a real venue, claiming actual weather or inventing books for sale.',
    journalPrompt:'A line, a thought, a feeling you want to keep…',
    scene:scene('Rainy-day cafe','reading',{type:'place',setting:'cafe',label:'a cafe for a little pause'},['7434051500','55518713','8059518763','345674940'],'Four real listing references for an imagined window-seat afternoon. The cafe and rain are yours to imagine.'),
  },
  {
    id:'by-the-river',name:'By the river',subtitle:'a picnic with nowhere to hurry',chapter:'06 / A LITTLE OUTSIDE',
    description:'The river takes the long way. So can you. A small picnic, a patch of green, and space to remember how it felt to slow down.',
    prompt:'An outdoor riverside picnic world with a path for a walk and a place to pause. Use relevant supplied photo-backed T-shirt, sunglasses, mug or seat-cushion references under ₩100,000 total. Keep it beside an imagined river; do not invent a geographic location, actual weather, sun-protection rating or outdoor-use rating. The picnic blanket is scenery, not a product listing.',
    journalPrompt:'What did you notice when you slowed down?',
    scene:scene('By the river','kitchen',{type:'outdoor',setting:'riverside',label:'a little time by the river'},['8561267958','8310483629-olive','7434051500','8059518763'],'Four real listing references for a walk and a pause by an imagined river. Add a note when a little moment stays with you.'),
  },
];
