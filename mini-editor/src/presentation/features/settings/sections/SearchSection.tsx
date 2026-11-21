import "@/presentation/features/settings/pages/SettingsPage/SettingsPage.scss";

export default function SearchSection() {
  return (
    <div>
      <h2 className="settings-section-title">Search Settings</h2>

      <div className="settings-card">
        <div className="settings-row">
          <div>
            <div className="settings-row-label">Database &amp; Local Search</div>
            <div className="settings-row-desc">
              Document search runs directly against the local SQLite cache and Go database.
              Elasticsearch index management is not enabled on this backend.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
