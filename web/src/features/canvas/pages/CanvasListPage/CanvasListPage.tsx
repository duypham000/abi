import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDispatch } from "react-redux";
import { Modal, message } from "antd";
import { type AppDispatch } from "@/store";
import { setPageTitle } from "@/store/appSlice";
import { useCanvas } from "../../hooks/useCanvas";
import CanvasList from "../../components/CanvasList";
import "./CanvasListPage.scss";

export default function CanvasListPage() {
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const {
    canvases,
    isLoading,
    isCreating,
    isDeleting,
    createCanvas,
    deleteCanvas,
  } = useCanvas();
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    dispatch(setPageTitle("Canvas"));
  }, [dispatch]);

  useEffect(() => {
    setSelectedIds((prev) => {
      const validIds = new Set(canvases.map((c) => c.id));
      const next = new Set(Array.from(prev).filter((id) => validIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [canvases]);

  const handleToggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const allSelected =
    canvases.length > 0 && canvases.every((c) => selectedIds.has(c.id));

  const handleToggleSelectAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(canvases.map((c) => c.id)));
    }
  }, [allSelected, canvases]);

  const handleDeleteSelected = useCallback(() => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    Modal.confirm({
      title: `Xoá ${ids.length} canvas đã chọn?`,
      content: "Hành động này không thể hoàn tác.",
      okText: "Xoá",
      okType: "danger",
      cancelText: "Huỷ",
      onOk: async () => {
        for (const id of ids) {
          await deleteCanvas(id);
        }
        setSelectedIds(new Set());
        message.success(`Đã xoá ${ids.length} canvas`);
      },
    });
  }, [selectedIds, deleteCanvas]);

  const handleDeleteAll = useCallback(() => {
    if (canvases.length === 0) return;
    const ids = canvases.map((c) => c.id);
    Modal.confirm({
      title: `Xoá toàn bộ ${ids.length} canvas?`,
      content: "Tất cả canvas sẽ bị xoá khỏi máy chủ.",
      okText: "Xoá toàn bộ",
      okType: "danger",
      cancelText: "Huỷ",
      onOk: async () => {
        for (const id of ids) {
          await deleteCanvas(id);
        }
        setSelectedIds(new Set());
        message.success(`Đã xoá toàn bộ ${ids.length} canvas`);
      },
    });
  }, [canvases, deleteCanvas]);

  const handleNewCanvas = async () => {
    const newCanvas = await createCanvas({
      title: "Untitled Canvas",
      scene: null,
      metadata: null,
      lastSync: null,
      status: 1,
    });
    navigate(`/canvas/${newCanvas.id}`);
  };

  return (
    <main
      className="dashboard-main"
      style={{ height: "100%", overflow: "auto", padding: "24px" }}
    >
      <section className="dashboard-content canvas-list-page-content">
        <div className="canvas-list-page-header">
          <h2 className="canvas-list-page-title">Canvas</h2>
          <button
            className="canvas-new-btn"
            onClick={handleNewCanvas}
            disabled={isCreating}
          >
            {isCreating ? "Creating…" : "+ New Canvas"}
          </button>
        </div>

        <div className="canvas-bulk-bar">
          <label className="canvas-bulk-select-all">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={handleToggleSelectAll}
              disabled={canvases.length === 0}
            />
            <span>
              Chọn tất cả ({selectedIds.size}/{canvases.length})
            </span>
          </label>
          <div className="canvas-bulk-actions">
            {selectedIds.size > 0 && (
              <button
                type="button"
                className="canvas-bulk-btn canvas-bulk-btn--danger"
                onClick={handleDeleteSelected}
                disabled={isDeleting}
              >
                Xoá đã chọn ({selectedIds.size})
              </button>
            )}
            {canvases.length > 0 && (
              <button
                type="button"
                className="canvas-bulk-btn canvas-bulk-btn--danger-outline"
                onClick={handleDeleteAll}
                disabled={isDeleting}
              >
                Xoá toàn bộ
              </button>
            )}
          </div>
        </div>

        <CanvasList
          canvases={canvases}
          onDelete={deleteCanvas}
          isDeleting={isDeleting}
          isLoading={isLoading}
          selectedIds={selectedIds}
          onToggleSelect={handleToggleSelect}
        />
      </section>
    </main>
  );
}
