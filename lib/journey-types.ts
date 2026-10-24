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
  nextQuestion: string;
  districts: District[];
  processedCallIds: string[];
  processedWorldIds?: string[];
  processedJournalIds?: string[];
  archivedJournals?: ArchivedJournal[];
  lastReply?: string;
  pendingCall?: {memoryId: string; question: string};
}
export interface CallResponse {
  status: 'ok' | 'blocked' | 'fallback';
  message: string;
  question: string | null;
  interviewCount: number;
  interviewComplete: boolean;
  memories: MemoryLine[];
  proposedSkuIds: string[];
  profile: Profile;
  verdict?: Verdict;
  inventory?: ScanResult;
  meta?: CallMeta;
}
export interface WorldResponse {districts: District[]; profile: Profile; meta?: CallMeta;}
