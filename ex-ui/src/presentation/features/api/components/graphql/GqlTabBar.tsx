import { useState } from "react";
import { Button, Dropdown, Input, Modal } from "antd";
import type { MenuProps } from "antd";
import { PlusIcon, XIcon } from "lucide-react";
import { useGraphqlStore } from "../../store/graphqlStore";

export function GqlTabBar() {
  const tabs = useGraphqlStore((s) => s.tabs);
  const activeTabId = useGraphqlStore((s) => s.activeTabId);
  const addTab = useGraphqlStore((s) => s.addTab);
  const closeTab = useGraphqlStore((s) => s.closeTab);
  const setActiveTabId = useGraphqlStore((s) => s.setActiveTabId);
  const renameTab = useGraphqlStore((s) => s.renameTab);
  const duplicateTab = useGraphqlStore((s) => s.duplicateTab);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const handleCloseTab = (id: string, isDirty: boolean) => {
    if (isDirty) {
      Modal.confirm({
        title: "Unsaved changes",
        content: "Close without saving?",
        okText: "Close",
        okType: "danger",
        onOk: () => closeTab(id),
      });
    } else {
      closeTab(id);
    }
  };

  const handleDoubleClick = (id: string, name: string) => {
    setEditingId(id);
    setEditName(name);
  };

  const handleRenameCommit = (id: string) => {
    if (editName.trim()) renameTab(id, editName.trim());
    setEditingId(null);
  };

  const contextMenu = (id: string, name: string): MenuProps["items"] => [
    {
      key: "rename",
      label: "Rename",
      onClick: () => handleDoubleClick(id, name),
    },
    {
      key: "duplicate",
      label: "Duplicate",
      onClick: () => duplicateTab(id),
    },
    {
      key: "close",
      label: "Close",
      onClick: () => handleCloseTab(id, tabs.find((t) => t.id === id)?.isDirty ?? false),
    },
  ];

  return (
    <div className="gql-tab-bar">
      {tabs.map((tab) => (
        <Dropdown
          key={tab.id}
          menu={{ items: contextMenu(tab.id, tab.name) }}
          trigger={["contextMenu"]}
        >
          <div
            className={`gql-tab ${tab.id === activeTabId ? "active" : ""}`}
            onClick={() => setActiveTabId(tab.id)}
            onDoubleClick={() => handleDoubleClick(tab.id, tab.name)}
          >
            {editingId === tab.id ? (
              <Input
                size="small"
                autoFocus
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onPressEnter={() => handleRenameCommit(tab.id)}
                onBlur={() => handleRenameCommit(tab.id)}
                style={{ width: 100, fontSize: 12 }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="gql-tab-name">{tab.name}</span>
            )}
            {tab.isDirty && <span className="gql-tab-dirty">●</span>}
            <span
              className="gql-tab-close"
              onClick={(e) => {
                e.stopPropagation();
                handleCloseTab(tab.id, tab.isDirty);
              }}
            >
              <XIcon size={12} />
            </span>
          </div>
        </Dropdown>
      ))}
      <Button
        size="small"
        type="text"
        icon={<PlusIcon size={14} />}
        onClick={addTab}
        className="gql-tab-add"
        title="New Tab"
      />
    </div>
  );
}
