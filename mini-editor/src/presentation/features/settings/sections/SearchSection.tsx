import { message, Modal } from "antd";
import {
  useGetIndicesInfoQuery,
  useReindexAllMutation,
  useReindexByTypeMutation,
  useReconcileMutation,
  useReconcileCountMutation,
} from "@/infrastructure/api/docsApi";
import "@/presentation/features/settings/pages/SettingsPage/SettingsPage.scss";

export default function SearchSection() {
  const {
    data: indices,
    isLoading: isLoadingIndices,
    isFetching: isFetchingIndices,
    refetch: refetchIndices,
    error: indicesError,
  } = useGetIndicesInfoQuery(undefined, {
    pollingInterval: 10000, // Auto-refresh every 10s
  });

  const [reindexAll, { isLoading: isReindexingAll }] = useReindexAllMutation();
  const [reindexByType, { isLoading: isReindexingType }] = useReindexByTypeMutation();
  const [reconcile, { isLoading: isReconciling }] = useReconcileMutation();
  const [reconcileCount, { isLoading: isReconcilingCount }] = useReconcileCountMutation();

  const isBusy = isReindexingAll || isReindexingType || isReconciling || isReconcilingCount;

  const handleReindexAll = () => {
    Modal.confirm({
      title: "Reindex search?",
      content: "Toàn bộ docs và canvas sẽ được đánh lại index từ DB. Thao tác này có thể mất vài giây.",
      okText: "Reindex All",
      cancelText: "Huỷ",
      onOk: async () => {
        try {
          const result = await reindexAll().unwrap();
          message.success(`Reindex thành công: ${result} documents`);
          refetchIndices();
        } catch {
          message.error("Reindex thất bại");
        }
      },
    });
  };

  const handleReindexType = (type: string, label: string) => {
    Modal.confirm({
      title: `Reindex ${label}?`,
      content: `Toàn bộ ${label.toLowerCase()} sẽ được đánh lại index từ DB. Thao tác này có thể mất vài giây.`,
      okText: "Reindex",
      cancelText: "Huỷ",
      onOk: async () => {
        try {
          const result = await reindexByType(type.toLowerCase()).unwrap();
          message.success(`Reindex ${label} thành công: ${result} documents`);
          refetchIndices();
        } catch {
          message.error(`Reindex ${label} thất bại`);
        }
      },
    });
  };

  const handleReconcile = async () => {
    try {
      await reconcile().unwrap();
      message.success("Đã kích hoạt đồng bộ incremental (watermark scan)");
    } catch {
      message.error("Kích hoạt đồng bộ thất bại");
    }
  };

  const handleReconcileCount = async () => {
    try {
      await reconcileCount().unwrap();
      message.success("Đã kích hoạt kiểm tra sức khỏe số lượng (count health check)");
    } catch {
      message.error("Kích hoạt count check thất bại");
    }
  };

  return (
    <div>
      <h2 className="settings-section-title">Search Settings</h2>

      {/* Index Actions Card */}
      <div className="settings-card">
        <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "12px" }}>Reindex Commands</h3>
        <p style={{ fontSize: "0.75rem", opacity: 0.6, marginBottom: "16px" }}>
          Đồng bộ hoá dữ liệu giữa Database và Elasticsearch khi có sự sai lệch hoặc mất mát dữ liệu tìm kiếm.
        </p>

        <div className="settings-row" style={{ borderBottom: "1px solid var(--border-color)", paddingBottom: "16px" }}>
          <div>
            <div className="settings-row-label">Full Reindex</div>
            <div className="settings-row-desc">Xoá và tạo lại index, reindex toàn bộ Docs, Canvas</div>
          </div>
          <button
            className="settings-btn primary"
            onClick={handleReindexAll}
            disabled={isBusy}
          >
            {isReindexingAll ? "Reindexing All…" : "Reindex All"}
          </button>
        </div>

        <div style={{ display: "flex", gap: "10px", marginTop: "16px", flexWrap: "wrap" }}>
          <button
            className="settings-btn"
            onClick={() => handleReindexType("doc", "Docs")}
            disabled={isBusy}
          >
            Reindex Docs
          </button>
          <button
            className="settings-btn"
            onClick={() => handleReindexType("canvas", "Canvas")}
            disabled={isBusy}
          >
            Reindex Canvas
          </button>
        </div>
      </div>

      {/* Reconciliation Actions Card */}
      <div className="settings-card">
        <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "12px" }}>Reconciliation & Health</h3>
        <p style={{ fontSize: "0.75rem", opacity: 0.6, marginBottom: "16px" }}>
          Kích hoạt tiến trình quét và sửa lỗi lệch index ngầm.
        </p>
        <div style={{ display: "flex", gap: "10px" }}>
          <button
            className="settings-btn"
            onClick={handleReconcile}
            disabled={isBusy}
          >
            {isReconciling ? "Running Sync…" : "Watermark Scan"}
          </button>
          <button
            className="settings-btn"
            onClick={handleReconcileCount}
            disabled={isBusy}
          >
            {isReconcilingCount ? "Running Check…" : "Count Health Check"}
          </button>
        </div>
      </div>

      {/* Elasticsearch Indices Stats Table Card */}
      <div className="settings-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <div>
            <h3 style={{ fontSize: "1rem", fontWeight: 600, margin: 0 }}>Elasticsearch Indices</h3>
            <p style={{ fontSize: "0.75rem", opacity: 0.6, marginTop: "2px" }}>
              Danh sách và số liệu thống kê chi tiết của các index hiện có trong Elasticsearch.
            </p>
          </div>
          <button
            className="settings-btn"
            onClick={() => refetchIndices()}
            disabled={isLoadingIndices || isFetchingIndices}
            style={{ padding: "4px 10px", fontSize: "0.75rem" }}
          >
            {isFetchingIndices ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        {isLoadingIndices ? (
          <div style={{ padding: "32px", textAlign: "center", opacity: 0.6, fontSize: "0.875rem" }}>
            Loading index statistics...
          </div>
        ) : indicesError ? (
          <div style={{ padding: "16px", color: "var(--ant-color-error, #ff4d4f)", fontSize: "0.875rem" }}>
            Không thể lấy thông tin index từ Elasticsearch. Vui lòng kiểm tra trạng thái ES cluster.
          </div>
        ) : !indices || indices.length === 0 ? (
          <div style={{ padding: "32px", textAlign: "center", opacity: 0.6, fontSize: "0.875rem" }}>
            Không tìm thấy index nào. Hãy kích hoạt reindex.
          </div>
        ) : (
          <div className="settings-table-wrapper">
            <table className="settings-table">
              <thead>
                <tr>
                  <th>Index</th>
                  <th>Health</th>
                  <th>Status</th>
                  <th>UUID</th>
                  <th style={{ textAlign: "right" }}>Docs Count</th>
                  <th style={{ textAlign: "right" }}>Store Size</th>
                </tr>
              </thead>
              <tbody>
                {indices.map((idx) => (
                  <tr key={idx.uuid || idx.index}>
                    <td style={{ fontWeight: 500 }}>{idx.index}</td>
                    <td>
                      <span className={`health-badge ${idx.health?.toLowerCase()}`}>
                        <span className="health-badge-dot" />
                        {idx.health}
                      </span>
                    </td>
                    <td>
                      <span className={`status-badge ${idx.status?.toLowerCase()}`}>
                        {idx.status}
                      </span>
                    </td>
                    <td style={{ fontFamily: "monospace", fontSize: "0.75rem", opacity: 0.7 }}>
                      {idx.uuid || "—"}
                    </td>
                    <td style={{ textAlign: "right", fontWeight: 500 }}>
                      {Number(idx.docsCount).toLocaleString() || idx.docsCount || "0"}
                    </td>
                    <td style={{ textAlign: "right", opacity: 0.8 }}>
                      {idx.storeSize || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
