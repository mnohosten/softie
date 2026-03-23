import { useEffect, useRef } from "react";
import { Toolbar } from "./components/Toolbar.tsx";
import { ActivityFeed } from "./components/ActivityFeed.tsx";
import { NewProject } from "./components/NewProject.tsx";
import { useWebSocket } from "./hooks/useWebSocket.ts";
import { useSoftieStore } from "./store/index.ts";
import { DashboardView } from "./views/DashboardView.tsx";
import { SpecsView } from "./views/SpecsView.tsx";
import { BoardView } from "./views/BoardView.tsx";
import { IDEView } from "./views/IDEView.tsx";
import { DesignView } from "./views/DesignView.tsx";

function ViewRouter({ send }: { send: (msg: Record<string, unknown>) => void }) {
  const { activeView } = useSoftieStore();

  switch (activeView) {
    case "dashboard":
      return <DashboardView />;
    case "specs":
      return <SpecsView />;
    case "board":
      return <BoardView />;
    case "ide":
      return <IDEView send={send} />;
    case "design":
      return <DesignView />;
    default:
      return <DashboardView />;
  }
}

export function App() {
  const { sidebarWidth, contextPanelWidth, projectExists, metadata, setActiveView } = useSoftieStore();
  const prevStatus = useRef<string | null>(null);

  // Initialize WebSocket + load initial state
  const { send, loadProjectState } = useWebSocket();

  // Apply CSS variables for panel widths
  useEffect(() => {
    document.documentElement.style.setProperty("--sidebar-width", `${sidebarWidth}px`);
    document.documentElement.style.setProperty("--context-width", `${contextPanelWidth}px`);
  }, [sidebarWidth, contextPanelWidth]);

  // Auto-navigate to the right view when project status changes
  useEffect(() => {
    const status = metadata?.status;
    if (!status || status === prevStatus.current) return;
    prevStatus.current = status;

    switch (status) {
      case "spec-review":
        setActiveView("specs");
        break;
      case "ready":
        setActiveView("board");
        break;
      case "executing":
        setActiveView("ide");
        break;
      case "completed":
      case "failed":
      case "paused":
        setActiveView("dashboard");
        break;
    }
  }, [metadata?.status, setActiveView]);

  return (
    <div className="layout">
      <Toolbar />

      {!projectExists ? (
        <NewProject onStarted={loadProjectState} />
      ) : (
        <div className="main-area">
          <ViewRouter send={send} />
        </div>
      )}

      <ActivityFeed />
    </div>
  );
}
