import type {CallMeta, MemoryLine, Profile, SceneResult, ScanResult, Verdict} from './types';

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
  interviewCount: number;
  interviewComplete: boolean;
  interviewPaused?: boolean;
  nextQuestion: string;
  districts: District[];
  processedCallIds: string[];
  callReceipts?: {requestId:string;requestHash:string;status:'ok'|'blocked';conversationMode:CallConversationMode;proposedSkuIds:string[]}[];
  processedWorldIds?: string[];
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
  memories: MemoryLine[];
  proposedSkuIds: string[];
  profile: Profile;
  verdict?: Verdict;
  inventory?: ScanResult;
  meta?: CallMeta;
}
export interface WorldResponse {districts: District[]; profile: Profile; meta?: CallMeta;}
