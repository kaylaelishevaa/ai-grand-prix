import type {Profile} from './types';
import {likedProductIds} from './world-activity';

export function acceptsProfileUpdate(current:Profile|null,next:Profile):boolean {
  return !current||(current.id===next.id&&next.revision>=current.revision);
}

/** A product-led scene keeps its surviving anchors when its owner reimagines it. */
export function rebuildProductAnchors(profile:Profile|null,districtId?:string):string[] {
  if(!profile||profile.journey?.interviewComplete||!districtId)return [];
  const district=profile.journey?.districts.find(item=>item.id===districtId);
  if(!district)return [];
  return likedProductIds(profile).filter(id=>district.scene.items.some(item=>item.skuId===id)).slice(0,3);
}
