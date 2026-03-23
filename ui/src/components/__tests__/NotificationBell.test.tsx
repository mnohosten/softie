// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useSoftieStore } from "../../store/index.ts";
import { NotificationBell } from "../NotificationBell.tsx";
import type { AppNotification } from "../../notifications/types.ts";

function makeNotification(overrides: Partial<AppNotification> = {}): AppNotification {
  return {
    id: "n1",
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

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// Badge visibility
// ---------------------------------------------------------------------------
describe("NotificationBell — badge hidden when 0 unread", () => {
  it("hides badge when there are no notifications at all", () => {
    render(<NotificationBell />);
    const badge = document.querySelector(".notification-badge");
    expect(badge).toBeNull();
  });

  it("hides badge when all notifications are read", () => {
    useSoftieStore.setState({
      notifications: [
        makeNotification({ id: "n1", read: true }),
        makeNotification({ id: "n2", read: true }),
      ],
    });
    render(<NotificationBell />);
    const badge = document.querySelector(".notification-badge");
    expect(badge).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Badge count
// ---------------------------------------------------------------------------
describe("NotificationBell — badge shows correct count", () => {
  it("shows badge count of 1 with a single unread notification", () => {
    useSoftieStore.setState({
      notifications: [makeNotification({ id: "n1", read: false })],
    });
    render(<NotificationBell />);
    const badge = document.querySelector(".notification-badge");
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toBe("1");
  });

  it("shows badge count of 3 with three unread notifications", () => {
    useSoftieStore.setState({
      notifications: [
        makeNotification({ id: "n1", read: false }),
        makeNotification({ id: "n2", read: false }),
        makeNotification({ id: "n3", read: false }),
      ],
    });
    render(<NotificationBell />);
    const badge = document.querySelector(".notification-badge");
    expect(badge?.textContent).toBe("3");
  });

  it("only counts unread notifications (ignores read ones)", () => {
    useSoftieStore.setState({
      notifications: [
        makeNotification({ id: "n1", read: false }),
        makeNotification({ id: "n2", read: true }),
        makeNotification({ id: "n3", read: false }),
      ],
    });
    render(<NotificationBell />);
    const badge = document.querySelector(".notification-badge");
    expect(badge?.textContent).toBe("2");
  });

  it("shows badge count of 99 when exactly 99 are unread", () => {
    useSoftieStore.setState({
      notifications: Array.from({ length: 99 }, (_, i) =>
        makeNotification({ id: `n${i}`, read: false })
      ),
    });
    render(<NotificationBell />);
    const badge = document.querySelector(".notification-badge");
    expect(badge?.textContent).toBe("99");
  });

  it("shows '99+' when more than 99 notifications are unread", () => {
    useSoftieStore.setState({
      notifications: Array.from({ length: 100 }, (_, i) =>
        makeNotification({ id: `n${i}`, read: false })
      ),
    });
    render(<NotificationBell />);
    const badge = document.querySelector(".notification-badge");
    expect(badge?.textContent).toBe("99+");
  });
});

// ---------------------------------------------------------------------------
// Badge color (severity priority: error > warning > info)
// ---------------------------------------------------------------------------
describe("NotificationBell — badge color reflects highest severity", () => {
  it("shows red badge (no .warning/.info class) when any unread notification is error severity", () => {
    useSoftieStore.setState({
      notifications: [makeNotification({ id: "n1", severity: "error", read: false })],
    });
    render(<NotificationBell />);
    const badge = document.querySelector(".notification-badge");
    expect(badge).not.toBeNull();
    expect(badge?.className).not.toContain("warning");
    expect(badge?.className).not.toContain("info");
  });

  it("error severity takes priority over warning (red badge)", () => {
    useSoftieStore.setState({
      notifications: [
        makeNotification({ id: "n1", severity: "error", read: false }),
        makeNotification({ id: "n2", severity: "warning", read: false }),
      ],
    });
    render(<NotificationBell />);
    const badge = document.querySelector(".notification-badge");
    expect(badge?.className).not.toContain("warning");
    expect(badge?.className).not.toContain("info");
  });

  it("error severity takes priority over info (red badge)", () => {
    useSoftieStore.setState({
      notifications: [
        makeNotification({ id: "n1", severity: "error", read: false }),
        makeNotification({ id: "n2", severity: "info", read: false }),
      ],
    });
    render(<NotificationBell />);
    const badge = document.querySelector(".notification-badge");
    expect(badge?.className).not.toContain("warning");
    expect(badge?.className).not.toContain("info");
  });

  it("shows yellow badge (.warning class) when highest unread severity is warning", () => {
    useSoftieStore.setState({
      notifications: [
        makeNotification({ id: "n1", severity: "warning", read: false }),
        makeNotification({ id: "n2", severity: "info", read: false }),
      ],
    });
    render(<NotificationBell />);
    const badge = document.querySelector(".notification-badge");
    expect(badge?.className).toContain("warning");
    expect(badge?.className).not.toContain("info");
  });

  it("shows yellow badge (.warning class) when only warning notifications are unread", () => {
    useSoftieStore.setState({
      notifications: [makeNotification({ id: "n1", severity: "warning", read: false })],
    });
    render(<NotificationBell />);
    const badge = document.querySelector(".notification-badge");
    expect(badge?.className).toContain("warning");
  });

  it("shows blue badge (.info class) when all unread notifications are info severity", () => {
    useSoftieStore.setState({
      notifications: [
        makeNotification({ id: "n1", severity: "info", read: false }),
        makeNotification({ id: "n2", severity: "info", read: false }),
      ],
    });
    render(<NotificationBell />);
    const badge = document.querySelector(".notification-badge");
    expect(badge?.className).toContain("info");
    expect(badge?.className).not.toContain("warning");
  });

  it("shows blue badge (.info class) when all unread notifications are success severity", () => {
    useSoftieStore.setState({
      notifications: [makeNotification({ id: "n1", severity: "success", read: false })],
    });
    render(<NotificationBell />);
    const badge = document.querySelector(".notification-badge");
    expect(badge?.className).toContain("info");
  });

  it("ignores read error notifications for badge color — shows info when only error is read", () => {
    useSoftieStore.setState({
      notifications: [
        makeNotification({ id: "n1", severity: "error", read: true }),
        makeNotification({ id: "n2", severity: "info", read: false }),
      ],
    });
    render(<NotificationBell />);
    const badge = document.querySelector(".notification-badge");
    expect(badge?.className).toContain("info");
    expect(badge?.className).not.toContain("warning");
  });

  it("ignores read warning notifications for badge color — shows info when only warning is read", () => {
    useSoftieStore.setState({
      notifications: [
        makeNotification({ id: "n1", severity: "warning", read: true }),
        makeNotification({ id: "n2", severity: "info", read: false }),
      ],
    });
    render(<NotificationBell />);
    const badge = document.querySelector(".notification-badge");
    expect(badge?.className).toContain("info");
  });
});

// ---------------------------------------------------------------------------
// Dropdown toggle and ARIA attributes
// ---------------------------------------------------------------------------
describe("NotificationBell — dropdown toggle", () => {
  it("does not render dropdown initially", () => {
    render(<NotificationBell />);
    const dropdown = document.querySelector(".notification-dropdown");
    expect(dropdown).toBeNull();
  });

  it("renders dropdown after clicking the bell button", async () => {
    const user = userEvent.setup();
    render(<NotificationBell />);
    const bell = screen.getByRole("button", { name: /notifications/i });
    await user.click(bell);
    const dropdown = document.querySelector(".notification-dropdown");
    expect(dropdown).not.toBeNull();
  });

  it("bell button has aria-expanded=false initially", () => {
    render(<NotificationBell />);
    const bell = screen.getByRole("button", { name: /notifications/i });
    expect(bell.getAttribute("aria-expanded")).toBe("false");
  });

  it("bell button has aria-expanded=true after opening dropdown", async () => {
    const user = userEvent.setup();
    render(<NotificationBell />);
    const bell = screen.getByRole("button", { name: /notifications/i });
    await user.click(bell);
    expect(bell.getAttribute("aria-expanded")).toBe("true");
  });

  it("aria-label includes unread count when there are unread notifications", () => {
    useSoftieStore.setState({
      notifications: [makeNotification({ id: "n1", read: false })],
    });
    render(<NotificationBell />);
    const bell = screen.getByRole("button");
    expect(bell.getAttribute("aria-label")).toContain("1 unread");
  });

  it("aria-label is plain 'Notifications' when there are no unread", () => {
    render(<NotificationBell />);
    const bell = screen.getByRole("button");
    expect(bell.getAttribute("aria-label")).toBe("Notifications");
  });
});
