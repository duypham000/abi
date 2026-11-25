import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSelector, useDispatch } from "react-redux";
import { message } from "antd";
import Sidebar from "@/presentation/features/dashboard/components/Sidebar";
import { AppBar } from "@/presentation/components/AppBar";
import { type RootState, type AppDispatch } from "@/presentation/store";
import { setPageTitle } from "@/presentation/store/appSlice";
import { useRestoreCanvasesFromServerMutation } from "@/infrastructure/api/canvasApi";
import type { DeleteScope } from "@/infrastructure/api/docsApi";
import { confirmDeleteWithScope } from "@/presentation/components/ui/ConfirmDeleteModal/confirmDeleteModal";
import { useCanvas } from "../../hooks/useCanvas";
import CanvasList from "../../components/CanvasList";
import { useGoldenLayout } from "@/presentation/layout/golden/GoldenLayoutContext";
import { PANEL_TYPES } from "@/presentation/layout/golden/panelRegistry";
import "./CanvasListPage.scss";

interface CanvasListPageProps {
  panelMode?: boolean;
}

export default function CanvasListPage({ panelMode }: CanvasListPageProps) {
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const { openPanel } = useGoldenLayout();
  const { theme } = useSelector((state: RootState) => state.app);
  const { canvases, isLoading, isCreating, isDeleting, createCanvas, deleteCanvas } =
    useCanvas();
  const [restoreCanvases, { isLoading: isRestoringBulk }] = useRestoreCanvasesFromServerMutation();
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [restoringId, setRestoringId] = useState<number | null>(null);

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

  const allSelected = canvases.length > 0 && canvases.every((c) => selectedIds.has(c.id));

  const handleToggleSelectAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(canvases.map((c) => c.id)));
    }
  }, [allSelected, canvases]);

  const handleRestoreOne = useCallback(async (id: number) => {
    setRestoringId(id);
    try {
      const res = await restoreCanvases({ ids: [id] }).unwrap();
      if (res.count > 0) {
        message.success("Đã khôi phục canvas từ Server!");
      } else {
        message.warning("Không tìm thấy bản lưu của canvas này trên Server.");
      }
    } catch (err: any) {
      message.error(err?.data?.message || "Khôi phục canvas từ Server thất bại");
    } finally {
      setRestoringId(null);
    }
  }, [restoreCanvases]);

  const handleRestoreSelectedOrAll = useCallback(async () => {
    const ids = Array.from(selectedIds);
    try {
      const res = await restoreCanvases(ids.length > 0 ? { ids } : undefined).unwrap();
      if (res.count > 0) {
        message.success(`Đã khôi phục ${res.count} canvas từ Server!`);
      } else {
        message.warning("Không có canvas nào được khôi phục từ Server.");
      }
      if (ids.length > 0) setSelectedIds(new Set());
    } catch (err: any) {
      message.error(err?.data?.message || "Khôi phục canvas từ Server thất bại");
    }
  }, [restoreCanvases, selectedIds]);

  const handleDeleteSelected = useCallback(() => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    confirmDeleteWithScope({
      entityLabel: "canvas",
      title: `${ids.length} canvas đã chọn`,
      onConfirm: async (scope: DeleteScope) => {
        for (const id of ids) {
          await deleteCanvas(id, scope);
        }
        setSelectedIds(new Set());
        message.success(`Đã xoá ${ids.length} canvas`);
      },
    });
  }, [selectedIds, deleteCanvas]);

  const handleDeleteAll = useCallback(() => {
    if (canvases.length === 0) return;
    const ids = canvases.map((c) => c.id);
    confirmDeleteWithScope({
      entityLabel: "canvas",
      title: `toàn bộ ${ids.length} canvas`,
      onConfirm: async (scope: DeleteScope) => {
        for (const id of ids) {
          await deleteCanvas(id, scope);
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
    if (panelMode) {
      openPanel(PANEL_TYPES.CANVAS_EDITOR, { id: newCanvas.id }, { title: newCanvas.title ?? "Canvas" });
    } else {
      navigate(`/canvas/${newCanvas.id}`);
    }
  };

  const content = (
    <main className="dashboard-main">
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
            <button
              type="button"
              className="canvas-bulk-btn canvas-bulk-btn--restore"
              onClick={handleRestoreSelectedOrAll}
              disabled={isRestoringBulk}
            >
              {isRestoringBulk
                ? "Đang khôi phục…"
                : selectedIds.size > 0
                  ? `Khôi phục đã chọn (${selectedIds.size})`
                  : "Khôi phục từ Server"}
            </button>
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
          onRestore={handleRestoreOne}
          restoringId={restoringId}
        />
      </section>
    </main>
  );

  if (panelMode) return content;

  return (
    <div className={`dashboard-layout theme-${theme}`}>
      <AppBar variant="dashboard" />
      <div className="dashboard-body">
        <Sidebar />
        {content}
      </div>
    </div>
  );
}
