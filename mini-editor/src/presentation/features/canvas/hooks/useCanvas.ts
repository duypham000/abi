import {
  useListCanvasQuery,
  useCreateCanvasMutation,
  useDeleteCanvasMutation,
} from "@/infrastructure/api/canvasApi";
import type { CanvasRequest } from "@/core/interfaces/canvas";

export function useCanvas(page = 0, size = 20) {
  const { data, isLoading, isFetching, refetch } = useListCanvasQuery({
    page,
    size,
  });
  const [createCanvas, { isLoading: isCreating }] = useCreateCanvasMutation();
  const [deleteCanvas, { isLoading: isDeleting }] = useDeleteCanvasMutation();

  const canvases = data?.items ?? [];
  const total = data?.total ?? 0;

  const handleCreate = (request: CanvasRequest) => createCanvas(request).unwrap();
  const handleDelete = (id: number) => deleteCanvas(id).unwrap();

  return {
    canvases,
    total,
    isLoading,
    isFetching,
    isCreating,
    isDeleting,
    createCanvas: handleCreate,
    deleteCanvas: handleDelete,
    refetch,
  };
}
