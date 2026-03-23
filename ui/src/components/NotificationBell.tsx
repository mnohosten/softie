import { useRef, useState } from "react";
import { useSoftieStore } from "../store/index.ts";
import { NotificationDropdown } from "./NotificationDropdown.tsx";

function useBadgeInfo() {
  // Selectors must return primitives to avoid infinite loop in React 18 useSyncExternalStore
  const count = useSoftieStore((state) => state.notifications.filter((n) => !n.read).length);
  const variant = useSoftieStore((state) => {
    const unread = state.notifications.filter((n) => !n.read);
    if (unread.some((n) => n.severity === "error")) return "error" as const;
    if (unread.some((n) => n.severity === "warning")) return "warning" as const;
    return "info" as const;
  });
  return { count, variant };
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { count, variant } = useBadgeInfo();
  const bellRef = useRef<HTMLButtonElement>(null);

  function handleClose() {
    setOpen(false);
    bellRef.current?.focus();
  }

  return (
    <div className="notification-bell-wrapper">
      <button
        ref={bellRef}
        className="notification-bell"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notifications${count > 0 ? `, ${count} unread` : ""}`}
        aria-expanded={open}
        aria-haspopup="menu"
        title="Notifications"
      >
        🔔
        {count > 0 && (
          <span
            className={`notification-badge ${variant === "warning" ? "warning" : variant === "info" ? "info" : ""}`}
            aria-live="polite"
            aria-atomic="true"
          >
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && <NotificationDropdown onClose={handleClose} />}
    </div>
  );
}
