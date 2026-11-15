import { useEffect, useRef, useState } from "react";
import { getItem, setItem } from "@/infrastructure/tauri/kvStore";
import { useDispatch, useSelector } from "react-redux";
import { AppBar } from "@/presentation/components/AppBar";
import Sidebar from "@/presentation/features/dashboard/components/Sidebar";
import { AppDispatch, RootState } from "@/presentation/store";
import { setPageTitle } from "@/presentation/store/appSlice";
import {
  killProcess,
  PortInfo,
  scanPort,
  scanPorts,
} from "@/infrastructure/tauri/portService";
import "./PortsPage.scss";

interface PortsPageProps {
  panelMode?: boolean;
}

export default function PortsPage({ panelMode }: PortsPageProps) {
  const dispatch = useDispatch<AppDispatch>();
  const { theme } = useSelector((state: RootState) => state.app);

  const STORAGE_KEY = "ports_page_tracked_ports";

  const [ports, setPorts] = useState<number[]>([]);

  useEffect(() => {
    getItem(STORAGE_KEY).then((saved) => {
      if (saved) { try { setPorts(JSON.parse(saved)); } catch { /* ignore */ } }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [results, setResults] = useState<Record<number, PortInfo>>({});
  const [loading, setLoading] = useState<Set<number>>(new Set());
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [scanningAll, setScanningAll] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [inputError, setInputError] = useState("");
  const [killConfirm, setKillConfirm] = useState<PortInfo | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    dispatch(setPageTitle("Ports"));
  }, [dispatch]);

  useEffect(() => {
    setItem(STORAGE_KEY, JSON.stringify(ports));
  }, [ports]);

  const setPortLoading = (port: number, on: boolean) => {
    setLoading((prev) => {
      const next = new Set(prev);
      on ? next.add(port) : next.delete(port);
      return next;
    });
  };

  const refreshPort = async (port: number) => {
    setPortLoading(port, true);
    setErrors((prev) => { const n = { ...prev }; delete n[port]; return n; });
    try {
      const info = await scanPort(port);
      setResults((prev) => ({ ...prev, [port]: info }));
    } catch (e) {
      setErrors((prev) => ({ ...prev, [port]: String(e) }));
    } finally {
      setPortLoading(port, false);
    }
  };

  const addPort = async () => {
    const num = parseInt(inputValue, 10);
    if (isNaN(num) || num < 1 || num > 65535) {
      setInputError("Port phải từ 1 đến 65535");
      return;
    }
    if (ports.includes(num)) {
      setInputError("Port này đã được thêm");
      return;
    }
    setInputError("");
    setInputValue("");
    setPorts((prev) => [...prev, num]);
    await refreshPort(num);
    inputRef.current?.focus();
  };

  const removePort = (port: number) => {
    setPorts((prev) => prev.filter((p) => p !== port));
    setResults((prev) => { const n = { ...prev }; delete n[port]; return n; });
    setErrors((prev) => { const n = { ...prev }; delete n[port]; return n; });
  };

  const scanAll = async () => {
    if (ports.length === 0) return;
    setScanningAll(true);
    ports.forEach((p) => setPortLoading(p, true));
    setErrors({});
    try {
      const infos = await scanPorts(ports);
      const next: Record<number, PortInfo> = {};
      infos.forEach((info) => { next[info.port] = info; });
      setResults((prev) => ({ ...prev, ...next }));
    } catch (e) {
      // fallback: mark all as error
      const errs: Record<number, string> = {};
      ports.forEach((p) => { errs[p] = String(e); });
      setErrors(errs);
    } finally {
      ports.forEach((p) => setPortLoading(p, false));
      setScanningAll(false);
    }
  };

  const confirmKill = async () => {
    if (!killConfirm?.pid) return;
    const port = killConfirm.port;
    const pid = killConfirm.pid;
    setKillConfirm(null);
    setPortLoading(port, true);
    try {
      await killProcess(pid);
      await refreshPort(port);
    } catch (e) {
      setErrors((prev) => ({ ...prev, [port]: String(e) }));
      setPortLoading(port, false);
    }
  };

  const content = (
    <>
    <main className="dashboard-main">
      <section className="dashboard-content ports-page">

            <div className="ports-header">
              <h1 className="ports-title">Ports</h1>
              <button
                className="btn-scan-all"
                onClick={scanAll}
                disabled={scanningAll || ports.length === 0}
              >
                {scanningAll ? "Đang quét..." : "Quét tất cả"}
              </button>
            </div>

            <div className="ports-input-row">
              <input
                ref={inputRef}
                type="number"
                className={`port-input${inputError ? " error" : ""}`}
                placeholder="Nhập port (vd: 8080)"
                value={inputValue}
                min={1}
                max={65535}
                onChange={(e) => { setInputValue(e.target.value); setInputError(""); }}
                onKeyDown={(e) => e.key === "Enter" && addPort()}
              />
              <button className="btn-add-port" onClick={addPort}>
                Thêm
              </button>
              {inputError && <span className="input-error">{inputError}</span>}
            </div>

            {ports.length === 0 ? (
              <div className="ports-empty">
                Chưa có port nào. Nhập port ở trên để bắt đầu theo dõi.
              </div>
            ) : (
              <div className="ports-table-wrap">
                <table className="ports-table">
                  <thead>
                    <tr>
                      <th>Port</th>
                      <th>Trạng thái</th>
                      <th>PID</th>
                      <th>Process</th>
                      <th>Hành động</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ports.map((port) => {
                      const info = results[port];
                      const isLoading = loading.has(port);
                      const err = errors[port];
                      return (
                        <tr key={port}>
                          <td className="port-number">{port}</td>
                          <td>
                            {isLoading ? (
                              <span className="badge badge-scanning">Đang quét...</span>
                            ) : err ? (
                              <span className="badge badge-error" title={err}>Lỗi</span>
                            ) : info ? (
                              <span className={`badge badge-${info.status}`}>
                                {info.status === "free" ? "Rảnh" : "Đang dùng"}
                              </span>
                            ) : (
                              <span className="badge badge-unknown">—</span>
                            )}
                          </td>
                          <td className="port-pid">
                            {info?.pid ?? (isLoading || !info ? "—" : "—")}
                          </td>
                          <td className="port-process">
                            {info?.processName ?? (isLoading || !info ? "—" : "—")}
                          </td>
                          <td className="port-actions">
                            <button
                              className="btn-refresh"
                              onClick={() => refreshPort(port)}
                              disabled={isLoading}
                              title="Quét lại"
                            >
                              ↺
                            </button>
                            {info?.status === "occupied" && info.pid && (
                              <button
                                className="btn-kill"
                                onClick={() => setKillConfirm(info)}
                                disabled={isLoading}
                                title="Kill process"
                              >
                                Kill
                              </button>
                            )}
                            <button
                              className="btn-remove"
                              onClick={() => removePort(port)}
                              title="Xoá khỏi danh sách"
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </main>
      {killConfirm && (
        <div className="modal-overlay" onClick={() => setKillConfirm(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h3>Xác nhận Kill Process</h3>
            <p>
              Kill <strong>{killConfirm.processName ?? "process"}</strong> (PID{" "}
              <strong>{killConfirm.pid}</strong>) đang chiếm port{" "}
              <strong>{killConfirm.port}</strong>?
            </p>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setKillConfirm(null)}>
                Huỷ
              </button>
              <button className="btn-confirm-kill" onClick={confirmKill}>
                Kill
              </button>
            </div>
          </div>
        </div>
      )}
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
