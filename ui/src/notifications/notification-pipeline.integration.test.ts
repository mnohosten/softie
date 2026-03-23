/**
 * Integration test: WebSocket event → notification pipeline
 *
 * Covers the full flow:
 *   WsEvent received → eventToNotification() → store.addNotification()
 *     → badge state (NotificationBell) → notification list (NotificationDropdown)
 *
 * No React rendering needed: the badge and dropdown read Zustand state, so
 * we verify the exact state those components would consume.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../utils.ts", () => ({
  randomId: vi.fn(() => "test-id"),
  formatRelativeTime: vi.fn(() => "just now"),
}));

import { eventToNotification } from "./event-to-notification.ts";
import { useSoftieStore } from "../store/index.ts";
import type { SoftieEvent } from "../types.ts";
import type { AppNotification } from "./types.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TS = "2026-03-20T14:00:00.000Z";

/**
 * Mirrors the selector logic inside useBadgeInfo() in NotificationBell.tsx.
 * Returns what the bell badge would show given a notifications array.
 */
function getBadgeInfo(notifications: AppNotification[]) {
  const unread = notifications.filter((n) => !n.read);
  const count = unread.length;
  if (count === 0) return { count: 0, variant: "info" as const };
  if (unread.some((n) => n.severity === "error")) return { count, variant: "error" as const };
  if (unread.some((n) => n.severity === "warning")) return { count, variant: "warning" as const };
  return { count, variant: "info" as const };
}

/**
 * Simulates what useWebSocket.handleMessage does for a `type: "event"` WsMessage.
 * Calls eventToNotification() and feeds the result into the store — exactly
 * the two lines in the hook after addActivity().
 */
