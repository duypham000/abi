import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useDispatch } from "react-redux";
import { type AppDispatch } from "@/store";
import { setPageTitle } from "@/store/appSlice";
import { useCanvas } from "../../hooks/useCanvas";
import CanvasList from "../../components/CanvasList";
import "./CanvasListPage.scss";

export default function CanvasListPage() {
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
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
    navigate(`/canvas/${newCanvas.id}`);
  };

  return (
    <main className="dashboard-main" style={{ height: "100%", overflow: "auto", padding: "24px" }}>
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
}
