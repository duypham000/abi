import { getMcpConfig } from './config.js';

export interface GoClientOptions {
  apiBase?: string;
  authToken?: string;
  yjsSecret?: string;
}

export interface DocDto {
  id: string;
  title: string;
  slug: string;
  content: string;
  status: string;
  parent_id?: string | null;
  owner_id: string;
  is_pinned: boolean;
  is_starred: boolean;
  created_at: string;
  updated_at: string;
}

export interface CanvasDto {
  id: string;
  title: string;
  slug: string;
  scene: string;
  metadata: string;
  status: number;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export interface SeriesDto {
  id: number;
  name: string;
  description?: string | null;
  createdDate?: string;
  lastModifiedDate?: string;
}

export interface PageResponse<T> {
  items: T[];
  total_items: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface YjsTokenResponse {
  token: string;
  doc_id: string;
  access_mode: string;
  expires_at: string;
  url?: string;
  expiresIn?: number;
}

export class GoApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export class GoClient {
  readonly apiBase: string;
  readonly authToken: string;
  readonly yjsSecret: string;

  constructor(opts: GoClientOptions = {}) {
    const cfg = getMcpConfig();
    this.apiBase = (opts.apiBase || cfg.apiBase).replace(/\/+$/, '');
    this.authToken = opts.authToken ?? cfg.authToken;
    this.yjsSecret = opts.yjsSecret ?? cfg.yjsSecret;
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    const h: Record<string, string> = {
      'Content-Type': 'application/json',
      ...extra,
    };
    if (this.authToken) {
      h.Authorization = this.authToken.startsWith('Bearer ')
        ? this.authToken
        : `Bearer ${this.authToken}`;
    }
    return h;
  }

  private async requestJson<T>(
    path: string,
    init: RequestInit = {},
    unwrapData = true,
  ): Promise<T> {
    const url = `${this.apiBase}${path}`;
    const res = await fetch(url, {
      ...init,
      headers: this.headers((init.headers as Record<string, string>) || {}),
    });
    const text = await res.text();
    let parsed: any = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = { message: text };
      }
    }
    if (!res.ok) {
      const msg = parsed?.message || parsed?.error || `HTTP ${res.status} ${res.statusText}`;
      throw new GoApiError(res.status, msg);
    }
    if (unwrapData && parsed && typeof parsed === 'object' && 'data' in parsed) {
      return parsed.data as T;
    }
    return parsed as T;
  }

  // --- Docs ---
  async listDocs(params: {
    page?: number;
    page_size?: number;
    parent_id?: string;
    search?: string;
  } = {}): Promise<PageResponse<DocDto>> {
    const qs = new URLSearchParams();
    if (params.page) qs.set('page', String(params.page));
    if (params.page_size) qs.set('page_size', String(params.page_size));
    if (params.parent_id !== undefined) qs.set('parent_id', params.parent_id);
    if (params.search) qs.set('search', params.search);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return this.requestJson<PageResponse<DocDto>>(`/docs${suffix}`);
  }

  async getDoc(id: string): Promise<DocDto> {
    return this.requestJson<DocDto>(`/docs/${encodeURIComponent(id)}`);
  }

  async getDocBySlug(slug: string): Promise<DocDto> {
    return this.requestJson<DocDto>(`/docs/slug/${encodeURIComponent(slug)}`);
  }

  async getDocTree(): Promise<any[]> {
    return this.requestJson<any[]>('/docs/tree');
  }

