export interface FileItemInfo {
  path: string;
  name: string;
  ext: string;
  parent_dir: string;
  size: number;
}

export interface DirNodeInfo {
  path: string;
  name: string;
  parent_dir: string;
  item_count: number;
}

export interface DirectoryContentInfo {
  current_path: string;
  parent_path: string | null;
  subdirs: DirNodeInfo[];
  files: FileItemInfo[];
}

export interface RenameTask {
  old_path: string;
  new_path: string;
}

export interface RenameResult {
  old_path: string;
  new_path: string;
  success: boolean;
  error: string | null;
}
