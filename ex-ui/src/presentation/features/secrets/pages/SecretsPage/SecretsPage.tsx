import { useState, useEffect, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { 
  Button, 
  Input, 
  Select, 
  Dropdown, 
  Drawer, 
  message, 
  Popconfirm,
  Tooltip,
  Popover,
  Slider,
  Checkbox
} from "antd";
import { 
  SearchOutlined, 
  FilterOutlined, 
  PlusOutlined, 
  CopyOutlined, 
  EyeOutlined, 
  EyeInvisibleOutlined, 
  DeleteOutlined, 
  EditOutlined, 
  ShareAltOutlined, 
  ArrowLeftOutlined,
  FolderOutlined,
  FolderOpenOutlined,
  KeyOutlined,
  CloseOutlined,
  PlusCircleOutlined,
  HomeOutlined,
  LockOutlined,
  UnlockOutlined,
  ThunderboltOutlined
} from "@ant-design/icons";
import { AppBar } from "@/presentation/components/AppBar";
import Sidebar from "@/presentation/features/dashboard/components/Sidebar";
import { RootState } from "@/presentation/store";
import { setPageTitle } from "@/presentation/store/appSlice";
import { MarkdownDocEditor } from "./MarkdownDocEditor";
import {
  useListSecretsQuery,
  useGetSecretDetailQuery,
  useSearchSecretsQuery,
  useCreateSecretMutation,
  useUpdateSecretMutation,
  useDeleteSecretMutation,
} from "@/infrastructure/api/secretsApi";
import {
  useListSecretGroupsQuery,
  useCreateSecretGroupMutation,
  useUpdateSecretGroupMutation,
  useDeleteSecretGroupMutation,
} from "@/infrastructure/api/secretGroupsApi";
import type {
  SecretDetailDto,
  SecretGroupDto
} from "@/core/interfaces/secrets";
import "./SecretsPage.scss";

// --- Password Generator Content for Popover ---
const PasswordGeneratorPopover = ({ onGenerate }: { onGenerate: (val: string) => void }) => {
  const [length, setLength] = useState(16);
  const [includeNumbers, setIncludeNumbers] = useState(true);
  const [includeSymbols, setIncludeSymbols] = useState(true);

  const CHARSET = {
    upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    lower: "abcdefghijklmnopqrstuvwxyz",
    numbers: "0123456789",
    symbols: "!@#$%^&*()_+-=[]{}|;:,.<>?",
  };

  const handleGenerate = () => {
    let charset = CHARSET.upper + CHARSET.lower;
    if (includeNumbers) charset += CHARSET.numbers;
    if (includeSymbols) charset += CHARSET.symbols;

    const arr = new Uint32Array(length);
    crypto.getRandomValues(arr);
    const pass = Array.from(arr).map((n) => charset[n % charset.length]).join("");
    onGenerate(pass);
    message.success("Đã tự sinh mật khẩu!");
  };

  return (
    <div style={{ width: 220, padding: "4px 0" }} onClick={e => e.stopPropagation()}>
      <div style={{ marginBottom: 10, fontSize: 12, fontWeight: 600 }}>Cấu hình tự sinh</div>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <span>Độ dài: {length} kí tự</span>
        </div>
        <Slider min={6} max={32} value={length} onChange={setLength} tooltip={{ open: false }} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
        <Checkbox checked={includeNumbers} onChange={e => setIncludeNumbers(e.target.checked)}>
          Chữ số (0-9)
        </Checkbox>
        <Checkbox checked={includeSymbols} onChange={e => setIncludeSymbols(e.target.checked)}>
          Kí tự đặc biệt (!@#...)
        </Checkbox>
      </div>
      <Button type="primary" size="small" block onClick={handleGenerate}>
        Tạo mật khẩu
      </Button>
    </div>
  );
};

function useWindowWidth() {
  const [width, setWidth] = useState(() => (typeof window !== "undefined" ? window.innerWidth : 1024));
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  return width;
}

interface SecretsPageProps {
  panelMode?: boolean;
}

export default function SecretsPage({ panelMode }: SecretsPageProps) {
  const dispatch = useDispatch();
  const theme = useSelector((state: RootState) => state.app.theme);
  const width = useWindowWidth();
  const isMobileView = width <= 767;

  const [mobileTab, setMobileTab] = useState<"items" | "info">("items");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<"all" | "secrets" | "groups">("all");
  const [activeGroupId, setActiveGroupId] = useState<number | null>(null);

  // Selected Secret for Drawer editing
  const [selectedSecretId, setSelectedSecretId] = useState<number | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Password Visibility Toggle State Map
  // key: secretId + "_" + itemId
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});

  // API Queries & Mutations
  const { data: groups = [] } = useListSecretGroupsQuery();
  
  const isSearching = searchQuery.trim().length > 0;
  
  const { data: listData } = useListSecretsQuery(
    { 
      groupId: activeGroupId === null ? 0 : activeGroupId,
      favorite: null
    },
    { skip: isSearching }
  );

  const { data: searchData = [] } = useSearchSecretsQuery(
    searchQuery.trim(),
    { skip: !isSearching }
  );

  const [createSecret] = useCreateSecretMutation();
  const [updateSecret] = useUpdateSecretMutation();
  const [deleteSecret] = useDeleteSecretMutation();

  const [createSecretGroup] = useCreateSecretGroupMutation();
  const [updateSecretGroup] = useUpdateSecretGroupMutation();
  const [deleteSecretGroup] = useDeleteSecretGroupMutation();

  // Selected Detail for drawer
  const { data: activeSecretDetails } = useGetSecretDetailQuery(
    selectedSecretId!,
    { skip: selectedSecretId === null }
  );

  // Local state for editing in Drawer
  const [editingSecret, setEditingSecret] = useState<SecretDetailDto | null>(null);
  
  // Local state for active group editing (split-view left pane)
  const [editingGroup, setEditingGroup] = useState<SecretGroupDto | null>(null);

  // Set Page Title
  useEffect(() => {
    dispatch(setPageTitle("Secrets"));
  }, [dispatch]);

  // Sync details to local editing state
  useEffect(() => {
    if (activeSecretDetails && selectedSecretId !== null) {
      setEditingSecret(activeSecretDetails);
    } else {
      setEditingSecret(null);
    }
  }, [activeSecretDetails, selectedSecretId]);

  const activeGroup = useMemo(() => groups.find(g => g.id === activeGroupId) || null, [groups, activeGroupId]);

  // Sync group details to local editing state
  useEffect(() => {
    if (activeGroup) {
      setEditingGroup(activeGroup);
    } else {
      setEditingGroup(null);
    }
  }, [activeGroup]);

  // Debounced auto-save for Group title & description
  useEffect(() => {
    if (!editingGroup) return;
    const timer = setTimeout(async () => {
      const orig = groups.find(g => g.id === editingGroup.id);
      if (orig && (orig.title !== editingGroup.title || orig.description !== editingGroup.description)) {
        try {
          await updateSecretGroup({
            id: editingGroup.id,
            body: {
              title: editingGroup.title,
              description: editingGroup.description || "",
              parentId: orig.parentId
            }
          }).unwrap();
        } catch (err) {
          message.error("Lỗi khi lưu tự động nhóm!");
        }
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [editingGroup, groups, updateSecretGroup]);

  // URL checking
  const isUrl = (val: string) => {
    return /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/.test(val) || val.includes("www.");
  };

  const formatUrl = (val: string) => {
    if (val.startsWith("http://") || val.startsWith("https://")) return val;
    return `https://${val}`;
  };

  const handleCopy = (value: string, label: string) => {
    navigator.clipboard.writeText(value);
    message.success(`Copied ${label} to clipboard!`);
  };

  // State Actions
  const handleCreateSecret = async (groupId: number | null) => {
    try {
      const newSecret = await createSecret({
        title: "New Secret",
        description: "Description of the credentials",
        groupId: groupId,
        tags: [],
        favorite: false,
        items: [
          { label: "Username", value: "", isSecret: false },
          { label: "Password", value: "", isSecret: true },
          { label: "Sites", value: "", isSecret: false },
          { label: "Note", value: "", isSecret: false }
        ]
      }).unwrap();
      setSelectedSecretId(newSecret.id);
      setIsDrawerOpen(true);
    } catch (err) {
      message.error("Lỗi khi tạo mật khẩu!");
    }
  };

  const handleCreateGroup = async (parentId: number | null) => {
    try {
      const newGroup = await createSecretGroup({
        title: "New Group",
        description: "# New Group\nDescription of this group...",
        parentId: parentId
      }).unwrap();
      setActiveGroupId(newGroup.id);
    } catch (err) {
      message.error("Lỗi khi tạo nhóm!");
    }
  };

  const handleDeleteSecret = async (id: number) => {
    try {
      await deleteSecret(id).unwrap();
      message.success("Xóa mật khẩu thành công!");
      if (selectedSecretId === id) {
        setIsDrawerOpen(false);
        setSelectedSecretId(null);
      }
    } catch (err) {
      message.error("Lỗi khi xóa mật khẩu!");
    }
  };

  const handleDeleteGroup = async (id: number) => {
    try {
      await deleteSecretGroup(id).unwrap();
      message.success("Xóa nhóm thành công!");
      if (activeGroupId === id) {
        setActiveGroupId(null);
      }
    } catch (err) {
      message.error("Lỗi khi xóa nhóm!");
    }
  };

  const handleUpdateGroupContent = (id: number, updates: Partial<SecretGroupDto>) => {
    if (editingGroup && editingGroup.id === id) {
      setEditingGroup({ ...editingGroup, ...updates });
    }
  };

  const handleUpdateSecretContent = (updates: Partial<SecretDetailDto>) => {
    if (editingSecret) {
      setEditingSecret({ ...editingSecret, ...updates } as SecretDetailDto);
    }
  };

  const handleSaveSecret = async () => {
    if (!editingSecret) return;
    try {
      await updateSecret({
        id: editingSecret.id,
        body: {
          title: editingSecret.title,
          description: editingSecret.description,
          groupId: editingSecret.groupId,
          tags: editingSecret.tags,
          favorite: editingSecret.favorite,
          items: editingSecret.items.map(item => ({
            id: item.id,
            label: item.label,
            value: item.value,
            isSecret: item.isSecret
          }))
        }
      }).unwrap();
      setIsDrawerOpen(false);
      setSelectedSecretId(null);
      message.success("Đã lưu mật khẩu bảo mật!");
    } catch (err) {
      message.error("Lỗi khi lưu mật khẩu!");
    }
  };

  // Group Details Filtering
  const currentGroups = useMemo(() => groups.filter(g => g.parentId === activeGroupId), [groups, activeGroupId]);

  const displayGroups = useMemo(() => {
    if (filterType === "secrets") return [];
    if (isSearching) {
      const q = searchQuery.toLowerCase();
      return groups.filter(g => g.title.toLowerCase().includes(q) || (g.description && g.description.toLowerCase().includes(q)));
    }
    return currentGroups;
  }, [filterType, isSearching, searchQuery, groups, currentGroups]);

  const displaySecrets = useMemo(() => {
    if (filterType === "groups") return [];
    if (isSearching) return searchData;
    return listData?.items ?? [];
  }, [filterType, isSearching, searchData, listData]);

  // Breadcrumbs generator
  const getBreadcrumbs = () => {
    const crumbs: SecretGroupDto[] = [];
    let parent = activeGroup;
    while (parent) {
      crumbs.unshift(parent);
      const parentId = parent.parentId;
      parent = parentId ? (groups.find(g => g.id === parentId) || null) : null;
    }
    return crumbs;
  };

  // Dropdown menus
  const newItemMenuItems = [
    {
      key: "new-secret",
      label: "New Secret",
      icon: <KeyOutlined />,
      onClick: () => handleCreateSecret(activeGroupId)
    },
    {
      key: "new-group",
      label: "New Group",
      icon: <FolderOutlined />,
      onClick: () => handleCreateGroup(activeGroupId)
    }
  ];

  const secretsContent = (
    <>
    <main className="secrets-page__main">
          
          {/* Header Bar */}
          <div className="secrets-page__header">
            {activeGroupId ? (
              <div className="secrets-page__navigation">
                <Button 
                  icon={<ArrowLeftOutlined />} 
                  onClick={() => setActiveGroupId(activeGroup?.parentId || null)}
                  className="secrets-page__back-btn"
                >
                  Quay lại
                </Button>
                <div className="secrets-page__breadcrumbs">
                  <span className="crumb-home" onClick={() => setActiveGroupId(null)}>
                    <HomeOutlined /> Root
                  </span>
                  {getBreadcrumbs().map((crumb) => (
                    <span key={crumb.id} className="crumb-item" onClick={() => setActiveGroupId(crumb.id)}>
                      / {crumb.title}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div className="secrets-page__title-area">
                <h1 className="secrets-page__main-title">Kho mật khẩu bảo mật</h1>
                <p className="secrets-page__subtitle">Lưu trữ, tổ chức và chia sẻ tài khoản bảo mật của bạn.</p>
              </div>
            )}

            <div className="secrets-page__controls">
              <Input
                placeholder="Tìm kiếm nhãn, giá trị, mô tả..."
                prefix={<SearchOutlined />}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="secrets-page__search-input"
                allowClear
              />
              <Select
                value={filterType}
                onChange={val => setFilterType(val)}
                className="secrets-page__filter-select"
                options={[
                  { value: "all", label: "Tất cả" },
                  { value: "secrets", label: "Mật khẩu" },
                  { value: "groups", label: "Nhóm" }
                ]}
                suffixIcon={<FilterOutlined />}
              />
              <Dropdown menu={{ items: newItemMenuItems }} trigger={["click"]}>
                <Button type="primary" icon={<PlusOutlined />} className="secrets-page__new-btn">
                  Tạo mới
                </Button>
              </Dropdown>
            </div>
          </div>

          {/* Main Content Area */}
          <div className="secrets-page__content-container">
            {!activeGroupId ? (
              // Root view: Grid of cards
              <div className="secrets-page__grid-view">
                {displayGroups.length === 0 && displaySecrets.length === 0 ? (
                  <div className="secrets-page__empty">
                    <KeyOutlined className="empty-icon" />
                    <h3>Không tìm thấy dữ liệu</h3>
                    <p>Hãy tạo mật khẩu mới hoặc nhóm mới để bắt đầu.</p>
                  </div>
                ) : (
                  <div className="secrets-grid">
                    {/* Render Groups */}
                    {displayGroups.map(group => {
                      const directSecretsCount = displaySecrets.filter(s => s.groupId === group.id).length;
                      const directSubGroupsCount = groups.filter(g => g.parentId === group.id).length;
                      return (
                        <div 
                          key={group.id} 
                          className="secrets-card secrets-card--group"
                          onClick={() => setActiveGroupId(group.id)}
                        >
                          <div className="secrets-card__group-icon">
                            <FolderOutlined />
                          </div>
                          <div className="secrets-card__content">
                            <h3 className="secrets-card__title">{group.title}</h3>
                            <p className="secrets-card__description">
                              {group.description?.replace(/[#*`_-]/g, "").substring(0, 100) || "Không có mô tả"}
                            </p>
                            <div className="secrets-card__group-meta">
                              <span>{directSecretsCount} secrets</span>
                              <span className="dot">•</span>
                              <span>{directSubGroupsCount} nhóm con</span>
                            </div>
                          </div>
                          <div className="secrets-card__group-actions" onClick={e => e.stopPropagation()}>
                            <Popconfirm
                              title="Xóa nhóm này?"
                              description="Xóa nhóm sẽ xóa toàn bộ nhóm con bên trong."
                              onConfirm={() => handleDeleteGroup(group.id)}
                              okText="Xóa"
                              cancelText="Hủy"
                            >
                              <Button type="text" danger icon={<DeleteOutlined />} size="small" />
                            </Popconfirm>
                          </div>
                        </div>
                      );
                    })}

                    {/* Render Secrets */}
                    {displaySecrets.map(secret => (
                      <div key={secret.id} className="secrets-card secrets-card--secret">
                        {/* Tags list in the top-right corner */}
                        {secret.tags && secret.tags.length > 0 && (
                          <div className="secrets-card__tags-corner">
                            {secret.tags.map(tag => (
                              <span key={tag} className="secrets-card__tag-badge">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}

                        <div className="secrets-card__header">
                          <div className="secrets-card__title-col">
                            {secret.highlights?.title?.[0] ? (
                              <h3 
                                className="secrets-card__title [&_em]:bg-yellow-100 [&_em]:text-yellow-800 [&_em]:not-italic [&_em]:font-semibold [&_em]:px-1 [&_em]:rounded" 
                                dangerouslySetInnerHTML={{ __html: secret.highlights.title[0] }} 
                              />
                            ) : (
                              <h3 className="secrets-card__title">{secret.title}</h3>
                            )}
                            
                            {secret.highlights?.body?.[0] ? (
                              <p 
                                className="secrets-card__description [&_em]:bg-yellow-100 [&_em]:text-yellow-800 [&_em]:not-italic [&_em]:font-semibold [&_em]:px-1 [&_em]:rounded" 
                                dangerouslySetInnerHTML={{ __html: secret.highlights.body[0] }} 
                              />
                            ) : (
                              <p className="secrets-card__description">{secret.description}</p>
                            )}
                          </div>
                        </div>
                        
                        {/* 2 Column Fields Layout */}
                        <div className="secrets-card__fields-grid">
                          {secret.items?.map(item => {
                            if (!item.label) return null;
                            const isSecret = item.isSecret || false;
                            const isValUrl = isUrl(item.value);
                            const passVisibleKey = `${secret.id}_${item.id}`;
                            const isVisible = visiblePasswords[passVisibleKey] || false;

                            return (
                              <div key={item.id} className="secrets-card__field">
                                <span className="secrets-card__field-label">{item.label}</span>
                                <div 
                                  className="secrets-card__field-pill"
                                  onClick={() => item.value && handleCopy(item.value, item.label)}
                                >
                                  {isSecret ? (
                                    <span className="secrets-card__field-value font-mono">
                                      {isVisible ? item.value : "••••••••••••"}
                                    </span>
                                  ) : isValUrl ? (
                                    <a 
                                      href={formatUrl(item.value)} 
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                      className="secrets-card__field-link"
                                      onClick={e => e.stopPropagation()}
                                    >
                                      {item.value}
                                    </a>
                                  ) : (
                                    <span className="secrets-card__field-value">
                                      {item.value || <span className="placeholder">No {item.label.toLowerCase()} added</span>}
                                    </span>
                                  )}

                                  <div className="secrets-card__field-actions">
                                    {isSecret && item.value && (
                                      <button 
                                        className="field-action-btn"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setVisiblePasswords({
                                            ...visiblePasswords,
                                            [passVisibleKey]: !isVisible
                                          });
                                        }}
                                      >
                                        {isVisible ? <EyeInvisibleOutlined /> : <EyeOutlined />}
                                      </button>
                                    )}
                                    {item.value && (
                                      <span className="field-action-btn">
                                        <CopyOutlined />
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Card Footer Actions */}
                        <div className="secrets-card__footer">
                          <div className="left-actions">
                            <Button 
                              shape="round" 
                              icon={<EditOutlined />} 
                              onClick={() => {
                                setSelectedSecretId(secret.id);
                                setIsDrawerOpen(true);
                              }}
                              className="card-action-btn-pill"
                            >
                              Edit
                            </Button>
                            <Popconfirm
                              title="Xóa mật khẩu này?"
                              onConfirm={() => handleDeleteSecret(secret.id)}
                              okText="Xóa"
                              cancelText="Hủy"
                            >
                              <Button 
                                shape="round" 
                                danger 
                                icon={<DeleteOutlined />}
                                className="card-action-btn-pill card-action-btn-pill--danger"
                              >
                                Delete
                              </Button>
                            </Popconfirm>
                          </div>
                          <Button 
                            shape="round" 
                            icon={<ShareAltOutlined />}
                            onClick={() => {
                              navigator.clipboard.writeText(`${window.location.origin}/secrets?id=${secret.id}`);
                              message.success("Shared secret link copied to clipboard!");
                            }}
                            className="card-action-btn-pill"
                          >
                            Share
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : activeGroup && editingGroup ? (
              // Group details Split View (2-pane)
              <div className="secrets-page__split-view-container">
                {isMobileView && (
                  <div className="secrets-mobile-tabs">
                    <button
                      className={`secrets-mobile-tab-btn ${mobileTab === "items" ? "active" : ""}`}
                      onClick={() => setMobileTab("items")}
                      type="button"
                    >
                      <KeyOutlined /> Danh sách
                    </button>
                    <button
                      className={`secrets-mobile-tab-btn ${mobileTab === "info" ? "active" : ""}`}
                      onClick={() => setMobileTab("info")}
                      type="button"
                    >
                      <FolderOpenOutlined /> Tài liệu
                    </button>
                  </div>
                )}
                <div className="secrets-page__split-view">
                  
                  {/* Left pane: Document editor */}
                  <div className={`split-pane split-pane--left ${isMobileView && mobileTab !== "info" ? "split-pane--hidden-mobile" : ""}`}>
                  <div className="split-pane__editor-header">
                    <input
                      type="text"
                      value={editingGroup.title}
                      onChange={e => handleUpdateGroupContent(editingGroup.id, { title: e.target.value })}
                      placeholder="Tên nhóm..."
                      className="split-pane__title-input"
                    />
                    <div className="split-pane__save-status">
                      <span>Lưu tự động dưới dạng Markdown</span>
                    </div>
                  </div>
                  <div className="split-pane__editor-body">
                    <MarkdownDocEditor
                      markdown={editingGroup.description || ""}
                      onChange={markdown => handleUpdateGroupContent(editingGroup.id, { description: markdown })}
                    />
                  </div>
                </div>

                {/* Right pane: Group Sub-Items */}
                <div className={`split-pane split-pane--right ${isMobileView && mobileTab !== "items" ? "split-pane--hidden-mobile" : ""}`}>
                  <div className="split-pane__right-header">
                    <h3 className="section-title">Nội dung nhóm</h3>
                    <p className="section-desc">Các mật khẩu và nhóm con trực thuộc</p>
                  </div>

                  {/* Quick Add Secret Form */}
                  <div className="quick-add-form">
                    <h4 className="quick-add-form__title">Tạo nhanh mật khẩu</h4>
                    <form 
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const formData = new FormData(e.currentTarget);
                        const title = formData.get("secretTitle") as string;
                        if (!title.trim()) return;
                        
                        try {
                          await createSecret({
                            title: title,
                            description: "Mật khẩu tạo nhanh",
                            groupId: activeGroupId,
                            tags: [],
                            favorite: false,
                            items: [
                              { label: "Username", value: "", isSecret: false },
                              { label: "Password", value: "", isSecret: true },
                              { label: "Sites", value: "", isSecret: false },
                              { label: "Note", value: "", isSecret: false }
                            ]
                          }).unwrap();
                          message.success(`Đã tạo "${title}". Nhấp Edit để thiết lập chi tiết.`);
                          e.currentTarget.reset();
                        } catch (err) {
                          message.error("Lỗi khi tạo mật khẩu nhanh!");
                        }
                      }}
                      className="quick-add-form__fields"
                    >
                      <Input
                        name="secretTitle"
                        placeholder="Nhập tên mật khẩu bảo mật..."
                        required
                        className="quick-add-input"
                      />
                      <Button type="primary" htmlType="submit" icon={<PlusCircleOutlined />}>
                        Thêm
                      </Button>
                    </form>
                  </div>

                  {/* Sub-items Grid */}
                  {displayGroups.length === 0 && displaySecrets.length === 0 ? (
                    <div className="split-pane__empty-sub">
                      <span>Nhóm này chưa có nội dung con.</span>
                    </div>
                  ) : (
                    <div className="sub-items-list">
                      {/* Render Subgroups */}
                      {displayGroups.map(group => {
                        const directSecretsCount = displaySecrets.filter(s => s.groupId === group.id).length;
                        const directSubGroupsCount = groups.filter(g => g.parentId === group.id).length;
                        return (
                          <div 
                            key={group.id} 
                            className="sub-item-row sub-item-row--group"
                            onClick={() => setActiveGroupId(group.id)}
                          >
                            <div className="sub-item-row__left">
                              <FolderOpenOutlined className="item-icon" />
                              <div className="item-info">
                                <span className="item-title">{group.title}</span>
                                <span className="item-meta">{directSecretsCount} secrets • {directSubGroupsCount} nhóm con</span>
                              </div>
                            </div>
                            <div className="sub-item-row__actions" onClick={e => e.stopPropagation()}>
                              <Popconfirm
                                title="Xóa nhóm con này?"
                                onConfirm={() => handleDeleteGroup(group.id)}
                                okText="Xóa"
                                cancelText="Hủy"
                              >
                                <Button type="text" danger icon={<DeleteOutlined />} size="small" />
                              </Popconfirm>
                            </div>
                          </div>
                        );
                      })}

                      {/* Render Sub-secrets */}
                      {displaySecrets.map(secret => (
                        <div 
                          key={secret.id} 
                          className="sub-item-row sub-item-row--secret"
                          onClick={() => {
                            setSelectedSecretId(secret.id);
                            setIsDrawerOpen(true);
                          }}
                        >
                          <div className="sub-item-row__left">
                            <KeyOutlined className="item-icon" />
                            <div className="item-info">
                              <span className="item-title">{secret.title}</span>
                              <span className="item-desc">{secret.description || "Không có mô tả"}</span>
                            </div>
                          </div>
                          <div className="sub-item-row__actions" onClick={e => e.stopPropagation()}>
                            <Button 
                              type="text" 
                              icon={<EditOutlined />} 
                              size="small" 
                              onClick={() => {
                                setSelectedSecretId(secret.id);
                                setIsDrawerOpen(true);
                              }}
                            />
                            <Popconfirm
                              title="Xóa mật khẩu?"
                              onConfirm={() => handleDeleteSecret(secret.id)}
                              okText="Xóa"
                              cancelText="Hủy"
                            >
                              <Button type="text" danger icon={<DeleteOutlined />} size="small" />
                            </Popconfirm>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                </div>
              </div>
            </div>
            ) : null}
          </div>

        </main>
      {/* Secret Detail Vertical Slide-over Panel (Drawer) */}
      <Drawer
        title={
          <div className="drawer-custom-title">
            <KeyOutlined /> {editingSecret ? `Chỉnh sửa: ${editingSecret.title}` : "Chi tiết mật khẩu"}
          </div>
        }
        placement="right"
        onClose={() => {
          setIsDrawerOpen(false);
          setSelectedSecretId(null);
        }}
        open={isDrawerOpen}
        width={isMobileView ? "100%" : 480}
        extra={
          <Button 
            type="text" 
            icon={<CloseOutlined />} 
            onClick={() => {
              setIsDrawerOpen(false);
              setSelectedSecretId(null);
            }} 
          />
        }
        closeIcon={null}
        className="secret-detail-drawer"
      >
        {editingSecret ? (
          <div className="secret-editor">
            {/* Title & Desc Fields */}
            <div className="secret-editor__section">
              <label className="secret-editor__label">Tiêu đề mật khẩu</label>
              <Input
                value={editingSecret.title}
                onChange={e => handleUpdateSecretContent({ title: e.target.value })}
                placeholder="Nhập tiêu đề mật khẩu..."
                className="secret-editor__input secret-editor__input--title"
              />
            </div>

            <div className="secret-editor__section">
              <label className="secret-editor__label">Mô tả ngắn</label>
              <Input.TextArea
                value={editingSecret.description || ""}
                onChange={e => handleUpdateSecretContent({ description: e.target.value })}
                placeholder="Mô tả công dụng tài khoản này..."
                rows={3}
                className="secret-editor__input"
              />
            </div>

            {/* List of Label/Value Items */}
            <div className="secret-editor__section">
              <div className="secret-editor__section-header">
                <label className="secret-editor__label">Danh sách trường thông tin</label>
                <Button
                  type="link"
                  icon={<PlusOutlined />}
                  onClick={() => {
                    const updatedItems = [
                      ...editingSecret.items,
                      { id: Date.now(), label: "Trường mới", value: "", isSecret: false }
                    ];
                    handleUpdateSecretContent({ items: updatedItems });
                  }}
                  className="add-field-btn"
                >
                  Thêm trường
                </Button>
              </div>

              <div className="secret-editor__fields-list">
                {editingSecret.items?.map((item, idx) => {
                  const hasSecretStatus = item.isSecret || false;
                  return (
                    <div key={item.id} className="secret-editor__field-row">
                      <Tooltip title={hasSecretStatus ? "Trường bảo mật (ẩn/hiện)" : "Trường công khai"}>
                        <Button
                          type="text"
                          icon={hasSecretStatus ? <LockOutlined style={{ color: "#2563eb" }} /> : <UnlockOutlined style={{ color: "#9ca3af" }} />}
                          onClick={() => {
                            const updated = [...editingSecret.items];
                            updated[idx] = { ...updated[idx], isSecret: !hasSecretStatus };
                            handleUpdateSecretContent({ items: updated });
                          }}
                          className="field-row-toggle-secret"
                        />
                      </Tooltip>
                      <div className="field-row-inputs">
                        <Input
                          value={item.label}
                          onChange={e => {
                            const updated = [...editingSecret.items];
                            updated[idx] = { ...updated[idx], label: e.target.value };
                            handleUpdateSecretContent({ items: updated });
                          }}
                          placeholder="Label (vd: Email)"
                          className="field-row-input-label"
                        />
                        <Input
                          value={item.value}
                          onChange={e => {
                            const updated = [...editingSecret.items];
                            updated[idx] = { ...updated[idx], value: e.target.value };
                            handleUpdateSecretContent({ items: updated });
                          }}
                          placeholder="Giá trị"
                          className="field-row-input-value"
                          type={hasSecretStatus ? "password" : "text"}
                          suffix={
                            hasSecretStatus ? (
                              <Popover
                                content={
                                  <PasswordGeneratorPopover
                                    onGenerate={(generatedVal) => {
                                      const updated = [...editingSecret.items];
                                      updated[idx] = { ...updated[idx], value: generatedVal };
                                      handleUpdateSecretContent({ items: updated });
                                    }}
                                  />
                                }
                                title="Cấu hình tự sinh"
                                trigger="click"
                                placement="topRight"
                              >
                                <Tooltip title="Tự sinh giá trị">
                                  <ThunderboltOutlined style={{ color: "#eab308", cursor: "pointer" }} />
                                </Tooltip>
                              </Popover>
                            ) : null
                          }
                        />
                      </div>
                      <Button
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => {
                          const updated = editingSecret.items.filter(it => it.id !== item.id);
                          handleUpdateSecretContent({ items: updated });
                        }}
                        className="delete-field-btn"
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Action Footer inside Drawer */}
            <div className="secret-editor__footer">
              <Popconfirm
                title="Xóa mật khẩu này vĩnh viễn?"
                onConfirm={() => handleDeleteSecret(editingSecret.id)}
                okText="Xóa"
                cancelText="Hủy"
              >
                <Button danger type="dashed" icon={<DeleteOutlined />}>
                  Xóa tài khoản
                </Button>
              </Popconfirm>
              <Button 
                type="primary" 
                onClick={handleSaveSecret}
              >
                Hoàn tất
              </Button>
            </div>

          </div>
        ) : (
          <div className="secret-editor__empty">
            <span>Vui lòng chọn mật khẩu để chỉnh sửa.</span>
          </div>
        )}
      </Drawer>
    </>
  );

  if (panelMode) {
    return (
      <div className="secrets-page secrets-page-container" style={{ height: "100%", width: "100%" }}>
        {secretsContent}
      </div>
    );
  }

  return (
    <div className={`secrets-page theme-${theme} secrets-page-container`}>
      <AppBar variant="dashboard" />
      <div className="secrets-page__body">
        <Sidebar />
        {secretsContent}
      </div>
    </div>
  );
}
