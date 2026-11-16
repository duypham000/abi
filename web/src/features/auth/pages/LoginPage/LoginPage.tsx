import { useState } from "react";
import { Typography } from "antd";
import LoginForm from "../../components/LoginForm";
import { TomoIcon } from "@/components/icons/TomoIcon";
import "./LoginPage.scss";

export default function LoginPage() {
  const [step, setStep] = useState<1 | 2>(1);

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-between auth-bg p-4 md:p-6 transition-colors duration-300 font-sans">
      <div className="h-4" />

      <div className="flex flex-col items-center gap-6 animate-fade-in-up w-full max-w-[404px]">
        <div className="flex items-center gap-2 cursor-pointer">
          <TomoIcon />
        </div>

        <div className="auth-card-figma flex flex-col gap-6 animate-scale-up">
          <div className="text-center flex flex-col gap-2">
            <Typography.Title
              level={1}
              className="!text-[28px] !leading-[36px] !font-bold !text-zinc-900 dark:!text-zinc-50 !tracking-tight !mb-0"
            >
              Đăng nhập
            </Typography.Title>
            <Typography.Paragraph className="!text-base !text-zinc-500 dark:!text-zinc-400 !mb-0">
              Chào mừng bạn quay trở lại với Tomo
            </Typography.Paragraph>
          </div>

          <LoginForm step={step} setStep={setStep} />
        </div>
      </div>

      <div className="w-full max-w-[404px] flex flex-col gap-4 mt-8 mb-4">
        <div className="flex justify-between items-center text-xs font-normal">
          <Typography.Link
            href="#terms"
            className="!text-zinc-500 dark:!text-zinc-400 underline hover:!text-zinc-700 dark:hover:!text-zinc-200 cursor-pointer"
          >
            Điều khoản sử dụng
          </Typography.Link>
          <Typography.Link
            href="#privacy"
            className="!text-zinc-500 dark:!text-zinc-400 underline hover:!text-zinc-700 dark:hover:!text-zinc-200 cursor-pointer"
          >
            Chính sách bảo mật
          </Typography.Link>
          <Typography.Text className="!text-zinc-500 dark:!text-zinc-400">
            ©2026 Tomo
          </Typography.Text>
        </div>
      </div>
    </div>
  );
}
