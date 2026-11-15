import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface CachedFolder {
  path: string;
  name: string;
  addedAt: number;
}

export interface CachedFile {
  path: string;
  name: string;
  ext: string;
  addedAt: number;
}

export interface BatchPreset {
  id: string;
  name: string;
  fromExt: string;
  toExt: string;
  recursive: boolean;
}

interface BatchRenameStore {
  cachedFolders: CachedFolder[];
  cachedFiles: CachedFile[];
  presets: BatchPreset[];
  
  // Active settings state
  activeTab: "folders" | "files" | "quick";
  fromExt: string;
  toExt: string;
  isRecursive: boolean;
  
  // Actions
  setActiveTab: (tab: "folders" | "files" | "quick") => void;
  setFromExt: (ext: string) => void;
  setToExt: (ext: string) => void;
  setIsRecursive: (v: boolean) => void;
  
  addFolder: (folderPath: string) => void;
  removeFolder: (folderPath: string) => void;
  clearFolders: () => void;
  
  addFiles: (filePaths: string[]) => void;
  removeFile: (filePath: string) => void;
  clearFiles: () => void;
  
  savePreset: (preset: Omit<BatchPreset, "id">) => void;
  deletePreset: (id: string) => void;
}

const DEFAULT_PRESETS: BatchPreset[] = [
  { id: "p1", name: "Text to Markdown (.txt -> .md)", fromExt: "txt", toExt: "md", recursive: true },
  { id: "p2", name: "Image WebP (.png -> .webp)", fromExt: "png", toExt: "webp", recursive: false },
  { id: "p3", name: "JPEG Standard (.jfif -> .jpg)", fromExt: "jfif", toExt: "jpg", recursive: true },
];

export const useBatchRenameStore = create<BatchRenameStore>()(
  persist(
    (set) => ({
      cachedFolders: [],
      cachedFiles: [],
      presets: DEFAULT_PRESETS,
      
      activeTab: "folders",
      fromExt: "",
      toExt: "",
      isRecursive: true,
      
      setActiveTab: (activeTab) => set({ activeTab }),
      setFromExt: (fromExt) => set({ fromExt }),
      setToExt: (toExt) => set({ toExt }),
      setIsRecursive: (isRecursive) => set({ isRecursive }),
      
      addFolder: (folderPath) =>
        set((state) => {
          if (!folderPath || state.cachedFolders.some((f) => f.path === folderPath)) {
            return state;
          }
          const folderName = folderPath.replace(/\\/g, "/").split("/").filter(Boolean).pop() || folderPath;
          return {
            cachedFolders: [
              ...state.cachedFolders,
              { path: folderPath, name: folderName, addedAt: Date.now() },
            ],
          };
        }),
        
      removeFolder: (folderPath) =>
        set((state) => ({
          cachedFolders: state.cachedFolders.filter((f) => f.path !== folderPath),
        })),
        
      clearFolders: () => set({ cachedFolders: [] }),
      
      addFiles: (filePaths) =>
        set((state) => {
          const newEntries: CachedFile[] = [];
          for (const filePath of filePaths) {
            if (!filePath || state.cachedFiles.some((f) => f.path === filePath)) continue;
            const parts = filePath.replace(/\\/g, "/").split("/").filter(Boolean);
            const fileName = parts.pop() || filePath;
            const extParts = fileName.split(".");
            const ext = extParts.length > 1 ? extParts.pop() || "" : "";
            newEntries.push({
              path: filePath,
              name: fileName,
              ext,
              addedAt: Date.now(),
            });
          }
          return {
            cachedFiles: [...state.cachedFiles, ...newEntries],
          };
        }),
        
      removeFile: (filePath) =>
        set((state) => ({
          cachedFiles: state.cachedFiles.filter((f) => f.path !== filePath),
        })),
        
      clearFiles: () => set({ cachedFiles: [] }),
      
      savePreset: (preset) =>
        set((state) => ({
          presets: [
            ...state.presets,
            { ...preset, id: "preset_" + Date.now() + "_" + Math.random().toString(36).substr(2, 4) },
          ],
        })),
        
      deletePreset: (id) =>
        set((state) => ({
          presets: state.presets.filter((p) => p.id !== id),
        })),
    }),
    {
      name: "tomo_batch_rename_cache",
    }
  )
);
