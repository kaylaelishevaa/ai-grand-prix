import type {SceneResult} from '../lib/types';
import {getSku} from '../lib/catalog';

export interface WorldTemplate {
  id:string; name:string; subtitle:string; chapter:string; description:string;
  prompt:string; journalPrompt:string; scene:SceneResult;
}
function scene(name:string,kind:SceneResult['kind'],ids:string[],explanation:string):SceneResult {
  return {name,kind,explanation,items:ids.map(skuId=>({skuId,oneLiner:getSku(skuId)?.description||''}))};
}

/** Editorial starting points, never a claim about other people's activity or the user's tastes. */
export const worldTemplates:WorldTemplate[]=[
  {
    id:'before-the-date',name:'Before the date',subtitle:'a little getting-ready ritual',chapter:'01 / ANTICIPATION',
    description:'An outfit on the rail. A little color at the mirror. A place to keep the before, the butterflies, and the story afterwards.',
    prompt:'Getting ready for a date: a closet and makeup vanity, with outfit, accessories and cosmetics. Keep the total under ₩150,000 and adapt it to what I have shared.',
    journalPrompt:'What do you want to remember about tonight?',
    scene:scene('Before the date','dressing',['dateDress','eveningBlouse','littleHandbag','roseLipstick','softCompact','smallHoops'],'A curated closet and vanity to imagine a getting-ready ritual. Your version will use your own story and budget.'),
  },
  {
    id:'slow-sunday',name:'A slower Sunday',subtitle:'breakfast without a deadline',chapter:'02 / EVERYDAY RITUALS',
    description:'A warm cup, a small breakfast, nowhere to rush. Make a place for the mornings you want more of, and keep a few words from the ones you loved.',
    prompt:'A kitchen for slow Sunday breakfasts and a warm drink, under ₩100,000 total. Adapt the objects to my actual morning routine and preferences.',
    journalPrompt:'What made this morning feel like yours?',
    scene:scene('A slower Sunday','kitchen',['kettleAlt','mugs','cottonApron','bambooTray','matcha'],'A curated slow-morning kitchen. A starting point for your own everyday rituals.'),
  },
  {
    id:'creative-corner',name:'Room for an idea',subtitle:'a desk for your next chapter',chapter:'03 / SMALL BEGINNINGS',
    description:'The thing you keep meaning to start deserves a little room. Bring a project, leave a note, and watch this corner become a record of small beginnings.',
    prompt:'A calm desk and creative workspace for a project I want to start, under ₩100,000 total. Use my stated work or hobby interests without assuming a profession.',
    journalPrompt:'What did you make a little progress on today?',
    scene:scene('Room for an idea','desk',['smallLamp','organizer','miniSpeaker','smallVase'],'A curated workspace for focus and making things. Tell Coopy what you want to make it yours.'),
  },
  {
    id:'rainy-pages',name:'Rainy-day pages',subtitle:'a quiet place to come back to',chapter:'04 / A LITTLE PAUSE',
    description:'A reading chair, a warm light, a pause between everything else. Keep a line that stayed with you, or just how the afternoon felt.',
    prompt:'A quiet reading nook for rainy afternoons, with natural textures and warm lighting, under ₩100,000 total. Adapt it to my preferences.',
    journalPrompt:'A line, a thought, a feeling you want to keep…',
    scene:scene('Rainy-day pages','reading',['rattan','cushion','mugs','smallCandle'],'A curated reading nook for a quiet afternoon. Personalize the mood and objects in your own words.'),
  },
];
