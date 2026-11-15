import { IFileService } from "@/core/interfaces/fileService";

export class WebFileService implements IFileService {
  async readFile(path: string): Promise<string> {
    return localStorage.getItem(path) ?? "";
  }

  async writeFile(path: string, content: string): Promise<void> {
    localStorage.setItem(path, content);
  }
}
