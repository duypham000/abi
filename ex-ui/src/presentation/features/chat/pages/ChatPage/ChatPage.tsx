import { useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import Sidebar from '@/presentation/features/dashboard/components/Sidebar';
import { AppBar } from '@/presentation/components/AppBar';
import { type RootState, type AppDispatch } from '@/presentation/store';
import { setPageTitle } from '@/presentation/store/appSlice';
import { AgentChatProvider } from '../../components/AgentChatProvider';
import { AgentChatLayout } from '../../components/AgentChatLayout';
import './ChatPage.scss';

interface ChatPageProps {
  panelMode?: boolean;
}

export default function ChatPage({ panelMode }: ChatPageProps) {
  const dispatch = useDispatch<AppDispatch>();
  const { theme } = useSelector((state: RootState) => state.app);

  useEffect(() => {
    dispatch(setPageTitle('Chat'));
  }, [dispatch]);

  const content = (
    <main className="dashboard-main chat-main">
      <AgentChatProvider>
        <AgentChatLayout />
      </AgentChatProvider>
    </main>
  );

  if (panelMode) return content;

  return (
    <div className={`dashboard-layout theme-${theme}`}>
      <AppBar variant="dashboard" />
      <div className="dashboard-body">
        <Sidebar />
        {content}
      </div>
    </div>
  );
}
