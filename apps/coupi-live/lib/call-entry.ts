import type {Profile} from './types';

/** Keep the published shopping-first call and its existing controls for every entry. */
export function usesFirstCall(_profile:Profile,_action?:string):boolean {
  return false;
}
