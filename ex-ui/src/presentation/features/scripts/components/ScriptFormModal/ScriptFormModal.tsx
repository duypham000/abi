import { useEffect, useState } from "react";
import { Form, Input, Modal } from "antd";
import type { Script } from "@/core/interfaces/script";

interface ScriptFormModalProps {
  open: boolean;
  script?: Script | null;
  onClose: () => void;
  onSave: (data: Omit<Script, "id" | "createdAt" | "updatedAt">) => void;
}

interface FormValues {
  title: string;
  description: string;
  body: string;
}

export default function ScriptFormModal({
  open,
  script,
  onClose,
  onSave,
}: ScriptFormModalProps) {
  const [form] = Form.useForm<FormValues>();
  const [isDirty, setIsDirty] = useState(false);
  const isEdit = !!script;

  useEffect(() => {
    if (open) {
      form.setFieldsValue({
        title: script?.title ?? "",
        description: script?.description ?? "",
        body: script?.body ?? "",
      });
      setIsDirty(false);
    }
  }, [open, script, form]);

  const handleClose = () => {
    if (isDirty) {
      Modal.confirm({
        title: "Discard changes?",
        content: "You have unsaved changes. Are you sure you want to close?",
        okText: "Discard",
        okButtonProps: { danger: true },
        cancelText: "Keep editing",
        onOk: () => {
          form.resetFields();
          onClose();
        },
      });
    } else {
      form.resetFields();
      onClose();
    }
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      onSave({
        title: values.title.trim(),
        description: values.description?.trim() ?? "",
        body: values.body,
        startWithWindow: script?.startWithWindow ?? false,
      });
      form.resetFields();
      setIsDirty(false);
    } catch {
      // validation errors shown inline
    }
  };

  return (
    <Modal
      open={open}
      title={isEdit ? "Edit Script" : "New Script"}
      onCancel={handleClose}
      onOk={handleSave}
      okText="Save"
      cancelText="Cancel"
      okButtonProps={{ disabled: !isDirty }}
      width={560}
      destroyOnHidden
    >
      <Form
        form={form}
        layout="vertical"
        onValuesChange={() => setIsDirty(true)}
        style={{ marginTop: 8 }}
      >
        <Form.Item
          name="title"
          label="Title"
          rules={[{ required: true, message: "Title is required" }]}
        >
          <Input placeholder="e.g. Start dev server" autoFocus />
        </Form.Item>

        <Form.Item name="description" label="Description">
          <Input placeholder="Brief description of what this script does" />
        </Form.Item>

        <Form.Item
          name="body"
          label="Script"
          rules={[{ required: true, message: "Script body is required" }]}
        >
          <Input.TextArea
            placeholder={"npm run dev\necho Done"}
            autoSize={{ minRows: 6, maxRows: 16 }}
            style={{
              fontFamily:
                '"Cascadia Code", "Fira Code", "JetBrains Mono", "Consolas", monospace',
              fontSize: 13,
            }}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
