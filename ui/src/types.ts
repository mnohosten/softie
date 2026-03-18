// Shared types mirroring the backend TypeScript types

export interface ProjectMetadata {
  id: string;
  name: string;
  intent: string;
  status: string;
  currentPhase?: string;
  createdAt: string;
  updatedAt: string;
  sessionId?: string;
}

export interface TeamAgent {
  id: string;
  name: string;
  description: string;
  dependsOn: string[];
}

export interface Team {
  agents: TeamAgent[];
}

export interface Phase {
  id: string;
  name: string;
  description: string;
  agents: string[];
  milestone?: string;
  status: "pending" | "active" | "completed" | "failed";
  order: number;
  retryCount?: number;
}

export interface Milestone {
  id: string;
  name: string;
  description: string;
  deliverables: string[];
  status: "pending" | "active" | "completed" | "skipped";
}

export interface PhasePlan {
  phases: Phase[];
  milestones: Milestone[];
}

export interface Progress {
  totalPhases: number;
  completedPhases: number;
  currentPhase?: string;
  totalCostUsd: number;
  startedAt: string;
  lastActivityAt: string;
}

export type TaskApprovalStatus =
  | "draft"
  | "pending-review"
  | "approved"
  | "in-progress"
  | "completed"
  | "rejected";

export interface TaskApproval {
  id: string;
  phaseId: string;
  title: string;
  description: string;
  assignedAgent?: string;
  status: TaskApprovalStatus;
  revision: number;
  reviewComment?: string;
  rejectionReason?: string;
  modifiedByAgent: boolean;
  chatThreadId?: string;
  createdAt: string;
  updatedAt: string;
}

export type ApprovalMode = "granular" | "phase" | "brave";

export interface ApprovalState {
  mode: ApprovalMode;
  braveMode: boolean;
}

export interface ProjectState {
  metadata: ProjectMetadata | null;
  team: Team | null;
  plan: PhasePlan | null;
  progress: Progress | null;
  tasks: TaskApproval[];
  approvalState: ApprovalState;
  exists: boolean;
}

export interface FileNode {
  path: string;
  name: string;
  isDir: boolean;
  children?: FileNode[];
}

export type Tab = {
  id: string;
  type: "file" | "diff";
  filePath: string;
  title: string;
  content?: string;
  originalContent?: string; // for diff view
  isDirty?: boolean;
};

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export interface ChatThread {
  id: string;
  targetType: "task" | "phase" | "agent" | "project";
  targetId: string;
  messages: ChatMessage[];
  isStreaming: boolean;
  streamBuffer: string;
}

export interface Activity {
  id: string;
  type: string;
  message: string;
  timestamp: string;
  meta?: Record<string, unknown>;
}

export type SelectedItem =
  | { type: "phase"; id: string }
  | { type: "task"; id: string }
  | { type: "agent"; id: string }
  | { type: "file"; path: string }
  | { type: "project" };

// WebSocket message types
export interface WsEvent {
  type: "event";
  data: SoftieEvent;
}

export interface WsConnected {
  type: "connected";
  timestamp: string;
}

export type WsMessage = WsEvent | WsConnected | WsMilestoneQuestion;

export type SoftieEvent =
  | { type: "agent:activity"; agentName: string; action: string; timestamp: string }
  | { type: "phase:started"; phaseId: string; phaseName: string; description: string; timestamp: string }
  | { type: "phase:completed"; phaseId: string; phaseName: string; cost: number; timestamp: string }
  | { type: "phase:failed"; phaseId: string; phaseName: string; timestamp: string }
  | { type: "parallel:launch"; agentNames: string[]; timestamp: string }
  | { type: "task:started"; taskId: string; agentName: string; timestamp: string }
  | { type: "task:completed"; agentName: string; timestamp: string }
  | { type: "cost:update"; totalCostUsd: number; timestamp: string }
  | { type: "project:status"; status: string; timestamp: string }
  | { type: "file:changed"; path: string; timestamp: string }
  | { type: "chat:delta"; threadId: string; content: string; timestamp: string }
  | { type: "chat:done"; threadId: string; cost: number; timestamp: string }
  | { type: "sdk:text"; agentName: string; text: string; timestamp: string }
  | { type: "sdk:tool"; agentName: string; toolName: string; summary: string; timestamp: string };

export interface WsMilestoneQuestion {
  type: "milestone:question";
  question: string;
  timestamp: string;
}
