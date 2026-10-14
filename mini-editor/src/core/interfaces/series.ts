export interface SeriesDto {
  id: number;
  name: string;
  description: string | null;
  createdBy: { id: number; username: string; email: string } | null;
  createdDate: string;
  lastModifiedDate: string;
}

export interface SeriesRequest {
  name: string;
  description: string | null;
}
