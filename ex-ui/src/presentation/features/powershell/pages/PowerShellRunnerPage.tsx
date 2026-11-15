import { useEffect, useState, useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  Tabs,
  Button,
  Input,
  Form,
  Checkbox,
  Table,
  Space,
  Card,
  Typography,
  message,
  Tag,
  Tooltip,
  Divider,
  Modal,
  Switch,
  InputNumber,
  Empty,
  Badge,
} from "antd";
import {
  PlusOutlined,
  PlayCircleOutlined,
  StopOutlined,
  EyeOutlined,
  EyeInvisibleOutlined,
  FolderOpenOutlined,
  HistoryOutlined,
  DeleteOutlined,
  CopyOutlined,
  EditOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { nanoid } from "nanoid";
import { AppDispatch, RootState } from "@/presentation/store";
import { setPageTitle } from "@/presentation/store/appSlice";
import { AppBar } from "@/presentation/components/AppBar";
import Sidebar from "@/presentation/features/dashboard/components/Sidebar";
import type {
  PowerShellScript,
  PowerShellRunHistory,
  PowerShellParam,
} from "@/core/interfaces/powershellRunner";
import {
  selectFolder,
  selectFile,
  loadPowerShellScripts,
  savePowerShellScripts,
  loadPowerShellHistory,
  appendPowerShellHistory,
  updatePowerShellHistoryStatus,
  clearPowerShellHistory,
  parsePowerShellParams,
  isProcessAlive,
} from "@/infrastructure/tauri/powershellRunnerService";
import {
  runScript,
  killScript,
  showScriptWindow,
  hideScriptWindow,
} from "@/infrastructure/tauri/scriptService";
import { TauriFileService } from "@/infrastructure/tauri/fileService";

const { Text } = Typography;
const fileService = new TauriFileService();

interface PowerShellRunnerPageProps {
  panelMode?: boolean;
}

export default function PowerShellRunnerPage({ panelMode }: PowerShellRunnerPageProps) {
  const dispatch = useDispatch<AppDispatch>();
  const { theme } = useSelector((state: RootState) => state.app);

  // States
  const [activeTab, setActiveTab] = useState<string>("activation");
  const [scripts, setScripts] = useState<PowerShellScript[]>([]);
  const [history, setHistory] = useState<PowerShellRunHistory[]>([]);
  const [selectedScript, setSelectedScript] = useState<PowerShellScript | null>(null);
  
  // Activation / Config Form State
  const [workingDir, setWorkingDir] = useState<string>("");
  const [paramValues, setParamValues] = useState<Record<string, string | boolean | number>>({});
  const [runAdmin, setRunAdmin] = useState<boolean>(false);
  const [runHidden, setRunHidden] = useState<boolean>(false);

  // Modal State for Adding/Editing Script
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [editingScript, setEditingScript] = useState<PowerShellScript | null>(null);
  const [modalScriptName, setModalScriptName] = useState<string>("");
  const [modalScriptBody, setModalScriptBody] = useState<string>("");
  const [modalScriptFilePath, setModalScriptFilePath] = useState<string>("");
  const [scannedParams, setScannedParams] = useState<PowerShellParam[]>([]);

  // Set Page Title
  useEffect(() => {
    dispatch(setPageTitle("PowerShell Runner"));
  }, [dispatch]);

  // Load Scripts and History
  const loadData = useCallback(async () => {
    const s = await loadPowerShellScripts();
    const h = await loadPowerShellHistory();
    setScripts(s);
    setHistory(h);
    if (s.length > 0 && !selectedScript) {
      handleSelectScript(s[0], h);
    }
  }, [selectedScript]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Periodic Polling of Active Running Processes (every 3s)
  useEffect(() => {
    const checkActiveProcesses = async () => {
      let updated = false;
      const currentHistory = await loadPowerShellHistory();
      
      const nextHistory = await Promise.all(
        currentHistory.map(async (item) => {
          if (item.status === "running" && item.pid) {
            const alive = await isProcessAlive(item.pid);
            if (!alive) {
              updated = true;
              return {
                ...item,
                status: "success" as const,
                endedAt: dayjs().toISOString(),
              };
            }
          }
          return item;
        })
      );

      if (updated) {
        setHistory(nextHistory);
        await savePowerShellScripts(scripts); // Triggers storage write update (actually saves history)
        // Store updated history in db
        await setHistoryInDb(nextHistory);
      }
    };

    const interval = setInterval(() => {
      void checkActiveProcesses();
    }, 3000);

    return () => clearInterval(interval);
  }, [scripts]);

  const setHistoryInDb = async (newHistory: PowerShellRunHistory[]) => {
    const SCRIPTS_KEY = "ps_runner_history_v1";
    const { setItem } = await import("@/infrastructure/tauri/kvStore");
    await setItem(SCRIPTS_KEY, JSON.stringify(newHistory));
  };

  // Select Script & Autofill defaults from history
  const handleSelectScript = (script: PowerShellScript, historyList: PowerShellRunHistory[]) => {
    setSelectedScript(script);
    
    // Find the last history item for this script
    const scriptHistory = historyList.filter((h) => h.scriptId === script.id);
    if (scriptHistory.length > 0) {
      const lastRun = scriptHistory[0];
      setWorkingDir(lastRun.workingDir);
      setParamValues(lastRun.paramValues);
      setRunAdmin(lastRun.isAdmin ?? false);
      setRunHidden(lastRun.isHidden ?? false);
    } else {
      // Use script parameter defaults
      setWorkingDir("");
      const defaults: Record<string, string | boolean | number> = {};
      script.params.forEach((p) => {
        if (p.defaultValue !== undefined) {
          defaults[p.name] = p.defaultValue;
        }
      });
      setParamValues(defaults);
      setRunAdmin(false);
      setRunHidden(false);
    }
  };

  // Open Browse folder Dialog
  const handleBrowseFolder = async () => {
    const selected = await selectFolder();
    if (selected) {
      setWorkingDir(selected);
    }
  };

  // Handle Scanning Params on text edit
  const handleScriptBodyChange = (body: string) => {
    setModalScriptBody(body);
    const parsed = parsePowerShellParams(body);
    setScannedParams(parsed);
  };

  // Import Script File
  const handleImportScript = async () => {
    try {
      const selected = await selectFile();
      if (selected) {
        const content = await fileService.readFile(selected);
        const fileName = selected.split(/[\\/]/).pop() || "Imported Script";
        setModalScriptName(fileName.replace(".ps1", ""));
        setModalScriptFilePath(selected);
        setModalScriptBody(content);
        const parsed = parsePowerShellParams(content);
        setScannedParams(parsed);
      }
    } catch (err) {
      message.error("Failed to import script: " + String(err));
    }
  };

  // Save/Register script
  const handleSaveScript = async () => {
    if (!modalScriptName.trim()) {
      message.error("Please enter a script name.");
      return;
    }
    if (!modalScriptBody.trim() && !modalScriptFilePath.trim()) {
      message.error("Please provide script body or import a file.");
      return;
    }

    const now = dayjs().toISOString();
    let updatedScripts: PowerShellScript[];

    if (editingScript) {
      const updated: PowerShellScript = {
        ...editingScript,
        name: modalScriptName,
        body: modalScriptBody,
        filePath: modalScriptFilePath || undefined,
        params: scannedParams,
        updatedAt: now,
      };
      updatedScripts = scripts.map((s) => (s.id === editingScript.id ? updated : s));
      if (selectedScript?.id === editingScript.id) {
        setSelectedScript(updated);
      }
    } else {
      const newScript: PowerShellScript = {
        id: nanoid(),
        name: modalScriptName,
        body: modalScriptBody,
        filePath: modalScriptFilePath || undefined,
        params: scannedParams,
        createdAt: now,
        updatedAt: now,
      };
      updatedScripts = [...scripts, newScript];
    }

    setScripts(updatedScripts);
    await savePowerShellScripts(updatedScripts);
    setModalOpen(false);
    message.success(editingScript ? "Script updated" : "Script registered successfully");
  };

  // Open Modal for New Script
  const handleNewScript = () => {
    setEditingScript(null);
    setModalScriptName("");
    setModalScriptBody("");
    setModalScriptFilePath("");
    setScannedParams([]);
    setModalOpen(true);
  };

  // Open Modal for Editing Script
  const handleEditScript = (script: PowerShellScript) => {
    setEditingScript(script);
    setModalScriptName(script.name);
    setModalScriptBody(script.body);
    setModalScriptFilePath(script.filePath || "");
    setScannedParams(script.params);
    setModalOpen(true);
  };

  // Delete Script
  const handleDeleteScript = async (id: string) => {
    Modal.confirm({
      title: "Delete Script",
      content: "Are you sure you want to delete this script?",
      okType: "danger",
      onOk: async () => {
        const updated = scripts.filter((s) => s.id !== id);
        setScripts(updated);
        await savePowerShellScripts(updated);
        if (selectedScript?.id === id) {
          setSelectedScript(updated[0] || null);
        }
        message.success("Script deleted");
      },
    });
  };

  // Execute PowerShell script
  const handleRun = async () => {
    if (!selectedScript) return;
    if (!workingDir.trim()) {
      message.error("Please specify a script directory.");
      return;
    }

    try {
      // 1. Construct parameters args string
      let argsString = "";
      selectedScript.params.forEach((p) => {
        const val = paramValues[p.name];
        if (p.type === "switch") {
          if (val === true) {
            argsString += ` -${p.name}`;
          }
        } else if (p.type === "int") {
          if (val !== undefined && val !== "") {
            argsString += ` -${p.name} ${val}`;
          }
        } else {
          if (val !== undefined && val !== "") {
            argsString += ` -${p.name} "${String(val).replace(/"/g, '`"')}"`;
          }
        }
      });

      // 2. Prepare execution command and path
      let runCmd = "";
      let executionFilePath = selectedScript.filePath;
      let isTempFile = false;
      const runId = nanoid();

      if (!executionFilePath) {
        // Write the script body to a temporary file in the selected working directory
        isTempFile = true;
        executionFilePath = `${workingDir}\\.tomo_temp_${runId}.ps1`;
        await fileService.writeFile(executionFilePath, selectedScript.body);
      }

      runCmd = `cd /d "${workingDir}" && powershell -ExecutionPolicy Bypass -File "${executionFilePath}"${argsString}`;
      
      if (isTempFile) {
        // Self-clean temporary file after running
        runCmd += ` & del "${executionFilePath}"`;
      }

      // 3. Execute
      const pid = await runScript(runCmd, runHidden, runAdmin);
      const startedAt = dayjs().toISOString();

      // 4. Save to history
      const historyEntry: PowerShellRunHistory = {
        id: runId,
        scriptId: selectedScript.id,
        scriptName: selectedScript.name,
        workingDir,
        paramValues: { ...paramValues },
        pid,
        status: "running",
        startedAt,
        isHidden: runHidden,
        isAdmin: runAdmin,
      };

      const updatedHistory = await appendPowerShellHistory(historyEntry);
      setHistory(updatedHistory);
      message.success(`Script started (PID: ${pid})`);
    } catch (err) {
      message.error("Failed to start script: " + String(err));
    }
  };

  // Window Visibility Controls
  const handleToggleWindow = async (item: PowerShellRunHistory) => {
    if (!item.pid) return;
    try {
      if (item.isHidden) {
        await showScriptWindow(item.pid);
        item.isHidden = false;
      } else {
        await hideScriptWindow(item.pid);
        item.isHidden = true;
      }
      // Save back to db
      const updated = history.map((h) => (h.id === item.id ? { ...item } : h));
      setHistory(updated);
      await setHistoryInDb(updated);
    } catch (err) {
      message.error("Failed to toggle window visibility: " + String(err));
    }
  };

  // Terminate script process
  const handleKill = async (item: PowerShellRunHistory) => {
    if (!item.pid) return;
    try {
      await killScript(item.pid);
      const endedAt = dayjs().toISOString();
      const updated = await updatePowerShellHistoryStatus(item.id, "failed", endedAt);
      setHistory(updated);
      message.warning("Script process terminated.");
    } catch (err) {
      message.error("Failed to kill process: " + String(err));
    }
  };

  // Delete History record
  const handleDeleteHistory = async (id: string) => {
    const updated = history.filter((h) => h.id !== id);
    setHistory(updated);
    await setHistoryInDb(updated);
    message.success("History record removed");
  };

  // Clone config from history
  const handleCloneConfig = (item: PowerShellRunHistory) => {
    const script = scripts.find((s) => s.id === item.scriptId);
    if (script) {
      setSelectedScript(script);
      setWorkingDir(item.workingDir);
      setParamValues(item.paramValues);
      setRunAdmin(item.isAdmin ?? false);
      setRunHidden(item.isHidden ?? false);
      setActiveTab("activation");
      message.info(`Loaded parameters configuration for script "${script.name}"`);
    } else {
      message.error("Original script no longer exists.");
    }
  };

  // Get unique list of recently used directories for a specific script
  const getRecentDirectories = () => {
    if (!selectedScript) return [];
    const dirs = history
      .filter((h) => h.scriptId === selectedScript.id)
      .map((h) => h.workingDir);
    return Array.from(new Set(dirs)).slice(0, 5); // Max 5 quick selection items
  };

  // Render Form inputs for parsed params
  const renderParamInput = (param: PowerShellParam) => {
    const val = paramValues[param.name];

    if (param.type === "switch") {
      return (
        <Form.Item label={param.name} labelCol={{ span: 6 }} wrapperCol={{ span: 18 }} key={param.name}>
          <Switch
            checked={!!val}
            onChange={(checked) => setParamValues((prev) => ({ ...prev, [param.name]: checked }))}
          />
        </Form.Item>
      );
    }

    if (param.type === "int") {
      return (
        <Form.Item label={param.name} labelCol={{ span: 6 }} wrapperCol={{ span: 18 }} key={param.name}>
          <InputNumber
            style={{ width: "100%" }}
            value={typeof val === "number" ? val : undefined}
            placeholder={param.defaultValue !== undefined ? String(param.defaultValue) : ""}
            onChange={(num) =>
              setParamValues((prev) => ({ ...prev, [param.name]: num !== null ? num : 0 }))
            }
          />
        </Form.Item>
      );
    }

    return (
      <Form.Item label={param.name} labelCol={{ span: 6 }} wrapperCol={{ span: 18 }} key={param.name}>
        <Input
          value={typeof val === "string" ? val : ""}
          placeholder={param.defaultValue !== undefined ? String(param.defaultValue) : ""}
          onChange={(e) => setParamValues((prev) => ({ ...prev, [param.name]: e.target.value }))}
        />
      </Form.Item>
    );
  };

  // Activation Subview
  const renderActivationTab = () => {
    const recentDirs = getRecentDirectories();

    return (
      <div style={{ display: "flex", gap: "20px", height: "calc(100vh - 170px)" }}>
        {/* Scripts List (Left Side) */}
        <Card
          title={
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>Scripts List</span>
              <Button type="primary" size="small" icon={<PlusOutlined />} onClick={handleNewScript}>
                Add Script
              </Button>
            </div>
          }
          style={{ width: "320px", display: "flex", flexDirection: "column" }}
          bodyStyle={{ overflowY: "auto", flex: 1, padding: "10px" }}
        >
          {scripts.length === 0 ? (
            <Empty description="No scripts registered" />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {scripts.map((script) => (
                <div
                  key={script.id}
                  onClick={() => handleSelectScript(script, history)}
                  style={{
                    padding: "10px",
                    borderRadius: "6px",
                    cursor: "pointer",
                    backgroundColor: selectedScript?.id === script.id ? "rgba(24, 144, 255, 0.15)" : "transparent",
                    border: selectedScript?.id === script.id ? "1px solid #1890ff" : "1px solid rgba(255, 255, 255, 0.08)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    transition: "all 0.2s",
                  }}
                >
                  <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    <Text strong style={{ color: selectedScript?.id === script.id ? "#1890ff" : "inherit" }}>
                      {script.name}
                    </Text>
                    <br />
                    <Text type="secondary" style={{ fontSize: "11px" }}>
                      {script.filePath ? "Imported File" : "Custom Script"}
                    </Text>
                  </div>
                  <Space>
                    <Button
                      type="text"
                      size="small"
                      icon={<EditOutlined />}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEditScript(script);
                      }}
                    />
                    <Button
                      type="text"
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteScript(script.id);
                      }}
                    />
                  </Space>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Config & Launch Form (Right Side) */}
        <Card
          title={selectedScript ? `Run Configurator: ${selectedScript.name}` : "Run Configurator"}
          style={{ flex: 1, overflowY: "auto" }}
        >
          {selectedScript ? (
            <Form layout="horizontal">
              {/* File Info */}
              {selectedScript.filePath && (
                <Form.Item label="Script Path" labelCol={{ span: 6 }} wrapperCol={{ span: 18 }}>
                  <Text code style={{ wordBreak: "break-all" }}>
                    {selectedScript.filePath}
                  </Text>
                </Form.Item>
              )}

              {/* Working Directory Selector */}
              <Form.Item label="Script Directory" labelCol={{ span: 6 }} wrapperCol={{ span: 18 }} required>
                <Space.Compact style={{ width: "100%" }}>
                  <Input
                    placeholder="E.g. e:\Projects\SpringBoot\tomo"
                    value={workingDir}
                    onChange={(e) => setWorkingDir(e.target.value)}
                  />
                  <Button icon={<FolderOpenOutlined />} onClick={handleBrowseFolder} />
                </Space.Compact>

                {/* Directory History List below */}
                {recentDirs.length > 0 && (
                  <div style={{ marginTop: "8px" }}>
                    <Text type="secondary" style={{ fontSize: "12px", display: "block", marginBottom: "4px" }}>
                      Recent Working Directories:
                    </Text>
                    <Space size={[0, 4]} wrap>
                      {recentDirs.map((dir) => (
                        <Tag
                          key={dir}
                          color="blue"
                          style={{ cursor: "pointer" }}
                          onClick={() => setWorkingDir(dir)}
                        >
                          {dir.split(/[\\/]/).pop() || dir}
                        </Tag>
                      ))}
                    </Space>
                  </div>
                )}
              </Form.Item>

              <Divider orientation={"left" as any} style={{ margin: "12px 0" }}>
                Script Parameters
              </Divider>

              {/* Parameter form inputs */}
              {selectedScript.params.length === 0 ? (
                <div style={{ padding: "10px", textAlign: "center" }}>
                  <Text type="secondary">No parameters scanned inside the script.</Text>
                </div>
              ) : (
                selectedScript.params.map(renderParamInput)
              )}

              <Divider orientation={"left" as any} style={{ margin: "12px 0" }}>
                Execution Options
              </Divider>

              <Form.Item label="Run Settings" labelCol={{ span: 6 }} wrapperCol={{ span: 18 }}>
                <Space direction="horizontal" size="large">
                  <Checkbox checked={runAdmin} onChange={(e) => setRunAdmin(e.target.checked)}>
                    Run as Administrator
                  </Checkbox>
                  <Checkbox checked={runHidden} onChange={(e) => setRunHidden(e.target.checked)}>
                    Run Hidden
                  </Checkbox>
                </Space>
              </Form.Item>

              <Form.Item wrapperCol={{ offset: 6, span: 18 }}>
                <Button type="primary" size="large" icon={<PlayCircleOutlined />} onClick={handleRun}>
                  Run Script
                </Button>
              </Form.Item>
            </Form>
          ) : (
            <div style={{ padding: "80px 0", textAlign: "center" }}>
              <Empty description="Register or select a script from the list to start configuration." />
            </div>
          )}
        </Card>
      </div>
    );
  };

  // Run History Subview
  const renderHistoryTab = () => {
    const columns = [
      {
        title: "Script Name",
        dataIndex: "scriptName",
        key: "scriptName",
        render: (name: string, record: PowerShellRunHistory) => (
          <Text strong style={{ color: "#1890ff", cursor: "pointer" }} onClick={() => {
            const sc = scripts.find((s) => s.id === record.scriptId);
            if (sc) handleSelectScript(sc, history);
            setActiveTab("activation");
          }}>
            {name}
          </Text>
        ),
      },
      {
        title: "Working Directory",
        dataIndex: "workingDir",
        key: "workingDir",
        render: (path: string) => <Text style={{ fontSize: "13px" }}>{path}</Text>,
      },
      {
        title: "PID",
        dataIndex: "pid",
        key: "pid",
        render: (pid?: number) => pid ? <Tag color="cyan">{pid}</Tag> : <Text>-</Text>,
      },
      {
        title: "Parameters",
        dataIndex: "paramValues",
        key: "paramValues",
        render: (vals: Record<string, string | boolean | number>) => {
          const keys = Object.keys(vals);
          if (keys.length === 0) return <Text type="secondary">None</Text>;
          const formatted = keys.map((k) => `${k}: ${vals[k]}`).join("\n");
          return (
            <Tooltip title={<pre style={{ margin: 0, fontSize: "11px" }}>{formatted}</pre>}>
              <Tag color="purple" style={{ cursor: "help" }}>
                {keys.length} params
              </Tag>
            </Tooltip>
          );
        },
      },
      {
        title: "Status",
        dataIndex: "status",
        key: "status",
        render: (status: string) => {
          if (status === "running") {
            return (
              <Badge status="processing" text={<Tag color="processing" style={{ animation: "pulse 1.5s infinite" }}>Running</Tag>} />
            );
          }
          if (status === "success") {
            return <Tag color="success">Completed</Tag>;
          }
          return <Tag color="error">Failed / Terminated</Tag>;
        },
      },
      {
        title: "Time",
        key: "time",
        render: (_: unknown, record: PowerShellRunHistory) => {
          const start = dayjs(record.startedAt).format("HH:mm:ss DD/MM");
          const end = record.endedAt ? dayjs(record.endedAt).format("HH:mm:ss") : "";
          return (
            <span style={{ fontSize: "12px" }}>
              {start} {end && `→ ${end}`}
            </span>
          );
        },
      },
      {
        title: "Actions",
        key: "actions",
        render: (_: unknown, record: PowerShellRunHistory) => {
          const isRunning = record.status === "running";
          return (
            <Space>
              {isRunning && (
                <>
                  <Tooltip title={record.isHidden ? "Show Console Window" : "Hide Console Window"}>
                    <Button
                      size="small"
                      icon={record.isHidden ? <EyeOutlined /> : <EyeInvisibleOutlined />}
                      onClick={() => handleToggleWindow(record)}
                    />
                  </Tooltip>
                  <Tooltip title="Kill Script Process">
                    <Button
                      size="small"
                      danger
                      icon={<StopOutlined />}
                      onClick={() => handleKill(record)}
                    />
                  </Tooltip>
                </>
              )}
              {!isRunning && (
                <Tooltip title="Re-run (Load Config)">
                  <Button
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={() => handleCloneConfig(record)}
                  />
                </Tooltip>
              )}
              <Button
                size="small"
                danger
                type="text"
                icon={<DeleteOutlined />}
                onClick={() => handleDeleteHistory(record.id)}
              />
            </Space>
          );
        },
      },
    ];

    return (
      <Card
        title={
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>Execution History Logs</span>
            <Button size="small" danger onClick={async () => {
              await clearPowerShellHistory();
              setHistory([]);
              message.success("History cleared");
            }}>
              Clear History
            </Button>
          </div>
        }
      >
        <Table
          dataSource={history}
          columns={columns}
          rowKey="id"
          size="middle"
          pagination={{ pageSize: 15 }}
          locale={{ emptyText: "No execution logs tracked yet." }}
        />
      </Card>
    );
  };

  const content = (
    <>
      <main className="dashboard-main">
        <section className="dashboard-content" style={{ padding: "20px", display: "flex", flexDirection: "column", height: "100%" }}>
          <div style={{ marginBottom: "15px" }}>
            <Tabs activeKey={activeTab} onChange={setActiveTab}>
              <Tabs.TabPane tab={<span><PlayCircleOutlined /> Script Activation</span>} key="activation" />
              <Tabs.TabPane tab={<span><HistoryOutlined /> Run History</span>} key="history" />
            </Tabs>
          </div>

          <div style={{ flex: 1 }}>
            {activeTab === "activation" ? renderActivationTab() : renderHistoryTab()}
          </div>
        </section>
      </main>

      {/* Script Import/Edit Modal */}
      <Modal
        title={editingScript ? "Edit Registered Script" : "Register New PowerShell Script"}
        open={modalOpen}
        onOk={handleSaveScript}
        onCancel={() => setModalOpen(false)}
        width={750}
        okText={editingScript ? "Save Changes" : "Register Script"}
      >
        <Form layout="vertical" style={{ marginTop: "15px" }}>
          <Form.Item label="Script Name" required>
            <Input
              placeholder="E.g. deploy-gateway"
              value={modalScriptName}
              onChange={(e) => setModalScriptName(e.target.value)}
            />
          </Form.Item>

          <Form.Item label="Import from File (Optional)">
            <Space.Compact style={{ width: "100%" }}>
              <Input
                placeholder="Path to .ps1 file"
                value={modalScriptFilePath}
                onChange={(e) => setModalScriptFilePath(e.target.value)}
              />
              <Button type="primary" onClick={handleImportScript}>
                Browse File
              </Button>
            </Space.Compact>
          </Form.Item>

          <Form.Item label="Script Body Content" required>
            <Input.TextArea
              rows={8}
              placeholder="Paste PowerShell script code here..."
              style={{ fontFamily: "monospace", fontSize: "13px" }}
              value={modalScriptBody}
              onChange={(e) => handleScriptBodyChange(e.target.value)}
            />
          </Form.Item>

          {scannedParams.length > 0 && (
            <div style={{ marginTop: "12px", background: "rgba(255, 255, 255, 0.02)", padding: "10px", borderRadius: "6px" }}>
              <Text strong style={{ fontSize: "13px", display: "block", marginBottom: "6px" }}>
                Scanned Parameters ({scannedParams.length}):
              </Text>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)", textAlign: "left" }}>
                    <th style={{ padding: "4px" }}>Param Name</th>
                    <th style={{ padding: "4px" }}>Type</th>
                    <th style={{ padding: "4px" }}>Default Value</th>
                  </tr>
                </thead>
                <tbody>
                  {scannedParams.map((p) => (
                    <tr key={p.name} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                      <td style={{ padding: "4px" }}>
                        <Text code>{p.name}</Text>
                      </td>
                      <td style={{ padding: "4px" }}>
                        <Tag color={p.type === "switch" ? "orange" : p.type === "int" ? "green" : "blue"}>
                          {p.type}
                        </Tag>
                      </td>
                      <td style={{ padding: "4px" }}>
                        {p.defaultValue !== undefined ? String(p.defaultValue) : <Text type="secondary">None</Text>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Form>
      </Modal>
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
