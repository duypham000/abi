export type NoteStatus = 0 | 1;

export interface NoteDto {
  id: number;
  title: string;
  content: string | null;
  metadata: string | null;
  lastSync: string | null;
  status: NoteStatus;
}

export interface NoteRequest {
  title: string;
  content: string | null;
  metadata: string | null;
  lastSync: string | null;
  status: NoteStatus;
}
