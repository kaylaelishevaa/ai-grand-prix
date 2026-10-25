import type {SceneResult} from './types';
import {resolveSceneKind} from './scenes';

export type SceneContextType = 'event' | 'space' | 'outdoor' | 'place';
export type SceneSetting = 'home' | 'garden' | 'rooftop' | 'forest' | 'cafe' | 'riverside' | 'studio';
export interface SceneContext {type:SceneContextType;setting:SceneSetting;label:string;}

const settingCues:Record<SceneSetting,RegExp>={
  rooftop:/\b(?:roof[ -]?top|roof terrace|skyline terrace)\b|루프탑/g,
  riverside:/\b(?:river(?:side|bank)?|by the water|waterfront|waterside)\b|강변/g,
  cafe:/\b(?:caf[eé]|coffee shop|coffeehouse)\b|카페/g,
  forest:/\b(?:forest|woodland|woods|among the trees|beneath the trees)\b|숲/g,
  garden:/\b(?:garden|park|picnic|outdoors?|outside)\b|정원|공원/g,
  studio:/\b(?:studio|atelier|creative courtyard|art courtyard)\b|작업실/g,
  home:/\b(?:home|indoors?|inside|bedroom|kitchen|closet|wardrobe|vanity|dressing room|reading room|living room)\b|집|실내/g,
};
const eventCue=/\b(?:date[ -]night|(?:for|before) (?:a|the|my|our) date|dinner date|romantic dinner|birthday|anniversary|celebration|party|wedding|dinner under the lights)\b/g;
const labels:Record<SceneSetting,string>={home:'a little place at home',garden:'outside, among the green',rooftop:'an evening above the city',forest:'a quiet pocket of forest',cafe:'a cafe for a little pause',riverside:'a little time by the river',studio:'room to make something'};
const types:Record<SceneSetting,SceneContextType>={home:'space',garden:'outdoor',rooftop:'outdoor',forest:'outdoor',cafe:'place',riverside:'outdoor',studio:'space'};

function hasPositiveCue(value:string,pattern:RegExp):boolean {
  for(const match of value.toLowerCase().matchAll(pattern)){
    const before=value.toLowerCase().slice(Math.max(0,match.index!-65),match.index);
    if(/\b(?:no|not|without|skip|exclude|excluding|avoid|avoiding|don't want|do not want|instead of|rather than)\s+(?:(?:a|an|the|any|more|new|my)\s+)?$/.test(before))continue;
    return true;
  }
  return false;
}
function explicitSetting(value:string):SceneSetting|undefined {
  for(const setting of ['rooftop','riverside','cafe','forest','studio','garden','home'] as const)if(hasPositiveCue(value,settingCues[setting]))return setting;
}
function validContext(context:SceneContext|undefined):context is SceneContext {
  return !!context&&['event','space','outdoor','place'].includes(context.type)&&Object.hasOwn(labels,context.setting)&&typeof context.label==='string';
}
function context(setting:SceneSetting,event:boolean):SceneContext {
  return {type:event?'event':types[setting],setting,label:event&&setting==='home'?'a little before the occasion':labels[setting]};
}

/** Setting expresses a user's occasion/place; kind remains a small furniture-placement vocabulary.
 * Labels are generic scene descriptions, never claims about a real venue, location or weather. */
export function resolveSceneContext(scene:SceneResult,command=''):SceneContext {
  const commandSetting=explicitSetting(command),commandEvent=hasPositiveCue(command,eventCue);
  const fallback=resolveSceneKind(scene,command)==='desk'?'studio':'home';
  const describedSetting=explicitSetting(scene.name)||explicitSetting(scene.explanation);
  if(commandSetting||commandEvent)return context(commandSetting||(validContext(scene.context)?scene.context.setting:describedSetting)||fallback,commandEvent);
  if(validContext(scene.context))return scene.context;
  return context(describedSetting||fallback,hasPositiveCue(`${scene.name}. ${scene.explanation}`,eventCue));
}
