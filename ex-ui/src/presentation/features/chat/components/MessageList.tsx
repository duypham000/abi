import React from 'react';
import { Bubble, Welcome, Prompts, ThoughtChain, Think, Sources, Actions } from '@ant-design/x';
import { Typography, Space, Avatar } from 'antd';
import {
  CopyOutlined, DislikeOutlined, LikeOutlined, ShareAltOutlined,
  UserOutlined, RobotOutlined, TwitterOutlined, YoutubeOutlined, GithubOutlined,
} from '@ant-design/icons';
import { HitlApprovalPanel, HitlConfirmationBubble } from './HitlApprovalPanel';
import type { HitlRequest, HitlSubmission } from '../types/hitl';

const { Text } = Typography;

const mockPrompts = [
  { key: 'market_analysis', label: 'Phân tích thị trường hôm nay', value: 'market_analysis' },
  { key: 'search_aapl', label: 'Tra cứu mã cổ phiếu AAPL', value: 'search_aapl' },
  { key: 'news_summary', label: 'Tóm tắt tin tức tài chính', value: 'news_summary' },
];

const mockHitlRequest: HitlRequest = {
  thread_id: 'thread-001',
  reason: 'Agent chuẩn bị gửi báo cáo phân tích AAPL đến danh sách email. Vui lòng xác nhận và bổ sung thông tin bên dưới.',
  previewLanguage: 'markdown',
  preview: `Subject: [Báo cáo] Phân tích cổ phiếu AAPL — Q2 2026

Kính gửi,

Dựa trên dữ liệu Yahoo Finance và phân tích kỹ thuật (RSI: 58.3, MACD: tích cực),
cổ phiếu AAPL hiện đang ở vùng tích lũy với kháng cự gần nhất tại $198.

Khuyến nghị: Giữ (Hold) với stop-loss tại $182.
Mục tiêu 3 tháng: $210 — $215.

Nguồn: Yahoo Finance, Bloomberg Terminal, SEC Filings Q1-2026.

---
Báo cáo tự động bởi Market Scout Agent`,
  fields: [
    {
      key: 'recipients',
      type: 'checkbox_group',
      label: 'Gửi đến nhóm nào?',
      description: 'Chọn một hoặc nhiều nhóm nhận báo cáo.',
      required: true,
      options: [
        { value: 'team_invest', label: 'Nhóm đầu tư', description: '12 thành viên' },
        { value: 'team_risk', label: 'Nhóm quản lý rủi ro', description: '5 thành viên' },
        { value: 'board', label: 'Ban lãnh đạo', description: '3 thành viên' },
        { value: 'external', label: 'Đối tác bên ngoài', description: '8 liên hệ', disabled: true },
      ],
    },
    {
      key: 'priority',
      type: 'select',
      label: 'Mức độ ưu tiên',
      required: true,
      options: [
        { value: 'low', label: 'Thấp — gửi trong ngày' },
        { value: 'normal', label: 'Bình thường — gửi trong 1 giờ' },
        { value: 'high', label: 'Cao — gửi ngay lập tức' },
        { value: 'urgent', label: '🔴 Khẩn — kèm cảnh báo email' },
      ],
    },
    {
      key: 'send_time',
      type: 'radio_group',
      label: 'Thời điểm gửi',
      options: [
        { value: 'now', label: 'Gửi ngay' },
        { value: 'morning', label: 'Sáng mai lúc 08:00' },
        { value: 'schedule', label: 'Lên lịch cụ thể (qua Settings)' },
      ],
    },
    {
      key: 'max_recipients',
      type: 'number_input',
      label: 'Giới hạn số người nhận',
      description: 'Tối đa bao nhiêu email được gửi trong lần này.',
      min: 1,
      max: 100,
    },
    {
      key: 'confidence_threshold',
      type: 'slider',
      label: 'Ngưỡng độ tin cậy tối thiểu (%)',
      description: 'Chỉ gửi nếu độ tin cậy phân tích vượt ngưỡng này.',
      min: 0,
      max: 100,
      step: 5,
      marks: { 0: '0%', 50: '50%', 75: '75%', 100: '100%' },
    },
    {
      key: 'tags',
      type: 'tags_input',
      label: 'Tags phân loại báo cáo',
      placeholder: 'Ví dụ: AAPL, tech-sector, Q2...',
    },
    {
      key: 'notes',
      type: 'textarea',
      label: 'Ghi chú bổ sung',
      placeholder: 'Thêm ghi chú hoặc hướng dẫn cụ thể cho người nhận...',
      rows: 3,
    },
  ],
};

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'hitl';
  content?: React.ReactNode;
  hitlRequest?: HitlRequest;
  hitlConfirmation?: { request: HitlRequest; submission: HitlSubmission };
}