function simulateWsEvent(event: SoftieEvent) {
  const { addNotification } = useSoftieStore.getState();
  const notification = eventToNotification(event);
  if (notification) addNotification(notification);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("notification pipeline integration", () => {
  beforeEach(() => {
    useSoftieStore.setState({ notifications: [] });
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Event type 1: phase:completed
  // -------------------------------------------------------------------------

  describe("phase:completed event", () => {
    const event: SoftieEvent = {
      type: "phase:completed",
      phaseId: "phase-1",
      phaseName: "Implementation",
      cost: 0.0456,
      timestamp: TS,
    };

    it("notification lands in store", () => {
      simulateWsEvent(event);

      const { notifications } = useSoftieStore.getState();
      expect(notifications).toHaveLength(1);
    });

    it("notification has correct fields", () => {
      simulateWsEvent(event);

      const [n] = useSoftieStore.getState().notifications;
      expect(n.sourceEventType).toBe("phase:completed");
      expect(n.title).toBe("Phase completed: Implementation");
      expect(n.description).toContain("0.0456");
      expect(n.severity).toBe("success");
      expect(n.read).toBe(false);
      expect(n.timestamp).toBe(TS);
    });

    it("notification action points to dashboard view", () => {
      simulateWsEvent(event);

      const [n] = useSoftieStore.getState().notifications;
      expect(n.action).toEqual({ viewId: "dashboard" });
    });

    it("badge shows count 1", () => {
      simulateWsEvent(event);

      const badge = getBadgeInfo(useSoftieStore.getState().notifications);
      expect(badge.count).toBe(1);
    });

    it("badge variant is 'info' (success has no error/warning override)", () => {
      simulateWsEvent(event);

      const badge = getBadgeInfo(useSoftieStore.getState().notifications);
      expect(badge.variant).toBe("info");
    });

    it("dropdown list would contain the notification", () => {
      simulateWsEvent(event);

      const { notifications } = useSoftieStore.getState();
      const dropdownItems = notifications; // component renders this array directly
      expect(dropdownItems).toHaveLength(1);
      expect(dropdownItems[0].title).toBe("Phase completed: Implementation");
    });
  });

  // -------------------------------------------------------------------------
  // Event type 2: board:task:status review
  // -------------------------------------------------------------------------

  describe("board:task:status (review) event", () => {
    const event: SoftieEvent = {
      type: "board:task:status",
      taskId: "task-99",
      status: "review",
      timestamp: TS,
    };

    it("notification lands in store", () => {
      simulateWsEvent(event);

      const { notifications } = useSoftieStore.getState();
      expect(notifications).toHaveLength(1);
    });

    it("notification has correct fields", () => {
      simulateWsEvent(event);

      const [n] = useSoftieStore.getState().notifications;
      expect(n.sourceEventType).toBe("board:task:status");
      expect(n.title).toBe("Task ready for review");
      expect(n.description).toBe("task-99");
      expect(n.severity).toBe("warning");
      expect(n.read).toBe(false);
    });

    it("notification action points to board view with task selection", () => {
      simulateWsEvent(event);

      const [n] = useSoftieStore.getState().notifications;
      expect(n.action).toEqual({ viewId: "board", itemId: "task-99", itemType: "task" });
    });

    it("badge shows count 1", () => {
      simulateWsEvent(event);

      const badge = getBadgeInfo(useSoftieStore.getState().notifications);
      expect(badge.count).toBe(1);
    });

    it("badge variant is 'warning'", () => {
      simulateWsEvent(event);

      const badge = getBadgeInfo(useSoftieStore.getState().notifications);
      expect(badge.variant).toBe("warning");
    });

    it("dropdown list would contain the notification", () => {
      simulateWsEvent(event);

      const { notifications } = useSoftieStore.getState();
      expect(notifications[0].title).toBe("Task ready for review");
      expect(notifications[0].action?.itemId).toBe("task-99");
    });
  });

  // -------------------------------------------------------------------------
  // Event type 3: phase:failed (error badge priority)
  // -------------------------------------------------------------------------

  describe("phase:failed event", () => {
    const event: SoftieEvent = {
      type: "phase:failed",
      phaseId: "phase-2",
      phaseName: "Deployment",
      timestamp: TS,
    };

    it("notification lands in store with error severity", () => {
      simulateWsEvent(event);

      const [n] = useSoftieStore.getState().notifications;
      expect(n.severity).toBe("error");
      expect(n.title).toBe("Phase failed: Deployment");
    });

    it("badge variant is 'error'", () => {
      simulateWsEvent(event);

      const badge = getBadgeInfo(useSoftieStore.getState().notifications);
      expect(badge.variant).toBe("error");
    });

    it("error badge takes priority over warning badge when both are unread", () => {
      simulateWsEvent({
        type: "board:task:status",
        taskId: "task-1",
        status: "review",
        timestamp: TS,
      });
      simulateWsEvent(event);

      const badge = getBadgeInfo(useSoftieStore.getState().notifications);
      expect(badge.count).toBe(2);
      expect(badge.variant).toBe("error");
    });
  });

  // -------------------------------------------------------------------------
  // Non-actionable events — badge stays silent
  // -------------------------------------------------------------------------

  describe("non-actionable events produce no notifications", () => {
    it("agent:activity does not reach store", () => {
      simulateWsEvent({ type: "agent:activity", agentName: "coder", action: "Reading", timestamp: TS });

      expect(useSoftieStore.getState().notifications).toHaveLength(0);
    });

    it("board:task:status in-progress does not reach store", () => {
      simulateWsEvent({ type: "board:task:status", taskId: "t1", status: "in-progress", timestamp: TS });

      expect(useSoftieStore.getState().notifications).toHaveLength(0);
    });

    it("badge count remains 0 after non-actionable events", () => {
      simulateWsEvent({ type: "agent:activity", agentName: "coder", action: "Reading", timestamp: TS });
      simulateWsEvent({ type: "board:task:status", taskId: "t1", status: "in-progress", timestamp: TS });
      simulateWsEvent({ type: "cost:update", totalCostUsd: 0.05, timestamp: TS });

      const badge = getBadgeInfo(useSoftieStore.getState().notifications);
      expect(badge.count).toBe(0);
    });

    it("dropdown would show empty state after non-actionable events", () => {
      simulateWsEvent({ type: "agent:activity", agentName: "coder", action: "Reading", timestamp: TS });

      const { notifications } = useSoftieStore.getState();
      expect(notifications).toHaveLength(0); // component renders "No notifications"
    });
  });

  // -------------------------------------------------------------------------
  // Multiple events — ordering and accumulation
  // -------------------------------------------------------------------------

  describe("multiple events accumulate correctly", () => {
    it("two actionable events produce two notifications", () => {
      simulateWsEvent({
        type: "phase:completed",
        phaseId: "p1",
        phaseName: "Planning",
        cost: 0.01,
        timestamp: TS,
      });
      simulateWsEvent({
        type: "board:task:status",
        taskId: "task-1",
        status: "review",
        timestamp: TS,
      });

      expect(useSoftieStore.getState().notifications).toHaveLength(2);
    });

    it("notifications are newest-first (last event at index 0)", () => {
      simulateWsEvent({
        type: "phase:completed",
        phaseId: "p1",
        phaseName: "Planning",
        cost: 0.01,
        timestamp: TS,
      });
      simulateWsEvent({
        type: "board:task:status",
        taskId: "task-1",
        status: "review",
        timestamp: TS,
      });

      const { notifications } = useSoftieStore.getState();
      expect(notifications[0].sourceEventType).toBe("board:task:status");
      expect(notifications[1].sourceEventType).toBe("phase:completed");
    });

    it("badge count equals number of unread notifications", () => {
      simulateWsEvent({
        type: "phase:completed",
        phaseId: "p1",
        phaseName: "Planning",
        cost: 0.01,
        timestamp: TS,
      });
      simulateWsEvent({
        type: "board:task:status",
        taskId: "task-1",
        status: "review",
        timestamp: TS,
      });

      const badge = getBadgeInfo(useSoftieStore.getState().notifications);
      expect(badge.count).toBe(2);
    });

    it("mixed actionable and non-actionable events: only actionable ones stored", () => {
      simulateWsEvent({ type: "agent:activity", agentName: "coder", action: "Step 1", timestamp: TS });
      simulateWsEvent({
        type: "phase:completed",
        phaseId: "p1",
        phaseName: "Analysis",
        cost: 0.02,
        timestamp: TS,
      });
      simulateWsEvent({ type: "cost:update", totalCostUsd: 0.02, timestamp: TS });
      simulateWsEvent({
        type: "board:task:status",
        taskId: "task-5",
        status: "done",
        timestamp: TS,
      });

      expect(useSoftieStore.getState().notifications).toHaveLength(2);
    });
  });

  // -------------------------------------------------------------------------
  // Mark as read — badge reflects updated state
  // -------------------------------------------------------------------------

  describe("mark as read updates badge", () => {
    it("marking one notification read reduces badge count", () => {
      simulateWsEvent({
        type: "phase:completed",
        phaseId: "p1",
        phaseName: "Planning",
        cost: 0.01,
        timestamp: TS,
      });

      const { notifications, markNotificationRead } = useSoftieStore.getState();
      expect(getBadgeInfo(notifications).count).toBe(1);

      markNotificationRead(notifications[0].id);

      const after = useSoftieStore.getState().notifications;
      expect(getBadgeInfo(after).count).toBe(0);
    });

    it("marking all read clears the badge", () => {
      simulateWsEvent({
        type: "phase:completed",
        phaseId: "p1",
        phaseName: "Planning",
        cost: 0.01,
        timestamp: TS,
      });
      simulateWsEvent({
        type: "board:task:status",
        taskId: "task-1",
        status: "review",
        timestamp: TS,
      });

      useSoftieStore.getState().markAllNotificationsRead();

      const after = useSoftieStore.getState().notifications;
      expect(getBadgeInfo(after).count).toBe(0);
    });

    it("badge variant drops to 'info' after marking warning notification read", () => {
      simulateWsEvent({
        type: "board:task:status",
        taskId: "task-1",
        status: "review",
        timestamp: TS,
      });

      const { notifications, markNotificationRead } = useSoftieStore.getState();
      expect(getBadgeInfo(notifications).variant).toBe("warning");

      markNotificationRead(notifications[0].id);

      expect(getBadgeInfo(useSoftieStore.getState().notifications).count).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // milestone:question — handled inline in useWebSocket (not via eventToNotification)
  // -------------------------------------------------------------------------

  describe("milestone:question notification via inline handler", () => {
    it("milestone notification reaches store and shows in dropdown", () => {
      // Mirrors the inline addNotification() block in useWebSocket.ts handleMessage()
      useSoftieStore.getState().addNotification({
        id: "test-id",
        title: "Milestone question",
        description: "Should we use approach A or B?",
        severity: "warning",
        read: false,
        timestamp: TS,
        sourceEventType: "milestone:question",
        action: { viewId: "dashboard" },
      });

      const { notifications } = useSoftieStore.getState();
      expect(notifications).toHaveLength(1);
      expect(notifications[0].sourceEventType).toBe("milestone:question");
      expect(notifications[0].title).toBe("Milestone question");
      expect(notifications[0].action?.viewId).toBe("dashboard");
    });

    it("badge shows warning variant for milestone:question", () => {
      useSoftieStore.getState().addNotification({
        id: "test-id",
        title: "Milestone question",
        severity: "warning",
        read: false,
        timestamp: TS,
        sourceEventType: "milestone:question",
        action: { viewId: "dashboard" },
      });

      const badge = getBadgeInfo(useSoftieStore.getState().notifications);
      expect(badge.count).toBe(1);
      expect(badge.variant).toBe("warning");
    });
  });

  // -------------------------------------------------------------------------
  // project:status events
  // -------------------------------------------------------------------------

  describe("project:status events", () => {
    it("project:status completed creates success notification", () => {
      simulateWsEvent({ type: "project:status", status: "completed", timestamp: TS });

      const [n] = useSoftieStore.getState().notifications;
      expect(n.title).toBe("Project completed");
      expect(n.severity).toBe("success");
      expect(n.action?.viewId).toBe("dashboard");
    });

    it("project:status spec-review creates warning notification pointing to specs view", () => {
      simulateWsEvent({ type: "project:status", status: "spec-review", timestamp: TS });

      const [n] = useSoftieStore.getState().notifications;
      expect(n.title).toBe("Specs ready for review");
      expect(n.severity).toBe("warning");
      expect(n.action?.viewId).toBe("specs");
    });

    it("project:status started does not create notification", () => {
      simulateWsEvent({ type: "project:status", status: "started", timestamp: TS });

      expect(useSoftieStore.getState().notifications).toHaveLength(0);
    });
  });
});
