import { useEffect, useState, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { 
  Table, 
  Button, 
  Input, 
  Tag, 
  Popconfirm, 
  Space, 
  message, 
  Tooltip 
} from "antd";
import { 
  PlusOutlined, 
  EditOutlined, 
  KeyOutlined, 
  DeleteOutlined, 
  SearchOutlined,
  UserOutlined
} from "@ant-design/icons";
import { AppBar } from "@/presentation/components/AppBar";
import Sidebar from "@/presentation/features/dashboard/components/Sidebar";
import { AppDispatch, RootState } from "@/presentation/store";
import { setPageTitle } from "@/presentation/store/appSlice";
import {
  useListUsersQuery,
  useCreateUserMutation,
  useUpdateUserMutation,
  useDeleteUserMutation,
  useUpdateUserPasswordMutation,
} from "@/infrastructure/api/usersApi";
import type { UserDto } from "@/core/interfaces/auth";
import UserFormModal from "../../components/UserFormModal";
import UserPasswordModal from "../../components/UserPasswordModal";
import dayjs from "dayjs";
import "./UsersPage.scss";

interface UsersPageProps {
  panelMode?: boolean;
}

export default function UsersPage({ panelMode }: UsersPageProps) {
  const dispatch = useDispatch<AppDispatch>();
  const { theme } = useSelector((state: RootState) => state.app);
  const { user: currentUser } = useSelector((state: RootState) => state.auth);

  const { data: users = [], isLoading } = useListUsersQuery();
  const [createUser, { isLoading: isCreating }] = useCreateUserMutation();
  const [updateUser, { isLoading: isUpdating }] = useUpdateUserMutation();
  const [deleteUser] = useDeleteUserMutation();
  const [updatePassword, { isLoading: isResettingPassword }] = useUpdateUserPasswordMutation();

  const [searchText, setSearchText] = useState("");
  const [formModalVisible, setFormModalVisible] = useState(false);
  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserDto | null>(null);

  useEffect(() => {
    dispatch(setPageTitle("Users"));
  }, [dispatch]);

  const filteredUsers = useMemo(() => {
    const term = searchText.toLowerCase().trim();
    if (!term) return users;
    return users.filter(
      (u) =>
        u.username?.toLowerCase().includes(term) ||
        u.email?.toLowerCase().includes(term)
    );
  }, [users, searchText]);

  const handleCreateOrUpdate = async (values: any) => {
    try {
      if (selectedUser) {
        await updateUser({
          id: selectedUser.id,
          body: {
            username: selectedUser.username, // Username cannot be modified as per standard
            email: values.email,
            role: values.role,
            active: values.active,
          },
        }).unwrap();
        message.success("User updated successfully");
      } else {
        await createUser({
          username: values.username,
          email: values.email,
          password: values.password,
          role: values.role,
        }).unwrap();
        message.success("User created successfully");
      }
      setFormModalVisible(false);
      setSelectedUser(null);
    } catch (err: any) {
      message.error(err?.data?.message || err?.message || "Failed to save user");
    }
  };

  const handleResetPassword = async (password: string) => {
    if (!selectedUser) return;
    try {
      await updatePassword({
        id: selectedUser.id,
        body: { password },
      }).unwrap();
      message.success("Password reset successfully");
      setPasswordModalVisible(false);
      setSelectedUser(null);
    } catch (err: any) {
      message.error(err?.data?.message || err?.message || "Failed to reset password");
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteUser(id).unwrap();
      message.success("User deleted successfully");
    } catch (err: any) {
      message.error(err?.data?.message || err?.message || "Failed to delete user");
    }
  };

  const openCreateModal = () => {
    setSelectedUser(null);
    setFormModalVisible(true);
  };

  const openEditModal = (record: UserDto) => {
    setSelectedUser(record);
    setFormModalVisible(true);
  };

  const openPasswordModal = (record: UserDto) => {
    setSelectedUser(record);
    setPasswordModalVisible(true);
  };

  const columns = [
    {
      title: "User",
      key: "user",
      render: (_: any, record: UserDto) => (
        <Space size="middle">
          <div className="user-avatar-circle">
            <UserOutlined />
          </div>
          <div>
            <div className="user-username-text">{record.username}</div>
            <div className="user-email-text">{record.email}</div>
          </div>
        </Space>
      ),
    },
    {
      title: "Role",
      dataIndex: "role",
      key: "role",
      render: (role: string) => {
        const color = role === "ADMIN" ? "magenta" : "blue";
        return <Tag color={color}>{role}</Tag>;
      },
    },
    {
      title: "Status",
      dataIndex: "active",
      key: "active",
      render: (active: boolean) => (
        <Tag color={active ? "green" : "red"}>
          {active ? "Active" : "Inactive"}
        </Tag>
      ),
    },
    {
      title: "Created Date",
      dataIndex: "createdDate",
      key: "createdDate",
      render: (date: string) => date ? dayjs(date).format("YYYY-MM-DD HH:mm") : "—",
    },
    {
      title: "Actions",
      key: "action",
      render: (_: any, record: UserDto) => {
        const isSelf = currentUser?.userId === record.id;
        return (
          <Space size="small">
            <Tooltip title="Edit user details">
              <Button
                type="text"
                icon={<EditOutlined />}
                onClick={() => openEditModal(record)}
              />
            </Tooltip>
            <Tooltip title="Change password">
              <Button
                type="text"
                icon={<KeyOutlined />}
                onClick={() => openPasswordModal(record)}
              />
            </Tooltip>
            <Tooltip title={isSelf ? "Cannot delete yourself" : "Delete user"}>
              <span>
                <Popconfirm
                  title="Are you sure you want to delete this user?"
                  onConfirm={() => handleDelete(record.id)}
                  okText="Yes"
                  cancelText="No"
                  disabled={isSelf}
                >
                  <Button
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    disabled={isSelf}
                  />
                </Popconfirm>
              </span>
            </Tooltip>
          </Space>
        );
      },
    },
  ];

  const content = (
    <main className="dashboard-main users-page-main">
      <section className="dashboard-content users-page">
        <div className="users-header">
          <div className="users-title-area">
            <h1 className="users-title">Users</h1>
            <p className="users-subtitle">Manage all user accounts, update details, or reset credentials.</p>
          </div>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={openCreateModal}
            className="btn-create-user"
          >
            Create User
          </Button>
        </div>

        <div className="users-filter-row">
          <Input
            placeholder="Search by username or email..."
            prefix={<SearchOutlined style={{ color: "rgba(0,0,0,.25)" }} />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="users-search-input"
            allowClear
          />
        </div>

        <div className="users-table-wrap">
          <Table
            columns={columns}
            dataSource={filteredUsers}
            rowKey="id"
            loading={isLoading}
            pagination={{ defaultPageSize: 10, showSizeChanger: true, showTotal: (total) => `Total ${total} users` }}
            className="users-table"
          />
        </div>
      </section>

      <UserFormModal
        visible={formModalVisible}
        onCancel={() => {
          setFormModalVisible(false);
          setSelectedUser(null);
        }}
        onSubmit={handleCreateOrUpdate}
        confirmLoading={isCreating || isUpdating}
        user={selectedUser}
      />

      <UserPasswordModal
        visible={passwordModalVisible}
        onCancel={() => {
          setPasswordModalVisible(false);
          setSelectedUser(null);
        }}
        onSubmit={handleResetPassword}
        confirmLoading={isResettingPassword}
        user={selectedUser}
      />
    </main>
  );

  if (panelMode) return content;

  return (
    <div className={`dashboard-layout theme-${theme}`}>
      <AppBar variant="dashboard" />
      <div className="dashboard-body">
        <Sidebar />
        {content}
      </div>
    </div>
  );
}