  async createDoc(body: {
    title: string;
    content?: string;
    status?: string;
    parent_id?: string | null;
  }): Promise<DocDto> {
    return this.requestJson<DocDto>('/docs', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async updateDoc(
    id: string,
    body: {
      title?: string;
      content?: string;
      status?: string;
      parent_id?: string | null;
      is_pinned?: boolean;
      is_starred?: boolean;
    },
  ): Promise<DocDto> {
    return this.requestJson<DocDto>(`/docs/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  async deleteDoc(id: string): Promise<void> {
    await this.requestJson<null>(`/docs/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }

  async listRevisions(id: string): Promise<any[]> {
    return this.requestJson<any[]>(`/docs/${encodeURIComponent(id)}/revisions`);
  }

  async reconstructRevision(id: string, version: number): Promise<any> {
    return this.requestJson<any>(
      `/yjs/revision/${encodeURIComponent(id)}/reconstruct?version=${version}`,
    );
  }

  // --- Series ---
  async listSeries(params: { search?: string; page?: number; size?: number } = {}): Promise<any> {
    if (params.search) {
      return this.requestJson<any>(
        `/series/search?q=${encodeURIComponent(params.search)}`,
        {},
        false,
      );
    }
    const qs = new URLSearchParams();
    qs.set('page', String(params.page ?? 0));
    qs.set('size', String(params.size ?? 20));
    return this.requestJson<any>(`/series?${qs.toString()}`, {}, false);
  }

  async createSeries(body: { name: string; description?: string }): Promise<SeriesDto> {
    return this.requestJson<SeriesDto>('/series', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async updateSeries(
    id: number,
    body: { name?: string; description?: string },
  ): Promise<SeriesDto> {
    return this.requestJson<SeriesDto>(`/series/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  async deleteSeries(id: number): Promise<void> {
    await this.requestJson<null>(`/series/${id}`, { method: 'DELETE' });
  }

  // --- Canvases ---
  async listCanvases(params: {
    page?: number;
    page_size?: number;
    search?: string;
  } = {}): Promise<PageResponse<CanvasDto>> {
    const qs = new URLSearchParams();
    if (params.page) qs.set('page', String(params.page));
    if (params.page_size) qs.set('page_size', String(params.page_size));
    if (params.search) qs.set('search', params.search);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return this.requestJson<PageResponse<CanvasDto>>(`/canvas${suffix}`);
  }

  async getCanvas(id: string): Promise<CanvasDto> {
    return this.requestJson<CanvasDto>(`/canvas/${encodeURIComponent(id)}`);
  }

  async createCanvas(body: {
    title: string;
    scene?: string;
    metadata?: string;
    status?: number;
  }): Promise<CanvasDto> {
    return this.requestJson<CanvasDto>('/canvas', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async updateCanvas(
    id: string,
    body: {
      title?: string;
      scene?: string;
      metadata?: string;
      status?: number;
    },
  ): Promise<CanvasDto> {
    return this.requestJson<CanvasDto>(`/canvas/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  async deleteCanvas(id: string): Promise<void> {
    await this.requestJson<null>(`/canvas/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }

  // --- Yjs ---
  async mintToken(body: {
    doc_id?: string;
    canvas_id?: string;
    access_mode?: 'read' | 'write';
  }): Promise<YjsTokenResponse> {
    return this.requestJson<YjsTokenResponse>('/yjs/auth/token', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async getInternalSnapshot(type: 'doc' | 'canvas', id: string): Promise<Uint8Array | null> {
    const plural = type === 'canvas' ? 'canvases' : 'docs';
    const url = `${this.apiBase}/yjs/internal/${plural}/${encodeURIComponent(id)}/snapshot?branch=main`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${this.yjsSecret}` },
    });
    if (res.status === 204 || res.status === 404) return null;
    if (!res.ok) {
      throw new GoApiError(res.status, `Failed to get internal snapshot: ${res.status}`);
    }
    const buf = await res.arrayBuffer();
    return buf.byteLength === 0 ? null : new Uint8Array(buf);
  }

  async putInternalSnapshot(
    type: 'doc' | 'canvas',
    id: string,
    updateBlob: Uint8Array,
    stateVector: Uint8Array,
  ): Promise<void> {
    const plural = type === 'canvas' ? 'canvases' : 'docs';
    const url = `${this.apiBase}/yjs/internal/${plural}/${encodeURIComponent(id)}/snapshot?branch=main`;
    const svB64 = Buffer.from(stateVector).toString('base64');
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${this.yjsSecret}`,
        'Content-Type': 'application/octet-stream',
        'X-Yjs-State-Vector': svB64,
      },
      body: Buffer.from(updateBlob),
    });
    if (!res.ok) {
      throw new GoApiError(res.status, `Failed to put internal snapshot: ${res.status}`);
    }
  }

  async updateDocMeta(docId: string, plainText: string): Promise<void> {
    const url = `${this.apiBase}/yjs/internal/docs/${encodeURIComponent(docId)}/meta`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.yjsSecret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ plainText }),
    });
    if (!res.ok) {
      throw new GoApiError(res.status, `Failed to update doc meta: ${res.status}`);
    }
  }
}
