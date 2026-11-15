import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Input, Modal, Tooltip, Dropdown, Popover, Select, Switch } from "antd";
import type { InputRef, MenuProps } from "antd";
import {
  FileTextOutlined,
  LoadingOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  SaveOutlined,
  StarOutlined,
  StarFilled,
  InfoCircleOutlined,
  MoreOutlined,
  SettingOutlined,
  EditOutlined,
  DeleteOutlined,
  LinkOutlined,
  SelectOutlined,
  SplitCellsOutlined,
  UnorderedListOutlined,
  HistoryOutlined,
  CopyOutlined,
  ImportOutlined,
  ExportOutlined,
  UndoOutlined,
  RedoOutlined,
  ThunderboltOutlined,
  DownOutlined,
  UpOutlined,
} from "@ant-design/icons";
import { CloseIcon, PinIcon, PinFilledIcon, MinimizeIcon, MaximizeIcon, RestoreIcon } from "@/presentation/components/icons";
import { useWindowControls } from "@/presentation/hooks/useWindowControls";
import type { SaveStatus } from "../../hooks/useDocEditor";
import "./DocPopupAppBar.scss";

export interface PopupEditorSettings {
  autoSave: boolean;
  pageSize: "A4" | "Letter";
}

const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const MINI_WIDTH = 320;
const MINI_HEIGHT = 56;
const NORMAL_WIDTH = 700;
const NORMAL_HEIGHT = 520;
const MIN_NORMAL_WIDTH = 400;
const MIN_NORMAL_HEIGHT = 280;

const EXIT_DURATION = 200;

