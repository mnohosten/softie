export function DesignView() {
  return (
    <div className="design-view">
      <div className="design-placeholder">
        <div style={{ fontSize: 32, marginBottom: 12 }}>🎨</div>
        <h3>Design</h3>
        <p style={{ color: "var(--text-muted)", fontSize: 12, maxWidth: 400, textAlign: "center", lineHeight: 1.6 }}>
          Design integration via MCP (Pencil, Figma) will be available in v2.1.
          This view will show design assets, previews, and AI-powered design chat.
        </p>
      </div>
    </div>
  );
}
