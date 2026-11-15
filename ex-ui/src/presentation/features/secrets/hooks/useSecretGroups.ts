import {
  useListSecretGroupsQuery,
  useCreateSecretGroupMutation,
  useUpdateSecretGroupMutation,
  useDeleteSecretGroupMutation,
} from "@/infrastructure/api/secretGroupsApi";
import type { SecretGroupDto, SecretGroupRequest } from "@/core/interfaces/secrets";
import type { DataNode } from "antd/es/tree";

export function buildGroupTree(groups: SecretGroupDto[]): DataNode[] {
  const map = new Map<number, DataNode & { key: number; parentId: number | null }>();
  groups.forEach((g) =>
    map.set(g.id, { key: g.id, title: g.title, children: [], parentId: g.parentId })
  );
  const roots: DataNode[] = [];
  map.forEach((node) => {
    if (node.parentId == null) {
      roots.push(node);
    } else {
      const parent = map.get(node.parentId);
      if (parent) (parent.children as DataNode[]).push(node);
      else roots.push(node);
    }
  });
  return roots;
}

export function useSecretGroups() {
  const { data: groups = [], isLoading } = useListSecretGroupsQuery();
  const [createGroupMutation] = useCreateSecretGroupMutation();
  const [updateGroupMutation] = useUpdateSecretGroupMutation();
  const [deleteGroupMutation] = useDeleteSecretGroupMutation();

  const onCreate = async (req: SecretGroupRequest) => {
    await createGroupMutation(req).unwrap();
  };
  const onUpdate = async (id: number, req: SecretGroupRequest) => {
    await updateGroupMutation({ id, body: req }).unwrap();
  };
  const onDelete = async (id: number) => {
    await deleteGroupMutation(id).unwrap();
  };

  return {
    groups,
    isLoading,
    treeData: buildGroupTree(groups),
    onCreate,
    onUpdate,
    onDelete,
  };
}
