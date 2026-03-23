// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useSoftieStore } from "../../store/index.ts";
import { NotificationDropdown } from "../NotificationDropdown.tsx";
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
  useSoftieStore.setState({ notifications: [], activeView: "dashboard", selectedItem: null });
});

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------
describe("NotificationDropdown — empty state", () => {
  it("shows 'No notifications' when the store has no notifications", () => {
    render(<NotificationDropdown onClose={vi.fn()} />);
    expect(screen.getByText("No notifications")).not.toBeNull();
  });

  it("does not render any notification items when store is empty", () => {
    render(<NotificationDropdown onClose={vi.fn()} />);
    const items = document.querySelectorAll(".notification-item");
    expect(items).toHaveLength(0);
  });

  it("'Mark all read' button is disabled when there are no notifications", () => {
    render(<NotificationDropdown onClose={vi.fn()} />);
    const button = screen.getByText("Mark all read") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Renders notification items
// ---------------------------------------------------------------------------
describe("NotificationDropdown — renders notification items", () => {
  it("renders a single notification item with its title", () => {
    useSoftieStore.setState({
      notifications: [makeNotification({ id: "n1", title: "Phase completed" })],
    });
    render(<NotificationDropdown onClose={vi.fn()} />);
    expect(screen.getByText("Phase completed")).not.toBeNull();
  });

  it("renders all notification items in the store", () => {
    useSoftieStore.setState({
      notifications: [
        makeNotification({ id: "n1", title: "First notification" }),
        makeNotification({ id: "n2", title: "Second notification" }),
        makeNotification({ id: "n3", title: "Third notification" }),
      ],
    });
    render(<NotificationDropdown onClose={vi.fn()} />);
    const items = document.querySelectorAll(".notification-item");
    expect(items).toHaveLength(3);
  });

  it("renders notification title and description when description is present", () => {
    useSoftieStore.setState({
      notifications: [
        makeNotification({ id: "n1", title: "Task done", description: "task-abc-123" }),
      ],
    });
    render(<NotificationDropdown onClose={vi.fn()} />);
    expect(screen.getByText("Task done")).not.toBeNull();
    expect(screen.getByText("task-abc-123")).not.toBeNull();
  });

  it("renders notification without description when description is absent", () => {
    useSoftieStore.setState({
      notifications: [makeNotification({ id: "n1", title: "Phase failed" })],
    });
    render(<NotificationDropdown onClose={vi.fn()} />);
    const descElements = document.querySelectorAll(".notification-item-desc");
    expect(descElements).toHaveLength(0);
  });

  it("applies 'unread' CSS class to unread notification items", () => {
    useSoftieStore.setState({
      notifications: [makeNotification({ id: "n1", read: false })],
    });
    render(<NotificationDropdown onClose={vi.fn()} />);
    const item = document.querySelector(".notification-item");
    expect(item?.className).toContain("unread");
    // "unread" must be present as a class; "read" must NOT appear as a standalone word
    expect(item?.className).not.toMatch(/\bread\b/);
  });

  it("applies 'read' CSS class to read notification items", () => {
    useSoftieStore.setState({
      notifications: [makeNotification({ id: "n1", read: true })],
    });
    render(<NotificationDropdown onClose={vi.fn()} />);
    const item = document.querySelector(".notification-item");
    expect(item?.className).toContain("read");
    expect(item?.className).not.toContain("unread");
  });

  it("applies severity CSS class to notification items", () => {
    useSoftieStore.setState({
      notifications: [makeNotification({ id: "n1", severity: "error" })],
    });
    render(<NotificationDropdown onClose={vi.fn()} />);
    const item = document.querySelector(".notification-item");
    expect(item?.className).toContain("severity-error");
  });

  it("does not show 'No notifications' when items are present", () => {
    useSoftieStore.setState({
      notifications: [makeNotification({ id: "n1" })],
    });
    render(<NotificationDropdown onClose={vi.fn()} />);
    expect(screen.queryByText("No notifications")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Click marks notification as read
// ---------------------------------------------------------------------------
describe("NotificationDropdown — click marks notification as read", () => {
  it("marks a notification as read when its item is clicked", () => {
    useSoftieStore.setState({
      notifications: [makeNotification({ id: "n1", title: "Click me", read: false })],
    });
    render(<NotificationDropdown onClose={vi.fn()} />);
    const item = document.querySelector(".notification-item") as HTMLElement;
    fireEvent.click(item);
    const { notifications } = useSoftieStore.getState();
    expect(notifications[0].read).toBe(true);
  });

  it("marks only the clicked notification as read, leaving others unread", () => {
    useSoftieStore.setState({
      notifications: [
        makeNotification({ id: "n1", title: "First", read: false }),
        makeNotification({ id: "n2", title: "Second", read: false }),
      ],
    });
    render(<NotificationDropdown onClose={vi.fn()} />);
    const items = document.querySelectorAll(".notification-item");
    fireEvent.click(items[0]);
    const { notifications } = useSoftieStore.getState();
    const n1 = notifications.find((n) => n.id === "n1");
    const n2 = notifications.find((n) => n.id === "n2");
    expect(n1?.read).toBe(true);
    expect(n2?.read).toBe(false);
  });

  it("calls onClose after clicking a notification item", () => {
    useSoftieStore.setState({
      notifications: [makeNotification({ id: "n1", title: "Click me", read: false })],
    });
    const onClose = vi.fn();
    render(<NotificationDropdown onClose={onClose} />);
    const item = document.querySelector(".notification-item") as HTMLElement;
    fireEvent.click(item);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("navigates to the action viewId when notification has an action", () => {
    useSoftieStore.setState({
      notifications: [
        makeNotification({
          id: "n1",
          title: "Go to board",
          action: { viewId: "board" },
        }),
      ],
    });
    render(<NotificationDropdown onClose={vi.fn()} />);
    const item = document.querySelector(".notification-item") as HTMLElement;
    fireEvent.click(item);
    const { activeView } = useSoftieStore.getState();
    expect(activeView).toBe("board");
  });

  it("selects item in store when action has itemId and itemType=task", () => {
    useSoftieStore.setState({
      notifications: [
        makeNotification({
          id: "n1",
          title: "Task ready",
          action: { viewId: "board", itemId: "task-42", itemType: "task" },
        }),
      ],
    });
    render(<NotificationDropdown onClose={vi.fn()} />);
    const item = document.querySelector(".notification-item") as HTMLElement;
    fireEvent.click(item);
    const { selectedItem } = useSoftieStore.getState();
    expect(selectedItem).toEqual({ type: "task", id: "task-42" });
  });

  it("marks notification as read via Enter key press on item", () => {
    useSoftieStore.setState({
      notifications: [makeNotification({ id: "n1", title: "Enter key test", read: false })],
    });
    render(<NotificationDropdown onClose={vi.fn()} />);
    const item = document.querySelector(".notification-item") as HTMLElement;
    fireEvent.keyDown(item, { key: "Enter" });
    const { notifications } = useSoftieStore.getState();
    expect(notifications[0].read).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Mark all read button
// ---------------------------------------------------------------------------
describe("NotificationDropdown — 'Mark all read' button", () => {
  it("marks all notifications as read when button is clicked", () => {
    useSoftieStore.setState({
      notifications: [
        makeNotification({ id: "n1", read: false }),
        makeNotification({ id: "n2", read: false }),
        makeNotification({ id: "n3", read: false }),
      ],
    });
    render(<NotificationDropdown onClose={vi.fn()} />);
    const button = screen.getByText("Mark all read");
    fireEvent.click(button);
    const { notifications } = useSoftieStore.getState();
    expect(notifications.every((n) => n.read)).toBe(true);
  });

  it("marks remaining unread notifications when some are already read", () => {
    useSoftieStore.setState({
      notifications: [
        makeNotification({ id: "n1", read: true }),
        makeNotification({ id: "n2", read: false }),
      ],
    });
    render(<NotificationDropdown onClose={vi.fn()} />);
    const button = screen.getByText("Mark all read");
    fireEvent.click(button);
    const { notifications } = useSoftieStore.getState();
    expect(notifications.every((n) => n.read)).toBe(true);
  });

  it("'Mark all read' button is enabled when there are unread notifications", () => {
    useSoftieStore.setState({
      notifications: [makeNotification({ id: "n1", read: false })],
    });
    render(<NotificationDropdown onClose={vi.fn()} />);
    const button = screen.getByText("Mark all read") as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });

  it("'Mark all read' button is disabled when all notifications are already read", () => {
    useSoftieStore.setState({
      notifications: [makeNotification({ id: "n1", read: true })],
    });
    render(<NotificationDropdown onClose={vi.fn()} />);
    const button = screen.getByText("Mark all read") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Click outside closes dropdown
// ---------------------------------------------------------------------------
describe("NotificationDropdown — click outside closes dropdown", () => {
  it("calls onClose when mousedown fires outside the dropdown container", () => {
    const onClose = vi.fn();
    render(<NotificationDropdown onClose={onClose} />);
    // Create an element outside and fire mousedown on it
    const outside = document.createElement("div");
    document.body.appendChild(outside);
    fireEvent.mouseDown(outside);
    expect(onClose).toHaveBeenCalledOnce();
    document.body.removeChild(outside);
  });

  it("does NOT call onClose when mousedown fires inside the dropdown container", () => {
    useSoftieStore.setState({
      notifications: [makeNotification({ id: "n1", title: "Inner" })],
    });
    const onClose = vi.fn();
    render(<NotificationDropdown onClose={onClose} />);
    const dropdown = document.querySelector(".notification-dropdown") as HTMLElement;
    fireEvent.mouseDown(dropdown);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("does NOT call onClose when mousedown fires on a notification item inside dropdown", () => {
    useSoftieStore.setState({
      notifications: [makeNotification({ id: "n1", title: "Inner item" })],
    });
    const onClose = vi.fn();
    render(<NotificationDropdown onClose={onClose} />);
    const item = document.querySelector(".notification-item") as HTMLElement;
    fireEvent.mouseDown(item);
    expect(onClose).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Keyboard: Escape closes dropdown
// ---------------------------------------------------------------------------
describe("NotificationDropdown — Escape key closes dropdown", () => {
  it("calls onClose when Escape is pressed inside the dropdown", () => {
    const onClose = vi.fn();
    render(<NotificationDropdown onClose={onClose} />);
    const dropdown = document.querySelector(".notification-dropdown") as HTMLElement;
    fireEvent.keyDown(dropdown, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
