import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock randomId so IDs are deterministic in tests
vi.mock("../utils.ts", () => ({
  randomId: vi.fn(() => "test-id"),
}));

import { eventToNotification } from "./event-to-notification.ts";
import type { SoftieEvent } from "../types.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TS = "2026-03-20T12:00:00.000Z";

function phaseCompleted(overrides?: Partial<Extract<SoftieEvent, { type: "phase:completed" }>>): SoftieEvent {
  return { type: "phase:completed", phaseId: "p1", phaseName: "Planning", cost: 0.0123, timestamp: TS, ...overrides };
}

function phaseFailed(overrides?: Partial<Extract<SoftieEvent, { type: "phase:failed" }>>): SoftieEvent {
  return { type: "phase:failed", phaseId: "p1", phaseName: "Coding", timestamp: TS, ...overrides };
}

function boardTaskStatus(status: string): SoftieEvent {
  return { type: "board:task:status", taskId: "task-42", status, timestamp: TS };
}

function projectStatus(status: string): SoftieEvent {
  return { type: "project:status", status, timestamp: TS };
}

// ---------------------------------------------------------------------------
// phase:completed
// ---------------------------------------------------------------------------

describe("phase:completed", () => {
  it("returns a notification with correct shape", () => {
    const result = eventToNotification(phaseCompleted());
    expect(result).not.toBeNull();
    expect(result!.id).toBe("test-id");
    expect(result!.sourceEventType).toBe("phase:completed");
    expect(result!.read).toBe(false);
    expect(result!.timestamp).toBe(TS);
  });

  it("title includes the phase name", () => {
    const result = eventToNotification(phaseCompleted({ phaseName: "Planning" }));
    expect(result!.title).toBe("Phase completed: Planning");
  });

  it("description includes formatted cost", () => {
    const result = eventToNotification(phaseCompleted({ cost: 0.0123 }));
    expect(result!.description).toBe("Cost: $0.0123");
  });

  it("severity is success", () => {
    expect(eventToNotification(phaseCompleted())!.severity).toBe("success");
  });

  it("action navigates to dashboard", () => {
    expect(eventToNotification(phaseCompleted())!.action).toEqual({ viewId: "dashboard" });
  });
});

// ---------------------------------------------------------------------------
// phase:failed
// ---------------------------------------------------------------------------

