import { IFileService } from "@/core/interfaces/fileService";
import { TauriFileService } from "@/infrastructure/tauri/fileService";
import { WebFileService } from "@/infrastructure/web/fileService";

const isTauri =
  typeof window !== "undefined" &&
  (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !== undefined;

export const fileService: IFileService = isTauri
  ? new TauriFileService()
  : new WebFileService();
