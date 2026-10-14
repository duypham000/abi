export default function AboutSection() {
  return (
    <div>
      <h2 className="settings-section-title">About</h2>

      <div className="settings-card">
        <div className="settings-row">
          <div className="settings-row-label">App name</div>
          <span style={{ fontSize: "0.875rem", opacity: 0.8 }}>Tomo</span>
        </div>
        <div className="settings-row">
          <div className="settings-row-label">Version</div>
          <span style={{ fontSize: "0.875rem", opacity: 0.8 }}>0.1.0</span>
        </div>
        <div className="settings-row">
          <div className="settings-row-label">Built with</div>
          <span style={{ fontSize: "0.875rem", opacity: 0.8 }}>
            Tauri · React · Spring Boot
          </span>
        </div>
      </div>
    </div>
  );
}
