import { useEffect } from "react";
import { Modal, Form, Input, Select } from "antd";
import type { UserDto } from "@/core/interfaces/auth";

interface UserFormModalProps {
  visible: boolean;
  onCancel: () => void;
  onSubmit: (values: any) => void;
  confirmLoading: boolean;
  user: UserDto | null;
}

export default function UserFormModal({
  visible,
  onCancel,
  onSubmit,
  confirmLoading,
  user,
}: UserFormModalProps) {
  const [form] = Form.useForm();

  useEffect(() => {
    if (visible) {
      if (user) {
        form.setFieldsValue({
          username: user.username,
          email: user.email,
          role: user.role,
          active: user.active,
        });
      } else {
        form.resetFields();
      }
    }
  }, [visible, user, form]);

  const handleOk = () => {
    form
      .validateFields()
      .then((values) => {
        onSubmit(values);
      })
      .catch((info) => {
        console.log("Validation Failed:", info);
      });
  };

  return (
    <Modal
      open={visible}
      title={user ? "Edit User" : "Create User"}
      okText={user ? "Save" : "Create"}
      cancelText="Cancel"
      onCancel={onCancel}
      onOk={handleOk}
      confirmLoading={confirmLoading}
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        name="userForm"
        initialValues={{ role: "USER", active: true }}
      >
        <Form.Item
          name="username"
          label="Username"
          rules={[
            { required: true, message: "Please input username" },
            { min: 3, message: "Username must be at least 3 characters" },
          ]}
        >
          <Input disabled={!!user} placeholder="Enter username" />
        </Form.Item>

        <Form.Item
          name="email"
          label="Email"
          rules={[
            { required: true, message: "Please input email" },
            { type: "email", message: "Please enter a valid email address" },
          ]}
        >
          <Input placeholder="Enter email" />
        </Form.Item>

        {!user && (
          <Form.Item
            name="password"
            label="Password"
            rules={[
              { required: true, message: "Please input password" },
              { min: 6, message: "Password must be at least 6 characters" },
            ]}
          >
            <Input.Password placeholder="Enter password" />
          </Form.Item>
        )}

        <Form.Item
          name="role"
          label="Role"
          rules={[{ required: true, message: "Please select a role" }]}
        >
          <Select placeholder="Select role">
            <Select.Option value="USER">USER</Select.Option>
            <Select.Option value="ADMIN">ADMIN</Select.Option>
          </Select>
        </Form.Item>

        {user && (
          <Form.Item
            name="active"
            label="Status"
            rules={[{ required: true, message: "Please select status" }]}
          >
            <Select placeholder="Select status">
              <Select.Option value={true}>Active</Select.Option>
              <Select.Option value={false}>Inactive</Select.Option>
            </Select>
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
}
