import { useState, useRef, useEffect } from "react";
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
  BranchesOutlined,
  CloudUploadOutlined,
  WarningOutlined,
  CloudDownloadOutlined,
  CloudSyncOutlined,
} from "@ant-design/icons";
import type { EditorSettings } from "@/features/docs/pages/DocEditorPage/DocEditorPage";
import type { SaveStatus } from "../../../../hooks/useDocEditor";
import type { DocPersistenceState } from "@/store/docsSlice";
import type { CollaboratorUser } from "@/features/docs/hooks/useYjsCollaboration";
import { CollaboratorAvatars } from "../CollaboratorAvatars";
import "./DocEditorToolbar.scss";

interface DocEditorToolbarProps {
  title: string;
  starred: boolean;
  isRightPanelOpen: boolean;
  settings: EditorSettings;
  saveStatus: SaveStatus;
  persistenceState?: DocPersistenceState;
  justSaved?: boolean;
  saveError?: string | null;
  lastSavedLocalAt?: string | null;
  lastSyncedRemoteAt?: string | null;
  isDraft?: boolean;
  isDirty: boolean;
  isSyncedToServer?: boolean;
  collaborators?: CollaboratorUser[];
  isCollabConnected?: boolean;
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
  onViewGitHistory?: () => void;
  onSaveToGit?: () => void;
  isOnGit?: boolean;
  isSavingGit?: boolean;
  gitFileStatus?: "clean" | "modified" | "untracked" | "conflict" | "behind";
  hasGitChanges?: boolean;
  hasConflict?: boolean;
  remoteUpdated?: boolean;
  onPull?: () => void;
  onResolveConflict?: () => void;
  onDuplicate: () => void;
  onImport: () => void;
  onExport: () => void;
}

