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
    description:'An outfit on the rail. A little color at the mirror. A place at home to keep the before, the butterflies, and the story afterwards.',
    prompt:'An event world: getting ready at home before a date, with a closet and makeup vanity, outfit, accessories and cosmetics. Keep the total under ₩150,000 and adapt it to what I have shared.',
    journalPrompt:'What do you want to remember about tonight?',
    scene:scene('Before the date','dressing',{type:'event',setting:'home',label:'a little before the evening'},['dateDress','eveningBlouse','littleHandbag','roseLipstick','softCompact','smallHoops'],'A curated getting-ready occasion at home. Your version will use your own story and budget.'),
  },
  {
    id:'dinner-under-lights',name:'Dinner under the lights',subtitle:'a rooftop evening, made for lingering',chapter:'02 / AN EVENING TO KEEP',
    description:'The city below, a little table above it. Imagine the meal, the conversation, and the moment you wish would last a little longer.',
    prompt:'An event world: an imagined rooftop dinner date under warm lights, with tableware and small atmosphere objects under ₩100,000 total. Keep the setting outdoors on a rooftop, not an indoor kitchen. Use my preferences; do not invent a venue, reservation or location.',
    journalPrompt:'What would you keep from this evening?',
    scene:scene('Dinner under the lights','kitchen',{type:'event',setting:'rooftop',label:'dinner above the city'},['glass','tray','smallCandle','miniSpeaker'],'An imagined rooftop dinner occasion, with curated table objects. No venue, reservation or real weather is implied.'),
  },
  {
    id:'slow-sunday',name:'A slower Sunday',subtitle:'breakfast without a deadline',chapter:'03 / A PLACE AT HOME',
    description:'A warm cup, a small breakfast, nowhere to rush. Make a place at home for the mornings you want more of, and keep a few words from the ones you loved.',
    prompt:'An indoor home space for slow Sunday breakfasts and a warm drink, under ₩100,000 total. Adapt the objects to my actual morning routine and preferences.',
    journalPrompt:'What made this morning feel like yours?',
    scene:scene('A slower Sunday','kitchen',{type:'space',setting:'home',label:'a slow morning at home'},['kettleAlt','mugs','cottonApron','bambooTray','matcha'],'A curated breakfast space at home. A starting point for your own everyday rituals.'),
  },
  {
    id:'creative-corner',name:'Room for an idea',subtitle:'a studio for your next chapter',chapter:'04 / A LITTLE SPACE',
    description:'The thing you keep meaning to start deserves a little room. Bring a project, leave a note, and watch this studio become a record of small beginnings.',
    prompt:'An indoor creative studio space with a calm desk for a project I want to start, under ₩100,000 total. Use my stated work or hobby interests without assuming a profession.',
    journalPrompt:'What did you make a little progress on today?',
    scene:scene('Room for an idea','desk',{type:'space',setting:'studio',label:'your little creative studio'},['smallLamp','organizer','miniSpeaker','smallVase'],'A curated studio space for focus and making things. Tell Coopy what you want to make it yours.'),
  },
  {
    id:'rainy-day-cafe',name:'Rainy-day cafe',subtitle:'a window seat, somewhere in your world',chapter:'05 / A PLACE TO PAUSE',
    description:'An imagined cafe, rain at the window, a warm cup in reach. Keep a line that stayed with you, or just how the afternoon felt.',
    prompt:'A place world: an imagined rainy-day cafe reading corner by a window, with a warm cup, natural textures and soft lighting, under ₩100,000 total. Keep it a cafe setting, not a forest or bedroom. Adapt it to my preferences without naming a real venue or claiming actual weather.',
    journalPrompt:'A line, a thought, a feeling you want to keep…',
    scene:scene('Rainy-day cafe','reading',{type:'place',setting:'cafe',label:'a cafe for a little pause'},['rattan','cushion','mugs','smallCandle'],'An imagined cafe for a quiet rainy afternoon. Personalize the mood and objects in your own words.'),
  },
  {
    id:'by-the-river',name:'By the river',subtitle:'a picnic with nowhere to hurry',chapter:'06 / A LITTLE OUTSIDE',
    description:'The river takes the long way. So can you. A small picnic, a patch of green, and space to remember how it felt to slow down.',
    prompt:'An outdoor riverside picnic world, beside an imagined river with a blanket and simple table objects for a slow afternoon. Use relevant catalog objects under ₩100,000 total. Keep this outdoors by the water, not a kitchen; do not invent a geographic location or real weather.',
    journalPrompt:'What did you notice when you slowed down?',
    scene:scene('By the river','kitchen',{type:'outdoor',setting:'riverside',label:'a little time by the river'},['bambooTray','mugs','cushionCover','miniSpeaker'],'A curated outdoor picnic beside an imagined river. The place is a simulation, ready for your own story.'),
  },
];
