import React, { useState, useMemo } from 'react';
import { Modal, Input, List, Typography, Tag } from 'antd';
import { SearchOutlined, MessageOutlined } from '@ant-design/icons';

const { Text } = Typography;

interface ConversationItem {
  id: string;
  title: string;
  preview: string;
  date: string;
  tag?: string;
}

const mockHistory: ConversationItem[] = [
  { id: '1', title: 'Phân tích AAPL', preview: 'Cổ phiếu AAPL đang có xu hướng tích lũy...', date: 'Hôm nay, 09:15', tag: 'Cổ phiếu' },
  { id: '2', title: 'Danh mục đầu tư Q1', preview: 'Tổng danh mục đang tăng 12% so với đầu quý...', date: 'Hôm nay, 08:30', tag: 'Danh mục' },
  { id: '3', title: 'Tìm kiếm cổ phiếu tăng trưởng', preview: 'Các mã có tiềm năng trong quý này bao gồm...', date: 'Hôm qua, 21:00', tag: 'Cổ phiếu' },
  { id: '4', title: 'Phân tích vĩ mô tháng 6', preview: 'Fed dự kiến giữ nguyên lãi suất trong phiên họp...', date: 'Hôm qua, 14:20', tag: 'Vĩ mô' },
  { id: '5', title: 'So sánh ETF VNM và FUEVFVND', preview: 'Hai quỹ ETF này có chiến lược khác nhau về...', date: '09/06/2026', tag: 'ETF' },
  { id: '6', title: 'Tổng hợp tin tức tài chính tuần 23', preview: 'Thị trường chứng khoán Mỹ có tuần giảm điểm mạnh...', date: '08/06/2026', tag: 'Tin tức' },
  { id: '7', title: 'Chiến lược DCA Bitcoin', preview: 'Phương pháp đầu tư định kỳ giúp giảm thiểu rủi ro...', date: '07/06/2026', tag: 'Crypto' },
];

interface ChatHistoryModalProps {
  open: boolean;
  onClose: () => void;
  onSelect?: (item: ConversationItem) => void;
}

export const ChatHistoryModal: React.FC<ChatHistoryModalProps> = ({ open, onClose, onSelect }) => {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return mockHistory;
    return mockHistory.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.preview.toLowerCase().includes(q) ||
        item.tag?.toLowerCase().includes(q)
    );
  }, [search]);

  const handleSelect = (item: ConversationItem) => {
    onSelect?.(item);
    onClose();
  };

  return (
    <Modal
      title="Lịch sử hội thoại"
      open={open}
      onCancel={onClose}
      footer={null}
      width={520}
      styles={{ body: { padding: '12px 0 0' } }}
    >
      <div style={{ padding: '0 24px 12px' }}>
        <Input
          prefix={<SearchOutlined className="text-zinc-400" />}
          placeholder="Tìm kiếm hội thoại..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          allowClear
          autoFocus
        />
      </div>

      <List
        dataSource={filtered}
        locale={{ emptyText: 'Không tìm thấy hội thoại nào' }}
        style={{ maxHeight: 420, overflowY: 'auto' }}
        renderItem={(item) => (
          <List.Item
            onClick={() => handleSelect(item)}
            style={{ padding: '10px 24px', cursor: 'pointer' }}
            className="hover:bg-zinc-50 transition-colors"
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, width: '100%' }}>
              <MessageOutlined style={{ fontSize: 16, color: '#1677ff', marginTop: 3, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <Text strong ellipsis style={{ maxWidth: 260 }}>{item.title}</Text>
                  <Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap', flexShrink: 0 }}>{item.date}</Text>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                  {item.tag && <Tag style={{ fontSize: 11, lineHeight: '18px', padding: '0 6px' }}>{item.tag}</Tag>}
                  <Text type="secondary" ellipsis style={{ fontSize: 12 }}>{item.preview}</Text>
                </div>
              </div>
            </div>
          </List.Item>
        )}
      />
    </Modal>
  );
};
