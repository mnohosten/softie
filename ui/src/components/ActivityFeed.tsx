import { useEffect, useRef, useState } from "react";
import { useSoftieStore } from "../store/index.ts";
import { formatTime } from "../utils.ts";

const TYPE_ICONS: Record<string, string> = {
  "agent:activity": "🤖",
  "phase:started": "▶",
  "phase:completed": "✓",
  "phase:failed": "✗",
  "parallel:launch": "⟁",
  "file:changed": "📝",
  "cost:update": "$",
  "project:status": "◉",
  "sdk:tool": "🔧",
};

export function ActivityFeed() {
  const { activities, isRunning, currentActivity } = useSoftieStore();
  const [logOpen, setLogOpen] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to top (newest) when new activity arrives
  useEffect(() => {
    if (logOpen && logRef.current) {
      logRef.current.scrollTop = 0;
    }
  }, [activities.length, logOpen]);

  return (
    <div className="activity-feed-wrapper">
      {/* Log panel — slides up above the bottom bar */}
      {logOpen && (
        <div className="log-panel" ref={logRef}>
          {activities.length === 0 ? (
            <div className="log-empty">Waiting for events...</div>
          ) : (
            activities.map((activity) => (
              <div key={activity.id} className="log-entry">
                <span className="log-entry-icon">
                  {TYPE_ICONS[activity.type] || "·"}
                </span>
                <span className="log-entry-msg">{activity.message}</span>
                <span className="log-entry-time">{formatTime(activity.timestamp)}</span>
              </div>
            ))
          )}
        </div>
      )}

      {/* Bottom bar */}
      <div className="activity-feed">
        <span className="activity-label">
          {isRunning && <span className="activity-pulse-dot" />}
          {!isRunning && <span className="activity-idle-dot" />}
        </span>
        <span className="activity-current">
          {currentActivity
            ? currentActivity.message
            : <span style={{ color: "var(--text-muted)" }}>Waiting for events...</span>}
        </span>
        <button
          className={`activity-log-btn ${logOpen ? "active" : ""}`}
          onClick={() => setLogOpen((o) => !o)}
          title="Toggle activity log"
        >
          {logOpen ? "▼ Log" : "▲ Log"}
        </button>
      </div>
    </div>
  );
}
