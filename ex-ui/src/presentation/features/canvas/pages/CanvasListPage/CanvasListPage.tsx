import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useSelector, useDispatch } from "react-redux";
import Sidebar from "@/presentation/features/dashboard/components/Sidebar";
import { AppBar } from "@/presentation/components/AppBar";
import { type RootState, type AppDispatch } from "@/presentation/store";
import { setPageTitle } from "@/presentation/store/appSlice";
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

  useEffect(() => {
    dispatch(setPageTitle("Canvas"));
  }, [dispatch]);

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

        <CanvasList
          canvases={canvases}
          onDelete={deleteCanvas}
          isDeleting={isDeleting}
          isLoading={isLoading}
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
