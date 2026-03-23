import { useState } from "react";
import { useSoftieStore } from "../store/index.ts";

interface NewProjectProps {
  onStarted: () => void;
}

export function NewProject({ onStarted }: NewProjectProps) {
  const [intent, setIntent] = useState("");
  const [preferences, setPreferences] = useState("");
  const [showPrefs, setShowPrefs] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { setProjectState } = useSoftieStore();

  const handleStart = async () => {
    if (!intent.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/project/start-v2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intent: intent.trim(),
          preferences: preferences.trim() || undefined,
        }),
      });

      const data = await res.json() as { started?: boolean; error?: string };

      if (!res.ok || data.error) {
        setError(data.error || "Failed to start project");
        setLoading(false);
        return;
      }

      // Reload state from server
      const stateRes = await fetch("/api/state");
      if (stateRes.ok) {
        const state = await stateRes.json();
        setProjectState({
          metadata: state.metadata,
          team: state.team,
          plan: state.plan,
          progress: state.progress,
          tasks: state.tasks || [],
          approvalState: state.approvalState,
          exists: state.exists,
        });
      }

      onStarted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      handleStart();
    }
  };

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      height: "100%",
      background: "var(--bg-1)",
      padding: "40px",
    }}>
      <div style={{
        width: "100%",
        maxWidth: "560px",
        display: "flex",
        flexDirection: "column",
        gap: "20px",
      }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: "8px" }}>
          <div style={{ fontSize: "32px", fontWeight: 700, color: "var(--blue)", letterSpacing: "-2px" }}>
            ⟁ Softie
          </div>
          <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>
            Spec-Driven Development
          </div>
        </div>

        {/* Intent input */}
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <label style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            What do you want to build?
          </label>
          <textarea
            style={{
              background: "var(--bg-3)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              color: "var(--text-1)",
              fontSize: "14px",
              lineHeight: "1.6",
              padding: "12px 14px",
              resize: "vertical",
              minHeight: "120px",
              outline: "none",
              fontFamily: "var(--font-ui)",
              transition: "border-color 150ms ease",
            }}
            placeholder="Build a SaaS task management app with React frontend, Node.js backend, and PostgreSQL..."
            value={intent}
            onChange={(e) => setIntent(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={(e) => {
              (e.target as HTMLTextAreaElement).style.borderColor = "var(--accent)";
            }}
            onBlur={(e) => {
              (e.target as HTMLTextAreaElement).style.borderColor = "var(--border)";
            }}
            disabled={loading}
            autoFocus
          />
          <div style={{ fontSize: "10px", color: "var(--text-muted)", textAlign: "right" }}>
            ⌘Enter to start
          </div>
        </div>

        {/* Preferences (collapsible) */}
        <div>
          <button
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              fontSize: "11px",
              cursor: "pointer",
              padding: "0",
              display: "flex",
              alignItems: "center",
              gap: "5px",
              fontFamily: "var(--font-ui)",
            }}
            onClick={() => setShowPrefs(!showPrefs)}
          >
            <span style={{ transform: showPrefs ? "rotate(90deg)" : "none", transition: "transform 150ms", display: "inline-block" }}>▶</span>
            Preferences / constraints (optional)
          </button>

          {showPrefs && (
            <textarea
              style={{
                marginTop: "8px",
                width: "100%",
                background: "var(--bg-3)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                color: "var(--text-1)",
                fontSize: "12px",
                lineHeight: "1.5",
                padding: "10px 12px",
                resize: "vertical",
                minHeight: "80px",
                outline: "none",
                fontFamily: "var(--font-ui)",
              }}
              placeholder="Use TypeScript. Prefer Fastify over Express. No test frameworks needed. Keep it simple."
              value={preferences}
              onChange={(e) => setPreferences(e.target.value)}
              disabled={loading}
            />
          )}
        </div>

        {/* Error */}
        {error && (
          <div style={{
            padding: "10px 12px",
            background: "rgba(244,71,71,0.1)",
            border: "1px solid var(--red)",
            borderRadius: "var(--radius)",
            color: "var(--red)",
            fontSize: "12px",
          }}>
            {error}
          </div>
        )}

        {/* Start button */}
        <button
          style={{
            padding: "12px 24px",
            background: loading ? "var(--bg-4)" : "var(--accent)",
            border: "none",
            borderRadius: "var(--radius-md)",
            color: loading ? "var(--text-muted)" : "white",
            fontSize: "14px",
            fontWeight: 600,
            cursor: loading || !intent.trim() ? "default" : "pointer",
            opacity: (!intent.trim() && !loading) ? 0.5 : 1,
            transition: "all 150ms",
            fontFamily: "var(--font-ui)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
          }}
          onClick={handleStart}
          disabled={loading || !intent.trim()}
        >
          {loading ? (
            <>
              <span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⟳</span>
              Generating specs...
            </>
          ) : (
            <>⟁ Start Project</>
          )}
        </button>

        {loading && (
          <div style={{
            fontSize: "11px",
            color: "var(--text-muted)",
            textAlign: "center",
            lineHeight: "1.6",
          }}>
            Spec orchestrator is analyzing your intent and generating specifications.
            <br />
            Watch the Activity Feed for live progress.
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
