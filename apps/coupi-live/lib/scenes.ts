import type {SceneResult} from './types';
import {getSku} from './catalog';

export type SceneKind = 'kitchen' | 'desk' | 'reading' | 'dressing';
export const SCENE_LABELS:Record<SceneKind,string> = {
  kitchen:'a kitchen for your rituals',
  desk:'a little room for your ideas',
  reading:'a quieter corner of the world',
  dressing:'getting ready, your way',
};

const cues:Record<SceneKind,RegExp> = {
  dressing:/\b(?:closet|wardrobe|clothes|clothing|make[ -]?up|cosmetics?|vanity|dressing|getting ready|outfits?)\b|화장대|옷장/g,
  reading:/\b(?:reading|read a book|book nook|book corner|rainy afternoon)\b|독서/g,
  desk:/\b(?:desk|workspace|workstation|work space|work station|drawing|study|focus)\b|책상/g,
  kitchen:/\b(?:kitchen|cook(?:ing)?|dinner|breakfast|coffee|matcha|tea ritual)\b|주방|부엌/g,
};

function positiveCue(value:string,pattern:RegExp):boolean {
  const text=value.toLowerCase().replace(/\bsalad dressing\b/g,'cooking');
  for(const match of text.matchAll(pattern)){
    const before=text.slice(Math.max(0,match.index!-60),match.index);
    // Negating an object is not asking for a room dedicated to that object.
    if(/\b(?:no|not|without|skip|exclude|excluding|avoid|avoiding|don't want|do not want|instead of|rather than)\s+(?:(?:a|an|the|any|more|new|my)\s+)?$/.test(before))continue;
    return true;
  }
  return false;
}

function contextKind(value:string):SceneKind|undefined {
  // A date alone does not tell us whether someone wants to dress up or cook dinner.
  for(const kind of ['dressing','reading','desk','kitchen'] as const)if(positiveCue(value,cues[kind]))return kind;
}

export function dressingRequestConstraints(command:string) {
  return {
    active:positiveCue(command,cues.dressing),
    wardrobe:positiveCue(command,/\b(?:closet|wardrobe|outfits?|clothing)\b|옷장/g),
    beauty:positiveCue(command,/\b(?:make[ -]?up|cosmetics?|vanity)\b|화장대/g),
    excludeMakeup:/\b(?:no|not|without|skip|exclude|excluding|avoid|avoiding|don't want|do not want)\s+(?:(?:any|new|more)\s+)?(?:make[ -]?up|cosmetics?)\b/i.test(command),
  };
}

/** A new explicit command can change a room; persisted kind otherwise keeps renders stable. */
export function resolveSceneKind(scene:SceneResult,command=''):SceneKind {
  const commanded=contextKind(command);
  if(commanded)return commanded;
  if(scene.kind&&Object.hasOwn(SCENE_LABELS,scene.kind))return scene.kind;
  const named=contextKind(scene.name);
  if(named)return named;
  const described=contextKind(scene.explanation);
  if(described)return described;
  const products=scene.items.flatMap(item=>{const sku=getSku(item.skuId);return sku?[sku]:[];});
  if(products.some(sku=>sku.category==='wardrobe'||sku.category==='beauty'))return 'dressing';
  if(products.some(sku=>sku.type==='organizer'))return 'desk';
  return 'kitchen';
}