function formatSyncTime(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
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
  persistenceState,
  justSaved = false,
  saveError = null,
  lastSavedLocalAt = null,
  lastSyncedRemoteAt = null,
  isDraft,
  isDirty,
  isSyncedToServer,
  collaborators = [],
  isCollabConnected = false,
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
  onViewGitHistory,
  onSaveToGit,
  isOnGit = false,
  isSavingGit = false,
  gitFileStatus = "clean",
  hasGitChanges = false,
  hasConflict = false,
  remoteUpdated = false,
  onPull,
  onResolveConflict,
  onDuplicate,
  onImport,
  onExport,
}: DocEditorToolbarProps) {
  const titleInputRef = useRef<InputRef>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [localTitle, setLocalTitle] = useState(title);
  const isFocusedRef = useRef(false);

  const effectiveState: DocPersistenceState =
    persistenceState ??
    (saveStatus === "saving"
      ? "saving"
      : saveStatus === "error"
        ? "error"
        : isDirty
          ? "unsaved"
          : isSyncedToServer === false
            ? "saved-local"
            : "synced");

  const isGitSaving = isSavingGit || effectiveState === "saving";

  let gitIcon = <BranchesOutlined className="toolbar-btn-icon" />;
  let gitClass = "toolbar-git-btn--clean";
  let gitTooltip = "";
  let isGitDisabled = false;
  let handleGitAction = onSaveToGit;

  if (isGitSaving) {
    gitIcon = <LoadingOutlined className="toolbar-btn-icon" spin />;
    gitTooltip = isSavingGit ? "Đang lưu & đẩy lên GitHub…" : "Đang lưu tài liệu…";
    isGitDisabled = true;
  } else if (saveStatus === "error") {
    gitTooltip = "Lưu tài liệu thất bại — Vui lòng thử lại";
    isGitDisabled = true;
  } else if (hasConflict || gitFileStatus === "conflict") {
    gitIcon = <WarningOutlined className="toolbar-btn-icon" />;
    gitClass = "toolbar-git-btn--conflict";
    gitTooltip = "Phát hiện xung đột Git trên file này — Nhấn để giải quyết";
    handleGitAction = onResolveConflict || onSaveToGit;
    isGitDisabled = false;
  } else if (remoteUpdated || gitFileStatus === "behind") {
    gitIcon = <CloudDownloadOutlined className="toolbar-btn-icon" />;
    gitClass = "toolbar-git-btn--behind";
    gitTooltip = "Nội dung trên Git đã được cập nhật — Nhấn để Pull về";
    handleGitAction = onPull || onSaveToGit;
    isGitDisabled = false;
  } else if (!isOnGit || gitFileStatus === "untracked") {
    gitIcon = <CloudUploadOutlined className="toolbar-btn-icon" />;
    gitClass = "toolbar-git-btn--untracked";
    gitTooltip = "Save and Push lên GitHub (Ctrl+Shift+S)";
    isGitDisabled = false;
  } else if (hasGitChanges || gitFileStatus === "modified") {
    gitIcon = <BranchesOutlined className="toolbar-btn-icon" />;
    gitClass = "toolbar-git-btn--modified";
    gitTooltip = "Save and Commit lên Git (Ctrl+Shift+S)";
    isGitDisabled = false;
  } else {
    // Clean / No changes -> disable commit button as requested
    gitIcon = <BranchesOutlined className="toolbar-btn-icon" />;
    gitClass = "toolbar-git-btn--clean";
    gitTooltip = "Save and Commit (Ctrl+Shift+S) — Đã đồng bộ với Git";
    isGitDisabled = true;
  }

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
    ...(onViewGitHistory ? [{
      key: "view-git-history",
      label: "View Git history",
      icon: <BranchesOutlined />,
      onClick: onViewGitHistory,
    }] : []),
    ...(onSaveToGit ? [{
      key: "save-to-git",
      label: hasConflict
        ? "Resolve Git Conflict"
        : remoteUpdated
          ? "Pull changes from Git"
          : isOnGit
            ? "Commit nhanh lên Git"
            : "Push to GitHub",
      icon: gitIcon,
      disabled: isGitDisabled,
      onClick: handleGitAction,
    }] : []),
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
            {settings.autoSave ? "Bật — tự động lưu & đồng bộ" : "Tắt — dùng Ctrl+S hoặc nút Save"}
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
      {isDraft && (
        <span className="toolbar-draft-badge">DRAFT · Ctrl+S</span>
      )}

      {/* Unified real persistence state indicator */}
      {effectiveState === "saving" && (
        <span className="toolbar-autosave toolbar-autosave--saving">
          <LoadingOutlined spin /> Đang lưu…
        </span>
      )}
      {effectiveState === "error" && (
        <Tooltip title={saveError || "Lưu thất bại — nhấn để thử lại"}>
          <button
            className="toolbar-autosave toolbar-autosave--error toolbar-autosave--clickable"
            onClick={onRetry}
          >
            <CloseCircleOutlined /> Lưu lỗi — Thử lại
          </button>
        </Tooltip>
      )}
      {effectiveState === "unsaved" && (
        <Tooltip title="Có thay đổi chưa lưu — Nhấn hoặc Ctrl+S để lưu">
          <button
            className="toolbar-autosave toolbar-autosave--unsaved toolbar-autosave--clickable"
            onClick={onManualSave}
          >
            <span className="toolbar-status-dot" /> Chưa lưu
          </button>
        </Tooltip>
      )}
      {effectiveState === "saved-local" && (
        <Tooltip
          title={
            lastSavedLocalAt
              ? `Đã lưu trên máy lúc ${formatSyncTime(lastSavedLocalAt)}, chưa đồng bộ server — Nhấn hoặc Ctrl+S`
              : "Đã lưu trên máy, chưa đồng bộ server — Nhấn hoặc Ctrl+S"
          }
        >
          <button
            className="toolbar-autosave toolbar-autosave--local toolbar-autosave--clickable"
            onClick={onManualSave}
          >
            <CloudSyncOutlined /> Đã lưu máy
          </button>
        </Tooltip>
      )}
      {effectiveState === "synced" && (
        justSaved || saveStatus === "success" ? (
          <span className="toolbar-autosave toolbar-autosave--success">
            <CheckCircleOutlined /> Đã lưu
          </span>
        ) : (
          <Tooltip
            title={
              lastSyncedRemoteAt
                ? `Đã đồng bộ server lúc ${formatSyncTime(lastSyncedRemoteAt)}`
                : "Đã đồng bộ với server"
            }
          >
            <span className="toolbar-autosave toolbar-autosave--synced">
              <CheckCircleOutlined /> Đã đồng bộ
            </span>
          </Tooltip>
        )
      )}

      {/* Manual Save button (autosave off) */}
      {!settings.autoSave && effectiveState !== "saving" && (
        <Tooltip
          title={
            isDirty || effectiveState === "error"
              ? "Lưu & đồng bộ (Ctrl+S)"
              : "Tất cả thay đổi đã được đồng bộ"
          }
        >
          <button
            className={`toolbar-btn toolbar-save-btn ${isDirty || effectiveState === "error" ? "toolbar-save-btn--dirty" : ""}`}
            onClick={onManualSave}
            disabled={!isDirty && effectiveState !== "error"}
          >
            <SaveOutlined className="toolbar-btn-icon" />
            {(isDirty || effectiveState === "error") && <span className="toolbar-save-btn__dot" />}
          </button>
        </Tooltip>
      )}

      <div className="doc-editor-toolbar-actions">
        {isCollabConnected && (
          <Tooltip title="Đang kết nối thời gian thực (Yjs)">
            <span style={{ display: "inline-flex", alignItems: "center", marginRight: 6 }} aria-label="Live">
              <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "#52c41a" }} />
            </span>
          </Tooltip>
        )}
        {collaborators && collaborators.length > 0 && (
          <>
            <CollaboratorAvatars collaborators={collaborators} />
            <span className="toolbar-divider" />
          </>
        )}
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

        {onSaveToGit && (
          <Tooltip title={gitTooltip}>
            <button
              className={`toolbar-btn toolbar-git-btn ${gitClass}`}
              onClick={handleGitAction}
              disabled={isGitDisabled}
              aria-label={gitTooltip}
            >
              {gitIcon}
            </button>
          </Tooltip>
        )}

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
