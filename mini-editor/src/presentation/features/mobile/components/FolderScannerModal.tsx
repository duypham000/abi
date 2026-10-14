import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Folder,
  FolderPlus,
  CornerLeftUp,
  CheckCircle,
  X,
  HardDrive,
  Download,
  FileText,
  Camera,
  Image as ImageIcon,
  Loader2,
  AlertCircle,
} from "lucide-react";
import type { DirectoryContentInfo } from "../types";
import { isTauri } from "@/infrastructure/platform";

interface FolderScannerModalProps {
  isOpen: boolean;
  initialPath?: string;
  onSelectFolder: (path: string) => void;
  onClose: () => void;
}

const ANDROID_SHORTCUTS = [
  { name: "Bộ nhớ trong", path: "/storage/emulated/0", icon: HardDrive },
  { name: "Download", path: "/storage/emulated/0/Download", icon: Download },
  { name: "Documents", path: "/storage/emulated/0/Documents", icon: FileText },
  { name: "DCIM", path: "/storage/emulated/0/DCIM", icon: Camera },
  { name: "Pictures", path: "/storage/emulated/0/Pictures", icon: ImageIcon },
];

export const FolderScannerModal: React.FC<FolderScannerModalProps> = ({
  isOpen,
  initialPath,
  onSelectFolder,
  onClose,
}) => {
  const [currentPath, setCurrentPath] = useState<string>(initialPath || "/storage/emulated/0");
  const [dirContent, setDirContent] = useState<DirectoryContentInfo | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const loadDirectory = async (targetPath: string) => {
    setLoading(true);
    setError(null);
    try {
      if (isTauri()) {
        const result = await invoke<DirectoryContentInfo>("cmd_list_directory_contents", {
          path: targetPath,
        });
        setDirContent(result);
        setCurrentPath(result.current_path);
      } else {
        // Mock fallback for browser dev mode
        setDirContent({
          current_path: targetPath,
          parent_path: targetPath !== "/" ? "/storage/emulated/0" : null,
          subdirs: [
            { path: `${targetPath}/Download`, name: "Download", parent_dir: targetPath, item_count: 12 },
            { path: `${targetPath}/Documents`, name: "Documents", parent_dir: targetPath, item_count: 5 },
            { path: `${targetPath}/Pictures`, name: "Pictures", parent_dir: targetPath, item_count: 34 },
          ],
          files: [],
        });
        setCurrentPath(targetPath);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || "Không thể đọc nội dung thư mục này.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadDirectory(initialPath || "/storage/emulated/0");
    }
  }, [isOpen, initialPath]);

  if (!isOpen) return null;

  const pathParts = currentPath.split("/").filter(Boolean);

  return (
    <div
      style={{
        paddingTop: "calc(env(safe-area-inset-top, 0px) + 0.75rem)",
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 0.75rem)",
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-sm animate-fadeIn"
    >
      <div className="w-full max-w-lg h-full max-h-[85vh] flex flex-col bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100 overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-2.5">
            <FolderPlus className="w-5 h-5 text-blue-500" />
            <h3 className="text-lg font-semibold">Chọn Thư Mục</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Shortcuts Bar */}
        <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 overflow-x-auto flex gap-2 scrollbar-none">
          {ANDROID_SHORTCUTS.map((sc) => {
            const Icon = sc.icon;
            const isSelected = currentPath === sc.path;
            return (
              <button
                key={sc.path}
                onClick={() => loadDirectory(sc.path)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all border ${
                  isSelected
                    ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                    : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-blue-400"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {sc.name}
              </button>
            );
          })}
        </div>

        {/* Breadcrumbs & Up Level */}
        <div className="px-4 py-2.5 bg-slate-100 dark:bg-slate-850 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
          {dirContent?.parent_path && (
            <button
              onClick={() => loadDirectory(dirContent.parent_path!)}
              className="p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors flex-shrink-0"
              title="Lên thư mục cha"
            >
              <CornerLeftUp className="w-4 h-4" />
            </button>
          )}

          <div className="flex-1 overflow-x-auto whitespace-nowrap text-xs font-mono text-slate-600 dark:text-slate-300 flex items-center gap-1 py-1">
            <span
              onClick={() => loadDirectory("/")}
              className="cursor-pointer hover:text-blue-500 underline"
            >
              root
            </span>
            {pathParts.map((part, idx) => {
              const subPath = "/" + pathParts.slice(0, idx + 1).join("/");
              return (
                <React.Fragment key={subPath}>
                  <span className="text-slate-400">/</span>
                  <span
                    onClick={() => loadDirectory(subPath)}
                    className="cursor-pointer hover:text-blue-500 font-semibold"
                  >
                    {part}
                  </span>
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Content Folder List */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-2">
              <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
              <span className="text-sm">Đang quét thư mục...</span>
            </div>
          ) : error ? (
            <div className="p-4 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 rounded-xl flex items-start gap-3 border border-red-200 dark:border-red-900/50">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div className="text-sm">{error}</div>
            </div>
          ) : dirContent?.subdirs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-2">
              <Folder className="w-12 h-12 stroke-[1.5] text-slate-300 dark:text-slate-700" />
              <span className="text-sm">Thư mục này không có thư mục con</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {dirContent?.subdirs.map((dir) => (
                <div
                  key={dir.path}
                  onClick={() => loadDirectory(dir.path)}
                  className="group flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-blue-500 dark:hover:border-blue-500 bg-white dark:bg-slate-800/60 hover:bg-blue-50/50 dark:hover:bg-blue-950/30 cursor-pointer transition-all shadow-sm"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500 group-hover:scale-105 transition-transform">
                      <Folder className="w-5 h-5 fill-amber-500/20" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate group-hover:text-blue-600 dark:group-hover:text-blue-400">
                        {dir.name}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {dir.item_count} mục
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer Selection Button */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80 flex items-center justify-between gap-3">
          <div className="text-xs text-slate-500 truncate flex-1 font-mono">
            Thư mục chọn: <span className="font-semibold text-slate-700 dark:text-slate-200">{currentPath}</span>
          </div>
          <button
            onClick={() => {
              onSelectFolder(currentPath);
              onClose();
            }}
            className="py-2.5 px-5 flex items-center gap-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-medium text-sm rounded-xl shadow-lg shadow-blue-500/20 transition-all whitespace-nowrap"
          >
            <CheckCircle className="w-4 h-4" />
            Chọn thư mục này
          </button>
        </div>
      </div>
    </div>
  );
};
