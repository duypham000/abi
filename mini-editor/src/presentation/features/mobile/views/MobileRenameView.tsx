import React, { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  FolderSearch,
  FileEdit,
  RefreshCw,
  CheckSquare,
  Square,
  Play,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Filter,
  Layers,
  FileCheck,
} from "lucide-react";
import { FolderScannerModal } from "../components/FolderScannerModal";
import { StoragePermissionModal } from "../components/StoragePermissionModal";
import type { FileItemInfo, RenameTask, RenameResult } from "../types";
import { isTauri } from "@/infrastructure/platform";

export const MobileRenameView: React.FC = () => {
  const [selectedFolder, setSelectedFolder] = useState<string>("/storage/emulated/0/Download");
  const [oldExt, setOldExt] = useState<string>("*");
  const [newExt, setNewExt] = useState<string>("md");
  const [recursive, setRecursive] = useState<boolean>(false);

  const [files, setFiles] = useState<FileItemInfo[]>([]);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState<boolean>(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [executing, setExecuting] = useState<boolean>(false);
  const [resultSummary, setResultSummary] = useState<{ total: number; success: number; failed: number } | null>(null);

  const [isFolderModalOpen, setIsFolderModalOpen] = useState<boolean>(false);
  const [hasPermission, setHasPermission] = useState<boolean>(true);
  const [showPermModal, setShowPermModal] = useState<boolean>(false);

  // Check Storage Permission
  const checkPermission = useCallback(async () => {
    if (!isTauri()) return;
    try {
      const granted = await invoke<boolean>("cmd_check_storage_permission");
      setHasPermission(granted);
      if (!granted) {
        setShowPermModal(true);
      }
    } catch {
      setHasPermission(true);
    }
  }, []);

  useEffect(() => {
    checkPermission();
  }, [checkPermission]);

  const requestPermission = async () => {
    if (!isTauri()) {
      setHasPermission(true);
      setShowPermModal(false);
      return;
    }
    try {
      const ok = await invoke<boolean>("cmd_request_storage_permission");
      setHasPermission(ok);
      if (ok) setShowPermModal(false);
    } catch (e) {
      alert(String(e));
    }
  };

  // Scan files in selected folder matching criteria
  const scanFiles = useCallback(async () => {
    if (!selectedFolder) return;
    setLoading(true);
    setScanError(null);
    setResultSummary(null);
    try {
      if (isTauri()) {
        const result = await invoke<FileItemInfo[]>("cmd_scan_folder_files", {
          folderPaths: [selectedFolder],
          recursive,
          targetExt: oldExt.trim() ? oldExt.trim() : null,
        });
        setFiles(result);
        setSelectedPaths(new Set(result.map((f) => f.path)));
      } else {
        // Mock data for web preview
        const mock: FileItemInfo[] = [
          { path: `${selectedFolder}/notes_01.txt`, name: "notes_01.txt", ext: "txt", parent_dir: selectedFolder, size: 1024 },
          { path: `${selectedFolder}/photo_02.png`, name: "photo_02.png", ext: "png", parent_dir: selectedFolder, size: 204800 },
          { path: `${selectedFolder}/draft_doc.pdf`, name: "draft_doc.pdf", ext: "pdf", parent_dir: selectedFolder, size: 512000 },
        ];
        setFiles(mock);
        setSelectedPaths(new Set(mock.map((f) => f.path)));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Scan error:", msg);
      setScanError(msg || "Không thể quét file trong thư mục này. Hãy kiểm tra lại đường dẫn hoặc quyền bộ nhớ.");
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, [selectedFolder, oldExt, recursive]);

  useEffect(() => {
    scanFiles();
  }, [scanFiles]);

  const toggleSelectAll = () => {
    if (selectedPaths.size === files.length) {
      setSelectedPaths(new Set());
    } else {
      setSelectedPaths(new Set(files.map((f) => f.path)));
    }
  };

  const toggleSelectFile = (path: string) => {
    const next = new Set(selectedPaths);
    if (next.has(path)) {
      next.delete(path);
    } else {
      next.add(path);
    }
    setSelectedPaths(next);
  };

  const computeNewPath = (item: FileItemInfo): string => {
    const cleanNewExt = newExt.trim().replace(/^\./, "");
    if (!cleanNewExt) return item.path;

    const lastDot = item.name.lastIndexOf(".");
    const baseName = lastDot > 0 ? item.name.substring(0, lastDot) : item.name;
    const newName = `${baseName}.${cleanNewExt}`;
    return `${item.parent_dir}/${newName}`.replace(/\/+/g, "/");
  };

  const executeRename = async () => {
    const selectedFiles = files.filter((f) => selectedPaths.has(f.path));
    if (selectedFiles.length === 0) {
      alert("Vui lòng chọn ít nhất một file để đổi tên.");
      return;
    }
    const cleanNewExt = newExt.trim().replace(/^\./, "");
    if (!cleanNewExt) {
      alert("Vui lòng nhập đuôi file mới.");
      return;
    }

    setExecuting(true);
    setResultSummary(null);

    const tasks: RenameTask[] = selectedFiles.map((item) => ({
      old_path: item.path,
      new_path: computeNewPath(item),
    }));

    try {
      if (isTauri()) {
        const results = await invoke<RenameResult[]>("cmd_batch_rename_files", { tasks });
        const successCount = results.filter((r) => r.success).length;
        const failedCount = results.length - successCount;
        setResultSummary({
          total: results.length,
          success: successCount,
          failed: failedCount,
        });
      } else {
        setResultSummary({
          total: tasks.length,
          success: tasks.length,
          failed: 0,
        });
      }
      // Re-scan folder after rename
      await scanFiles();
    } catch (e: unknown) {
      alert(`Lỗi khi thực hiện đổi tên: ${String(e)}`);
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto p-4 sm:p-6 flex flex-col gap-5 pb-24">
      {/* Title */}
      <div className="flex items-center gap-3">
        <div className="p-3 rounded-2xl bg-blue-600/10 text-blue-600 dark:text-blue-400">
          <FileEdit className="w-7 h-7" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
            Đổi Tên File Hàng Loạt
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Đổi hàng loạt đuôi tệp tin trong thư mục được chọn
          </p>
        </div>
      </div>

      {/* Permission Warning Banner */}
      {!hasPermission && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-3 text-amber-600 dark:text-amber-400 text-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>Chưa cấp quyền truy cập bộ nhớ thiết bị</span>
          </div>
          <button
            onClick={requestPermission}
            className="px-3 py-1.5 bg-amber-600 text-white rounded-lg font-semibold hover:bg-amber-700 transition-colors"
          >
            Cấp quyền
          </button>
        </div>
      )}

      {/* Section 1: Target Folder Chooser */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col gap-3">
        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
          <FolderSearch className="w-4 h-4 text-blue-500" />
          Thư mục được chọn
        </label>

        <div className="flex gap-2">
          <div className="flex-1 px-3 py-2.5 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-mono text-slate-700 dark:text-slate-200 overflow-x-auto whitespace-nowrap border border-slate-200 dark:border-slate-700">
            {selectedFolder || "Chưa chọn thư mục nào"}
          </div>

          <button
            onClick={() => setIsFolderModalOpen(true)}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs rounded-xl shadow-md shadow-blue-500/20 flex items-center gap-1.5 transition-all flex-shrink-0"
          >
            <FolderSearch className="w-4 h-4" />
            Duyệt folder
          </button>
        </div>
      </div>

      {/* Section 2: Extension Filter & Target Config */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col gap-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5 flex items-center gap-1">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              Đuôi file cần đổi (cũ)
            </label>
            <input
              type="text"
              value={oldExt}
              onChange={(e) => setOldExt(e.target.value)}
              placeholder="ví dụ: txt, png, pdf hoặc *"
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
            {/* Quick Extension Chips */}
            <div className="flex gap-1.5 mt-2 overflow-x-auto pb-1 scrollbar-none">
              {["*", "txt", "png", "jpg", "pdf", "docx", "mp4"].map((ext) => (
                <button
                  key={ext}
                  type="button"
                  onClick={() => setOldExt(ext)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-medium transition-colors border ${
                    oldExt === ext
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-blue-400"
                  }`}
                >
                  {ext === "*" ? "* Tất cả" : ext}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5 flex items-center gap-1">
              <FileCheck className="w-3.5 h-3.5 text-blue-500" />
              Đuôi file mới
            </label>
            <input
              type="text"
              value={newExt}
              onChange={(e) => setNewExt(e.target.value)}
              placeholder="ví dụ: md, webp, docx"
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
          <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
            <input
              type="checkbox"
              checked={recursive}
              onChange={(e) => setRecursive(e.target.checked)}
              className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
            />
            <span className="flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-slate-400" />
              Bao gồm cả các thư mục con (Recursive)
            </span>
          </label>

          <button
            onClick={scanFiles}
            className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-1 text-xs"
            title="Tải lại danh sách file"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Quét lại
          </button>
        </div>
      </div>

      {/* Scan Error Banner */}
      {scanError && (
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-xs flex items-start gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-bold mb-0.5">Không thể quét file:</div>
            <div>{scanError}</div>
          </div>
        </div>
      )}

      {/* Section 3: File List Preview */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={toggleSelectAll}
              className="p-1 text-slate-500 hover:text-blue-600 transition-colors"
            >
              {selectedPaths.size > 0 && selectedPaths.size === files.length ? (
                <CheckSquare className="w-5 h-5 text-blue-600" />
              ) : (
                <Square className="w-5 h-5" />
              )}
            </button>
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Chọn tất cả ({selectedPaths.size}/{files.length} file)
            </span>
          </div>
        </div>

        {/* File Table / List */}
        <div className="max-h-64 overflow-y-auto border border-slate-100 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800">
          {files.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400 leading-relaxed">
              {loading
                ? "Đang quét danh sách file..."
                : `Không tìm thấy file nào khớp trong thư mục "${selectedFolder}". Vui lòng chọn nút "* Tất cả" ở trên hoặc chọn thư mục khác.`}
            </div>
          ) : (
            files.map((item) => {
              const isChecked = selectedPaths.has(item.path);
              const lastDot = item.name.lastIndexOf(".");
              const baseName = lastDot > 0 ? item.name.substring(0, lastDot) : item.name;
              const targetNewName = `${baseName}.${newExt.trim().replace(/^\./, "")}`;

              return (
                <div
                  key={item.path}
                  onClick={() => toggleSelectFile(item.path)}
                  className={`p-3 flex items-center justify-between gap-3 text-xs cursor-pointer transition-colors ${
                    isChecked
                      ? "bg-blue-50/50 dark:bg-blue-950/20"
                      : "hover:bg-slate-50 dark:hover:bg-slate-850"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {isChecked ? (
                      <CheckSquare className="w-4 h-4 text-blue-600 flex-shrink-0" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    )}
                    <div className="min-w-0 font-mono">
                      <div className="text-slate-800 dark:text-slate-200 truncate font-medium">
                        {item.name}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate flex items-center gap-1 mt-0.5">
                        <ArrowRight className="w-2.5 h-2.5 text-blue-500" />
                        <span className="text-blue-600 dark:text-blue-400 font-semibold">
                          {targetNewName}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="text-[10px] text-slate-400 flex-shrink-0 font-mono">
                    {(item.size / 1024).toFixed(1)} KB
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Result Toast Banner */}
      {resultSummary && (
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-500" />
          <div>
            <div className="font-bold">Đổi tên hoàn tất!</div>
            <div>
              Đã thành công {resultSummary.success}/{resultSummary.total} file
              {resultSummary.failed > 0 && ` (${resultSummary.failed} file thất bại)`}.
            </div>
          </div>
        </div>
      )}

      {/* Action Footer */}
      <button
        onClick={executeRename}
        disabled={executing || selectedPaths.size === 0}
        className={`w-full py-3.5 px-6 flex items-center justify-center gap-2.5 text-white font-semibold rounded-2xl shadow-xl transition-all ${
          executing || selectedPaths.size === 0
            ? "bg-slate-400 dark:bg-slate-700 cursor-not-allowed opacity-60"
            : "bg-blue-600 hover:bg-blue-700 active:bg-blue-800 shadow-blue-500/25 active:scale-[0.99]"
        }`}
      >
        <Play className="w-5 h-5 fill-current" />
        {executing ? "Đang tiến hành đổi tên..." : `Đổi tên ${selectedPaths.size} file đã chọn`}
      </button>

      {/* Modals */}
      <FolderScannerModal
        isOpen={isFolderModalOpen}
        initialPath={selectedFolder}
        onSelectFolder={(path) => setSelectedFolder(path)}
        onClose={() => setIsFolderModalOpen(false)}
      />

      <StoragePermissionModal
        isOpen={showPermModal}
        onRequestPermission={requestPermission}
        onClose={() => setShowPermModal(false)}
      />
    </div>
  );
};
