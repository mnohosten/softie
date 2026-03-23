import { randomId } from "../utils.ts";
import type { SoftieEvent, ViewId } from "../types.ts";
import type { AppNotification, NotificationSeverity } from "./types.ts";

export function eventToNotification(event: SoftieEvent): AppNotification | null {
  switch (event.type) {
    case "phase:completed":
      return {
        id: randomId(),
        title: `Phase completed: ${event.phaseName}`,
        description: `Cost: $${event.cost.toFixed(4)}`,
        severity: "success",
        read: false,
        timestamp: event.timestamp,
        sourceEventType: event.type,
        action: { viewId: "dashboard" },
      };

    case "phase:failed":
      return {
        id: randomId(),
        title: `Phase failed: ${event.phaseName}`,
        severity: "error",
        read: false,
        timestamp: event.timestamp,
        sourceEventType: event.type,
        action: { viewId: "dashboard" },
      };

    case "board:task:status":
      if (event.status === "review") {
        return {
          id: randomId(),
          title: "Task ready for review",
          description: event.taskId,
          severity: "warning",
          read: false,
          timestamp: event.timestamp,
          sourceEventType: event.type,
          action: { viewId: "board", itemId: event.taskId, itemType: "task" },
        };
      }
      if (event.status === "done") {
        return {
          id: randomId(),
          title: "Task completed",
          description: event.taskId,
          severity: "success",
          read: false,
          timestamp: event.timestamp,
          sourceEventType: event.type,
          action: { viewId: "board", itemId: event.taskId, itemType: "task" },
        };
      }
      return null;

    case "project:status": {
      const map: Record<string, { title: string; severity: NotificationSeverity; viewId: ViewId }> = {
        completed: { title: "Project completed", severity: "success", viewId: "dashboard" },
        failed: { title: "Project failed", severity: "error", viewId: "dashboard" },
        "spec-review": { title: "Specs ready for review", severity: "warning", viewId: "specs" },
        "sprint-review": { title: "Sprint ready for review", severity: "warning", viewId: "board" },
      };
      const entry = map[event.status];
      if (!entry) return null;
      return {
        id: randomId(),
        title: entry.title,
        severity: entry.severity,
        read: false,
        timestamp: event.timestamp,
        sourceEventType: event.type,
        action: { viewId: entry.viewId },
      };
    }

    default:
      return null;
  }
}
