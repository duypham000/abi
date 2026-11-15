export type DocStatus = 0 | 1;

export interface DocRevisionSummaryDto {
  id: number;
  docId: number;
  versionNumber: number;
  title: string | null;
  preview: string | null;
  changedBy: string;
  changedAt: string;
}

export interface DocRevisionDto extends DocRevisionSummaryDto {
  yjsSnapshot: string | null;  // Base64
  plainText: string | null;
}

export interface DocDto {
  id: number;
  title: string;
  content: string | null;
  plainText: string | null;
  metadata: string | null;
  seriesId?: number | null;
  seriesName?: string | null;
  lastSync: string | null;
  status: DocStatus;
  createdBy: { id: number; username: string; email: string } | null;
  yjsState?: string | null;
  preview?: string | null;
  highlights?: Record<string, string[]> | null;
}

export interface DocRequest {
  title: string;
  content: string | null;
  plainText?: string | null;
  metadata: string | null;
  seriesId?: number | null;
  lastSync: string | null;
  status: DocStatus;
  yjsState?: string | null;
}

export interface DocMetadataProperty {
  key: string;
  value: string;
}

export interface DocMetadata {
  starred: boolean;
  tags: string[];
  tagColors: Record<string, string>;
  properties: DocMetadataProperty[];
  journal: boolean;
  template: boolean;
  createdAt: string | null;
  bookmarks: string[];
}

export function parseDocMetadata(raw: string | null): DocMetadata {
  const defaults: DocMetadata = {
    starred: false, tags: [], tagColors: {}, properties: [],
    journal: false, template: false, createdAt: null, bookmarks: [],
  };
  if (!raw) return defaults;
  try {
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return defaults;
  }
}

export function serializeDocMetadata(meta: DocMetadata): string {
  return JSON.stringify(meta);
}

export interface BinAnalysisDto {
  fileName: string;
  fileSize: number;
  gzip: boolean;
  decompressedSize: number;
  type: string;
  textLength: number;
  previewText: string;
  canvasElementCount: number;
  stateVector: string;
}
