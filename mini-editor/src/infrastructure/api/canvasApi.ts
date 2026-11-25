import { baseApi, PageResult, ScrollResult } from "./baseApi";
import type { DeleteScope } from "./docsApi";
import {
  parseCanvasMetadata,
  serializeCanvasMetadata,
  type CanvasDto,
  type CanvasRequest,
} from "@/core/interfaces/canvas";
import { getAccessToken } from "@/infrastructure/tauri/authBridge";
import { isTauri } from "@/infrastructure/tauri/sqliteDb";
import {
  listCanvasFromSqlite,
  getCanvasFromSqlite,
  createCanvasInSqlite,
  updateCanvasInSqlite,
  deleteCanvasFromSqlite,
  searchCanvasFromSqlite,
  upsertCanvasFromServerInSqlite,
} from "@/infrastructure/tauri/canvasCacheService";
import {
  generateLowResCanvasThumbnail,
  setCachedCanvasThumbnail,
} from "@/presentation/features/canvas/utils/canvasThumbnail";

export type DeleteCanvasArg = number | { id: number; scope?: DeleteScope };

export const canvasApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    listCanvas: builder.query<
      PageResult<CanvasDto>,
      { page?: number; size?: number; sortBy?: string; sortDirection?: string } | void
    >({
      queryFn: async (args, _api, _extraOptions, fetchWithBaseQuery) => {
        if (isTauri()) {
          try {
            const data = await listCanvasFromSqlite(args || undefined);
            return { data };
          } catch (err: unknown) {
            return { error: { status: 500, statusText: String(err), data: String(err) } };
          }
        }
        const { page = 0, size = 20, sortBy = "id", sortDirection = "ASC" } = args || {};
        const result = await fetchWithBaseQuery({
          url: "/canvas/list",
          params: { page, size, sortBy, sortDirection },
        });
        return result.data
          ? { data: result.data as PageResult<CanvasDto> }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          : { error: result.error as any };
      },
      providesTags: ["Canvas"],
    }),

    lazyCanvas: builder.query<
      ScrollResult<CanvasDto>,
      { lastId?: number; size?: number } | void
    >({
      queryFn: async (args, _api, _extraOptions, fetchWithBaseQuery) => {
        if (isTauri()) {
          try {
            const list = await listCanvasFromSqlite();
            return { data: { items: list.items, hasMore: false, nextCursor: null } };
          } catch (err: unknown) {
            return { error: { status: 500, statusText: String(err), data: String(err) } };
          }
        }
        const { lastId, size = 20 } = args || {};
        const result = await fetchWithBaseQuery({
          url: "/canvas/lazy",
          params: { lastId, size },
        });
        return result.data
          ? { data: result.data as ScrollResult<CanvasDto> }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          : { error: result.error as any };
      },
    }),

    getCanvasById: builder.query<CanvasDto, number>({
      queryFn: async (id, _api, _extraOptions, fetchWithBaseQuery) => {
        if (isTauri()) {
          try {
            const data = await getCanvasFromSqlite(id);
            if (data) return { data };
            return { error: { status: 404, statusText: "Canvas not found in SQLite", data: "Canvas not found" } };
          } catch (err: unknown) {
            return { error: { status: 500, statusText: String(err), data: String(err) } };
          }
        }
        const result = await fetchWithBaseQuery(`/canvas/${id}`);
        return result.data
          ? { data: result.data as CanvasDto }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          : { error: result.error as any };
      },
      providesTags: (_res, _err, id) => [{ type: "Canvas" as const, id }],
    }),

    createCanvas: builder.mutation<CanvasDto, CanvasRequest>({
      queryFn: async (body, _api, _extraOptions, fetchWithBaseQuery) => {
        if (isTauri()) {
          try {
            const data = await createCanvasInSqlite(body);
            return { data };
          } catch (err: unknown) {
            return { error: { status: 500, statusText: String(err), data: String(err) } };
          }
        }
        const result = await fetchWithBaseQuery({ url: "/canvas", method: "POST", body });
        return result.data
          ? { data: result.data as CanvasDto }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          : { error: result.error as any };
      },
      invalidatesTags: ["Canvas"],
    }),

    updateCanvas: builder.mutation<CanvasDto, { id: number; body: CanvasRequest }>({
      queryFn: async ({ id, body }, _api, _extraOptions, fetchWithBaseQuery) => {
        if (isTauri()) {
          try {
            const data = await updateCanvasInSqlite(id, body);
            return { data };
          } catch (err: unknown) {
            return { error: { status: 500, statusText: String(err), data: String(err) } };
          }
        }
        const result = await fetchWithBaseQuery({
          url: `/canvas/${id}`,
          method: "PUT",
          body,
        });
        return result.data
          ? { data: result.data as CanvasDto }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          : { error: result.error as any };
      },
      invalidatesTags: (_res, _err, { id }) => [
        { type: "Canvas" as const, id },
        "Canvas",
      ],
    }),

    deleteCanvas: builder.mutation<void, DeleteCanvasArg>({
      queryFn: async (arg, _api, _extraOptions, fetchWithBaseQuery) => {
        const id = typeof arg === "number" ? arg : arg.id;
        const scope: DeleteScope = typeof arg === "number" ? "server" : (arg.scope ?? "server");

        if (isTauri()) {
          try {
            await deleteCanvasFromSqlite(id);
          } catch (err: unknown) {
            return { error: { status: 500, statusText: String(err), data: String(err) } };
          }
          if (scope === "local") {
            return { data: undefined };
          }
          try {
            const token = await getAccessToken();
            if (token && token !== "local-standalone-token") {
              await fetchWithBaseQuery({
                url: `/github/files/delete?path=${encodeURIComponent(`canvases/canvas-${id}.json`)}`,
                method: "DELETE",
              });
            }
          } catch {
            // non-fatal if canvas is not on git
          }
          return { data: undefined };
        }

        if (scope === "local") {
          return { data: undefined };
        }
        const result = await fetchWithBaseQuery({ url: `/canvas/${id}`, method: "DELETE" });
        return result.data
          ? { data: undefined }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          : { error: result.error as any };
      },
      invalidatesTags: ["Canvas", "GitStatus"],
    }),

    searchCanvas: builder.query<CanvasDto[], string>({
      queryFn: async (q, _api, _extraOptions, fetchWithBaseQuery) => {
        if (isTauri()) {
          try {
            const data = await searchCanvasFromSqlite(q);
            return { data };
          } catch (err: unknown) {
            return { error: { status: 500, statusText: String(err), data: String(err) } };
          }
        }
        const result = await fetchWithBaseQuery({ url: "/canvas/search", params: { q } });
        return result.data
          ? { data: result.data as CanvasDto[] }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          : { error: result.error as any };
      },
      providesTags: ["Canvas"],
    }),
    restoreCanvasesFromServer: builder.mutation<{ restored: CanvasDto[]; count: number }, { ids?: number[] } | void>({
      queryFn: async (arg, api, _extraOptions, fetchWithBaseQuery) => {
        const token = await getAccessToken();
        if (!token || token === "local-standalone-token") {
          return {
            error: {
              status: 401,
              statusText: "Unauthorized",
              data: { message: "Vui lòng đăng nhập để khôi phục canvas từ Server" },
            },
          };
        }

        const restoreOneCanvas = async (targetId: number): Promise<CanvasDto | null> => {
          const gitRes = await fetchWithBaseQuery(
            `/github/files/get?path=${encodeURIComponent(`canvases/canvas-${targetId}.json`)}`
          );
          const rawContent = (gitRes.data as { content?: string } | undefined)?.content;
          if (rawContent) {
            try {
              const parsed = JSON.parse(rawContent) as Record<string, unknown>;
              const sceneStr =
                typeof parsed.scene === "string"
                  ? parsed.scene
                  : JSON.stringify(parsed.scene ?? { elements: [], appState: {}, files: {} });
              let rawMeta =
                typeof parsed.metadata === "string"
                  ? parsed.metadata
                  : parsed.metadata != null
                    ? JSON.stringify(parsed.metadata)
                    : null;
              const parsedMeta = parseCanvasMetadata(rawMeta);
              if (!parsedMeta.thumbnail) {
                const thumb = await generateLowResCanvasThumbnail(sceneStr);
                if (thumb) {
                  setCachedCanvasThumbnail(targetId, thumb);
                  rawMeta = serializeCanvasMetadata({ ...parsedMeta, thumbnail: thumb });
                }
              } else {
                setCachedCanvasThumbnail(targetId, parsedMeta.thumbnail);
              }
              const saved = await upsertCanvasFromServerInSqlite(targetId, {
                title: typeof parsed.title === "string" && parsed.title ? parsed.title : "Untitled Canvas",
                scene: sceneStr,
                metadata: rawMeta,
                lastSync: new Date().toISOString(),
                status: (parsed.status as 0 | 1 | undefined) ?? 1,
              });
              api.dispatch(canvasApi.util.upsertQueryData("getCanvasById", targetId, saved));
              return saved;
            } catch {
              // ignore malformed json
            }
          }

          const remoteRes = await fetchWithBaseQuery(`/canvas/${targetId}`);
          if (remoteRes.data) {
            const remote = remoteRes.data as CanvasDto;
            const saved = await upsertCanvasFromServerInSqlite(targetId, {
              title: remote.title || "Untitled Canvas",
              scene: remote.scene ?? null,
              metadata: remote.metadata ?? null,
              lastSync: remote.lastSync ?? new Date().toISOString(),
              status: remote.status ?? 1,
            });
            api.dispatch(canvasApi.util.upsertQueryData("getCanvasById", targetId, saved));
            return saved;
          }
          return null;
        };

        const ids = arg && Array.isArray(arg.ids) && arg.ids.length > 0 ? arg.ids : null;
        const restored: CanvasDto[] = [];

        if (ids) {
          for (const id of ids) {
            const item = await restoreOneCanvas(id);
            if (item) restored.push(item);
          }
        } else {
          const listRes = await fetchWithBaseQuery("/github/files/list?dir=canvases");
          const files = Array.isArray(listRes.data) ? (listRes.data as Array<{ path?: string; name?: string }>) : [];
          for (const file of files) {
            const pathOrName = file.path || file.name || "";
            const match = pathOrName.match(/canvas-(\d+)\.json$/);
            if (match) {
              const item = await restoreOneCanvas(Number(match[1]));
              if (item) restored.push(item);
            }
          }
        }

        return { data: { restored, count: restored.length } };
      },
      invalidatesTags: ["Canvas"],
    }),
    getYjsCanvasToken: builder.query<{ token: string; url: string; expiresIn: number }, number>({
      query: (canvasId) => ({
        url: "/yjs/auth/token",
        method: "POST",
        body: { canvas_id: String(canvasId), access_mode: "write" },
      }),
      transformResponse: (res: any) => res.data ?? res,
    }),
  }),
  overrideExisting: false,
});

export const {
  useListCanvasQuery,
  useLazyCanvasQuery,
  useGetCanvasByIdQuery,
  useCreateCanvasMutation,
  useUpdateCanvasMutation,
  useDeleteCanvasMutation,
  useSearchCanvasQuery,
  useRestoreCanvasesFromServerMutation,
  useGetYjsCanvasTokenQuery,
} = canvasApi;
