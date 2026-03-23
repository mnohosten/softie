export function randomId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function formatCost(usd: number): string {
  if (usd < 0.01) return `$${(usd * 100).toFixed(2)}¢`;
  return `$${usd.toFixed(4)}`;
}

export function formatTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return isoString;
  }
}

export function timeAgo(isoString: string): string {
  const d = new Date(isoString);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export function formatRelativeTime(timestamp: string): string {
  const d = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "yesterday";
  return d.toISOString().slice(0, 10);
}

export function shortenPath(path: string): string {
  const parts = path.split("/");
  if (parts.length <= 3) return path;
  return "…/" + parts.slice(-2).join("/");
}

export function statusColor(status: string): string {
  switch (status) {
    case "completed":
    case "approved":
      return "var(--green)";
    case "active":
    case "in-progress":
      return "var(--blue)";
    case "failed":
    case "rejected":
      return "var(--red)";
    case "pending-review":
      return "var(--yellow)";
    case "draft":
    case "pending":
    default:
      return "var(--text-muted)";
  }
}

export function statusIcon(status: string): string {
  switch (status) {
    case "completed":
    case "approved":
      return "✓";
    case "active":
    case "in-progress":
      return "▶";
    case "failed":
    case "rejected":
      return "✗";
    case "pending-review":
      return "○";
    default:
      return "·";
  }
}
