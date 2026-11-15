import React from 'react';
import { ConfigProvider, theme } from 'antd';
import { XProvider } from '@ant-design/x';

export const AgentChatProvider = ({ children }: { children: React.ReactNode }) => {
  return (
    <ConfigProvider
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          colorPrimary: '#1677ff',
        },
      }}
    >
      <XProvider>
        {children}
      </XProvider>
    </ConfigProvider>
  );
};
