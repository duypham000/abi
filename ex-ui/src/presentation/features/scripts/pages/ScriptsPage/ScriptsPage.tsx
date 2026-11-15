import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Badge, Button, Tabs } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { AppBar } from "@/presentation/components/AppBar";
import Sidebar from "@/presentation/features/dashboard/components/Sidebar";
import { AppDispatch, RootState } from "@/presentation/store";
import { setPageTitle } from "@/presentation/store/appSlice";
import type { Script } from "@/core/interfaces/script";
import { useScripts } from "../../hooks/useScripts";
import ScriptCard from "../../components/ScriptCard";
import ScriptFormModal from "../../components/ScriptFormModal";
import RunningProcessPanel from "../../components/RunningProcessPanel";
import RunHistoryPanel from "../../components/RunHistoryPanel";
import "./ScriptsPage.scss";

interface ScriptsPageProps {
  panelMode?: boolean;
}

export default function ScriptsPage({ panelMode }: ScriptsPageProps) {
  const dispatch = useDispatch<AppDispatch>();
  const { theme } = useSelector((state: RootState) => state.app);

  const {
    scripts,
    history,
    loading,
    runningProcesses,
    createScript,
    updateScript,
    runScript,
    killProcess,
    showWindow,
    hideWindow,
    restartProcess,
    stopAllByScript,
    clearHistory,
  } = useScripts();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingScript, setEditingScript] = useState<Script | null>(null);
  const [activeTab, setActiveTab] = useState("scripts");

  useEffect(() => {
    dispatch(setPageTitle("Scripts"));
  }, [dispatch]);

  const handleEdit = (script: Script) => {
    setEditingScript(script);
    setModalOpen(true);
  };

  const handleNewScript = () => {
    setEditingScript(null);
    setModalOpen(true);
  };

  const handleModalSave = async (
    data: Omit<Script, "id" | "createdAt" | "updatedAt">
  ) => {
    if (editingScript) {
      await updateScript(editingScript.id, data);
    } else {
      await createScript(data);
    }
    setModalOpen(false);
  };

  const handleToggleStartWithWindow = async (script: Script) => {
    await updateScript(script.id, { startWithWindow: !script.startWithWindow });
  };

  const runningCount = runningProcesses.length;

  const tabItems = [
    {
      key: "scripts",
      label: "Scripts",
      children: (
        <div className="scripts-tab">
          {loading ? (
            <div className="scripts-loading">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="scripts-skeleton" />
              ))}
            </div>
          ) : scripts.length === 0 ? (
            <div className="scripts-empty">
              <span className="scripts-empty__icon">⌨</span>
              <p className="scripts-empty__title">No scripts yet</p>
              <p className="scripts-empty__subtitle">
                Create your first script to get started
              </p>
              <Button type="primary" icon={<PlusOutlined />} onClick={handleNewScript}>
                Create script
              </Button>
            </div>
          ) : (
            <div className="scripts-grid">
              {scripts.map((script) => (
                <ScriptCard
                  key={script.id}
                  script={script}
                  runningProcesses={runningProcesses.filter(
                    (p) => p.scriptId === script.id
                  )}
                  onRun={runScript}
                  onEdit={handleEdit}
                  onStopAll={stopAllByScript}
                  onToggleStartWithWindow={handleToggleStartWithWindow}
                />
              ))}
            </div>
          )}
        </div>
      ),
    },
    {
      key: "running",
      label: (
        <span className="tab-label-with-badge">
          Running
          {runningCount > 0 && (
            <Badge
              count={runningCount}
              size="small"
              style={{ marginLeft: 6 }}
            />
          )}
        </span>
      ),
      children: (
        <RunningProcessPanel
          processes={runningProcesses}
          onKill={killProcess}
          onShow={showWindow}
          onHide={hideWindow}
          onRestart={restartProcess}
        />
      ),
    },
    {
      key: "history",
      label: "History",
      children: (
        <RunHistoryPanel history={history} onClear={clearHistory} />
      ),
    },
  ];

  const content = (
    <>
    <main className="dashboard-main">
      <section className="dashboard-content scripts-page">
            <div className="scripts-page__header">
              <Tabs
                activeKey={activeTab}
                onChange={setActiveTab}
                items={tabItems}
                tabBarExtraContent={
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={handleNewScript}
                  >
                    New Script
                  </Button>
                }
              />
            </div>
          </section>
        </main>
      <ScriptFormModal
        open={modalOpen}
        script={editingScript}
        onClose={() => setModalOpen(false)}
        onSave={handleModalSave}
      />
    </>
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