function useSaveStatusDisplay(saveStatus: SaveStatus) {
  const [displayed, setDisplayed] = useState<SaveStatus>("idle");
  const [phase, setPhase] = useState<"in" | "active" | "out">("in");
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearExit = useCallback(() => {
    if (exitTimerRef.current) { clearTimeout(exitTimerRef.current); exitTimerRef.current = null; }
  }, []);

  useEffect(() => {
    if (saveStatus !== "idle") {
      clearExit();
      setDisplayed(saveStatus);
      setPhase("in");
      const t = setTimeout(() => setPhase("active"), 10);
      return () => clearTimeout(t);
    } else if (displayed !== "idle" && displayed !== "error") {
      setPhase("out");
      exitTimerRef.current = setTimeout(() => {
        setDisplayed("idle");
        setPhase("in");
      }, EXIT_DURATION);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveStatus]);

  return { displayed, phase };
}

interface DocPopupAppBarProps {
  docTitle: string;
  isMini: boolean;
  onToggleMini: () => void;
  saveStatus: SaveStatus;
  isDraft?: boolean;
  isDirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  starred: boolean;
  settings: PopupEditorSettings;
  isInfoOpen: boolean;
  onTitleChange: (value: string) => void;
  onManualSave: () => void;
  onRetry: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onStarToggle: () => void;
  onInfoToggle: () => void;
  onSettingsChange: (next: PopupEditorSettings) => void;
  onDelete: () => void;
  onCopyLink: () => void;
  onOpenInNewTab: () => void;
  onViewInfo: () => void;
  onViewTableOfContents: () => void;
  onDuplicate: () => void;
  onImport: () => void;
  onExport: () => void;
}

export function DocPopupAppBar({
  docTitle,
  isMini,
  onToggleMini,
  saveStatus,
  isDraft,
  isDirty,
  canUndo,
  canRedo,
  starred,
  settings,
  isInfoOpen,
  onTitleChange,
  onManualSave,
  onRetry,
  onUndo,
  onRedo,
  onStarToggle,
  onInfoToggle,
  onSettingsChange,
  onDelete,
  onCopyLink,
  onOpenInNewTab,
  onViewInfo,
  onViewTableOfContents,
  onDuplicate,
  onImport,
  onExport,
}: DocPopupAppBarProps) {
  const { isMaximized, minimize, toggleMaximize, close } = useWindowControls();
  const [isAlwaysOnTop, setIsAlwaysOnTop] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [localTitle, setLocalTitle] = useState(docTitle);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const titleInputRef = useRef<InputRef>(null);
  const { displayed: displayedStatus, phase } = useSaveStatusDisplay(saveStatus);

  // Sync external title changes only when not editing
  useEffect(() => {
    if (!isEditingTitle) setLocalTitle(docTitle);
  }, [docTitle, isEditingTitle]);

  // Auto-focus + select all when entering edit mode
  useEffect(() => {
    if (isEditingTitle) {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }
  }, [isEditingTitle]);

  function startEdit() {
    setIsEditingTitle(true);
  }

  function commitEdit() {
    onTitleChange(localTitle);
    setIsEditingTitle(false);
  }

  function cancelEdit() {
    setLocalTitle(docTitle);
    setIsEditingTitle(false);
  }

  function handleTitleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") { e.preventDefault(); commitEdit(); }
    else if (e.key === "Escape") { e.preventDefault(); cancelEdit(); }
  }

  // Collapse row 2 when switching to mini mode
  useEffect(() => {
    if (isMini) setIsExpanded(false);
  }, [isMini]);

  const toggleAlwaysOnTop = useCallback(async () => {
    if (!isTauri()) return;
    const next = !isAlwaysOnTop;
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().setAlwaysOnTop(next);
    setIsAlwaysOnTop(next);
  }, [isAlwaysOnTop]);

  const toggleMini = useCallback(async () => {
    if (!isTauri()) return;
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const { LogicalSize } = await import("@tauri-apps/api/dpi");
    const win = getCurrentWindow();
    if (isMini) {
      await win.setSize(new LogicalSize(NORMAL_WIDTH, NORMAL_HEIGHT));
      await win.setResizable(true);
      await win.setMinSize(new LogicalSize(MIN_NORMAL_WIDTH, MIN_NORMAL_HEIGHT));
    } else {
      await win.setResizable(false);
      await win.setSize(new LogicalSize(MINI_WIDTH, MINI_HEIGHT));
    }
    onToggleMini();
  }, [isMini, onToggleMini]);

  const menuItems: MenuProps["items"] = [
    {
      key: "rename",
      label: "Rename",
      icon: <EditOutlined />,
      onClick: startEdit,
    },
    {
      key: "favourites",
      label: starred ? "Remove from favourites" : "Add to favourites",
      icon: starred ? <StarFilled /> : <StarOutlined />,
      onClick: onStarToggle,
    },
    { type: "divider" },
    {
      key: "open-new-tab",
      label: "Open in new tab",
      icon: <SelectOutlined />,
      onClick: onOpenInNewTab,
    },
    {
      key: "open-split-view",
      label: "Open in split view",
      icon: <SplitCellsOutlined />,
      disabled: true,
    },
    { type: "divider" },
    {
      key: "view-info",
      label: "View Info",
      icon: <InfoCircleOutlined />,
      onClick: onViewInfo,
    },
    {
      key: "view-toc",
      label: "View table of contents",
      icon: <UnorderedListOutlined />,
      onClick: onViewTableOfContents,
    },
    {
      key: "view-history",
      label: "View history version",
      icon: <HistoryOutlined />,
      disabled: true,
    },
    { type: "divider" },
    {
      key: "duplicate",
      label: "Duplicate",
      icon: <CopyOutlined />,
      onClick: onDuplicate,
    },
    {
      key: "import",
      label: "Import",
      icon: <ImportOutlined />,
      onClick: onImport,
    },
    {
      key: "export",
      label: "Export",
      icon: <ExportOutlined />,
      onClick: onExport,
    },
    { type: "divider" },
    {
      key: "copy-link",
      label: "Copy link",
      icon: <LinkOutlined />,
      onClick: onCopyLink,
    },
    { type: "divider" },
    {
      key: "delete",
      label: "Move to trash",
      icon: <DeleteOutlined />,
      danger: true,
      onClick: () =>
        Modal.confirm({
          title: "Xoá tài liệu?",
          content: "Tài liệu này sẽ bị xoá vĩnh viễn.",
          okText: "Xoá",
          okType: "danger",
          cancelText: "Huỷ",
          onOk: onDelete,
        }),
    },
  ];

  const settingsContent = (
    <div className="popup-settings-panel">
      <div className="popup-settings-section">
        <div className="popup-settings-label">
          <ThunderboltOutlined /> Lưu tự động
        </div>
        <div className="popup-settings-row">
          <Switch
            checked={settings.autoSave}
            onChange={(checked) => onSettingsChange({ ...settings, autoSave: checked })}
            size="small"
          />
          <span className="popup-settings-hint">
            {settings.autoSave ? "Bật" : "Tắt — Ctrl+S"}
          </span>
        </div>
      </div>
      <div className="popup-settings-section">
        <div className="popup-settings-label">Kích thước trang</div>
        <Select
          value={settings.pageSize}
          onChange={(val) => onSettingsChange({ ...settings, pageSize: val })}
          options={[{ label: "A4", value: "A4" }, { label: "Letter (US)", value: "Letter" }]}
          size="small"
          style={{ width: "100%" }}
        />
      </div>
    </div>
  );

  return (
    <header className="doc-popup-appbar">
      {/* Row 1 — always visible, drag region */}
      <div className="doc-popup-appbar-row1">
        <FileTextOutlined className="doc-popup-appbar-doc-icon" />

        {isEditingTitle ? (
          <Input
            ref={titleInputRef}
            variant="borderless"
            value={localTitle}
            onChange={(e) => setLocalTitle(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={handleTitleKeyDown}
            className="doc-popup-appbar-title-input"
            placeholder="Untitled"
          />
        ) : (
          <>
            <span
              className="doc-popup-appbar-title-display"
              data-tauri-drag-region
            >
              {localTitle || "Untitled"}
            </span>
            <Tooltip title="Rename">
              <button className="popup-row1-btn popup-row1-btn--icon-only" onClick={startEdit}>
                <EditOutlined />
              </button>
            </Tooltip>
            {/* Spacer — pushes right-side controls to the far right */}
            <span className="popup-row1-spacer" data-tauri-drag-region />
          </>
        )}

        {/* Draft badge */}
        {isDraft && saveStatus === "idle" && (
          <span className="popup-draft-badge">DRAFT · Ctrl+S</span>
        )}

        {/* Save status */}
        {(!isDraft || saveStatus !== "idle") && displayedStatus !== "idle" && (
          displayedStatus === "error" ? (
            <Tooltip title="Click to retry">
              <button
                className={`popup-save-status popup-save-status--error popup-save-status--clickable popup-save-status--${phase}`}
                onClick={onRetry}
              >
                <CloseCircleOutlined /> Retry
              </button>
            </Tooltip>
          ) : (
            <span
              className={[
                "popup-save-status",
                displayedStatus === "success" ? "popup-save-status--success" : "",
                `popup-save-status--${phase}`,
              ].filter(Boolean).join(" ")}
            >
              {displayedStatus === "saving" && <LoadingOutlined spin />}
              {displayedStatus === "success" && <CheckCircleOutlined />}
            </span>
          )
        )}

        {/* Manual save (autosave off, idle) */}
        {!settings.autoSave && saveStatus === "idle" && (
          <Tooltip title={isDirty ? "Save (Ctrl+S)" : "No unsaved changes"}>
            <button
              className={`popup-row1-btn ${isDirty ? "popup-row1-btn--dirty" : ""}`}
              onClick={onManualSave}
              disabled={!isDirty}
            >
              <SaveOutlined />
              {isDirty && <span className="popup-dirty-dot" />}
            </button>
          </Tooltip>
        )}

        {/* Expand toggle */}
        <Tooltip title={isExpanded ? "Collapse toolbar" : "Expand toolbar"}>
          <button
            className={`popup-row1-btn ${isExpanded ? "popup-row1-btn--active" : ""}`}
            onClick={() => setIsExpanded((p) => !p)}
          >
            {isExpanded ? <UpOutlined /> : <DownOutlined />}
          </button>
        </Tooltip>

        <span className="popup-appbar-sep" />

        {/* Window controls */}
        <div className="popup-window-controls">
          <button
            className={`doc-popup-btn ${isAlwaysOnTop ? "doc-popup-btn--active" : ""}`}
            onClick={toggleAlwaysOnTop}
            title={isAlwaysOnTop ? "Unpin" : "Pin (always on top)"}
          >
            {isAlwaysOnTop ? <PinFilledIcon /> : <PinIcon />}
          </button>
          <button
            className="doc-popup-btn"
            onClick={toggleMini}
            title={isMini ? "Restore compact" : "Compact mode"}
          >
            {isMini ? <MaximizeIcon /> : <MinimizeIcon />}
          </button>
          <button
            className="doc-popup-btn"
            onClick={minimize}
            title="Minimize to taskbar"
          >
            <MinimizeIcon />
          </button>
          <button
            className="doc-popup-btn"
            onClick={toggleMaximize}
            title={isMaximized ? "Restore" : "Maximize"}
          >
            {isMaximized ? <RestoreIcon /> : <MaximizeIcon />}
          </button>
          <button
            className="doc-popup-btn doc-popup-btn--close"
            onClick={close}
            title="Close"
          >
            <CloseIcon />
          </button>
        </div>
      </div>

      {/* Row 2 — expandable toolbar */}
      <div className={`doc-popup-appbar-row2${isExpanded ? " doc-popup-appbar-row2--open" : ""}`}>
        <Tooltip title="Undo (Ctrl+Z)">
          <button className="popup-row2-btn" onClick={onUndo} disabled={!canUndo}>
            <UndoOutlined />
          </button>
        </Tooltip>
        <Tooltip title="Redo (Ctrl+Shift+Z)">
          <button className="popup-row2-btn" onClick={onRedo} disabled={!canRedo}>
            <RedoOutlined />
          </button>
        </Tooltip>

        <span className="popup-row2-divider" />

        <Tooltip title={starred ? "Remove from favorites" : "Add to favorites"}>
          <button className="popup-row2-btn" onClick={onStarToggle}>
            {starred
              ? <StarFilled className="popup-row2-btn-icon--starred" />
              : <StarOutlined />}
          </button>
        </Tooltip>

        <span className="popup-row2-divider" />

        <Popover
          content={settingsContent}
          title="Cài đặt"
          trigger="click"
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          placement="bottomLeft"
        >
          <Tooltip title="Settings">
            <button className={`popup-row2-btn ${settingsOpen ? "popup-row2-btn--active" : ""}`}>
              <SettingOutlined />
            </button>
          </Tooltip>
        </Popover>

        <Tooltip title="Info / Table of contents">
          <button
            className={`popup-row2-btn ${isInfoOpen ? "popup-row2-btn--active" : ""}`}
            onClick={onInfoToggle}
          >
            <InfoCircleOutlined />
          </button>
        </Tooltip>

        <Dropdown menu={{ items: menuItems }} trigger={["click"]} placement="bottomLeft">
          <Tooltip title="More actions">
            <button className="popup-row2-btn">
              <MoreOutlined />
            </button>
          </Tooltip>
        </Dropdown>
      </div>
    </header>
  );
}
