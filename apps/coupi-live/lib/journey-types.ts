import type {CallMeta, MemoryLine, Profile, SceneResult, ScanResult, Verdict} from './types';
import type {PersonalizationDraft} from './personalization';
import type {AccountNavigation} from './account-guidance';

export interface DistrictJournalEntry {
  id: string;
  text: string;
  createdAt: string;
  districtName: string;
  scene: SceneResult;
}
export interface ArchivedJournal {
  id: string;
  name: string;
  entries: DistrictJournalEntry[];
}
export interface District {
  id: string;
  name: string;
  provenance: string;
  sourceMemoryIds: string[];
  scene: SceneResult;
  createdAt: string;
  journal?: DistrictJournalEntry[];
}
export interface JourneyState {
  hatched: boolean;
  firstCallRequested?: boolean;
  interviewCount: number;
  interviewComplete: boolean;
  interviewPaused?: boolean;
  personalizationDraft?:PersonalizationDraft;
  personalizationMemoryIds?:string[];
  personalizationReceipts?:{requestId:string;requestHash:string}[];
  nextQuestion: string;
  districts: District[];
  processedCallIds: string[];
  callReceipts?: {requestId:string;requestHash:string;status:'ok'|'blocked';conversationMode:CallConversationMode;proposedSkuIds:string[]}[];
  processedWorldIds?: string[];
  worldReceipts?: {requestId:string;requestHash:string}[];
  processedJournalIds?: string[];
  archivedJournals?: ArchivedJournal[];
  lastReply?: string;
  pendingCall?: {memoryId: string; question: string};
}
export type CallConversationMode = 'interview' | 'request' | 'conversation';
export interface CallResponse {
  status: 'ok' | 'blocked' | 'fallback';
  message: string;
  question: string | null;
  interviewCount: number;
  interviewComplete: boolean;
  conversationMode: CallConversationMode;
  /** Enough surviving, safe context to finish the optional interview and build a world. */
  worldReady: boolean;
  personalization?:{draftId:string;reviewReady:boolean};
  memories: MemoryLine[];
  proposedSkuIds: string[];
  profile: Profile;
  verdict?: Verdict;
  inventory?: ScanResult;
  navigation?: AccountNavigation;
  meta?: CallMeta;
}
export interface WorldResponse {districts: District[]; profile: Profile; meta?: CallMeta;}
