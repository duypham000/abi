import { useDispatch, useSelector } from "react-redux";
import { RootState, AppDispatch } from "@/presentation/store";
import {
  setSelectedSecret,
  setSelectedGroup,
  setShowFavorites,
  setSearchQuery,
} from "@/presentation/store/secretsSlice";
import {
  useListSecretsQuery,
  useGetSecretDetailQuery,
  useSearchSecretsQuery,
  useCreateSecretMutation,
  useUpdateSecretMutation,
  useDeleteSecretMutation,
} from "@/infrastructure/api/secretsApi";
import type { SecretRequest } from "@/core/interfaces/secrets";

export function useSecrets() {
  const dispatch = useDispatch<AppDispatch>();
  const { selectedSecretId, selectedGroupId, showFavoritesOnly, searchQuery } = useSelector(
    (s: RootState) => s.secrets
  );

  const isSearching = searchQuery.trim().length > 0;

  const { data: listData, isLoading: listLoading } = useListSecretsQuery(
    { groupId: selectedGroupId, favorite: showFavoritesOnly || null },
    { skip: isSearching }
  );
  const { data: searchData, isLoading: searchLoading } = useSearchSecretsQuery(
    searchQuery.trim(),
    { skip: !isSearching }
  );
  const { data: selectedDetail, isLoading: isDetailLoading } = useGetSecretDetailQuery(
    selectedSecretId!,
    { skip: selectedSecretId == null }
  );

  const [createMutation] = useCreateSecretMutation();
  const [updateMutation] = useUpdateSecretMutation();
  const [deleteMutation] = useDeleteSecretMutation();

  const secrets = isSearching ? (searchData ?? []) : (listData?.items ?? []);
  const isLoading = isSearching ? searchLoading : listLoading;

  const onSelectSecret = (id: number | null) => dispatch(setSelectedSecret(id));
  const onSelectGroup = (id: number | null) => dispatch(setSelectedGroup(id));
  const onToggleFavorites = (v: boolean) => dispatch(setShowFavorites(v));
  const onSetSearch = (q: string) => dispatch(setSearchQuery(q));

  const onCreate = async (req: SecretRequest) => {
    const result = await createMutation(req).unwrap();
    dispatch(setSelectedSecret(result.id));
  };
  const onUpdate = async (id: number, req: SecretRequest) => {
    await updateMutation({ id, body: req }).unwrap();
  };
  const onDelete = async (id: number) => {
    await deleteMutation(id).unwrap();
  };

  return {
    secrets,
    isLoading,
    selectedSecretId,
    selectedGroupId,
    showFavoritesOnly,
    searchQuery,
    selectedDetail,
    isDetailLoading,
    onSelectSecret,
    onSelectGroup,
    onToggleFavorites,
    onSetSearch,
    onCreate,
    onUpdate,
    onDelete,
  };
}
