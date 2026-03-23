import { z } from "zod";

// --- Agent Definition ---

export const AgentToolSchema = z.enum([
  "Read",
  "Write",
  "Edit",
  "Bash",
  "Glob",
  "Grep",
  "WebSearch",
  "WebFetch",
  "AskUserQuestion",
  "Agent",
  "TaskOutput",
  "TaskStop",
]);

export type AgentTool = z.infer<typeof AgentToolSchema>;

export const AgentModelSchema = z.enum(["opus", "sonnet", "haiku"]);
export type AgentModel = z.infer<typeof AgentModelSchema>;

export const AgentDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  model: AgentModelSchema,
  tools: z.array(AgentToolSchema),
  dependencies: z.array(z.string()).default([]),
  prompt: z.string(),
  maxTurns: z.number().optional().default(30),
});

export type AgentDefinition = z.infer<typeof AgentDefinitionSchema>;

// --- Team ---

export const TeamSchema = z.object({
  agents: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string(),
      dependsOn: z.array(z.string()).default([]),
    })
  ),
});

export type Team = z.infer<typeof TeamSchema>;

// --- Milestone ---

export const MilestoneSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  deliverables: z.array(z.string()),
  status: z.enum(["pending", "active", "completed", "skipped"]),
});

export type Milestone = z.infer<typeof MilestoneSchema>;

// --- Phase ---

export const PhaseSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  agents: z.array(z.string()),
  milestone: z.string().optional(),
  status: z.enum(["pending", "active", "completed", "failed"]),
  order: z.number(),
  retryCount: z.number().optional(),
});

export type Phase = z.infer<typeof PhaseSchema>;

export const PhasePlanSchema = z.object({
  phases: z.array(PhaseSchema),
  milestones: z.array(MilestoneSchema),
});

export type PhasePlan = z.infer<typeof PhasePlanSchema>;

// --- Project ---

export const ProjectStatusSchema = z.enum([
  "initializing",
  "analyzing",
  "spec-review",
  "planning",
  "ready",
  "executing",
  "sprint-review",
  "completed",
  "failed",
  "paused",
  // v1 compat
  "team-review",
  "milestone-review",
]);

export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;

export const ProjectMetadataSchema = z.object({
  id: z.string(),
  name: z.string(),
  intent: z.string(),
  status: ProjectStatusSchema,
  currentPhase: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  sessionId: z.string().optional(),
});

export type ProjectMetadata = z.infer<typeof ProjectMetadataSchema>;

// --- Progress ---

export const ProgressSchema = z.object({
  totalPhases: z.number(),
  completedPhases: z.number(),
  currentPhase: z.string().optional(),
  totalCostUsd: z.number().default(0),
  startedAt: z.string(),
  lastActivityAt: z.string(),
});

export type Progress = z.infer<typeof ProgressSchema>;

// --- Decision Log ---

export const DecisionSchema = z.object({
  timestamp: z.string(),
  phase: z.string(),
  agent: z.string().optional(),
  decision: z.string(),
  reasoning: z.string().optional(),
});

export type Decision = z.infer<typeof DecisionSchema>;

// --- Task Approval ---

export const TaskApprovalStatusSchema = z.enum([
  "draft",
  "pending-review",
  "approved",
  "in-progress",
  "completed",
  "rejected",
]);

export type TaskApprovalStatus = z.infer<typeof TaskApprovalStatusSchema>;

export const TaskApprovalSchema = z.object({
  id: z.string(),
  phaseId: z.string(),
  title: z.string(),
  description: z.string(),
  assignedAgent: z.string().optional(),
  status: TaskApprovalStatusSchema,
  revision: z.number().default(0),
  reviewComment: z.string().optional(),
  rejectionReason: z.string().optional(),
  modifiedByAgent: z.boolean().default(false),
  chatThreadId: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type TaskApproval = z.infer<typeof TaskApprovalSchema>;

export const ApprovalModeSchema = z.enum(["granular", "phase", "brave"]);
export type ApprovalMode = z.infer<typeof ApprovalModeSchema>;

export const ApprovalStateSchema = z.object({
  mode: ApprovalModeSchema.default("granular"),
  braveMode: z.boolean().default(false),
});

export type ApprovalState = z.infer<typeof ApprovalStateSchema>;

// --- Spec (v2) ---

export const SpecTypeSchema = z.enum([
  "product",
  "technical",
  "architecture",
  "api",
  "ui",
]);
export type SpecType = z.infer<typeof SpecTypeSchema>;

export const SpecStatusSchema = z.enum([
  "draft",
  "review",
  "approved",
  "implemented",
]);
export type SpecStatus = z.infer<typeof SpecStatusSchema>;

export const SpecSectionSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  order: z.number(),
});
export type SpecSection = z.infer<typeof SpecSectionSchema>;

export const SpecSchema = z.object({
  id: z.string(),
  title: z.string(),
  type: SpecTypeSchema,
  status: SpecStatusSchema.default("draft"),
  sections: z.array(SpecSectionSchema).default([]),
  filePath: z.string(), // relative to .softie/specs/
  linkedTaskIds: z.array(z.string()).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Spec = z.infer<typeof SpecSchema>;

// --- Task v2 ---

export const TaskStatusSchema = z.enum([
  "backlog",
  "todo",
  "in-progress",
  "review",
  "done",
  "blocked",
  "rejected",
]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const TaskPrioritySchema = z.enum(["p0", "p1", "p2"]);
export type TaskPriority = z.infer<typeof TaskPrioritySchema>;

export const TaskComplexitySchema = z.enum(["small", "medium", "large"]);
export type TaskComplexity = z.infer<typeof TaskComplexitySchema>;

export const TaskSchema = z.object({
  id: z.string(),
  specId: z.string().optional(),
  specSectionId: z.string().optional(),
  title: z.string(),
  description: z.string(),
  status: TaskStatusSchema.default("backlog"),
  priority: TaskPrioritySchema.default("p1"),
  assignedAgentId: z.string().optional(),
  dependencies: z.array(z.string()).default([]),
  sprintId: z.string().optional(),
  phaseId: z.string().optional(),
  estimatedComplexity: TaskComplexitySchema.default("medium"),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Task = z.infer<typeof TaskSchema>;

// --- Sprint ---

export const SprintStatusSchema = z.enum([
  "planning",
  "active",
  "completed",
]);
export type SprintStatus = z.infer<typeof SprintStatusSchema>;

export const SprintSchema = z.object({
  id: z.string(),
  name: z.string(),
  order: z.number(),
  status: SprintStatusSchema.default("planning"),
  taskIds: z.array(z.string()).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Sprint = z.infer<typeof SprintSchema>;
