import {
  useListDocsQuery,
  useCreateDocMutation,
  useDeleteDocMutation,
} from "@/infrastructure/api/docsApi";
import type { DocRequest } from "@/core/interfaces/docs";

export function useDocs(page = 0, size = 20, seriesId?: number) {
  const { data, isLoading, isFetching, refetch } = useListDocsQuery({
    seriesId,
    page,
    size,
  });
  const [createDoc, { isLoading: isCreating }] = useCreateDocMutation();
  const [deleteDoc, { isLoading: isDeleting }] = useDeleteDocMutation();

  const docs = data?.items ?? [];
  const total = data?.total ?? 0;

  const handleCreate = (request: DocRequest) => createDoc(request).unwrap();
  const handleDelete = (id: number) => deleteDoc(id).unwrap();

  return {
    docs,
    total,
    isLoading,
    isFetching,
    isCreating,
    isDeleting,
    createDoc: handleCreate,
    deleteDoc: handleDelete,
    refetch,
  };
}
