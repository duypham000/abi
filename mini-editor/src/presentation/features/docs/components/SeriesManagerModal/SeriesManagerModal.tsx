import { useState } from "react";
import { Modal, List, Form, Input, Button, Popconfirm, message, Typography } from "antd";
import { EditOutlined, DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import {
  useListSeriesQuery,
  useCreateSeriesMutation,
  useUpdateSeriesMutation,
  useDeleteSeriesMutation,
} from "@/infrastructure/api/seriesApi";
import type { SeriesDto } from "@/core/interfaces/series";

const { Text } = Typography;

interface SeriesManagerModalProps {
  open: boolean;
  onClose: () => void;
}

export function SeriesManagerModal({ open, onClose }: SeriesManagerModalProps) {
  const { data: seriesList, isLoading } = useListSeriesQuery({ page: 0, size: 100 });
  const [createSeries] = useCreateSeriesMutation();
  const [updateSeries] = useUpdateSeriesMutation();
  const [deleteSeries] = useDeleteSeriesMutation();

  const [form] = Form.useForm();
  const [editingId, setEditingId] = useState<number | null>(null);

  const handleFinish = async (values: { name: string; description: string | null }) => {
    try {
      if (editingId) {
        await updateSeries({ id: editingId, body: values }).unwrap();
        message.success("Cập nhật series thành công");
      } else {
        await createSeries(values).unwrap();
        message.success("Tạo series thành công");
      }
      handleCancelEdit();
    } catch {
      message.error("Thao tác thất bại");
    }
  };

  const handleEditClick = (item: SeriesDto) => {
    setEditingId(item.id);
    form.setFieldsValue({
      name: item.name,
      description: item.description,
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    form.resetFields();
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteSeries(id).unwrap();
      message.success("Xoá series thành công");
      if (editingId === id) {
        handleCancelEdit();
      }
    } catch {
      message.error("Xoá series thất bại");
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title="Manage Series"
      footer={null}
      width={650}
      destroyOnHidden
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
        {/* Creation/Editing Form */}
        <Form
          form={form}
          layout="vertical"
          onFinish={handleFinish}
          style={{
            background: "rgba(0, 0, 0, 0.02)",
            padding: "16px",
            borderRadius: "8px",
            border: "1px dashed rgba(0, 0, 0, 0.08)",
          }}
        >
          <div style={{ display: "flex", gap: "12px" }}>
            <Form.Item
              name="name"
              label="Series Name"
              rules={[{ required: true, message: "Vui lòng nhập tên series" }]}
              style={{ flex: 1, marginBottom: 0 }}
            >
              <Input placeholder="e.g. Clean Code Guide" />
            </Form.Item>
            <Form.Item
              name="description"
              label="Description"
              style={{ flex: 2, marginBottom: 0 }}
            >
              <Input placeholder="Optional details..." />
            </Form.Item>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "12px" }}>
            {editingId && (
              <Button onClick={handleCancelEdit}>Huỷ sửa</Button>
            )}
            <Button type="primary" htmlType="submit" icon={editingId ? <EditOutlined /> : <PlusOutlined />}>
              {editingId ? "Cập nhật" : "Tạo mới"}
            </Button>
          </div>
        </Form>

        {/* List of existing Series */}
        <List
          loading={isLoading}
          dataSource={seriesList?.items ?? []}
          style={{ overflowY: "auto", maxHeight: "350px" }}
          renderItem={(item: SeriesDto) => (
            <List.Item
              actions={[
                <Button
                  key="edit"
                  type="text"
                  icon={<EditOutlined />}
                  onClick={() => handleEditClick(item)}
                />,
                <Popconfirm
                  key="delete"
                  title="Xoá series này?"
                  description="Tất cả các tài liệu trong series này sẽ được gỡ khỏi series (không bị xoá tài liệu)."
                  okText="Xoá"
                  cancelText="Huỷ"
                  okButtonProps={{ danger: true }}
                  onConfirm={() => handleDelete(item.id)}
                >
                  <Button type="text" danger icon={<DeleteOutlined />} />
                </Popconfirm>,
              ]}
            >
              <List.Item.Meta
                title={<Text strong>{item.name}</Text>}
                description={item.description || "No description"}
              />
            </List.Item>
          )}
        />
      </div>
    </Modal>
  );
}
