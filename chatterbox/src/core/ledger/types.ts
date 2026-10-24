import { MissionSeal } from './ledger-crypto.js';

export type MissionStatus =
  | 'running'
  | 'awaiting_approval'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type MissionEventType =
  | 'mission_started'
  | 'goal_set'
  | 'provider_selected'
  | 'agent_joined'
  | 'plan_created'
  | 'plan_revised'
  | 'agent_message'
  | 'task_assigned'
  | 'task_started'
  | 'task_completed'
  | 'file_read'
  | 'file_created'
  | 'file_modified'
  | 'diff_created'
  | 'test_started'
  | 'test_passed'
  | 'test_failed'
  | 'quality_gate_failed'
  | 'approval_requested'
  | 'approved'
  | 'rejected'
  | 'redirected'
  | 'mission_completed'
  | 'mission_failed'
  | 'mission_cancelled';

export interface MissionEvent {
  id: string;
  timestamp: string;
  actor: string;
  actor_type: 'agent' | 'human' | 'system';
  event_type: MissionEventType;
  summary: string;
  data: Record<string, unknown>;
  previous_hash: string;
  event_hash: string;
  // Security metadata for file/diff events
  content_sha256?: string;
  size_bytes?: number;
  base_content_sha256?: string;
  proposed_content_sha256?: string;
  stale?: boolean;
}

export interface MissionArtifact {
  id: string;
  type: 'diff' | 'test_report' | 'plan' | 'summary';
  path: string; // Relative to data directory
  sha256: string;
  size_bytes?: number;
}

export interface MissionAgent {
  id: string;
  role: 'architect' | 'implementer' | 'tester' | 'reviewer' | 'coordinator' | string;
  model?: string;
}

export interface MissionIntegrity {
  algorithm: 'sha256';
  genesis_hash: string;
  head_hash: string;
  event_count: number;
}

export interface MissionRecord {
  mission_id: string;
  display_id: string; // e.g. #001
  goal: string;
  status: MissionStatus;
  created_at: string;
  updated_at: string;
  workspace_root: string;
  provider: {
    name: string;
    type: string;
    endpoint?: string;
  };
  model: string;
  agents: MissionAgent[];
  events: MissionEvent[];
  artifacts: MissionArtifact[];
  result?: {
    summary?: string;
    files_changed?: string[];
    tests_run?: number;
    tests_passed?: number;
    approval_status?: 'approved' | 'rejected' | 'unsupervised' | 'cancelled';
  };
  integrity: MissionIntegrity;
  seal?: MissionSeal;
}

export type VerificationStatus = 'VERIFIED' | 'TAMPERED' | 'UNVERIFIABLE';

export interface MissionVerificationResult {
  status: VerificationStatus;
  isValidChain: boolean;
  isValidSeal: boolean;
  eventCount: number;
  headHash: string;
  tamperDetails?: string[];
}
