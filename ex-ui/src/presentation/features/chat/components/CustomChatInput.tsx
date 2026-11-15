import React, { useState } from 'react';
import { Sender } from '@ant-design/x';
import { Button, Select, Tooltip } from 'antd';
import {
  Plus, Brain, Mic, Sparkles, Paperclip, MessageSquarePlus, History
} from 'lucide-react';
import { ChatHistoryModal } from './ChatHistoryModal';

interface CustomChatInputProps {
  value: string;
  onChange: (val: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<any>) => void | false;
  onTrigger?: (trigger: string | false) => void;
  onSubmit?: (val: string) => void;
}

export const CustomChatInput: React.FC<CustomChatInputProps> = ({
  value,
  onChange,
  onKeyDown,
  onTrigger,
  onSubmit
}) => {
  const senderRef = React.useRef<any>(null);
  const hasContent = value.trim().length > 0;
  const [selectedModelId, setSelectedModelId] = useState('gemini');
  const [selectedAgentId, setSelectedAgentId] = useState('agent');
  const [historyOpen, setHistoryOpen] = useState(false);

  const handleSend = () => {
    if (hasContent && onSubmit) {
      onSubmit(value);
      onChange('');
    }
  };

  return (
    <div className="w-full">
      <div className="bg-white rounded-2xl border border-zinc-200 p-2 shadow-[0_2px_10px_rgba(0,0,0,0.02)] focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-400/20 transition-all">

        <div className="w-full text-sm text-zinc-900 custom-sender-wrapper">
          <Sender
            ref={senderRef}
            value={value}
            onChange={(nextVal) => {
              onChange(nextVal);
              const match = nextVal.match(/[@/#][\w-]*$/);
              if (match && onTrigger) {
                onTrigger(match[0]);
              } else if (onTrigger) {
                onTrigger(false);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (e.shiftKey) {
                  e.preventDefault();
                  e.stopPropagation();
                  senderRef.current?.insert('\n');
                  return false;
                } else {
                  const handledBySuggestion = onKeyDown?.(e);
                  if (handledBySuggestion === false) return false;
                  e.preventDefault();
                  handleSend();
                  return false;
                }
              }
              return onKeyDown?.(e);
            }}
            onSubmit={onSubmit}
            placeholder="Nhập câu hỏi của bạn tại đây... Dùng @ để tag file, / để lệnh, # để nhắc agent"
            className="bg-transparent border-none shadow-none p-0 !bg-transparent custom-sender-hide-button"
            autoSize={{ minRows: 1, maxRows: 2 }}
            classNames={{
              input: 'bg-transparent resize-none border-none focus:ring-0 shadow-none scrollbar-thin'
            }}
          />
        </div>

        <div className="flex items-center justify-between mt-2 pl-1 pr-1">
          <div className="flex items-center gap-1.5">
            <Tooltip title="Đính kèm tệp">
              <Button
                type="text"
                shape="circle"
                icon={<Paperclip size={16} className="text-zinc-500" />}
              />
            </Tooltip>

            <div className="flex items-center bg-zinc-50 hover:bg-zinc-100 border border-zinc-200/60 rounded-full px-1.5 transition-colors h-7 ml-1">
              <Brain size={12} className="text-zinc-500 ml-1" />
              <Select
                value={selectedModelId}
                onChange={setSelectedModelId}
                variant="borderless"
                size="small"
                popupMatchSelectWidth={false}
                className="text-xs"
                options={[
                  { value: 'gemini', label: 'Gemini 3.1' },
                  { value: 'gpt4', label: 'GPT-4o' }
                ]}
              />
            </div>

            <div className="flex items-center bg-zinc-50 hover:bg-zinc-100 border border-zinc-200/60 rounded-full px-1.5 transition-colors h-7">
              <Plus size={12} className="text-zinc-500 ml-1" />
              <Select
                value={selectedAgentId}
                onChange={setSelectedAgentId}
                variant="borderless"
                size="small"
                popupMatchSelectWidth={false}
                className="text-xs"
                options={[
                  { value: 'agent', label: 'Default Agent' },
                  { value: 'research', label: 'Research Agent' }
                ]}
              />
            </div>

            <Tooltip title="Bắt đầu hội thoại mới">
              <Button
                type="text"
                shape="circle"
                icon={<MessageSquarePlus size={16} className="text-zinc-500" />}
                onClick={() => onChange('')}
              />
            </Tooltip>

            <Tooltip title="Lịch sử hội thoại">
              <Button
                type="text"
                shape="circle"
                icon={<History size={16} className="text-zinc-500" />}
                onClick={() => setHistoryOpen(true)}
              />
            </Tooltip>
          </div>

          <div className="flex items-center gap-1.5">
            <Tooltip title="Ghi âm (Tính năng đang tắt)">
              <Button
                type="text"
                shape="circle"
                disabled
                icon={<Mic size={16} className="text-zinc-400" />}
              />
            </Tooltip>
            <Button
              type="primary"
              shape="circle"
              size="large"
              icon={<Sparkles size={16} />}
              onClick={handleSend}
              disabled={!hasContent}
              className={`flex items-center justify-center transition-all ${
                hasContent ? 'bg-blue-600 hover:bg-blue-500 shadow-md shadow-blue-200' : 'bg-zinc-200'
              }`}
            />
          </div>
        </div>
      </div>

      <ChatHistoryModal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
      />
    </div>
  );
};
