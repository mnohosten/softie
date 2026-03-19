import { useSoftieStore } from "../store/index.ts";

export function ActivityFeed() {
  const { isRunning, currentActivity } = useSoftieStore();

  return (
    <div className="activity-feed">
      <span className="activity-label">
        {isRunning ? <span className="activity-pulse-dot" /> : <span className="activity-idle-dot" />}
      </span>
      <span className="activity-current">
        {currentActivity
          ? currentActivity.message
          : <span style={{ color: "var(--text-muted)" }}>Idle</span>}
      </span>
    </div>
  );
}
