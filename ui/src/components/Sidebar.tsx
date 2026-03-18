import { useState, useEffect } from "react";
import { useSoftieStore } from "../store/index.ts";
import { statusColor, statusIcon } from "../utils.ts";
import type { FileNode } from "../types.ts";

interface SectionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function Section({ title, children, defaultOpen = true }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="sidebar-section">
      <div
        className="sidebar-section-header"
        onClick={() => setOpen(!open)}
      >
        <span className={`sidebar-collapse-icon ${open ? "open" : ""}`}>▶</span>
        {title}
      </div>
      {open && children}
    </div>
  );
}

export function Sidebar() {
  const {
    metadata,
    plan,
    team,
    tasks,
    selectedItem,
    setSelectedItem,
    openTab,
    isRunning,
    currentActivity,
    fileVersion,
  } = useSoftieStore();

  if (!metadata) {
    return (
      <div className="sidebar">
        <div className="empty-state" style={{ padding: "24px 12px" }}>
          <p style={{ textAlign: "center", color: "var(--text-muted)", fontSize: "11px" }}>
            No project found.
            <br />
            Run <code style={{ color: "var(--blue)" }}>softie ui</code> from a project directory.
          </p>
        </div>
      </div>
    );
  }

  const openFile = (path: string, title: string) => {
    fetch(`/api/file?path=${encodeURIComponent(path)}`)
      .then((r) => r.json())
      .then((data: { content: string; path: string }) => {
        openTab({
          type: "file",
          filePath: path,
          title,
          content: data.content,
        });
      })
      .catch(console.error);
  };

  // Truncate activity message to ~40 chars
  const liveMsg = currentActivity
    ? currentActivity.message.length > 44
      ? currentActivity.message.slice(0, 41) + "…"
      : currentActivity.message
    : null;

  return (
    <div className="sidebar">
      {/* Project info */}
      <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>PROJECT</div>
        <div
          style={{ fontSize: "12px", color: "var(--text-1)", cursor: "pointer" }}
          onClick={() => setSelectedItem({ type: "project" })}
        >
          {metadata.name || "Untitled"}
        </div>
      </div>

      {/* Live activity strip */}
      {isRunning && liveMsg && (
        <div className="sidebar-live-strip">
          <span className="sidebar-live-dot" />
          <span className="sidebar-live-msg">{liveMsg}</span>
        </div>
      )}

      {/* Plan: Phases + Tasks */}
      {plan && (
        <Section title="Plan">
          {plan.phases
            .sort((a, b) => a.order - b.order)
            .map((phase) => {
              const phaseTasks = tasks.filter((t) => t.phaseId === phase.id);
              const isSelected =
                selectedItem?.type === "phase" && selectedItem.id === phase.id;

              return (
                <div key={phase.id}>
                  <div
                    className={`sidebar-item sidebar-phase ${isSelected ? "selected" : ""}`}
                    onClick={() => setSelectedItem({ type: "phase", id: phase.id })}
                  >
                    <span
                      className="sidebar-item-icon"
                      style={{ color: statusColor(phase.status) }}
                    >
                      {statusIcon(phase.status)}
                    </span>
                    <span className="sidebar-item-label">{phase.name}</span>
                  </div>
                  {phaseTasks.map((task) => {
                    const isTaskSelected =
                      selectedItem?.type === "task" && selectedItem.id === task.id;
                    return (
                      <div
                        key={task.id}
                        className={`sidebar-item sidebar-task ${isTaskSelected ? "selected" : ""}`}
                        onClick={() => setSelectedItem({ type: "task", id: task.id })}
                      >
                        <span
                          className="sidebar-item-icon"
                          style={{ color: statusColor(task.status) }}
                        >
                          {statusIcon(task.status)}
                        </span>
                        <span className="sidebar-item-label">{task.title}</span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
        </Section>
      )}

      {/* Team Agents */}
      {team && (
        <Section title="Team">
          {team.agents.map((agent) => {
            const isSelected =
              selectedItem?.type === "agent" && selectedItem.id === agent.id;
            return (
              <div
                key={agent.id}
                className={`sidebar-item ${isSelected ? "selected" : ""}`}
                onClick={() => {
                  setSelectedItem({ type: "agent", id: agent.id });
                  openFile(`team/agents/${agent.id}.md`, agent.name);
                }}
              >
                <span className="sidebar-item-icon" style={{ color: "var(--purple)" }}>
                  ◎
                </span>
                <span className="sidebar-item-label">{agent.name}</span>
                <span className="sidebar-item-status" style={{ color: "var(--text-muted)", fontSize: "9px" }}>
                  {agent.id}
                </span>
              </div>
            );
          })}
        </Section>
      )}

      {/* Files */}
      <Section title="Files" defaultOpen={false}>
        <FileTree key={fileVersion} root="" onOpen={openFile} />
      </Section>
    </div>
  );
}

function FileTree({ root, onOpen }: { root: string; onOpen: (path: string, title: string) => void }) {
  const [nodes, setNodes] = useState<FileNode[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const { selectedItem, setSelectedItem } = useSoftieStore();

  useEffect(() => {
    setLoading(true);
    fetch(`/api/files?dir=${encodeURIComponent(root)}`)
      .then((r) => r.json())
      .then((data: { files: FileNode[] }) => {
        setNodes(data.files || []);
        setLoading(false);
      })
      .catch(() => {
        setNodes([]);
        setLoading(false);
      });
  }, [root]);

  if (loading || nodes === null) {
    return <div className="sidebar-item"><span style={{ color: "var(--text-muted)", fontSize: "11px" }}>Loading...</span></div>;
  }

  const depth = root.split("/").filter(Boolean).length;

  return (
    <>
      {nodes.map((node) => {
        const isSelected =
          selectedItem?.type === "file" && selectedItem.path === node.path;
        const isExpanded = expanded.has(node.path);
        return (
          <div key={node.path}>
            <div
              className={`sidebar-item ${isSelected ? "selected" : ""}`}
              style={{ paddingLeft: `${16 + depth * 8}px` }}
              onClick={() => {
                if (node.isDir) {
                  setExpanded((prev) => {
                    const next = new Set(prev);
                    if (next.has(node.path)) next.delete(node.path);
                    else next.add(node.path);
                    return next;
                  });
                } else {
                  setSelectedItem({ type: "file", path: node.path });
                  onOpen(node.path, node.name);
                }
              }}
            >
              <span className="sidebar-item-icon">
                {node.isDir ? (isExpanded ? "📂" : "📁") : "📄"}
              </span>
              <span className="sidebar-item-label">{node.name}</span>
            </div>
            {node.isDir && isExpanded && (
              <FileTree root={node.path} onOpen={onOpen} />
            )}
          </div>
        );
      })}
    </>
  );
}
