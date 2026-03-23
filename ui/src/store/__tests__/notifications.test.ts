import { beforeEach, describe, expect, it } from "vitest";
import { useSoftieStore } from "../index.ts";
import type { AppNotification } from "../../notifications/types.ts";

function makeNotification(overrides: Partial<AppNotification> = {}): AppNotification {
  return {
    id: "test-id",
    title: "Test notification",
    severity: "info",
    read: false,
    timestamp: new Date().toISOString(),
    sourceEventType: "phase:completed",
    ...overrides,
  };
}

beforeEach(() => {
  useSoftieStore.setState({ notifications: [] });
});

describe("addNotification", () => {
  it("prepends notification to empty array", () => {
    const n = makeNotification({ id: "n1", title: "First" });
    useSoftieStore.getState().addNotification(n);
    const { notifications } = useSoftieStore.getState();
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toEqual(n);
  });

  it("prepends new notification before existing ones (newest first)", () => {
    const n1 = makeNotification({ id: "n1", title: "First" });
    const n2 = makeNotification({ id: "n2", title: "Second" });
    useSoftieStore.getState().addNotification(n1);
    useSoftieStore.getState().addNotification(n2);
    const { notifications } = useSoftieStore.getState();
    expect(notifications[0].id).toBe("n2");
    expect(notifications[1].id).toBe("n1");
  });

  it("stores notification with all fields intact", () => {
    const n = makeNotification({
      id: "full-n",
      title: "Full notification",
      description: "Some description",
      severity: "error",
      read: false,
      sourceEventType: "phase:failed",
      action: { viewId: "dashboard" },
    });
    useSoftieStore.getState().addNotification(n);
    expect(useSoftieStore.getState().notifications[0]).toEqual(n);
  });
});

describe("addNotification — 50 item cap", () => {
  it("keeps exactly 50 notifications when 50 are added", () => {
    for (let i = 0; i < 50; i++) {
      useSoftieStore.getState().addNotification(makeNotification({ id: `n${i}` }));
    }
    expect(useSoftieStore.getState().notifications).toHaveLength(50);
  });

  it("drops oldest notification when 51st is added", () => {
    for (let i = 0; i < 50; i++) {
      useSoftieStore.getState().addNotification(makeNotification({ id: `n${i}`, title: `Notification ${i}` }));
    }
    const oldest = useSoftieStore.getState().notifications[49];
    expect(oldest.id).toBe("n0");

    useSoftieStore.getState().addNotification(makeNotification({ id: "n50", title: "Notification 50" }));

    const { notifications } = useSoftieStore.getState();
    expect(notifications).toHaveLength(50);
    expect(notifications[0].id).toBe("n50");
    expect(notifications.find((n) => n.id === "n0")).toBeUndefined();
  });

  it("newest notification is at index 0 after cap enforcement", () => {
    for (let i = 0; i < 51; i++) {
      useSoftieStore.getState().addNotification(makeNotification({ id: `n${i}` }));
    }
    expect(useSoftieStore.getState().notifications[0].id).toBe("n50");
  });

  it("retains 49 most-recent pre-cap items after 51st addition", () => {
    for (let i = 0; i < 51; i++) {
      useSoftieStore.getState().addNotification(makeNotification({ id: `n${i}` }));
    }
    const ids = useSoftieStore.getState().notifications.map((n) => n.id);
    expect(ids).toContain("n1");
    expect(ids).toContain("n50");
    expect(ids).not.toContain("n0");
  });
});

