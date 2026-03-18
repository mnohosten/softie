import { EventEmitter } from "node:events";

export type SoftieEvent =
  | { type: "agent:activity"; agentName: string; action: string; timestamp: string }
  | { type: "phase:started"; phaseId: string; phaseName: string; description: string; timestamp: string }
  | { type: "phase:completed"; phaseId: string; phaseName: string; cost: number; timestamp: string }
  | { type: "phase:failed"; phaseId: string; phaseName: string; timestamp: string }
  | { type: "phase:retry"; phaseId: string; phaseName: string; attempt: number; timestamp: string }
  | { type: "parallel:launch"; agentNames: string[]; timestamp: string }
  | { type: "task:started"; taskId: string; agentName: string; timestamp: string }
  | { type: "task:completed"; agentName: string; timestamp: string }
  | { type: "milestone:started"; milestoneId: string; milestoneName: string; timestamp: string }
  | { type: "milestone:completed"; milestoneId: string; milestoneName: string; timestamp: string }
  | { type: "cost:update"; totalCostUsd: number; timestamp: string }
  | { type: "project:status"; status: string; timestamp: string }
  | { type: "file:changed"; path: string; timestamp: string }
  | { type: "chat:delta"; threadId: string; content: string; timestamp: string }
  | { type: "chat:done"; threadId: string; cost: number; timestamp: string }
  | { type: "sdk:text"; agentName: string; text: string; timestamp: string }
  | { type: "sdk:tool"; agentName: string; toolName: string; summary: string; timestamp: string }
  | { type: "milestone:question"; question: string; timestamp: string };

class SoftieEventBus extends EventEmitter {
  emit_event(event: SoftieEvent): void {
    this.emit(event.type, event);
    this.emit("*", event);
  }
}

export const eventBus = new SoftieEventBus();
