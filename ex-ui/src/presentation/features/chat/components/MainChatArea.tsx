import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';

export const MainChatArea = () => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', height: '100%' }}>
      <MessageList />
      <MessageInput />
    </div>
  );
};