export const MessageList = () => {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [messages, setMessages] = React.useState<Message[]>([
    {
      id: '1',
      role: 'user',
      content: 'Chào bạn, hãy phân tích cho tôi mã cổ phiếu AAPL.',
    },
    {
      id: '2',
      role: 'assistant',
      content: (
        <Space orientation="vertical" style={{ width: '100%' }}>
          <ThoughtChain
            items={[
              { title: 'Đang truy xuất dữ liệu từ Yahoo Finance...', status: 'success' },
              { title: 'Phân tích báo cáo tài chính quý gần nhất...', status: 'success' },
              {
                title: 'Đang tổng hợp nhận định kỹ thuật...',
                status: 'loading',
                blink: true,
                description: 'Dựa trên RSI và MACD...',
              },
              { title: 'Sumary...' },
            ]}
          />
          <Think title="deep thinking" blink>Đang suy nghĩ thêm về rủi ro vĩ mô...</Think>
          <Text>
            Dựa trên dữ liệu mới nhất, cổ phiếu AAPL đang có xu hướng tích lũy...
          </Text>
          <Sources
            items={[
              { title: 'Data source from twitter', url: 'https://x.ant.design/components/overview', icon: <TwitterOutlined /> },
              { title: 'Data source from youtube', url: 'https://x.ant.design/components/overview', icon: <YoutubeOutlined /> },
              { title: 'Data source from github', url: 'https://x.ant.design/components/overview', icon: <GithubOutlined /> },
            ]}
          />
          <Actions
            items={[
              { icon: <LikeOutlined />, onItemClick: () => console.log('Like') },
              { icon: <DislikeOutlined />, onItemClick: () => console.log('Dislike') },
              { icon: <CopyOutlined />, onItemClick: () => console.log('Copy') },
              { icon: <ShareAltOutlined />, onItemClick: () => console.log('Share') },
            ]}
          />
        </Space>
      ),
    },
    {
      id: '3',
      role: 'hitl',
      hitlRequest: mockHitlRequest,
    },
  ]);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const handleHitlSubmit = (msgId: string, sub: HitlSubmission) => {
    console.log('[HITL] submit payload:', JSON.stringify({
      approved: sub.approved,
      thread_id: mockHitlRequest.thread_id,
      ...(sub.approved && sub.values ? { values: sub.values } : {}),
    }, null, 2));

    const confirmMsg: Message = {
      id: `${msgId}-confirm`,
      role: 'user',
      hitlConfirmation: { request: mockHitlRequest, submission: sub },
    };

    const ackMsg: Message = {
      id: `${msgId}-ack`,
      role: 'assistant',
      content: sub.approved
        ? 'Đã tiếp nhận xác nhận. Đang thực thi gửi báo cáo AAPL...'
        : 'Đã huỷ hành động theo yêu cầu.',
    };

    setMessages((prev) => [...prev, confirmMsg, ackMsg]);
  };

  if (messages.length === 0) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <Welcome
          title="Xin chào! Tôi là Portfolio AI Assistant"
          description="Tôi có thể giúp bạn phân tích thị trường, quản lý danh mục và tra cứu thông tin tài chính."
        />
        <Prompts
          items={mockPrompts}
          onItemClick={(info) => console.log('Prompt clicked:', info.data.key)}
        />
      </div>
    );
  }

  return (
    <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
      {messages.map((msg) => {
        if (msg.role === 'hitl' && msg.hitlRequest) {
          return (
            <div key={msg.id} style={{ marginBottom: 12 }}>
              <HitlApprovalPanel
                request={msg.hitlRequest}
                onSubmit={(sub) => handleHitlSubmit(msg.id, sub)}
              />
            </div>
          );
        }

        if (msg.hitlConfirmation) {
          return (
            <div key={msg.id} style={{ marginBottom: 12 }}>
              <HitlConfirmationBubble
                request={msg.hitlConfirmation.request}
                submission={msg.hitlConfirmation.submission}
              />
            </div>
          );
        }

        return (
          <Bubble
            key={msg.id}
            placement={msg.role === 'user' ? 'end' : 'start'}
            content={msg.content}
            style={{ width: '100%', maxWidth: '100%' }}
            styles={{
              content: {
                backgroundColor: 'transparent',
                boxShadow: 'none',
                paddingInline: 0,
              },
            }}
            avatar={
              <Avatar
                style={{ backgroundColor: msg.role === 'user' ? '#87d068' : '#1677ff' }}
                icon={msg.role === 'user' ? <UserOutlined /> : <RobotOutlined />}
              />
            }
          />
        );
      })}
    </div>
  );
};
