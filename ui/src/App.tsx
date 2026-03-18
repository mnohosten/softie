import { useEffect } from "react";
import { Toolbar } from "./components/Toolbar.tsx";
import { Sidebar } from "./components/Sidebar.tsx";
import { EditorArea } from "./components/EditorArea.tsx";
import { ContextPanel } from "./components/ContextPanel.tsx";
import { ActivityFeed } from "./components/ActivityFeed.tsx";
import { NewProject } from "./components/NewProject.tsx";
import { useWebSocket } from "./hooks/useWebSocket.ts";
import { useSoftieStore } from "./store/index.ts";

export function App() {
  const { contextPanelOpen, sidebarWidth, contextPanelWidth, projectExists } = useSoftieStore();

  // Initialize WebSocket + load initial state
  const { send, loadProjectState } = useWebSocket();

  // Apply CSS variables for panel widths
  useEffect(() => {
    document.documentElement.style.setProperty("--sidebar-width", `${sidebarWidth}px`);
    document.documentElement.style.setProperty("--context-width", `${contextPanelWidth}px`);
  }, [sidebarWidth, contextPanelWidth]);

  return (
    <div className="layout">
      {/* Toolbar */}
      <Toolbar />

      {/* Main area */}
      {!projectExists ? (
        <NewProject onStarted={loadProjectState} />
      ) : (
        <div className={`main-area ${contextPanelOpen ? "with-context" : ""}`}>
          <Sidebar />
          <EditorArea send={send} />
          {contextPanelOpen && <ContextPanel />}
        </div>
      )}

      {/* Activity feed */}
      <ActivityFeed />
    </div>
  );
}
