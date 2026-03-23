import { EditorArea } from "../components/EditorArea.tsx";
import { ContextPanel } from "../components/ContextPanel.tsx";
import { Sidebar } from "../components/Sidebar.tsx";
import { useSoftieStore } from "../store/index.ts";

interface IDEViewProps {
  send: (msg: Record<string, unknown>) => void;
}

export function IDEView({ send }: IDEViewProps) {
  const { contextPanelOpen } = useSoftieStore();

  return (
    <div className={`ide-view ${contextPanelOpen ? "with-context" : ""}`}>
      <Sidebar />
      <EditorArea send={send} />
      {contextPanelOpen && <ContextPanel />}
    </div>
  );
}
