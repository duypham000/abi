import React, { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  FolderPlus,
  FilePlus,
  Trash2,
  RotateCcw,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Folder,
  FileCode,
  Zap,
  BookmarkPlus,
  ArrowRight,
  RefreshCw,
  FolderOpen,
  Info,
  Layers,
} from "lucide-react";
import { isTauri } from "@/infrastructure/platform";
import { useBatchRenameStore, BatchPreset } from "../store/batchRenameStore";
import "./BatchRenamePage.scss";

interface FileItemInfo {
  path: string;
  name: string;
  ext: string;
  parent_dir: string;
  size: number;
}

interface RenameTaskItem {
  oldPath: string;
  newPath: string;
  oldName: string;
  newName: string;
  parentDir: string;
  size: number;
  status: "pending" | "success" | "error" | "exists";
  errorMsg?: string;
}

const COMMON_MOBILE_FOLDERS = [
  { label: "Download", path: "/sdcard/Download" },
  { label: "Documents", path: "/sdcard/Documents" },
  { label: "DCIM (Ảnh)", path: "/sdcard/DCIM" },
  { label: "Pictures", path: "/sdcard/Pictures" },
  { label: "Movies", path: "/sdcard/Movies" },
  { label: "Music", path: "/sdcard/Music" },
];

export default function BatchRenamePage() {
  const {
    cachedFolders,
    cachedFiles,
    presets,
    activeTab,
    fromExt,
    toExt,
    isRecursive,
    setActiveTab,
    setFromExt,
    setToExt,
    setIsRecursive,
    addFolder,
    removeFolder,
    clearFolders,
    addFiles,
    removeFile,
    clearFiles,
    savePreset,
    deletePreset,
  } = useBatchRenameStore();

  const [scannedFiles, setScannedFiles] = useState<FileItemInfo[]>([]);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [manualFolderInput, setManualFolderInput] = useState<string>("");
  const [presetNameInput, setPresetNameInput] = useState<string>("");
  const [executionErrors, setExecutionErrors] = useState<Record<string, string>>({});
  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Pick folder: Uses Tauri native directory picker on Windows/Desktop, or Directory Intent for Android File Manager apps
  const handleSelectFolder = async () => {
    if (isTauri()) {
      try {
        const folder = await invoke<string | null>("cmd_select_folder");
        if (folder) {
          addFolder(folder);
          setStatusMessage({ type: "success", text: `Đã thêm thư mục: ${folder}` });
          return;
        }
      } catch {
        // Fallback
      }
    }
    folderInputRef.current?.click();
  };

  // Pick multiple specific files
  const handleSelectFiles = async () => {
    if (isTauri()) {
      try {
        const files = await invoke<string[]>("cmd_select_files_multi");
        if (files && files.length > 0) {
          addFiles(files);
          setStatusMessage({ type: "success", text: `Đã thêm ${files.length} tệp.` });
          return;
        }
      } catch {
        // Fallback
      }
    }
    fileInputRef.current?.click();
  };

  // Callback when files are chosen in FILE mode
  const handleHtml5FilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;
    const paths: string[] = [];
    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      const p = (file as unknown as { path?: string }).path || file.name;
      paths.push(p);
    }
    addFiles(paths);
    setStatusMessage({ type: "success", text: `Đã chọn ${paths.length} file.` });
    if (e.target) e.target.value = "";
  };

  // Callback when folder is chosen in FOLDER mode on Android File Managers
  const handleHtml5FolderSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;

    const firstFile = selectedFiles[0];
    const relPath = firstFile.webkitRelativePath || firstFile.name;
    const nativePath = (firstFile as unknown as { path?: string }).path;

    let folderPath = "";
    if (nativePath) {
      const sep = nativePath.includes("\\") ? "\\" : "/";
      const parts = nativePath.split(sep);
      parts.pop(); // Remove filename to get parent directory
      folderPath = parts.join(sep);
    } else {
      const parts = relPath.split("/");
      folderPath = parts.length > 1 ? parts[0] : relPath;
    }

    if (!folderPath) folderPath = relPath;

    addFolder(folderPath);
    setStatusMessage({
      type: "success",
      text: `Đã chọn thư mục: ${folderPath}`,
    });
    if (e.target) e.target.value = "";
  };

  // Add manual folder path
  const handleAddManualFolder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualFolderInput.trim()) return;
    addFolder(manualFolderInput.trim());
    setManualFolderInput("");
    setStatusMessage({ type: "success", text: "Đã thêm thư mục." });
  };

  // Quét danh sách file theo cấu hình
  const scanFiles = useCallback(async () => {
    if (activeTab === "folders") {
      if (cachedFolders.length === 0) {
        setScannedFiles([]);
        return;
      }
      if (!isTauri()) {
        setScannedFiles([]);
        return;
      }
      setIsScanning(true);
      try {
        const folderPaths = cachedFolders.map((f) => f.path);
        const items = await invoke<FileItemInfo[]>("cmd_scan_folder_files", {
          folderPaths,
          recursive: isRecursive,
          targetExt: fromExt ? fromExt : null,
        });
        setScannedFiles(items || []);
      } catch (err: unknown) {
        console.error("Scan error:", err);
      } finally {
        setIsScanning(false);
      }
    }
  }, [activeTab, cachedFolders, isRecursive, fromExt]);

  useEffect(() => {
    scanFiles();
  }, [scanFiles]);

  // Compute Rename Tasks with cross-platform path joining
  const getRenameTasks = (): RenameTaskItem[] => {
    const cleanToExt = toExt.trim().replace(/^\.+/, "");
    if (!cleanToExt) return [];

    if (activeTab === "folders") {
      return scannedFiles.map((file) => {
        const dotIdx = file.name.lastIndexOf(".");
        const baseName = dotIdx > 0 ? file.name.substring(0, dotIdx) : file.name;
        const newName = `${baseName}.${cleanToExt}`;
        const sep = file.parent_dir.includes("/") ? "/" : "\\";
        const cleanParent = file.parent_dir.replace(/[/\\]+$/, "");
        const newPath = `${cleanParent}${sep}${newName}`;
        const err = executionErrors[file.path];
        return {
          oldPath: file.path,
          newPath,
          oldName: file.name,
          newName,
          parentDir: file.parent_dir,
          size: file.size,
          status: err ? "error" : file.path === newPath ? "exists" : "pending",
          errorMsg: err,
        };
      });
    }

    if (activeTab === "files" || activeTab === "quick") {
      const cleanFromExt = fromExt.trim().replace(/^\.+/, "").toLowerCase();
      return cachedFiles
        .filter((file) => {
          if (!cleanFromExt || cleanFromExt === "*") return true;
          return file.ext.toLowerCase() === cleanFromExt;
        })
        .map((file) => {
          const dotIdx = file.name.lastIndexOf(".");
          const baseName = dotIdx > 0 ? file.name.substring(0, dotIdx) : file.name;
          const newName = `${baseName}.${cleanToExt}`;
          const sep = file.path.includes("/") ? "/" : "\\";
          const lastSepIdx = Math.max(file.path.lastIndexOf("/"), file.path.lastIndexOf("\\"));
          const parentDir = lastSepIdx > 0 ? file.path.substring(0, lastSepIdx) : "";
          const newPath = parentDir ? `${parentDir}${sep}${newName}` : newName;
          const err = executionErrors[file.path];
          return {
            oldPath: file.path,
            newPath,
            oldName: file.name,
            newName,
            parentDir,
            size: 0,
            status: err ? "error" : file.path === newPath ? "exists" : "pending",
            errorMsg: err,
          };
        });
    }

    return [];
  };

  const tasks = getRenameTasks();
  const validTasks = tasks.filter((t) => t.status === "pending");

  // Batch execute rename
  const handleExecuteBatchRename = async () => {
    if (validTasks.length === 0) {
      setStatusMessage({ type: "error", text: "Vui lòng nhập đuôi file đích (ví dụ: md, webp)." });
      return;
    }

    if (!isTauri()) {
      setStatusMessage({
        type: "error",
        text: "Thao tác đổi file trực tiếp yêu cầu ứng dụng Tauri / Android.",
      });
      return;
    }

    setIsProcessing(true);
    setStatusMessage(null);
    setExecutionErrors({});

    try {
      const payload = validTasks.map((t) => ({
        old_path: t.oldPath,
        new_path: t.newPath,
      }));

      const results = await invoke<
        { old_path: string; new_path: string; success: boolean; error?: string }[]
      >("cmd_batch_rename_files", { tasks: payload });

      const successCount = results.filter((r) => r.success).length;
      const failedItems = results.filter((r) => !r.success);
      const failCount = failedItems.length;

      const errMap: Record<string, string> = {};
      failedItems.forEach((item) => {
        errMap[item.old_path] = item.error || "Bị từ chối truy cập hoặc đường dẫn không hợp lệ";
      });
      setExecutionErrors(errMap);

      if (failCount === 0) {
        setStatusMessage({
          type: "success",
          text: `🎉 Đã đổi đuôi thành công ${successCount} file!`,
        });
      } else {
        const firstErrDetail = failedItems
          .map((item) => {
            const fileName = item.old_path.split(/[/\\]/).pop() || item.old_path;
            return `${fileName}: ${item.error || "Permission denied / Path error"}`;
          })
          .slice(0, 2)
          .join(" | ");

        setStatusMessage({
          type: "error",
          text: `Thành công ${successCount} file, thất bại ${failCount} file. Nguyên nhân: ${firstErrDetail}`,
        });
      }

      await scanFiles();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatusMessage({ type: "error", text: `Lỗi hệ thống khi đổi file: ${msg}` });
    } finally {
      setIsProcessing(false);
    }
  };

  // Preset apply
  const handleApplyPreset = (preset: BatchPreset) => {
    setFromExt(preset.fromExt);
    setToExt(preset.toExt);
    setIsRecursive(preset.recursive);
    setStatusMessage({
      type: "info",
      text: `Đã áp dụng mẫu: ${preset.name}`,
    });
  };

  const handleCreatePreset = (e: React.FormEvent) => {
    e.preventDefault();
    if (!presetNameInput.trim() || !toExt.trim()) return;
    savePreset({
      name: presetNameInput.trim(),
      fromExt,
      toExt,
      recursive: isRecursive,
    });
    setPresetNameInput("");
    setStatusMessage({ type: "success", text: "Đã lưu mẫu đổi đuôi!" });
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  return (
    <div className="mobile-batch-rename">
      {/* Target Directory Picker (Android Directory Intent & WebKit Directory attribute) */}
      <input
        type="file"
        ref={folderInputRef}
        {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
        accept="vnd.android.document/directory,resource/folder,folder/*"
        multiple
        onChange={handleHtml5FolderSelected}
        style={{ display: "none" }}
      />

      {/* Target Specific File Picker (Android File Intent) */}
      <input
        type="file"
        ref={fileInputRef}
        multiple
        accept="*/*"
        onChange={handleHtml5FilesSelected}
        style={{ display: "none" }}
      />

      {/* Header */}
      <div className="mobile-header">
        <div className="mobile-header__icon">
          <Sparkles size={20} />
        </div>
        <div className="mobile-header__titles">
          <h2>Đổi Đuôi File Hàng Loạt</h2>
          <p>Hỗ trợ Android File Manager & Desktop</p>
        </div>
      </div>

      {/* Mode / Target Selector Bar */}
      <div className="target-mode-bar">
        <span className="mode-label">
          <Layers size={14} /> Mục tiêu chọn (Target Mode):
        </span>
        <div className="segmented-tabs">
          <button
            className={`tab-btn ${activeTab === "folders" ? "is-active" : ""}`}
            onClick={() => setActiveTab("folders")}
          >
            <Folder size={16} />
            <span>📁 Thư Mục (Folder)</span>
            {cachedFolders.length > 0 && (
              <span className="tab-badge">{cachedFolders.length}</span>
            )}
          </button>

          <button
            className={`tab-btn ${activeTab === "files" ? "is-active" : ""}`}
            onClick={() => setActiveTab("files")}
          >
            <FileCode size={16} />
            <span>📄 Các Tệp (Files)</span>
            {cachedFiles.length > 0 && (
              <span className="tab-badge">{cachedFiles.length}</span>
            )}
          </button>

          <button
            className={`tab-btn ${activeTab === "quick" ? "is-active" : ""}`}
            onClick={() => setActiveTab("quick")}
          >
            <Zap size={16} />
            <span>⚡ Mẫu Đổi</span>
          </button>
        </div>
      </div>

      {/* Content Container */}
      <div className="mobile-body">
        {/* Status Toast */}
        {statusMessage && (
          <div className={`toast-banner toast-banner--${statusMessage.type}`}>
            {statusMessage.type === "success" && <CheckCircle2 size={16} />}
            {statusMessage.type === "error" && <AlertCircle size={16} />}
            {statusMessage.type === "info" && <Sparkles size={16} />}
            <span className="toast-text">{statusMessage.text}</span>
            <button
              className="toast-close"
              onClick={() => setStatusMessage(null)}
            >
              ×
            </button>
          </div>
        )}

        {/* TAB 1: TARGET = THƯ MỤC (FOLDER MODE) */}
        {activeTab === "folders" && (
          <div className="card-box">
            <div className="card-box__head">
              <span className="card-box__title">
                <FolderOpen size={18} /> Mục tiêu: Chọn Thư Mục ({cachedFolders.length})
              </span>
              {cachedFolders.length > 0 && (
                <button className="icon-btn-danger" onClick={clearFolders}>
                  <Trash2 size={16} />
                </button>
              )}
            </div>

            {/* Explanatory Banner for Android File Managers */}
            <div className="folder-guide-banner">
              <Info size={16} className="guide-icon" />
              <span>
                <strong>Dành cho Android:</strong> Chọn ứng dụng Quản lý file của bạn (Google Files, ZArchiver, Cx Explorer...). Bạn có thể chọn 1 file trong folder cần làm việc, ứng dụng sẽ tự động trích xuất đúng thư mục đó.
              </span>
            </div>

            <div className="action-button-group">
              <button
                className="primary-touch-btn"
                onClick={handleSelectFolder}
              >
                <FolderPlus size={20} /> Mở Trình Chọn Thư Mục (Folder Picker)
              </button>
            </div>

            {/* Quick Android preset folders */}
            <div className="folder-quick-chips">
              <span className="chip-label">Đường dẫn folder hệ thống Android:</span>
              <div className="chips-wrapper">
                {COMMON_MOBILE_FOLDERS.map((f) => (
                  <button
                    key={f.path}
                    type="button"
                    className="quick-chip"
                    onClick={() => {
                      addFolder(f.path);
                      setStatusMessage({
                        type: "success",
                        text: `Đã chọn thư mục: ${f.path}`,
                      });
                    }}
                  >
                    + {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Direct path input */}
            <form onSubmit={handleAddManualFolder} className="path-input-form">
              <input
                type="text"
                className="path-input"
                placeholder="Nhập đường dẫn folder (VD: /sdcard/Download)"
                value={manualFolderInput}
                onChange={(e) => setManualFolderInput(e.target.value)}
              />
              <button type="submit" className="add-path-btn">
                Thêm
              </button>
            </form>

            {/* Folder list */}
            {cachedFolders.length > 0 && (
              <div className="selected-items-list">
                {cachedFolders.map((f) => (
                  <div key={f.path} className="selected-item-row">
                    <span className="item-icon">📁</span>
                    <div className="item-meta">
                      <span className="item-name">{f.name}</span>
                      <span className="item-sub">{f.path}</span>
                    </div>
                    <button
                      className="remove-btn"
                      onClick={() => removeFolder(f.path)}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: TARGET = TỆP FILE (FILE MODE) */}
        {activeTab === "files" && (
          <div className="card-box">
            <div className="card-box__head">
              <span className="card-box__title">
                <FileCode size={18} /> Mục tiêu: Chọn Các Tệp File ({cachedFiles.length})
              </span>
              {cachedFiles.length > 0 && (
                <button className="icon-btn-danger" onClick={clearFiles}>
                  <Trash2 size={16} />
                </button>
              )}
            </div>

            <div className="action-button-group">
              <button className="primary-touch-btn" onClick={handleSelectFiles}>
                <FilePlus size={20} /> Mở Trình Chọn Tệp File (File Picker)
              </button>
            </div>

            {cachedFiles.length > 0 && (
              <div className="selected-items-list">
                {cachedFiles.map((file) => (
                  <div key={file.path} className="selected-item-row">
                    <span className="item-icon">📄</span>
                    <div className="item-meta">
                      <span className="item-name">{file.name}</span>
                      <span className="item-sub">{file.path}</span>
                    </div>
                    <span className="ext-badge">.{file.ext || "file"}</span>
                    <button
                      className="remove-btn"
                      onClick={() => removeFile(file.path)}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: QUICK PRESETS */}
        {activeTab === "quick" && (
          <div className="card-box">
            <div className="card-box__head">
              <span className="card-box__title">
                <BookmarkPlus size={18} /> Mẫu Đổi Đuôi Nhanh
              </span>
            </div>

            <div className="preset-cards-stack">
              {presets.map((preset) => (
                <div key={preset.id} className="preset-item-card">
                  <div className="preset-info">
                    <span className="preset-title">{preset.name}</span>
                    <div className="preset-rule">
                      <code>.{preset.fromExt || "*"}</code>
                      <ArrowRight size={12} />
                      <code>.{preset.toExt}</code>
                    </div>
                  </div>
                  <div className="preset-actions">
                    <button
                      className="preset-apply-btn"
                      onClick={() => handleApplyPreset(preset)}
                    >
                      Áp dụng
                    </button>
                    <button
                      className="remove-btn"
                      onClick={() => deletePreset(preset.id)}
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <form onSubmit={handleCreatePreset} className="create-preset-form">
              <input
                type="text"
                className="path-input"
                placeholder="Tên mẫu mới (VD: JPG -> PNG)"
                value={presetNameInput}
                onChange={(e) => setPresetNameInput(e.target.value)}
              />
              <button type="submit" className="add-path-btn">
                Lưu Mẫu
              </button>
            </form>
          </div>
        )}

        {/* CONFIG CARD */}
        <div className="card-box config-card">
          <div className="card-box__head">
            <span className="card-box__title">⚙️ Cấu Hình Đuôi Mới</span>
            {activeTab === "folders" && (
              <button
                className="refresh-btn"
                onClick={scanFiles}
                disabled={isScanning}
              >
                <RefreshCw size={14} className={isScanning ? "spin" : ""} /> Scan
              </button>
            )}
          </div>

          <div className="config-form-grid">
            <div className="field-group">
              <label>Đuôi Nguồn (Gốc)</label>
              <div className="input-prefix-box">
                <span className="dot-prefix">.</span>
                <input
                  type="text"
                  placeholder="txt, png, *..."
                  value={fromExt}
                  onChange={(e) => setFromExt(e.target.value)}
                />
              </div>
            </div>

            <div className="field-group">
              <label>
                Đuôi Mới (Đích) <span className="star">*</span>
              </label>
              <div className="input-prefix-box">
                <span className="dot-prefix">.</span>
                <input
                  type="text"
                  placeholder="md, webp, jpg..."
                  value={toExt}
                  onChange={(e) => setToExt(e.target.value)}
                />
              </div>
            </div>
          </div>

          {activeTab === "folders" && (
            <label className="recursive-checkbox">
              <input
                type="checkbox"
                checked={isRecursive}
                onChange={(e) => setIsRecursive(e.target.checked)}
              />
              <span>Quét cả thư mục con (Subfolders)</span>
            </label>
          )}
        </div>

        {/* PREVIEW LIST CARD */}
        <div className="card-box preview-card">
          <div className="card-box__head">
            <span className="card-box__title">
              👁️ Danh Sách Xem Trước ({tasks.length})
            </span>
            {validTasks.length > 0 && (
              <span className="ready-badge">Sẵn sàng: {validTasks.length}</span>
            )}
          </div>

          {tasks.length === 0 ? (
            <div className="empty-preview">
              <p>Chưa có file nào khớp với đuôi nguồn.</p>
            </div>
          ) : (
            <div className="preview-cards-list">
              {tasks.map((task, idx) => (
                <div key={idx} className="preview-item-card">
                  <div className="preview-names">
                    <span className="old-name">{task.oldName}</span>
                    <div className="change-arrow">
                      <ArrowRight size={14} />
                      <span className="new-name">{task.newName}</span>
                    </div>
                  </div>
                  <div className="preview-meta">
                    <span className="dir-path">
                      {task.parentDir}
                      {task.size > 0 ? ` · ${formatSize(task.size)}` : ""}
                    </span>
                    {task.status === "pending" && (
                      <span className="status-tag status-tag--ok">Ready</span>
                    )}
                    {task.status === "exists" && (
                      <span className="status-tag status-tag--warn">Trùng tên</span>
                    )}
                    {task.status === "error" && (
                      <span className="status-tag status-tag--err" title={task.errorMsg}>
                        Lỗi: {task.errorMsg}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* FLOATING RESPONSIVE FOOTER */}
      <div className="mobile-footer">
        <div className="footer-status">
          <span>
            Đổi sang <strong>.{toExt || "???"}</strong> ({validTasks.length} file)
          </span>
        </div>

        <button
          className="execute-action-btn"
          onClick={handleExecuteBatchRename}
          disabled={validTasks.length === 0 || isProcessing}
        >
          {isProcessing ? (
            <>
              <RotateCcw size={20} className="spin" /> Đang đổi...
            </>
          ) : (
            <>
              <Zap size={20} /> Đổi Đuôi Hàng Loạt ({validTasks.length})
            </>
          )}
        </button>
      </div>
    </div>
  );
}
