import { useState } from "react";
import { Button, Input, Tooltip, Tree } from "antd";
import type { DataNode } from "antd/es/tree";
import { FolderIcon, PlusCircleIcon } from "lucide-react";
import { useRestStore } from "../../../store/restStore";
import { MethodBadge } from "../../shared/MethodBadge";
import type { ApiFolder, ApiRequest } from "../../../types/rest";

function buildFolderNodes(
  folder: ApiFolder,
  onOpen: (req: ApiRequest) => void
): DataNode {
  return {
    key: `folder-${folder.id}`,
    title: (
      <span className="tree-folder-title">
        <FolderIcon size={13} />
        <span>{folder.name}</span>
      </span>
    ),
    children: [
      ...folder.folders.map((f) => buildFolderNodes(f, onOpen)),
      ...folder.requests.map((r) => buildRequestNode(r, onOpen)),
    ],
  };
}

function buildRequestNode(
  request: ApiRequest,
  onOpen: (req: ApiRequest) => void
): DataNode {
  return {
    key: `request-${request.id}`,
    isLeaf: true,
    title: (
      <div className="tree-request-title" onClick={() => onOpen(request)}>
        <MethodBadge method={request.method} size="xs" />
        <span>{request.name || request.url || "Untitled"}</span>
      </div>
    ),
  };
}

export function CollectionTree() {
  const collections = useRestStore((s) => s.collections);
  const addCollection = useRestStore((s) => s.addCollection);
  const replaceCurrentRequest = useRestStore((s) => s.replaceCurrentRequest);
  const [addingName, setAddingName] = useState(false);
  const [newName, setNewName] = useState("");

  const handleOpenRequest = (req: ApiRequest) => {
    replaceCurrentRequest(req);
  };

  const treeData: DataNode[] = collections.map((col) => ({
    key: `col-${col.id}`,
    title: (
      <span className="tree-collection-title">
        <span>{col.name}</span>
      </span>
    ),
    children: [
      ...col.folders.map((f) => buildFolderNodes(f, handleOpenRequest)),
      ...col.requests.map((r) => buildRequestNode(r, handleOpenRequest)),
    ],
  }));

  return (
    <div className="collection-tree">
      <div className="collection-tree-header">
        <span className="collection-tree-title">Collections</span>
        <Tooltip title="New Collection">
          <Button
            size="small"
            type="text"
            icon={<PlusCircleIcon size={14} />}
            onClick={() => setAddingName(true)}
          />
        </Tooltip>
      </div>

      {addingName && (
        <div className="collection-add-row">
          <Input
            size="small"
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Collection name"
            onPressEnter={() => {
              if (newName.trim()) {
                addCollection(newName.trim());
                setNewName("");
                setAddingName(false);
              }
            }}
            onBlur={() => {
              if (!newName.trim()) setAddingName(false);
            }}
          />
        </div>
      )}

      {treeData.length === 0 && !addingName ? (
        <div className="collection-empty">
          <p>No collections yet.</p>
          <Button
            size="small"
            type="dashed"
            onClick={() => setAddingName(true)}
          >
            New Collection
          </Button>
        </div>
      ) : (
        <Tree
          treeData={treeData}
          blockNode
          showLine={{ showLeafIcon: false }}
          className="collections-tree-ant"
        />
      )}
    </div>
  );
}
