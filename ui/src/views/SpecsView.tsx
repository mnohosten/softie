import { useState } from "react";
import Editor from "@monaco-editor/react";
import { useSoftieStore } from "../store/index.ts";
import { statusColor } from "../utils.ts";
import type { Spec, SpecType } from "../types.ts";

const SPEC_TYPE_LABELS: Record<SpecType, string> = {
  product: "Product",
  technical: "Technical",
  architecture: "Architecture",
  api: "API",
  ui: "UI/UX",
};

const MONACO_OPTIONS = {
  fontSize: 13,
  lineHeight: 20,
  fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Consolas, monospace",
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  wordWrap: "on" as const,
  padding: { top: 12, bottom: 12 },
  scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
};

function SpecListItem({ spec, isSelected, onClick }: {
  spec: Spec;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <div
      className={`spec-list-item ${isSelected ? "selected" : ""}`}
      onClick={onClick}
    >
      <div className="spec-list-item-header">
        <span className="spec-type-badge">{SPEC_TYPE_LABELS[spec.type]}</span>
        <span
          className="spec-status-badge"
          style={{ color: statusColor(spec.status === "approved" ? "approved" : spec.status === "implemented" ? "completed" : spec.status) }}
        >
          {spec.status}
        </span>
      </div>
      <div className="spec-list-item-title">{spec.title}</div>
    </div>
  );
}

export function SpecsView() {
  const { specs, metadata } = useSoftieStore();
  const [selectedSpecId, setSelectedSpecId] = useState<string | null>(null);
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [planning, setPlanning] = useState(false);

  const isSpecReview = metadata?.status === "spec-review";

  const selectedSpec = specs.find((s) => s.id === selectedSpecId) || null;

  const handleSelectSpec = async (spec: Spec) => {
    setSelectedSpecId(spec.id);
    setLoading(true);
    try {
      const res = await fetch(`/api/specs/${spec.id}/content`);
      if (res.ok) {
        const data = await res.json() as { content: string };
        setContent(data.content);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSpec = async (type: SpecType) => {
    const title = prompt(`${SPEC_TYPE_LABELS[type]} Spec title:`);
    if (!title) return;
    try {
      const res = await fetch("/api/specs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, type }),
      });
      if (res.ok) {
        const spec = await res.json() as Spec;
        // Reload specs
        const stateRes = await fetch("/api/state");
        if (stateRes.ok) {
          const data = await stateRes.json();
          useSoftieStore.getState().setProjectState({ specs: data.specs || [] });
        }
        handleSelectSpec(spec);
      }
    } catch {
      // ignore
    }
  };

  const handleSave = async () => {
    if (!selectedSpecId) return;
    await fetch(`/api/specs/${selectedSpecId}/content`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
  };

  const handleStatusChange = async (status: string) => {
    if (!selectedSpecId) return;
    await fetch(`/api/specs/${selectedSpecId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    // Reload
    const stateRes = await fetch("/api/state");
    if (stateRes.ok) {
      const data = await stateRes.json();
      useSoftieStore.getState().setProjectState({ specs: data.specs || [] });
    }
  };

  const handleApproveAllAndPlan = async () => {
    setPlanning(true);
    try {
      // Approve all specs
      for (const spec of specs) {
        if (spec.status === "draft" || spec.status === "review") {
          await fetch(`/api/specs/${spec.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "approved" }),
          });
        }
      }
      // Trigger planning
      await fetch("/api/board/plan", { method: "POST" });
      // Reload state
      const stateRes = await fetch("/api/state");
      if (stateRes.ok) {
        const data = await stateRes.json();
        useSoftieStore.getState().setProjectState({
          specs: data.specs || [],
          boardTasks: data.boardTasks || [],
          sprints: data.sprints || [],
          metadata: data.metadata,
        });
      }
    } catch {
      // ignore
    } finally {
      setPlanning(false);
    }
  };

  return (
    <div className="specs-view">
      {/* Spec list sidebar */}
      <div className="specs-list-panel">
        <div className="specs-list-header">
          <span>Specs</span>
          <div className="specs-create-dropdown">
            <button className="btn btn-sm" title="Create spec">+</button>
            <div className="specs-create-menu">
              {(Object.keys(SPEC_TYPE_LABELS) as SpecType[]).map((type) => (
                <button key={type} onClick={() => handleCreateSpec(type)}>
                  {SPEC_TYPE_LABELS[type]}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="specs-list">
          {specs.length === 0 ? (
            <div className="specs-empty">
              No specs yet. Create one or let the AI generate specs from your intent.
            </div>
          ) : (
            specs.map((spec) => (
              <SpecListItem
                key={spec.id}
                spec={spec}
                isSelected={spec.id === selectedSpecId}
                onClick={() => handleSelectSpec(spec)}
              />
            ))
          )}
        </div>

        {/* Approve & Plan CTA */}
        {isSpecReview && specs.length > 0 && (
          <div className="specs-cta">
            <button
              className="specs-cta-btn"
              onClick={handleApproveAllAndPlan}
              disabled={planning}
            >
              {planning ? "Planning..." : "Approve All & Plan Tasks"}
            </button>
          </div>
        )}
      </div>

      {/* Editor area */}
      <div className="specs-editor-panel">
        {selectedSpec ? (
          <>
            <div className="specs-editor-header">
              <span className="specs-editor-title">{selectedSpec.title}</span>
              <div className="specs-editor-actions">
                {selectedSpec.status === "draft" && (
                  <button className="btn btn-sm" onClick={() => handleStatusChange("review")}>
                    Submit for Review
                  </button>
                )}
                {selectedSpec.status === "review" && (
                  <button className="btn btn-sm btn-approve" onClick={() => handleStatusChange("approved")}>
                    Approve
                  </button>
                )}
                <button className="btn btn-sm" onClick={handleSave}>Save</button>
              </div>
            </div>
            {loading ? (
              <div className="specs-loading">Loading...</div>
            ) : (
              <Editor
                height="100%"
                value={content}
                language="markdown"
                theme="vs-dark"
                options={MONACO_OPTIONS}
                onChange={(value) => setContent(value || "")}
              />
            )}
          </>
        ) : (
          <div className="specs-empty-editor">
            <div style={{ fontSize: 24, marginBottom: 8 }}>📋</div>
            <p>Select a spec to edit, or create a new one</p>
          </div>
        )}
      </div>
    </div>
  );
}
