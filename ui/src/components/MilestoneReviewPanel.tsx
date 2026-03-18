import { useState, useRef, useEffect } from "react";
import { useSoftieStore } from "../store/index.ts";

interface MilestoneReviewPanelProps {
  send: (msg: Record<string, unknown>) => void;
}

export function MilestoneReviewPanel({ send }: MilestoneReviewPanelProps) {
  const { milestoneQuestion, metadata } = useSoftieStore();
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<Array<{ role: "agent" | "user"; text: string }>>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  // When a new question arrives from the agent, add it to history
  useEffect(() => {
    if (milestoneQuestion) {
      setHistory((prev) => {
        // Avoid duplicating the same question
        const last = prev[prev.length - 1];
        if (last?.role === "agent" && last.text === milestoneQuestion) return prev;
        return [...prev, { role: "agent", text: milestoneQuestion }];
      });
    }
  }, [milestoneQuestion]);

  // Scroll to bottom when history changes
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history]);

  const handleSubmit = () => {
    const answer = input.trim();
    if (!answer) return;
    setHistory((prev) => [...prev, { role: "user", text: answer }]);
    send({ type: "milestone:answer", answer });
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="milestone-panel">
      <div className="milestone-panel-header">
        <span className="milestone-panel-icon">◎</span>
        <div>
          <div className="milestone-panel-title">Milestone Review</div>
          <div className="milestone-panel-sub">
            {metadata?.name ?? "Project"} — review and approve to continue execution
          </div>
        </div>
      </div>

      <div className="milestone-messages">
        {history.length === 0 && (
          <div className="milestone-waiting">
            <span className="activity-pulse-dot" style={{ marginRight: 8 }} />
            Waiting for the agent to present the milestone review…
          </div>
        )}
        {history.map((msg, i) => (
          <div key={i} className={`milestone-msg milestone-msg-${msg.role}`}>
            <div className="milestone-msg-role">
              {msg.role === "agent" ? "Agent" : "You"}
            </div>
            <div className="milestone-msg-content">
              {msg.text}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="milestone-input-area">
        <textarea
          className="milestone-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type your response… (⌘↵ to send)"
          rows={3}
        />
        <button
          className="milestone-send-btn"
          onClick={handleSubmit}
          disabled={!input.trim()}
        >
          Send
        </button>
      </div>
    </div>
  );
}
