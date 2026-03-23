import { useEffect, useRef } from "react";
import { useSoftieStore } from "../store/index.ts";
import { formatRelativeTime } from "../utils.ts";
import type { AppNotification, NotificationSeverity } from "../notifications/types.ts";

interface Props {
  onClose: () => void;
}

const SEVERITY_ICON: Record<NotificationSeverity, string> = {
  success: "✓",
  error: "✕",
  warning: "⚠",
  info: "●",
};

function NotificationItem({
  notification,
  onNavigate,
}: {
  notification: AppNotification;
  onNavigate: (n: AppNotification) => void;
}) {
  return (
    <div
      className={`notification-item ${notification.read ? "read" : "unread"} severity-${notification.severity}`}
      onClick={() => onNavigate(notification)}
      role="menuitem"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onNavigate(notification)}
    >
      <span className="notification-icon" aria-label={notification.severity}>
        {SEVERITY_ICON[notification.severity]}
      </span>
      <div className="notification-item-body">
        <div className="notification-item-title">{notification.title}</div>
        {notification.description && (
          <div className="notification-item-desc">{notification.description}</div>
        )}
      </div>
      <span className="notification-time">{formatRelativeTime(notification.timestamp)}</span>
    </div>
  );
}

export function NotificationDropdown({ onClose }: Props) {
  const { notifications, markNotificationRead, markAllNotificationsRead, setActiveView, setSelectedItem } =
    useSoftieStore();

  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  // Focus trap: initial focus + Tab cycling + Escape to close
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    function getFocusable(): HTMLElement[] {
      return Array.from(
        el!.querySelectorAll<HTMLElement>('[role="menuitem"], button:not([disabled])')
      );
    }

    getFocusable()[0]?.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "Tab") {
        const focusable = getFocusable();
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    }

    el.addEventListener("keydown", handleKeyDown);
    return () => el.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  function handleNavigate(notification: AppNotification) {
    markNotificationRead(notification.id);
    if (notification.action) {
      setActiveView(notification.action.viewId);
      const { itemId, itemType } = notification.action;
      if (itemId && (itemType === "task" || itemType === "phase")) {
        setSelectedItem({ type: itemType, id: itemId });
      }
    }
    onClose();
  }

  return (
    <div className="notification-dropdown" ref={ref} role="menu" aria-label="Notifications">
      <div className="notification-header">
        <span className="notification-header-title">Notifications</span>
        <button
          className="notification-mark-all"
          onClick={markAllNotificationsRead}
          disabled={notifications.every((n) => n.read)}
        >
          Mark all read
        </button>
      </div>

      {notifications.length === 0 ? (
        <div className="notification-empty">No notifications</div>
      ) : (
        <div className="notification-list">
          {notifications.map((n) => (
            <NotificationItem key={n.id} notification={n} onNavigate={handleNavigate} />
          ))}
        </div>
      )}
    </div>
  );
}
