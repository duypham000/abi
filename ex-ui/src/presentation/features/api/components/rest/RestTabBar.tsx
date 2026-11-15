import { useState } from "react";
import { Button, Dropdown, Input, Modal } from "antd";
import type { MenuProps } from "antd";
import { PlusIcon, XIcon } from "lucide-react";
import { useRestStore } from "../../store/restStore";

export function RestTabBar() {
  const tabs = useRestStore((s) => s.tabs);
  const activeTabId = useRestStore((s) => s.activeTabId);
  const addTab = useRestStore((s) => s.addTab);
  const closeTab = useRestStore((s) => s.closeTab);
  const setActiveTabId = useRestStore((s) => s.setActiveTabId);
  const renameTab = useRestStore((s) => s.renameTab);
  const duplicateTab = useRestStore((s) => s.duplicateTab);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const handleCloseTab = (id: string, isDirty: boolean) => {
    if (isDirty) {
      Modal.confirm({
        title: "Unsaved changes",
        content: "Close tab without saving?",
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
    { key: "rename", label: "Rename", onClick: () => handleDoubleClick(id, name) },
    { key: "duplicate", label: "Duplicate", onClick: () => duplicateTab(id) },
    {
      key: "close",
      label: "Close",
      onClick: () => handleCloseTab(id, tabs.find((t) => t.id === id)?.isDirty ?? false),
    },
  ];

  return (
    <div className="rest-tab-bar">
      {tabs.map((tab) => (
        <Dropdown
          key={tab.id}
          menu={{ items: contextMenu(tab.id, tab.name) }}
          trigger={["contextMenu"]}
        >
          <div
            className={`rest-tab ${tab.id === activeTabId ? "active" : ""}`}
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
              <span className="rest-tab-name">{tab.name}</span>
            )}
            {tab.isDirty && <span className="rest-tab-dirty">●</span>}
            <span
              className="rest-tab-close"
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
        className="rest-tab-add"
        title="New Tab"
      />
    </div>
  );
}
