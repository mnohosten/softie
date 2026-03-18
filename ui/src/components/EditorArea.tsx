import { useEffect, useRef, useState } from "react";
import Editor, { DiffEditor } from "@monaco-editor/react";
import { useSoftieStore } from "../store/index.ts";
import type { Tab } from "../types.ts";
import { ActivityDashboard } from "./ActivityDashboard.tsx";
import { MilestoneReviewPanel } from "./MilestoneReviewPanel.tsx";

const MONACO_OPTIONS = {
  fontSize: 13,
  lineHeight: 20,
  fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Consolas, monospace",
  fontLigatures: true,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  renderWhitespace: "selection" as const,
  lineNumbers: "on" as const,
  wordWrap: "on" as const,
  wrappingIndent: "same" as const,
  bracketPairColorization: { enabled: true },
  padding: { top: 12, bottom: 12 },
  scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
};

function getLanguage(filePath: string): string {
  if (filePath.endsWith(".json")) return "json";
  if (filePath.endsWith(".md")) return "markdown";
  if (filePath.endsWith(".ts") || filePath.endsWith(".tsx")) return "typescript";
  if (filePath.endsWith(".js") || filePath.endsWith(".jsx")) return "javascript";
  if (filePath.endsWith(".yaml") || filePath.endsWith(".yml")) return "yaml";
  if (filePath.endsWith(".sh")) return "shell";
  return "plaintext";
}

interface TabProps {
  tab: Tab;
  isActive: boolean;
  onActivate: () => void;
  onClose: () => void;
}

function TabItem({ tab, isActive, onActivate, onClose }: TabProps) {
  return (
    <div
      className={`tab ${isActive ? "active" : ""}`}
      onClick={onActivate}
    >
      {tab.type === "diff" && <span className="tab-type-badge">diff</span>}
      <span className="tab-name">{tab.title}</span>
      {tab.isDirty && <span style={{ color: "var(--orange)", marginLeft: 2 }}>●</span>}
      <span
        className="tab-close"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      >
        ✕
      </span>
    </div>
  );
}

interface EditorContentProps {
  tab: Tab;
  onContentChange: (content: string) => void;
  onSaved: () => void;
}

