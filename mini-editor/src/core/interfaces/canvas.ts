export type CanvasStatus = 0 | 1;

export interface CanvasScene {
  elements: readonly unknown[];
  appState: Record<string, unknown>;
  files: Record<string, unknown>;
}

export interface CanvasDto {
  id: number;
  title: string;
  scene: string | null;
  metadata: string | null;
  lastSync: string | null;
  status: CanvasStatus;
  createdBy: { id: number; username: string; email: string } | null;
  preview?: string | null;
  highlights?: Record<string, string[]> | null;
}

export interface CanvasRequest {
  title: string;
  scene: string | null;
  metadata: string | null;
  lastSync: string | null;
  status: CanvasStatus;
}

export interface CanvasMetadata {
  starred: boolean;
  tags: string[];
  thumbnail: string | null;
}

export function parseCanvasMetadata(raw: string | null): CanvasMetadata {
  const defaults: CanvasMetadata = { starred: false, tags: [], thumbnail: null };
  if (!raw) return defaults;
  try {
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return defaults;
  }
}

export function serializeCanvasMetadata(meta: CanvasMetadata): string {
  return JSON.stringify(meta);
}
