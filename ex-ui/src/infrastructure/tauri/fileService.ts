import { IFileService } from "@/core/interfaces/fileService";
import { invoke } from "@tauri-apps/api/core";

export class TauriFileService implements IFileService {
  async readFile(path: string): Promise<string> {
    return invoke<string>("cmd_read_file", { path });
  }

  async writeFile(path: string, content: string): Promise<void> {
    await invoke("cmd_write_file", { path, content });
  }
}