describe("markNotificationRead", () => {
  it("sets read=true for the matching notification", () => {
    useSoftieStore.getState().addNotification(makeNotification({ id: "r1", read: false }));
    useSoftieStore.getState().markNotificationRead("r1");
    const n = useSoftieStore.getState().notifications.find((n) => n.id === "r1");
    expect(n?.read).toBe(true);
  });

  it("does not affect other notifications", () => {
    useSoftieStore.getState().addNotification(makeNotification({ id: "r1", read: false }));
    useSoftieStore.getState().addNotification(makeNotification({ id: "r2", read: false }));
    useSoftieStore.getState().markNotificationRead("r1");
    const r2 = useSoftieStore.getState().notifications.find((n) => n.id === "r2");
    expect(r2?.read).toBe(false);
  });

  it("is idempotent — marking already-read notification stays read", () => {
    useSoftieStore.getState().addNotification(makeNotification({ id: "r1", read: true }));
    useSoftieStore.getState().markNotificationRead("r1");
    expect(useSoftieStore.getState().notifications[0].read).toBe(true);
  });

  it("does nothing when id does not exist", () => {
    useSoftieStore.getState().addNotification(makeNotification({ id: "r1", read: false }));
    useSoftieStore.getState().markNotificationRead("nonexistent");
    expect(useSoftieStore.getState().notifications[0].read).toBe(false);
  });
});

describe("markAllNotificationsRead", () => {
  it("marks all notifications as read", () => {
    useSoftieStore.getState().addNotification(makeNotification({ id: "a1", read: false }));
    useSoftieStore.getState().addNotification(makeNotification({ id: "a2", read: false }));
    useSoftieStore.getState().addNotification(makeNotification({ id: "a3", read: false }));
    useSoftieStore.getState().markAllNotificationsRead();
    const { notifications } = useSoftieStore.getState();
    expect(notifications.every((n) => n.read)).toBe(true);
  });

  it("works when some are already read", () => {
    useSoftieStore.getState().addNotification(makeNotification({ id: "a1", read: true }));
    useSoftieStore.getState().addNotification(makeNotification({ id: "a2", read: false }));
    useSoftieStore.getState().markAllNotificationsRead();
    expect(useSoftieStore.getState().notifications.every((n) => n.read)).toBe(true);
  });

  it("works on empty array without error", () => {
    expect(() => useSoftieStore.getState().markAllNotificationsRead()).not.toThrow();
    expect(useSoftieStore.getState().notifications).toHaveLength(0);
  });

  it("preserves all other notification fields", () => {
    const original = makeNotification({ id: "a1", title: "Keep me", severity: "error" });
    useSoftieStore.getState().addNotification(original);
    useSoftieStore.getState().markAllNotificationsRead();
    const updated = useSoftieStore.getState().notifications[0];
    expect(updated.id).toBe(original.id);
    expect(updated.title).toBe(original.title);
    expect(updated.severity).toBe(original.severity);
    expect(updated.read).toBe(true);
  });
});

describe("dismissNotification", () => {
  it("removes notification with matching id", () => {
    useSoftieStore.getState().addNotification(makeNotification({ id: "d1" }));
    useSoftieStore.getState().dismissNotification("d1");
    expect(useSoftieStore.getState().notifications).toHaveLength(0);
  });

  it("does not remove other notifications", () => {
    useSoftieStore.getState().addNotification(makeNotification({ id: "d1" }));
    useSoftieStore.getState().addNotification(makeNotification({ id: "d2" }));
    useSoftieStore.getState().dismissNotification("d1");
    const { notifications } = useSoftieStore.getState();
    expect(notifications).toHaveLength(1);
    expect(notifications[0].id).toBe("d2");
  });

  it("does nothing when id does not exist", () => {
    useSoftieStore.getState().addNotification(makeNotification({ id: "d1" }));
    useSoftieStore.getState().dismissNotification("nonexistent");
    expect(useSoftieStore.getState().notifications).toHaveLength(1);
  });

  it("can dismiss from any position in the array", () => {
    useSoftieStore.getState().addNotification(makeNotification({ id: "first" }));
    useSoftieStore.getState().addNotification(makeNotification({ id: "middle" }));
    useSoftieStore.getState().addNotification(makeNotification({ id: "last" }));
    // array is [last, middle, first] due to prepend
    useSoftieStore.getState().dismissNotification("middle");
    const ids = useSoftieStore.getState().notifications.map((n) => n.id);
    expect(ids).toEqual(["last", "first"]);
  });
});
