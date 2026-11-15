import { Layout } from 'antd';
import { MainChatArea } from './MainChatArea';

const { Content } = Layout;

export const AgentChatLayout = () => {
  return (
    <Layout style={{ height: '100%', background: 'transparent' }}>
      <Content style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <MainChatArea />
      </Content>
    </Layout>
  );
};