function EditorContent({ tab, onContentChange, onSaved }: EditorContentProps) {
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = (value: string | undefined) => {
    if (value === undefined) return;
    onContentChange(value);

    // Debounced save
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      fetch(`/api/file?path=${encodeURIComponent(tab.filePath)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: value }),
      })
        .then(() => onSaved())
        .catch(console.error);
    }, 1500);
  };

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  if (tab.type === "diff") {
    return (
      <DiffEditor
        height="100%"
        original={tab.originalContent || ""}
        modified={tab.content || ""}
        language={getLanguage(tab.filePath)}
        theme="vs-dark"
        options={{
          ...MONACO_OPTIONS,
          readOnly: true,
        }}
      />
    );
  }

  return (
    <Editor
      height="100%"
      value={tab.content || ""}
      language={getLanguage(tab.filePath)}
      theme="vs-dark"
      options={MONACO_OPTIONS}
      onChange={handleChange}
    />
  );
}

function StatusActionPanel({
  icon,
  title,
  subtitle,
  description,
  actionLabel,
  actionVariant = "primary",
  onAction,
  loading,
  error,
}: {
  icon: string;
  title: string;
  subtitle?: string;
  description?: string;
  actionLabel: string;
  actionVariant?: "primary" | "green" | "red";
  onAction: () => void;
  loading: boolean;
  error: string | null;
}) {
  const colors: Record<string, string> = {
    primary: "var(--accent)",
    green: "var(--green)",
    red: "var(--red)",
  };
  return (
    <div className="editor-empty" style={{ alignItems: "center" }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>{icon}</div>
      <h3 style={{ color: "var(--text-1)", marginBottom: 4 }}>{title}</h3>
      {subtitle && <p style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: 4 }}>{subtitle}</p>}
      {description && (
        <p style={{ fontSize: "11px", color: "var(--text-muted)", maxWidth: 440, textAlign: "center", lineHeight: 1.6 }}>
          {description}
        </p>
      )}
      {error && (
        <p style={{ fontSize: "11px", color: "var(--red)", marginTop: 8 }}>Error: {error}</p>
      )}
      <button
        onClick={onAction}
        disabled={loading}
        style={{
          marginTop: 16,
          background: colors[actionVariant],
          color: actionVariant === "green" ? "var(--bg-1)" : "#fff",
          border: "none",
          borderRadius: 6,
          padding: "8px 20px",
          fontSize: "13px",
          fontWeight: 600,
          cursor: loading ? "not-allowed" : "pointer",
          opacity: loading ? 0.6 : 1,
        }}
      >
        {loading ? "Starting…" : actionLabel}
      </button>
    </div>
  );
}

function PausedPanel() {
  const { metadata, setProjectState } = useSoftieStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleResume = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/project/execute", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setProjectState({ metadata: data.metadata });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <StatusActionPanel
      icon="⏸"
      title="Project Paused"
      subtitle={metadata?.name}
      description="The milestone review requested changes. Make your adjustments to the .softie/ files and resume when ready."
      actionLabel="Resume Execution"
      actionVariant="green"
      onAction={handleResume}
      loading={loading}
      error={error}
    />
  );
}

function FailedPanel() {
  const { metadata, setProjectState } = useSoftieStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRetry = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/project/execute", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setProjectState({ metadata: data.metadata });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <StatusActionPanel
      icon="✗"
      title="Execution Failed"
      subtitle={metadata?.name}
      description="An error occurred during execution. Check .softie/logs/ for details. You can retry from the last completed phase."
      actionLabel="Retry Execution"
      actionVariant="red"
      onAction={handleRetry}
      loading={loading}
      error={error}
    />
  );
}

function TeamReviewPanel() {
  const { metadata, team, plan, setProjectState } = useSoftieStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleApprove = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/project/execute", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setProjectState({
        metadata: data.metadata,
        team: data.team,
        plan: data.plan,
        progress: data.progress,
        tasks: data.tasks || [],
        approvalState: data.approvalState,
        exists: data.exists,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="editor-empty"
      style={{ alignItems: "flex-start", padding: "32px", overflowY: "auto" }}
    >
      <div style={{ maxWidth: 680, width: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
          <div className="editor-empty-logo" style={{ fontSize: 24 }}>⟁</div>
          <div>
            <h3 style={{ margin: 0 }}>Team &amp; Plan Ready</h3>
            <p style={{ margin: 0, fontSize: "12px", color: "var(--text-muted)" }}>
              {metadata?.name} — review the proposed team and execution plan below
            </p>
          </div>
        </div>

        {team && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Agents ({team.agents.length})
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {team.agents.map((agent) => (
                <div
                  key={agent.id}
                  style={{
                    background: "var(--surface-2)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    padding: "8px 12px",
                    display: "flex",
                    gap: 10,
                    alignItems: "flex-start",
                  }}
                >
                  <span style={{ color: "var(--purple)", fontSize: 14, marginTop: 1 }}>◎</span>
                  <div>
                    <div style={{ fontSize: "12px", color: "var(--text-1)", fontWeight: 600 }}>{agent.name}</div>
                    <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{agent.id}</div>
                    {agent.description && (
                      <div style={{ fontSize: "11px", color: "var(--text-2)", marginTop: 2 }}>{agent.description}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {plan && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Phases ({plan.phases.length})
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {plan.phases
                .sort((a, b) => a.order - b.order)
                .map((phase) => (
                  <div
                    key={phase.id}
                    style={{
                      background: "var(--surface-2)",
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                      padding: "8px 12px",
                    }}
                  >
                    <div style={{ fontSize: "12px", color: "var(--text-1)", fontWeight: 600 }}>
                      {phase.order}. {phase.name}
                    </div>
                    {phase.description && (
                      <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: 2 }}>{phase.description}</div>
                    )}
                  </div>
                ))}
            </div>
          </div>
        )}

        {error && (
          <div style={{ color: "var(--red, #f87171)", fontSize: "12px", marginBottom: 12 }}>
            Error: {error}
          </div>
        )}

        <button
          onClick={handleApprove}
          disabled={loading}
          style={{
            background: "var(--blue)",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            padding: "8px 20px",
            fontSize: "13px",
            fontWeight: 600,
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? "Starting…" : "Approve Team & Start Execution"}
        </button>
      </div>
    </div>
  );
}

interface EditorAreaProps {
  send: (msg: Record<string, unknown>) => void;
}

export function EditorArea({ send }: EditorAreaProps) {
  const { openTabs, activeTabId, setActiveTab, closeTab, updateTabContent, markTabClean, metadata, projectExists } =
    useSoftieStore();

  const activeTab = openTabs.find((t) => t.id === activeTabId) || null;
  const status = metadata?.status;
  const showTeamReview = !activeTab && status === "team-review";
  const showMilestoneReview = !activeTab && status === "milestone-review";
  const showPaused = !activeTab && status === "paused";
  const showFailed = !activeTab && status === "failed";

  return (
    <div className="editor-area">
      {/* Tab bar */}
      {openTabs.length > 0 && (
        <div className="tab-bar">
          {openTabs.map((tab) => (
            <TabItem
              key={tab.id}
              tab={tab}
              isActive={tab.id === activeTabId}
              onActivate={() => setActiveTab(tab.id)}
              onClose={() => closeTab(tab.id)}
            />
          ))}
        </div>
      )}

      {/* Editor content — condition chain */}
      {activeTab ? (
        <div className="editor-container">
          <EditorContent
            key={activeTab.id}
            tab={activeTab}
            onContentChange={(content) => updateTabContent(activeTab.id, content)}
            onSaved={() => markTabClean(activeTab.id)}
          />
        </div>
      ) : showTeamReview ? (
        <TeamReviewPanel />
      ) : showMilestoneReview ? (
        <MilestoneReviewPanel send={send} />
      ) : showPaused ? (
        <PausedPanel />
      ) : showFailed ? (
        <FailedPanel />
      ) : projectExists ? (
        <ActivityDashboard />
      ) : (
        <div className="editor-empty">
          <div className="editor-empty-logo">⟁</div>
          <h3>Softie</h3>
          <p>Create a new project to get started</p>
        </div>
      )}
    </div>
  );
}
