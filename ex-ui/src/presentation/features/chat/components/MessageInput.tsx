import React from 'react';
import { Suggestion } from '@ant-design/x';
import { CustomChatInput } from './CustomChatInput';
import {
  FileOutlined, RobotOutlined, ToolOutlined, ApiOutlined, MacCommandOutlined
} from '@ant-design/icons';
import { SuggestionItem } from '@ant-design/x/es/suggestion';

const fileOptions: SuggestionItem[] = [
  { label: 'MessageInput.tsx', value: 'MessageInput.tsx', icon: <FileOutlined /> },
  { label: 'page.tsx', value: 'page.tsx', icon: <FileOutlined /> },
  { label: 'AgentChatProvider.tsx', value: 'AgentChatProvider.tsx', icon: <FileOutlined /> },
];

const commandOptions: SuggestionItem[] = [
  { label: '/clear - Xoá lịch sử chat', value: 'clear', icon: <MacCommandOutlined /> },
  { label: '/help - Xem hướng dẫn', value: 'help', icon: <MacCommandOutlined /> },
  { label: '/settings - Cài đặt', value: 'settings', icon: <MacCommandOutlined /> },
];

const referenceOptions: SuggestionItem[] = [
  { label: 'Market Scout Agent', value: 'market_scout', icon: <RobotOutlined /> },
  { label: 'Figma MCP Server', value: 'figma_mcp', icon: <ApiOutlined /> },
  { label: 'Web Search Tool', value: 'web_search', icon: <ToolOutlined /> },
];

export const MessageInput = () => {
  const [value, setValue] = React.useState('');

  const onSelect = (selectedValue: string) => {
    const match = value.match(/[@/#][\w-]*$/);
    if (match) {
      const trigger = match[0][0];
      const formattedValue = trigger === '/' ? `/${selectedValue}` : `${trigger}${selectedValue}`;
      const newValue = value.substring(0, match.index) + formattedValue + ' ';
      setValue(newValue);
    }
  };

  const getSuggestions = (info: string): SuggestionItem[] => {
    if (info.startsWith('@')) {
      const query = info.slice(1).toLowerCase();
      return fileOptions.filter(opt => opt.label?.toString().toLowerCase().includes(query));
    }
    if (info.startsWith('/')) {
      const query = info.slice(1).toLowerCase();
      return commandOptions.filter(opt => opt.label?.toString().toLowerCase().includes(query));
    }
    if (info.startsWith('#')) {
      const query = info.slice(1).toLowerCase();
      return referenceOptions.filter(opt => opt.label?.toString().toLowerCase().includes(query));
    }
    return [];
  };

  return (
    <div style={{ padding: '20px', borderTop: '1px solid #f0f0f0' }}>
      <Suggestion
        items={(info) => typeof info === 'string' ? getSuggestions(info) : []}
        onSelect={onSelect}
      >
        {({ onTrigger, onKeyDown }) => (
          <CustomChatInput
            value={value}
            onChange={setValue}
            onKeyDown={onKeyDown}
            onTrigger={onTrigger}
            onSubmit={(val) => {
              console.log('Send:', val);
              setValue('');
            }}
          />
        )}
      </Suggestion>
    </div>
  );
};
