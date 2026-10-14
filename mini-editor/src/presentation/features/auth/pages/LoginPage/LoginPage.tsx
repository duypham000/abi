import { useState, useEffect } from "react";
import { Typography } from "antd";
import { ShieldCheck, WifiOff, LaptopMinimal } from "lucide-react";
import LoginForm from "../../components/LoginForm";
import { useAuth } from "../../hooks/useAuth";
import { pingServer } from "@/infrastructure/api/sessionBootstrap";
import { TomoIcon } from "@/presentation/components/icons/TomoIcon";
import { Button } from "@/presentation/components/ui/Button";
import "./LoginPage.scss";

export default function LoginPage() {
  const [step, setStep] = useState<1 | 2>(1);
  const [isServerOnline, setIsServerOnline] = useState<boolean | null>(null);
  const { goOfflineMode, isLoggingIn } = useAuth();

  useEffect(() => {
    let mounted = true;
    pingServer(3000).then((online) => {
      if (mounted) {
        setIsServerOnline(online);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  const handleGoOffline = async () => {
    await goOfflineMode();
  };

  return (
    <div className="min-h-full w-full flex flex-col items-center justify-between auth-bg p-4 md:p-6 transition-colors duration-300 font-sans">
      {/* Top spacing */}
      <div className="h-4"></div>

      {/* Main card */}
      <div className="flex flex-col items-center gap-6 animate-fade-in-up w-full max-w-[404px]">
        {/* Logo Nebula */}
        <div className="flex items-center gap-2 cursor-pointer">
          <TomoIcon />
        </div>

        {/* Card containing the forms */}
        <div className="auth-card-figma flex flex-col gap-6 animate-scale-up">
          <div className="text-center flex flex-col gap-2">
            <Typography.Title level={1} className="!text-[28px] !leading-[36px] !font-bold !text-zinc-900 dark:!text-zinc-50 !tracking-tight !mb-0">
              Đăng nhập
            </Typography.Title>
            <Typography.Paragraph className="!text-base !text-zinc-500 dark:!text-zinc-400 !mb-0">
              Chào mừng bạn quay trở lại với Tomo
            </Typography.Paragraph>
          </div>

          {/* Offline Mode Prompt Banner when Server is Unreachable */}
          {isServerOnline === false && (
            <div className="flex flex-col gap-4 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200">
              <div className="flex items-center gap-3">
                <WifiOff className="w-5 h-5 text-amber-500 shrink-0" />
                <div className="flex flex-col">
                  <span className="font-semibold text-sm">Không thể kết nối máy chủ</span>
                  <span className="text-xs opacity-80">
                    Bạn có thể tiếp tục sử dụng ở Chế độ Ngoại tuyến (Local SQLite).
                  </span>
                </div>
              </div>

              <Button
                type="button"
                onClick={handleGoOffline}
                disabled={isLoggingIn}
                variant="primary"
                className="w-full flex items-center justify-center gap-2 !bg-amber-600 hover:!bg-amber-700 !border-none !text-white !font-bold !py-3 !rounded-xl"
              >
                <LaptopMinimal className="w-5 h-5" />
                Tiếp tục ở Chế độ Ngoại tuyến
              </Button>
            </div>
          )}

          <LoginForm step={step} setStep={setStep} />

          {/* Go Offline Option - Prominent for both Desktop & Web */}
          {isServerOnline !== false && (
            <div className="flex flex-col items-center gap-2 pt-4 border-t border-zinc-200 dark:border-zinc-800 w-full mt-2">
              <button
                type="button"
                onClick={handleGoOffline}
                disabled={isLoggingIn}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/50 rounded-xl hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                Tiếp tục ở Chế độ Ngoại tuyến (Go Offline)
              </button>
              <span className="text-[11px] text-zinc-400 dark:text-zinc-500 text-center">
                Bỏ qua đăng nhập • Lưu trữ dữ liệu an toàn trên thiết bị này
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Footer copyright section */}
      <div className="w-full max-w-[404px] flex flex-col gap-4 mt-8 mb-4">
        {/* Links */}
        <div className="flex justify-between items-center text-xs font-normal">
          <Typography.Link href="#terms" className="!text-zinc-500 dark:!text-zinc-400 underline hover:!text-zinc-700 dark:hover:!text-zinc-200 cursor-pointer">
            Điều khoản sử dụng
          </Typography.Link>
          <Typography.Link href="#privacy" className="!text-zinc-500 dark:!text-zinc-400 underline hover:!text-zinc-700 dark:hover:!text-zinc-200 cursor-pointer">
            Chính sách bảo mật
          </Typography.Link>
          <Typography.Text className="!text-zinc-500 dark:!text-zinc-400">©2026 Tomo</Typography.Text>
        </div>
      </div>
    </div>
  );
}
