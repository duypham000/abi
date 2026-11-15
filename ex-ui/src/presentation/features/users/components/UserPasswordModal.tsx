import { useEffect } from "react";
import { Modal, Form, Input } from "antd";
import type { UserDto } from "@/core/interfaces/auth";

interface UserPasswordModalProps {
  visible: boolean;
  onCancel: () => void;
  onSubmit: (password: string) => void;
  confirmLoading: boolean;
  user: UserDto | null;
}

export default function UserPasswordModal({
  visible,
  onCancel,
  onSubmit,
  confirmLoading,
  user,
}: UserPasswordModalProps) {
  const [form] = Form.useForm();

  useEffect(() => {
    if (visible) {
      form.resetFields();
    }
  }, [visible, form]);

  const handleOk = () => {
    form
      .validateFields()
      .then((values) => {
        onSubmit(values.password);
      })
      .catch((info) => {
        console.log("Validation Failed:", info);
      });
  };

  return (
    <Modal
      open={visible}
      title={`Reset Password for ${user?.username}`}
      okText="Reset"
      cancelText="Cancel"
      onCancel={onCancel}
      onOk={handleOk}
      confirmLoading={confirmLoading}
      destroyOnClose
    >
      <Form form={form} layout="vertical" name="userPasswordForm">
        <Form.Item
          name="password"
          label="New Password"
          rules={[
            { required: true, message: "Please input new password" },
            { min: 6, message: "Password must be at least 6 characters" },
          ]}
        >
          <Input.Password placeholder="Enter new password" />
        </Form.Item>

        <Form.Item
          name="confirmPassword"
          label="Confirm Password"
          dependencies={["password"]}
          rules={[
            { required: true, message: "Please confirm new password" },
            ({ getFieldValue }) => ({
              validator(_, value) {
                if (!value || getFieldValue("password") === value) {
                  return Promise.resolve();
                }
                return Promise.reject(
                  new Error("The two passwords that you entered do not match!")
                );
              },
            }),
          ]}
        >
          <Input.Password placeholder="Confirm new password" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
