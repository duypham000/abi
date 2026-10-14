import { useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import Sidebar from "../../components/Sidebar";
import { AppBar } from "@/presentation/components/AppBar";
import { RootState, AppDispatch } from "@/presentation/store";
import { setPageTitle } from "@/presentation/store/appSlice";
import "./DashboardPage.scss";

interface DashboardPageProps {
  panelMode?: boolean;
}

export default function DashboardPage({ panelMode }: DashboardPageProps) {
  const dispatch = useDispatch<AppDispatch>();
  const { user } = useSelector((state: RootState) => state.auth);
  const { theme } = useSelector((state: RootState) => state.app);

  useEffect(() => {
    dispatch(setPageTitle("Dashboard"));
  }, [dispatch]);

  const content = (
    <main className="dashboard-main">
      <section className="dashboard-content">
        <div className="welcome-card">
          <h2>Xin chào, {user?.username ?? "bạn"}!</h2>
          <p>Role: {user?.role}</p>
        </div>
      </section>
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
