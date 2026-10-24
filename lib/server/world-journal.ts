import {createHash} from 'node:crypto';
import type {Profile} from '../types';
import type {ArchivedJournal,District, DistrictJournalEntry} from '../journey-types';
import {AppError} from './errors';

export type JournalInput =
  | {action:'add';districtId:string;requestId:string;text:string}
  | {action:'delete';districtId:string;requestId:string;entryId:string};
export interface JournalResponse {profile:Profile;district?:District;archive?:ArchivedJournal;}

/** Diary text is private profile data: it never becomes memory, XP or an AI prompt. */
export function updateWorldJournal(profile:Profile,input:JournalInput,now=new Date()):JournalResponse {
  const original=profile.journey?.districts.find(district=>district.id===input.districtId);
  const archived=profile.journey?.archivedJournals?.find(archive=>archive.id===input.districtId);
  if(!input.requestId.trim()||input.requestId.length>100)throw new AppError('INVALID_JOURNAL_REQUEST','Use a valid journal request id.');
  const eventId=createHash('sha256').update(input.requestId).digest('hex');
  if(profile.journey?.processedJournalIds?.includes(eventId))return{profile,...(original?{district:original}:{}),...(archived?{archive:archived}:{})};
  if(!original&&!(input.action==='delete'&&archived))throw new AppError('DISTRICT_NOT_FOUND','That district no longer exists.',404);
  const entries=original?.journal||[];
  if(input.action==='add'){
    if(!input.text.trim()||input.text.trim().length>1000)throw new AppError('INVALID_JOURNAL_NOTE','Keep each note between 1 and 1,000 characters.');
    if(entries.length>=100)throw new AppError('JOURNAL_FULL','This district has 100 notes. Delete one before adding another.',409);
  }
  const next=structuredClone(profile),district=next.journey!.districts.find(item=>item.id===input.districtId);
  let archive:ArchivedJournal|undefined;
  if(input.action==='add'){
    const entry:DistrictJournalEntry={id:'journal-'+eventId.slice(0,24),text:input.text.trim(),createdAt:now.toISOString(),districtName:district!.name,scene:structuredClone(district!.scene)};
    district!.journal=[...(district!.journal||[]),entry];
  }else if(district)district.journal=(district.journal||[]).filter(entry=>entry.id!==input.entryId);
  else{
    archive=next.journey!.archivedJournals!.find(item=>item.id===input.districtId)!;
    archive.entries=archive.entries.filter(entry=>entry.id!==input.entryId);
    if(!archive.entries.length){next.journey!.archivedJournals=next.journey!.archivedJournals!.filter(item=>item.id!==input.districtId);archive=undefined;}
  }
  // Keep event IDs after deleting an entry, so retrying its original add cannot resurrect it.
  next.journey!.processedJournalIds=[...(next.journey!.processedJournalIds||[]),eventId];
  next.revision++;next.updatedAt=now.toISOString();
  return{profile:next,...(district?{district}:{}),...(archive?{archive}:{})};
}
