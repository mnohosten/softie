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
