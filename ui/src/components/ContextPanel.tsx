import { useState, useRef, useEffect } from "react";
import { useSoftieStore } from "../store/index.ts";
import type { TaskApproval, ApprovalMode } from "../types.ts";
import { statusColor } from "../utils.ts";

type ContextTab = "approval" | "chat";

function ApprovalPanel() {
  const { tasks, plan, approvalState, setApprovalMode, setTasks } = useSoftieStore();

  const pendingTasks = tasks.filter(
    (t) => t.status === "draft" || t.status === "pending-review"
  );

  const handleApprove = async (taskId: string) => {
    const res = await fetch(`/api/tasks/${taskId}/approve`, { method: "PUT" });
    if (res.ok) {
      const updated = await res.json() as TaskApproval;
      setTasks(tasks.map((t) => (t.id === taskId ? updated : t)));
    }
  };

  const handleReject = async (taskId: string) => {
    const reason = prompt("Rejection reason (optional):");
    const res = await fetch(`/api/tasks/${taskId}/reject`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: reason || undefined }),
    });
    if (res.ok) {
      const updated = await res.json() as TaskApproval;
      setTasks(tasks.map((t) => (t.id === taskId ? updated : t)));
    }
  };

  const handleApproveAll = async () => {
    const res = await fetch("/api/tasks/approve-all", { method: "PUT" });
    if (res.ok) {
      const updated = await res.json() as TaskApproval[];
      setTasks(updated);
    }
  };

  const handleModeChange = async (mode: ApprovalMode) => {
    setApprovalMode(mode);
    await fetch("/api/approval", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode }),
    });
  };

  const statusBg: Record<string, string> = {
    draft: "var(--bg-4)",
    "pending-review": "rgba(220,220,170,0.15)",
    approved: "rgba(78,201,176,0.15)",
    "in-progress": "rgba(79,193,255,0.15)",
    completed: "rgba(78,201,176,0.1)",
    rejected: "rgba(244,71,71,0.15)",
  };

  return (
    <div className="approval-panel">
      {/* Mode selector */}
      <div>
        <div style={{ fontSize: "10px", color: "var(--text-muted)", marginBottom: "6px" }}>
          APPROVAL MODE
        </div>
        <div className="approval-mode-select">
          {(["granular", "phase", "brave"] as ApprovalMode[]).map((mode) => (
            <button
              key={mode}
              className={`approval-mode-btn ${approvalState.mode === mode ? "active" : ""}`}
              onClick={() => handleModeChange(mode)}
            >
              {mode === "granular" ? "Granular" : mode === "phase" ? "Phase" : "⚡ Brave"}
            </button>
          ))}
        </div>
      </div>

      {/* Approve all button */}
      {pendingTasks.length > 0 && (
        <button className="btn btn-primary" onClick={handleApproveAll} style={{ width: "100%" }}>
          Approve All ({pendingTasks.length} pending)
        </button>
      )}

      {/* Task list grouped by phase */}
      {plan?.phases
        .sort((a, b) => a.order - b.order)
        .map((phase) => {
          const phaseTasks = tasks.filter((t) => t.phaseId === phase.id);
          if (phaseTasks.length === 0) return null;
          return (
            <div key={phase.id}>
              <div
                style={{
                  fontSize: "10px",
                  color: "var(--text-muted)",
                  padding: "4px 0 2px",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                {phase.name}
              </div>
              {phaseTasks.map((task) => (
                <div
                  key={task.id}
                  className="task-item"
                  style={{ background: statusBg[task.status] || "var(--bg-3)" }}
                >
                  <div className="task-header">
                    <span className="task-title">{task.title}</span>
                    <span
                      className="task-status-badge"
                      style={{
                        color: statusColor(task.status),
                        background: "transparent",
                        border: `1px solid ${statusColor(task.status)}`,
                      }}
                    >
                      {task.status}
                    </span>
                  </div>
                  {task.description && (
                    <div className="task-description">{task.description}</div>
                  )}
                  {task.assignedAgent && (
                    <div style={{ fontSize: "10px", color: "var(--purple)" }}>
                      → {task.assignedAgent}
                    </div>
                  )}
                  {(task.status === "draft" || task.status === "pending-review") && (
                    <div className="task-actions">
                      <button
                        className="btn btn-approve"
                        onClick={() => handleApprove(task.id)}
                      >
                        ✓ Approve
                      </button>
                      <button
                        className="btn btn-reject"
                        onClick={() => handleReject(task.id)}
                      >
                        ✗ Reject
                      </button>
                    </div>
                  )}
                  {task.rejectionReason && (
                    <div style={{ fontSize: "10px", color: "var(--red)", marginTop: "2px" }}>
                      Reason: {task.rejectionReason}
                    </div>
                  )}
                </div>
              ))}
            </div>
          );
        })}

      {tasks.length === 0 && (
        <div style={{ color: "var(--text-muted)", fontSize: "11px", textAlign: "center", padding: "20px 0" }}>
          No tasks yet.
          <br />
          <span style={{ fontSize: "10px" }}>Tasks are created when agents plan their work.</span>
        </div>
      )}
    </div>
  );
}

function ChatPanel() {
  const {
    chatThreads,
    activeThreadId,
    selectedItem,
    startThread,
    addChatUserMessage,
    setActiveThread,
  } = useSoftieStore();

  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const activeThread = activeThreadId ? chatThreads[activeThreadId] : null;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeThread?.messages.length, activeThread?.streamBuffer]);

  const getTargetInfo = () => {
    if (!selectedItem) return { type: "project" as const, id: "project" };
    if (selectedItem.type === "phase") return { type: "phase" as const, id: selectedItem.id };
    if (selectedItem.type === "task") return { type: "task" as const, id: selectedItem.id };
    if (selectedItem.type === "agent") return { type: "agent" as const, id: selectedItem.id };
    return { type: "project" as const, id: "project" };
  };

  const ensureThread = async () => {
    if (activeThreadId && chatThreads[activeThreadId]) return activeThreadId;

    const { type, id } = getTargetInfo();
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetType: type, targetId: id }),
    });
    if (!res.ok) throw new Error("Failed to create thread");
    const data = await res.json() as { threadId: string };

    // Register the thread in local store using server's thread ID
    startThread(type, id, data.threadId);
    setActiveThread(data.threadId);
    return data.threadId;
  };

  const sendMessage = async () => {
    const msg = input.trim();
    if (!msg) return;

    setInput("");

    try {
      const threadId = await ensureThread();
      // Ensure thread is tracked in local store before adding message
      if (!chatThreads[threadId]) {
        const { type, id } = getTargetInfo();
        startThread(type, id, threadId);
      }
      addChatUserMessage(threadId, msg);

      await fetch(`/api/chat/${threadId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });
    } catch (err) {
      console.error("Chat error:", err);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const targetInfo = getTargetInfo();

  return (
    <div className="chat-panel">
      {/* Target indicator */}
      <div className="chat-target">
        <span className="chat-target-type">{targetInfo.type}</span>
        <span>:</span>
        <span>{targetInfo.id}</span>
        <button
          style={{
            marginLeft: "auto",
            background: "none",
            border: "none",
            color: "var(--text-muted)",
            cursor: "pointer",
            fontSize: "10px",
          }}
          onClick={() => setActiveThread(null)}
        >
          + New
        </button>
      </div>

      {/* Messages */}
      <div className="chat-messages">
        {!activeThread || activeThread.messages.length === 0 ? (
          <div style={{ color: "var(--text-muted)", fontSize: "11px", textAlign: "center", padding: "20px 0" }}>
            Chat with an agent about this {targetInfo.type}.
            <br />
            <span style={{ fontSize: "10px" }}>
              The agent can read and edit .softie/ files.
            </span>
          </div>
        ) : (
          activeThread.messages.map((msg) => (
            <div key={msg.id} className={`chat-msg ${msg.role}`}>
              <span className="chat-msg-role">
                {msg.role === "user" ? "You" : "Agent"}
              </span>
              <div className="chat-msg-content">{msg.content}</div>
            </div>
          ))
        )}

        {/* Streaming indicator */}
        {activeThread?.isStreaming && activeThread.streamBuffer && (
          <div className="chat-msg assistant">
            <span className="chat-msg-role">Agent</span>
            <div className="chat-stream">{activeThread.streamBuffer}</div>
          </div>
        )}

        {activeThread?.isStreaming && !activeThread.streamBuffer && (
          <div style={{ color: "var(--text-muted)", fontSize: "11px", display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ animation: "blink 1s step-end infinite" }}>●</span>
            Agent is thinking...
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="chat-input-area">
        <textarea
          ref={textareaRef}
          className="chat-input"
          placeholder="Ask the agent... (Enter to send, Shift+Enter for newline)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={activeThread?.isStreaming}
          rows={2}
        />
        <button
          className="chat-send-btn"
          onClick={sendMessage}
          disabled={!input.trim() || activeThread?.isStreaming}
          title="Send (Enter)"
        >
          ↑
        </button>
      </div>
    </div>
  );
}

export function ContextPanel() {
  const [activeTab, setActiveTab] = useState<ContextTab>("chat");

  return (
    <div className="context-panel">
      <div className="context-panel-tabs">
        <div
          className={`context-tab ${activeTab === "chat" ? "active" : ""}`}
          onClick={() => setActiveTab("chat")}
        >
          Chat
        </div>
        <div
          className={`context-tab ${activeTab === "approval" ? "active" : ""}`}
          onClick={() => setActiveTab("approval")}
        >
          Approval
        </div>
      </div>

      {activeTab === "chat" ? <ChatPanel /> : <ApprovalPanel />}
    </div>
  );
}
