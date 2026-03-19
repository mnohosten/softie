import { useEffect, useRef } from "react";
import { useSoftieStore } from "../store/index.ts";
import type { Activity } from "../types.ts";

function EmptyState() {
  return (
    <div className="live-log-empty">
      <span className="live-log-empty-icon">◉</span>
      <span>Waiting for activity…</span>
    </div>
  );
}

function LogEntry({ activity }: { activity: Activity }) {
  const { type, message, meta } = activity;

  if (type === "sdk:text") {
    const agentId = (meta?.agentId as string) || (meta?.agent as string) || "meta-orchestrator";
    const text = (meta?.text as string) || message;
    return (
      <div className="log-entry-text">
        <div className="log-entry-text-header">{agentId}</div>
        <div className="log-entry-text-body">{text}</div>
      </div>
    );
  }

  if (type === "sdk:tool") {
    const toolName = (meta?.toolName as string) || (meta?.tool as string) || "";
    const input = meta?.input as Record<string, unknown> | undefined;
    let summary = "";
    if (input) {
      const firstVal = Object.values(input)[0];
      if (typeof firstVal === "string") summary = firstVal.slice(0, 60);
    }
    return (
      <div className="log-entry-tool">
        <span>🔧</span>
        <span style={{ color: "var(--text-1)" }}>{toolName || message}</span>
        {summary && <span style={{ color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>— {summary}</span>}
      </div>
    );
  }

  if (type === "phase:started") {
    const phaseName = (meta?.phaseName as string) || (meta?.name as string) || message;
    return (
      <div className="log-entry-phase">▶ {phaseName}</div>
    );
  }

  if (type === "phase:completed") {
    const cost = meta?.cost as number | undefined;
    return (
      <div className="log-entry-phase-done">
        ✓ {(meta?.phaseName as string) || message}
        {cost != null && <span style={{ marginLeft: 8, color: "var(--text-muted)" }}>${cost.toFixed(4)}</span>}
      </div>
    );
  }

  if (type === "phase:failed") {
    return (
      <div className="log-entry-phase-failed">✗ {(meta?.phaseName as string) || message}</div>
    );
  }

  if (type === "parallel:launch") {
    const agents = meta?.agents as string[] | undefined;
    return (
      <div className="log-entry-tool">
        <span>⟁</span>
        <span>{message}{agents?.length ? ` — ${agents.join(", ")}` : ""}</span>
      </div>
    );
  }

  if (type === "project:status") {
    return (
      <div className="log-entry-phase" style={{ color: "var(--text-2)", textTransform: "none", letterSpacing: 0, fontWeight: 600 }}>
        ◉ {message}
      </div>
    );
  }

  // agent:activity and everything else
  return (
    <div className="log-entry-generic">
      <span style={{ color: "var(--text-muted)", marginRight: 6 }}>·</span>
      {message}
    </div>
  );
}

export function LiveLogPanel() {
  const { activities, isRunning, metadata } = useSoftieStore();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activities.length]);

  // activities are stored newest-first; reverse for chat-style (newest at bottom)
  const ordered = [...activities].reverse();

  return (
    <div className="live-log-panel">
      <div className="live-log-header">
        <span className="live-log-title">{metadata?.name ?? "Softie"}</span>
        {isRunning && <span className="live-log-badge-running">● Running</span>}
      </div>
      <div className="live-log-stream">
        {ordered.length === 0 ? (
          <EmptyState />
        ) : (
          ordered.map((a) => <LogEntry key={a.id} activity={a} />)
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
