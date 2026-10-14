import { useState, useRef, useEffect, useCallback } from "react";
import { Input, Modal, Tooltip, Dropdown, Popover, Radio, Select, Switch } from "antd";
import type { InputRef, MenuProps } from "antd";
import {
  StarOutlined,
  StarFilled,
  InfoCircleOutlined,
  MoreOutlined,
  EditOutlined,
  DeleteOutlined,
  LinkOutlined,
  FileTextOutlined,
  SettingOutlined,
  ColumnWidthOutlined,
  SelectOutlined,
  SplitCellsOutlined,
  UnorderedListOutlined,
  HistoryOutlined,
  CopyOutlined,
  ImportOutlined,
  ExportOutlined,
  ArrowLeftOutlined,
  UndoOutlined,
  RedoOutlined,
  LoadingOutlined,
  SaveOutlined,
  ThunderboltOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from "@ant-design/icons";
import type { EditorSettings } from "@/presentation/features/docs/pages/DocEditorPage/DocEditorPage";
import type { SaveStatus } from "../../../../hooks/useDocEditor";
import "./DocEditorToolbar.scss";

interface DocEditorToolbarProps {
  title: string;
  starred: boolean;
  isRightPanelOpen: boolean;
  settings: EditorSettings;
  saveStatus: SaveStatus;
  isDraft?: boolean;
  isDirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  undoTooltip?: string;
  redoTooltip?: string;
  onBack: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onManualSave: () => void;
  onRetry: () => void;
  onTitleChange: (value: string) => void;
  onStarToggle: () => void;
  onInfoToggle: () => void;
  onDelete: () => void;
  onCopyLink: () => void;
  onSettingsChange: (next: EditorSettings) => void;
  onOpenInNewTab: () => void;
  onOpenInPopup: () => void;
  onOpenInSplitView: () => void;
  onViewInfo: () => void;
  onViewTableOfContents: () => void;
  onViewHistoryVersion: () => void;
  onDuplicate: () => void;
  onImport: () => void;
  onExport: () => void;
}

const EXIT_DURATION = 200; // ms — must match CSS animation duration

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
      // Exit animation for success/saving states; error stays until retried
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

const WIDTH_OPTIONS = [
  { label: "Hẹp", value: "narrow" },
  { label: "Vừa", value: "medium" },
  { label: "Rộng", value: "wide" },
  { label: "Toàn màn hình", value: "full" },
];

const PAGE_SIZE_OPTIONS = [
  { label: "A4", value: "A4" },
  { label: "Letter (US)", value: "Letter" },
];

export function DocEditorToolbar({
  title,
  starred,
  isRightPanelOpen,
  settings,
  saveStatus,
  isDraft,
  isDirty,
  canUndo,
  canRedo,
  undoTooltip = "Undo (Ctrl+Z)",
  redoTooltip = "Redo (Ctrl+Y)",
  onBack,
  onUndo,
  onRedo,
  onManualSave,
  onRetry,
  onTitleChange,
  onStarToggle,
  onInfoToggle,
  onDelete,
  onCopyLink,
  onSettingsChange,
  onOpenInNewTab,
  onOpenInPopup,
  onOpenInSplitView,
  onViewInfo,
  onViewTableOfContents,
  onViewHistoryVersion,
  onDuplicate,
  onImport,
  onExport,
}: DocEditorToolbarProps) {
  const titleInputRef = useRef<InputRef>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [localTitle, setLocalTitle] = useState(title);
  const isFocusedRef = useRef(false);
  const { displayed: displayedStatus, phase } = useSaveStatusDisplay(saveStatus);

  useEffect(() => {
    if (!isFocusedRef.current) {
      setLocalTitle(title);
    }
  }, [title]);

  const menuItems: MenuProps["items"] = [
    {
      key: "rename",
      label: "Rename",
      icon: <EditOutlined />,
      onClick: () => titleInputRef.current?.focus(),
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
      key: "open-popup",
      label: "Open in popup window",
      icon: <FileTextOutlined />,
      onClick: onOpenInPopup,
    },
    {
      key: "open-split-view",
      label: "Open in split view",
      icon: <SplitCellsOutlined />,
      onClick: onOpenInSplitView,
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
      onClick: onViewHistoryVersion,
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
      onClick: () => onImport(),
    },
    {
      key: "export",
      label: "Export",
      icon: <ExportOutlined />,
      onClick: () => onExport(),
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
    <div className="editor-settings-panel">
      <div className="editor-settings-section">
        <div className="editor-settings-section-title">
          <ColumnWidthOutlined /> Độ rộng
        </div>
        <Radio.Group
          value={settings.width}
          onChange={(e) => onSettingsChange({ ...settings, width: e.target.value })}
          className="editor-settings-radio-group"
        >
          {WIDTH_OPTIONS.map((opt) => (
            <Radio.Button key={opt.value} value={opt.value}>
              {opt.label}
            </Radio.Button>
          ))}
        </Radio.Group>
      </div>

      <div className="editor-settings-section">
        <div className="editor-settings-section-title">Kích thước trang (in)</div>
        <Select
          value={settings.pageSize}
          onChange={(val) => onSettingsChange({ ...settings, pageSize: val })}
          options={PAGE_SIZE_OPTIONS}
          size="small"
          style={{ width: "100%" }}
        />
      </div>

      <div className="editor-settings-section">
        <div className="editor-settings-section-title">
          <ThunderboltOutlined /> Lưu tự động
        </div>
        <div className="editor-settings-autosave-row">
          <Switch
            checked={settings.autoSave}
            onChange={(checked) => onSettingsChange({ ...settings, autoSave: checked })}
            size="small"
          />
          <span className="editor-settings-autosave-label">
            {settings.autoSave ? "Bật" : "Tắt — dùng Ctrl+S hoặc nút Save"}
          </span>
        </div>
      </div>

      <div className="editor-settings-section">
        <div className="editor-settings-section-title">Chế độ hiển thị</div>
        <div className="editor-settings-autosave-row">
          <Switch
            checked={settings.showCanvas}
            onChange={(checked) => {
              if (!checked && !settings.showEditor) return;
              onSettingsChange({ ...settings, showCanvas: checked });
            }}
            size="small"
          />
          <span className="editor-settings-autosave-label">Workspace (Canvas)</span>
        </div>
        <div className="editor-settings-autosave-row" style={{ marginTop: 6 }}>
          <Switch
            checked={settings.showEditor}
            onChange={(checked) => {
              if (!checked && !settings.showCanvas) return;
              onSettingsChange({ ...settings, showEditor: checked });
            }}
            size="small"
          />
          <span className="editor-settings-autosave-label">Editor</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="doc-editor-toolbar">
      {/* Back */}
      <Tooltip title="Back to docs">
        <button className="toolbar-btn" onClick={onBack}>
          <ArrowLeftOutlined className="toolbar-btn-icon" />
        </button>
      </Tooltip>

      <FileTextOutlined className="doc-editor-toolbar-icon" />

      <Input
        ref={titleInputRef}
        variant="borderless"
        value={localTitle}
        onChange={(e) => {
          setLocalTitle(e.target.value);
          onTitleChange(e.target.value);
        }}
        onFocus={() => { isFocusedRef.current = true; }}
        onBlur={() => { isFocusedRef.current = false; }}
        className="doc-editor-toolbar-title"
        placeholder="Untitled"
      />

      {/* Draft badge */}
      {isDraft && saveStatus === "idle" && (
        <span className="toolbar-draft-badge">DRAFT · Ctrl+S to save</span>
      )}

      {/* Save status indicator */}
      {(!isDraft || saveStatus !== "idle") && displayedStatus !== "idle" && (
        displayedStatus === "error" ? (
          <Tooltip title="Click to retry">
            <button
              key="error"
              className={`toolbar-autosave toolbar-autosave--error toolbar-autosave--clickable toolbar-autosave--${phase}`}
              onClick={onRetry}
            >
              <CloseCircleOutlined /> Save failed — retry
            </button>
          </Tooltip>
        ) : (
          <span
            key={displayedStatus}
            className={[
              "toolbar-autosave",
              displayedStatus === "success" ? "toolbar-autosave--success" : "",
              `toolbar-autosave--${phase}`,
            ].filter(Boolean).join(" ")}
          >
            {displayedStatus === "saving" && <><LoadingOutlined spin /> Saving…</>}
            {displayedStatus === "success" && <><CheckCircleOutlined /> Saved</>}
          </span>
        )
      )}

      {/* Manual Save button (autosave off, idle) */}
      {!settings.autoSave && saveStatus === "idle" && (
        <Tooltip title={isDirty ? "Save changes (Ctrl+S)" : "No unsaved changes"}>
          <button
            className={`toolbar-btn toolbar-save-btn ${isDirty ? "toolbar-save-btn--dirty" : ""}`}
            onClick={onManualSave}
            disabled={!isDirty}
          >
            <SaveOutlined className="toolbar-btn-icon" />
            {isDirty && <span className="toolbar-save-btn__dot" />}
          </button>
        </Tooltip>
      )}

      <div className="doc-editor-toolbar-actions">
        {/* Undo / Redo */}
        <Tooltip title={undoTooltip}>
          <button className="toolbar-btn" onClick={onUndo} disabled={!canUndo}>
            <UndoOutlined className="toolbar-btn-icon" />
          </button>
        </Tooltip>
        <Tooltip title={redoTooltip}>
          <button className="toolbar-btn" onClick={onRedo} disabled={!canRedo}>
            <RedoOutlined className="toolbar-btn-icon" />
          </button>
        </Tooltip>

        <span className="toolbar-divider" />

        <Tooltip title={starred ? "Remove from favorites" : "Add to favorites"}>
          <button className="toolbar-btn" onClick={onStarToggle}>
            {starred ? (
              <StarFilled className="toolbar-btn-icon toolbar-btn-icon--starred" />
            ) : (
              <StarOutlined className="toolbar-btn-icon" />
            )}
          </button>
        </Tooltip>

        <Popover
          content={settingsContent}
          title="Cài đặt trình soạn thảo"
          trigger="click"
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          placement="bottomRight"
          classNames={{ root: "editor-settings-popover" }}
        >
          <Tooltip title="Cài đặt editor">
            <button className={`toolbar-btn ${settingsOpen ? "toolbar-btn--active" : ""}`}>
              <SettingOutlined className="toolbar-btn-icon" />
            </button>
          </Tooltip>
        </Popover>

        <Tooltip title="Doc info">
          <button
            className={`toolbar-btn ${isRightPanelOpen ? "toolbar-btn--active" : ""}`}
            onClick={onInfoToggle}
          >
            <InfoCircleOutlined className="toolbar-btn-icon" />
          </button>
        </Tooltip>

        <Dropdown menu={{ items: menuItems }} trigger={["click"]} placement="bottomRight">
          <Tooltip title="More actions">
            <button className="toolbar-btn">
              <MoreOutlined className="toolbar-btn-icon" />
            </button>
          </Tooltip>
        </Dropdown>
      </div>
    </div>
  );
}