describe("phase:failed", () => {
  it("returns a notification with correct shape", () => {
    const result = eventToNotification(phaseFailed());
    expect(result).not.toBeNull();
    expect(result!.sourceEventType).toBe("phase:failed");
    expect(result!.read).toBe(false);
  });

  it("title includes the phase name", () => {
    const result = eventToNotification(phaseFailed({ phaseName: "Coding" }));
    expect(result!.title).toBe("Phase failed: Coding");
  });

  it("severity is error", () => {
    expect(eventToNotification(phaseFailed())!.severity).toBe("error");
  });

  it("action navigates to dashboard", () => {
    expect(eventToNotification(phaseFailed())!.action).toEqual({ viewId: "dashboard" });
  });

  it("has no description", () => {
    expect(eventToNotification(phaseFailed())!.description).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// board:task:status — review
// ---------------------------------------------------------------------------

describe("board:task:status — review", () => {
  it("returns a notification", () => {
    expect(eventToNotification(boardTaskStatus("review"))).not.toBeNull();
  });

  it("title is 'Task ready for review'", () => {
    expect(eventToNotification(boardTaskStatus("review"))!.title).toBe("Task ready for review");
  });

  it("description is the taskId", () => {
    expect(eventToNotification(boardTaskStatus("review"))!.description).toBe("task-42");
  });

  it("severity is warning", () => {
    expect(eventToNotification(boardTaskStatus("review"))!.severity).toBe("warning");
  });

  it("action navigates to board with task selection", () => {
    expect(eventToNotification(boardTaskStatus("review"))!.action).toEqual({
      viewId: "board",
      itemId: "task-42",
      itemType: "task",
    });
  });
});

// ---------------------------------------------------------------------------
// board:task:status — done
// ---------------------------------------------------------------------------

describe("board:task:status — done", () => {
  it("returns a notification", () => {
    expect(eventToNotification(boardTaskStatus("done"))).not.toBeNull();
  });

  it("title is 'Task completed'", () => {
    expect(eventToNotification(boardTaskStatus("done"))!.title).toBe("Task completed");
  });

  it("description is the taskId", () => {
    expect(eventToNotification(boardTaskStatus("done"))!.description).toBe("task-42");
  });

  it("severity is success", () => {
    expect(eventToNotification(boardTaskStatus("done"))!.severity).toBe("success");
  });

  it("action navigates to board with task selection", () => {
    expect(eventToNotification(boardTaskStatus("done"))!.action).toEqual({
      viewId: "board",
      itemId: "task-42",
      itemType: "task",
    });
  });
});

// ---------------------------------------------------------------------------
// board:task:status — non-actionable statuses → null
// ---------------------------------------------------------------------------

describe("board:task:status — non-actionable statuses return null", () => {
  it.each(["todo", "in-progress", "blocked", "cancelled", "archived", ""])(
    "status '%s' returns null",
    (status) => {
      expect(eventToNotification(boardTaskStatus(status))).toBeNull();
    }
  );
});

// ---------------------------------------------------------------------------
// project:status — completed
// ---------------------------------------------------------------------------

describe("project:status — completed", () => {
  it("returns a notification", () => {
    expect(eventToNotification(projectStatus("completed"))).not.toBeNull();
  });

  it("title is 'Project completed'", () => {
    expect(eventToNotification(projectStatus("completed"))!.title).toBe("Project completed");
  });

  it("severity is success", () => {
    expect(eventToNotification(projectStatus("completed"))!.severity).toBe("success");
  });

  it("action navigates to dashboard", () => {
    expect(eventToNotification(projectStatus("completed"))!.action).toEqual({ viewId: "dashboard" });
  });
});

// ---------------------------------------------------------------------------
// project:status — failed
// ---------------------------------------------------------------------------

describe("project:status — failed", () => {
  it("returns a notification", () => {
    expect(eventToNotification(projectStatus("failed"))).not.toBeNull();
  });

  it("title is 'Project failed'", () => {
    expect(eventToNotification(projectStatus("failed"))!.title).toBe("Project failed");
  });

  it("severity is error", () => {
    expect(eventToNotification(projectStatus("failed"))!.severity).toBe("error");
  });

  it("action navigates to dashboard", () => {
    expect(eventToNotification(projectStatus("failed"))!.action).toEqual({ viewId: "dashboard" });
  });
});

// ---------------------------------------------------------------------------
// project:status — spec-review
// ---------------------------------------------------------------------------

describe("project:status — spec-review", () => {
  it("returns a notification", () => {
    expect(eventToNotification(projectStatus("spec-review"))).not.toBeNull();
  });

  it("title is 'Specs ready for review'", () => {
    expect(eventToNotification(projectStatus("spec-review"))!.title).toBe("Specs ready for review");
  });

  it("severity is warning", () => {
    expect(eventToNotification(projectStatus("spec-review"))!.severity).toBe("warning");
  });

  it("action navigates to specs view", () => {
    expect(eventToNotification(projectStatus("spec-review"))!.action).toEqual({ viewId: "specs" });
  });
});

// ---------------------------------------------------------------------------
// project:status — sprint-review
// ---------------------------------------------------------------------------

describe("project:status — sprint-review", () => {
  it("returns a notification", () => {
    expect(eventToNotification(projectStatus("sprint-review"))).not.toBeNull();
  });

  it("title is 'Sprint ready for review'", () => {
    expect(eventToNotification(projectStatus("sprint-review"))!.title).toBe("Sprint ready for review");
  });

  it("severity is warning", () => {
    expect(eventToNotification(projectStatus("sprint-review"))!.severity).toBe("warning");
  });

  it("action navigates to board", () => {
    expect(eventToNotification(projectStatus("sprint-review"))!.action).toEqual({ viewId: "board" });
  });
});

// ---------------------------------------------------------------------------
// project:status — unmapped statuses → null
// ---------------------------------------------------------------------------

describe("project:status — unmapped statuses return null", () => {
  it.each(["started", "paused", "pending", "unknown", ""])(
    "status '%s' returns null",
    (status) => {
      expect(eventToNotification(projectStatus(status))).toBeNull();
    }
  );
});

// ---------------------------------------------------------------------------
// Common fields on all notifications
// ---------------------------------------------------------------------------

describe("all produced notifications", () => {
  const producingEvents: SoftieEvent[] = [
    phaseCompleted(),
    phaseFailed(),
    boardTaskStatus("review"),
    boardTaskStatus("done"),
    projectStatus("completed"),
    projectStatus("failed"),
    projectStatus("spec-review"),
    projectStatus("sprint-review"),
  ];

  it.each(producingEvents)("have read=false and correct timestamp ($type)", (event) => {
    const n = eventToNotification(event)!;
    expect(n.read).toBe(false);
    expect(n.timestamp).toBe(TS);
  });

  it.each(producingEvents)("have sourceEventType matching event.type ($type)", (event) => {
    const n = eventToNotification(event)!;
    expect(n.sourceEventType).toBe(event.type);
  });

  it.each(producingEvents)("have a non-empty id ($type)", (event) => {
    const n = eventToNotification(event)!;
    expect(typeof n.id).toBe("string");
    expect(n.id.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Excluded event types → null
// ---------------------------------------------------------------------------

describe("excluded event types return null", () => {
  it("agent:activity", () => {
    const event: SoftieEvent = { type: "agent:activity", agentName: "coder", action: "reading", timestamp: TS };
    expect(eventToNotification(event)).toBeNull();
  });

  it("sdk:text", () => {
    const event: SoftieEvent = { type: "sdk:text", agentName: "coder", text: "hello", timestamp: TS };
    expect(eventToNotification(event)).toBeNull();
  });

  it("sdk:tool", () => {
    const event: SoftieEvent = { type: "sdk:tool", agentName: "coder", toolName: "bash", summary: "ran ls", timestamp: TS };
    expect(eventToNotification(event)).toBeNull();
  });

  it("file:changed", () => {
    const event: SoftieEvent = { type: "file:changed", path: "/src/foo.ts", timestamp: TS };
    expect(eventToNotification(event)).toBeNull();
  });

  it("cost:update", () => {
    const event: SoftieEvent = { type: "cost:update", totalCostUsd: 0.05, timestamp: TS };
    expect(eventToNotification(event)).toBeNull();
  });

  it("chat:delta", () => {
    const event: SoftieEvent = { type: "chat:delta", threadId: "t1", content: "hi", timestamp: TS };
    expect(eventToNotification(event)).toBeNull();
  });

  it("chat:done", () => {
    const event: SoftieEvent = { type: "chat:done", threadId: "t1", cost: 0.001, timestamp: TS };
    expect(eventToNotification(event)).toBeNull();
  });

  it("phase:started", () => {
    const event: SoftieEvent = { type: "phase:started", phaseId: "p1", phaseName: "Planning", description: "...", timestamp: TS };
    expect(eventToNotification(event)).toBeNull();
  });

  it("board:task:created", () => {
    const event: SoftieEvent = { type: "board:task:created", taskId: "t1", title: "Do stuff", timestamp: TS };
    expect(eventToNotification(event)).toBeNull();
  });

  it("board:task:updated", () => {
    const event: SoftieEvent = { type: "board:task:updated", taskId: "t1", timestamp: TS };
    expect(eventToNotification(event)).toBeNull();
  });

  it("spec:created", () => {
    const event: SoftieEvent = { type: "spec:created", specId: "s1", title: "Auth spec", timestamp: TS };
    expect(eventToNotification(event)).toBeNull();
  });

  it("spec:updated", () => {
    const event: SoftieEvent = { type: "spec:updated", specId: "s1", timestamp: TS };
    expect(eventToNotification(event)).toBeNull();
  });

  it("spec:status", () => {
    const event: SoftieEvent = { type: "spec:status", specId: "s1", status: "approved", timestamp: TS };
    expect(eventToNotification(event)).toBeNull();
  });

  it("sprint:created", () => {
    const event: SoftieEvent = { type: "sprint:created", sprintId: "sp1", name: "Sprint 1", timestamp: TS };
    expect(eventToNotification(event)).toBeNull();
  });

  it("sprint:updated", () => {
    const event: SoftieEvent = { type: "sprint:updated", sprintId: "sp1", timestamp: TS };
    expect(eventToNotification(event)).toBeNull();
  });

  it("sprint:status", () => {
    const event: SoftieEvent = { type: "sprint:status", sprintId: "sp1", status: "active", timestamp: TS };
    expect(eventToNotification(event)).toBeNull();
  });

  it("task:started", () => {
    const event: SoftieEvent = { type: "task:started", taskId: "t1", agentName: "coder", timestamp: TS };
    expect(eventToNotification(event)).toBeNull();
  });

  it("task:completed", () => {
    const event: SoftieEvent = { type: "task:completed", agentName: "coder", timestamp: TS };
    expect(eventToNotification(event)).toBeNull();
  });

  it("parallel:launch", () => {
    const event: SoftieEvent = { type: "parallel:launch", agentNames: ["a", "b"], timestamp: TS };
    expect(eventToNotification(event)).toBeNull();
  });
});
