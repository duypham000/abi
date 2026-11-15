import { useState, useEffect } from "react";
import { Typography } from "antd";
import { ShieldCheck, WifiOff, Fingerprint } from "lucide-react";
import LoginForm from "../../components/LoginForm";
import { useAuth } from "../../hooks/useAuth";
import { pingServer } from "@/infrastructure/api/sessionBootstrap";
import { isMobile } from "@/infrastructure/platform";
import { TomoIcon } from "@/presentation/components/icons/TomoIcon";
import { Button } from "@/presentation/components/ui/Button";
import "./LoginPage.scss";

export default function LoginPage() {
  const [step, setStep] = useState<1 | 2>(1);
  const [isServerOnline, setIsServerOnline] = useState<boolean | null>(null);
  const { loginLocalMode, isLoggingIn } = useAuth();

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

  const handleDeviceAuthClick = async () => {
    await loginLocalMode();
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

          {/* Mobile Offline Mode Prompt Banner & Device Auth Action */}
          {isMobile() && isServerOnline === false && (
            <div className="flex flex-col gap-4 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200">
              <div className="flex items-center gap-3">
                <WifiOff className="w-5 h-5 text-amber-500 shrink-0" />
                <div className="flex flex-col">
                  <span className="font-semibold text-sm">Không thể kết nối máy chủ</span>
                  <span className="text-xs opacity-80">
                    Bỏ qua đăng nhập server để vào Chế độ Cục bộ (Local Mode).
                  </span>
                </div>
              </div>

              <Button
                type="button"
                onClick={handleDeviceAuthClick}
                disabled={isLoggingIn}
                variant="primary"
                className="w-full flex items-center justify-center gap-2 !bg-amber-600 hover:!bg-amber-700 !border-none !text-white !font-bold !py-3 !rounded-xl"
              >
                <Fingerprint className="w-5 h-5" />
                Xác thực vân tay / Mật khẩu máy
              </Button>
            </div>
          )}

          {/* Device Auth Option (Mobile Backup) */}
          {isMobile() && isServerOnline !== false && (
            <div className="mb-2">
              <button
                type="button"
                onClick={handleDeviceAuthClick}
                className="w-full flex items-center justify-center gap-2 p-3 text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/50 rounded-xl hover:bg-indigo-100 transition-colors"
              >
                <ShieldCheck className="w-4 h-4" />
                Đăng nhập Chế độ Cục bộ (Sinh trắc học)
              </button>
            </div>
          )}

          <LoginForm step={step} setStep={setStep} />
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
