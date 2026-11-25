import { useMemo, useState } from "react";
import { useSelector } from "react-redux";
import {
  Alert,
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Segmented,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  Ban,
  Check,
  Copy,
  KeyRound,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import type { RootState } from "@/store";
import type { APIKeyDto, CreateAPIKeyRequest } from "@/core/interfaces/auth";
import {
  useCreateApiKeyMutation,
  useDeleteApiKeyMutation,
  useListApiKeysQuery,
  useRevokeApiKeyMutation,
} from "@/infrastructure/api/apiKeysApi";
import "./ApiKeysPage.scss";

type StatusFilter = "ALL" | "ACTIVE" | "REVOKED";

function formatTimestamp(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function getKeyStatus(item: APIKeyDto): "Active" | "Revoked" | "Expired" {
  if (item.revoked_at) return "Revoked";
  if (item.expires_at) {
    const exp = new Date(item.expires_at).getTime();
    if (!Number.isNaN(exp) && exp <= Date.now()) return "Expired";
  }
  return "Active";
}

function buildMcpConfigSnippet(rawKey: string): string {
  return JSON.stringify(
    {
      mcpServers: {
        "tomo-docs": {
          url: "https://api.tomoo.uk/go/v1/mcp",
          headers: {
            "X-Api-Key": rawKey,
          },
        },
        "tomo-translate": {
          url: "https://api.tomoo.uk/node/mcp",
          headers: {
            "X-Api-Key": rawKey,
          },
        },
      },
    },
    null,
    2
  );
}

export default function ApiKeysPage() {
  const user = useSelector((state: RootState) => state.auth.user);
  const isAdmin = (user?.role || "").toUpperCase() === "ADMIN";

  const {
    data: apiKeys = [],
    isLoading,
    isFetching,
    error,
    refetch,
  } = useListApiKeysQuery(undefined, { skip: !isAdmin });

  const [createApiKey, { isLoading: isCreating }] = useCreateApiKeyMutation();
  const [revokeApiKey] = useRevokeApiKeyMutation();
  const [deleteApiKey] = useDeleteApiKeyMutation();

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [createOpen, setCreateOpen] = useState(false);
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<APIKeyDto | null>(null);
  const [copiedType, setCopiedType] = useState<"key" | "mcp" | null>(null);
  const [form] = Form.useForm<CreateAPIKeyRequest>();

  const filteredKeys = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return apiKeys.filter((item) => {
      const status = getKeyStatus(item);
      if (statusFilter === "ACTIVE" && status !== "Active") return false;
      if (statusFilter === "REVOKED" && status !== "Revoked") return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.key_prefix.toLowerCase().includes(q) ||
        item.role.toLowerCase().includes(q) ||
        (item.scopes || "").toLowerCase().includes(q)
      );
    });
  }, [apiKeys, searchQuery, statusFilter]);

  const handleCopy = async (text: string, type: "key" | "mcp") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedType(type);
      message.success(
        type === "key" ? "API key copied" : "mcp.json snippet copied"
      );
      setTimeout(() => setCopiedType(null), 2000);
    } catch {
      message.error("Failed to copy to clipboard");
    }
  };

  const handleCreateSubmit = async (values: CreateAPIKeyRequest) => {
    try {
      const payload: CreateAPIKeyRequest = {
        name: values.name.trim(),
        role: values.role || "ADMIN",
        scopes: values.scopes?.trim() || undefined,
        expires_in_days:
          values.expires_in_days && values.expires_in_days > 0
            ? values.expires_in_days
            : undefined,
        user_id: values.user_id?.trim() || undefined,
      };
      const created = await createApiKey(payload).unwrap();
      setNewlyCreatedKey(created);
      setCreateOpen(false);
      form.resetFields();
      message.success("API key created");
    } catch (err) {
      const msg =
        err && typeof err === "object" && "data" in err
          ? (err as { data?: { message?: string } }).data?.message
          : undefined;
      message.error(msg || "Failed to create API key");
    }
  };

  const handleRevoke = (record: APIKeyDto) => {
    Modal.confirm({
      title: `Revoke "${record.name}"?`,
      content:
        "Agents or MCP clients using this API key will immediately lose access.",
      okText: "Revoke",
      okType: "danger",
      cancelText: "Cancel",
      onOk: async () => {
        try {
          await revokeApiKey(record.id).unwrap();
          message.success("API key revoked");
        } catch {
          message.error("Failed to revoke API key");
        }
      },
    });
  };

  const handleDelete = (record: APIKeyDto) => {
    Modal.confirm({
      title: `Delete "${record.name}" permanently?`,
      content: "This action removes the key record and cannot be undone.",
      okText: "Delete",
      okType: "danger",
      cancelText: "Cancel",
      onOk: async () => {
        try {
          await deleteApiKey(record.id).unwrap();
          message.success("API key deleted");
        } catch {
          message.error("Failed to delete API key");
        }
      },
    });
  };

  const columns: ColumnsType<APIKeyDto> = [
    {
      title: "Name & Prefix",
      key: "name",
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          <Typography.Text strong>{record.name}</Typography.Text>
          <Typography.Text code>{record.key_prefix}...</Typography.Text>
        </Space>
      ),
    },
    {
      title: "Role",
      dataIndex: "role",
      key: "role",
      width: 110,
      render: (role: string) => (
        <Tag color={role === "ADMIN" ? "purple" : "blue"}>{role}</Tag>
      ),
    },
    {
      title: "Scopes",
      dataIndex: "scopes",
      key: "scopes",
      render: (scopes: string) =>
        scopes ? (
          <Typography.Text code>{scopes}</Typography.Text>
        ) : (
          <Typography.Text type="secondary">All scopes</Typography.Text>
        ),
    },
    {
      title: "Status",
      key: "status",
      width: 110,
      render: (_, record) => {
        const status = getKeyStatus(record);
        const color =
          status === "Active"
            ? "green"
            : status === "Revoked"
              ? "red"
              : "orange";
        return <Tag color={color}>{status}</Tag>;
      },
    },
    {
      title: "Last Used",
      dataIndex: "last_used_at",
      key: "last_used_at",
      render: (val: string | null | undefined) => formatTimestamp(val),
    },
    {
      title: "Expires",
      dataIndex: "expires_at",
      key: "expires_at",
      render: (val: string | null | undefined) =>
        val ? formatTimestamp(val) : "Never",
    },
    {
      title: "Actions",
      key: "actions",
      width: 170,
      render: (_, record) => {
        const isRevoked = Boolean(record.revoked_at);
        return (
          <div className="api-keys-row-actions">
            <Button
              size="small"
              icon={<Ban size={13} />}
              disabled={isRevoked}
              onClick={() => handleRevoke(record)}
            >
              Revoke
            </Button>
            <Button
              size="small"
              danger
              icon={<Trash2 size={13} />}
              onClick={() => handleDelete(record)}
            />
          </div>
        );
      },
    },
  ];

  const revealedSecret = newlyCreatedKey?.api_key || newlyCreatedKey?.key || "";

  return (
    <div className="api-keys-page">
      <div className="api-keys-header">
        <div className="api-keys-title-group">
          <h1 className="api-keys-title">
            <KeyRound size={22} />
            <span>API Keys</span>
          </h1>
          <p className="api-keys-subtitle">
            Admin-managed API keys for MCP servers (Go &amp; Node). Keys are
            hashed at rest and only displayed once on creation.
          </p>
        </div>

        {isAdmin && (
          <div className="api-keys-actions">
            <Button
              icon={<RefreshCw size={14} />}
              onClick={() => refetch()}
              loading={isFetching}
            >
              Refresh
            </Button>
            <Button
              type="primary"
              icon={<Plus size={14} />}
              onClick={() => {
                form.setFieldsValue({ role: "ADMIN" });
                setCreateOpen(true);
              }}
            >
              Create API Key
            </Button>
          </div>
        )}
      </div>

      {!isAdmin ? (
        <Alert
          type="warning"
          showIcon
          message="Administrator access required"
          description={`Signed in as ${user?.username || "User"} (${user?.role || "USER"}). Only ADMIN accounts can view, create, revoke, or delete MCP API keys.`}
        />
      ) : (
        <>
          {error && (
            <Alert
              type="error"
              showIcon
              message="Could not load API keys"
              description="Check that your ADMIN session is valid and the Go backend is reachable."
            />
          )}

          {newlyCreatedKey && revealedSecret && (
            <div className="api-keys-reveal-card">
              <div className="api-keys-reveal-header">
                <span className="api-keys-reveal-title">
                  New API key &ldquo;{newlyCreatedKey.name}&rdquo; created — copy
                  it now (it will not be shown again)
                </span>
                <Button
                  size="small"
                  onClick={() => setNewlyCreatedKey(null)}
                >
                  Dismiss
                </Button>
              </div>

              <div className="api-keys-reveal-box">
                <code className="api-keys-secret-code">{revealedSecret}</code>
                <Space>
                  <Button
                    size="small"
                    type="primary"
                    icon={
                      copiedType === "key" ? (
                        <Check size={13} />
                      ) : (
                        <Copy size={13} />
                      )
                    }
                    onClick={() => handleCopy(revealedSecret, "key")}
                  >
                    {copiedType === "key" ? "Copied" : "Copy Key"}
                  </Button>
                  <Button
                    size="small"
                    icon={
                      copiedType === "mcp" ? (
                        <Check size={13} />
                      ) : (
                        <Copy size={13} />
                      )
                    }
                    onClick={() =>
                      handleCopy(buildMcpConfigSnippet(revealedSecret), "mcp")
                    }
                  >
                    {copiedType === "mcp" ? "Copied" : "Copy mcp.json"}
                  </Button>
                </Space>
              </div>
            </div>
          )}

          <div className="api-keys-toolbar">
            <div className="api-keys-filters">
              <Input.Search
                placeholder="Search by name, prefix, role, or scope..."
                allowClear
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ width: 280 }}
              />
              <Segmented
                value={statusFilter}
                onChange={(val) => setStatusFilter(val as StatusFilter)}
                options={[
                  { label: "All", value: "ALL" },
                  { label: "Active", value: "ACTIVE" },
                  { label: "Revoked", value: "REVOKED" },
                ]}
              />
            </div>
            <Typography.Text type="secondary">
              {filteredKeys.length} key{filteredKeys.length === 1 ? "" : "s"}
            </Typography.Text>
          </div>

          <div className="api-keys-table-card">
            <Table
              rowKey="id"
              columns={columns}
              dataSource={filteredKeys}
              loading={isLoading}
              pagination={{ pageSize: 12, hideOnSinglePage: true }}
            />
          </div>
        </>
      )}

      <Modal
        title="Create MCP API Key"
        open={createOpen}
        onCancel={() => {
          setCreateOpen(false);
          form.resetFields();
        }}
        onOk={() => form.submit()}
        okText="Create Key"
        confirmLoading={isCreating}
        destroyOnHidden
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleCreateSubmit}
          initialValues={{ role: "ADMIN" }}
        >
          <Form.Item
            label="Key Name"
            name="name"
            rules={[{ required: true, message: "Please enter a key name" }]}
          >
            <Input placeholder="e.g. gemops-abi-mcp" />
          </Form.Item>

          <Form.Item label="Role" name="role">
            <Select
              options={[
                { label: "ADMIN", value: "ADMIN" },
                { label: "EDITOR", value: "EDITOR" },
                { label: "USER", value: "USER" },
              ]}
            />
          </Form.Item>

          <Form.Item
            label="Scopes (optional)"
            name="scopes"
            extra="Comma-separated scopes, or leave empty for full role access."
          >
            <Input placeholder="e.g. mcp:read,mcp:write" />
          </Form.Item>

          <Form.Item
            label="Expires In (days, optional)"
            name="expires_in_days"
            extra="Leave blank for a non-expiring key."
          >
            <InputNumber min={1} max={3650} style={{ width: "100%" }} />
          </Form.Item>

          <Form.Item
            label="Act As User ID (optional)"
            name="user_id"
            extra="Defaults to your current admin user ID."
          >
            <Input placeholder="Optional user UUID" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
