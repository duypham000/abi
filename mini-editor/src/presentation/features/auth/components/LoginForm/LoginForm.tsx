import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { Alert, Typography } from "antd";
import { Input, ReadonlyInput } from "@/presentation/components/ui/Input";
import { Button } from "@/presentation/components/ui/Button";
import { GoogleIcon, AppleIcon, PencilIcon } from "@/presentation/components/icons";
import "./LoginForm.scss";

interface LoginFormProps {
  step: 1 | 2;
  setStep: (step: 1 | 2) => void;
}

export default function LoginForm({ step, setStep }: LoginFormProps) {
  const { login, isLoggingIn, loginError } = useAuth();
  
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [identifierTouched, setIdentifierTouched] = useState(false);

  // Validate Identifier (allows username or email)
  const isIdentifierValid = (val: string) => {
    return val.trim().length >= 2;
  };

  const handleIdentifierNext = (e: React.FormEvent) => {
    e.preventDefault();
    setIdentifierTouched(true);
    if (isIdentifierValid(identifier)) {
      setStep(2);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;

    try {
      await login({ identifier: identifier.trim(), password });
    } catch (err) {
      console.error("Login fail:", err);
    }
  };

  const errorMessage = loginError
    ? (typeof loginError === "object" &&
       loginError !== null &&
       "data" in loginError
        ? (loginError as { data?: { message?: string } }).data?.message ??
          "Đăng nhập thất bại"
        : "Đăng nhập thất bại")
    : null;

  const handleGoogleLogin = () => {
    console.log("Login with Google");
  };

  const handleAppleLogin = () => {
    console.log("Login with Apple");
  };

  return (
    <div className="flex flex-col gap-4 w-full">
      {errorMessage && (
        <Alert
          message={errorMessage}
          type="error"
          showIcon
          closable
          className="rounded-xl animate-fade-in"
        />
      )}

      {step === 1 ? (
        /* ================= STEP 1 ================= */
        <form onSubmit={handleIdentifierNext} className="flex flex-col gap-4 w-full">
          {/* Social login buttons */}
          <div className="flex flex-col gap-4">
            <Button
              type="button"
              onClick={handleGoogleLogin}
              variant="social"
            >
              {/* Google icon */}
              <GoogleIcon />
              Tiếp tục với Google
            </Button>

            <Button
              type="button"
              onClick={handleAppleLogin}
              variant="social"
            >
              {/* Apple icon */}
              <AppleIcon />
              Tiếp tục với Apple
            </Button>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-4 w-full">
            <div className="h-[1px] flex-1 bg-[#ececed] dark:bg-zinc-800"></div>
            <Typography.Text className="!text-[14px] !leading-[20px] !font-normal !text-[#636369] dark:!text-zinc-400">hoặc</Typography.Text>
            <div className="h-[1px] flex-1 bg-[#ececed] dark:bg-zinc-800"></div>
          </div>

          {/* Identifier input field (username or email) */}
          <div className="flex flex-col gap-2">
            <Input
              type="text"
              value={identifier}
              onChange={(e) => {
                setIdentifier(e.target.value);
                if (identifierTouched) setIdentifierTouched(false);
              }}
              placeholder="Nhập tên đăng nhập hoặc email..."
              isError={identifierTouched && !isIdentifierValid(identifier)}
            />
            {identifierTouched && !isIdentifierValid(identifier) && (
              <Typography.Text className="!text-xs !text-red-500 !font-medium !pl-1 block">
                Vui lòng nhập tên đăng nhập hoặc địa chỉ email hợp lệ
              </Typography.Text>
            )}
          </div>

          {/* Continue button */}
          <Button
            type="submit"
            disabled={!identifier || !isIdentifierValid(identifier)}
            variant="primary"
          >
            Tiếp tục
          </Button>

          {/* Switch link */}
          <Typography.Paragraph className="!text-center !text-[14px] !leading-[20px] !font-normal !text-[#636369] dark:!text-zinc-400 !mt-2 !mb-0">
            Bạn chưa có tài khoản?{" "}
            <Link
              to="/register"
              className="font-bold text-[#111827] dark:text-zinc-100 hover:underline"
            >
              Đăng ký miễn phí
            </Link>
          </Typography.Paragraph>
        </form>
      ) : (
        /* ================= STEP 2 ================= */
        <form onSubmit={handleLoginSubmit} className="flex flex-col gap-4 w-full">
          {/* Readonly Identifier Display Box */}
          <ReadonlyInput
            value={identifier}
            actionIcon={<PencilIcon />}
            onActionClick={() => setStep(1)}
            actionTitle="Chỉnh sửa tài khoản"
          />

          {/* Password Input field */}
          <div className="flex flex-col gap-2">
            <Input.Password
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Nhập mật khẩu..."
              className="w-full"
            />
          </div>

          {/* Forgot Password Link */}
          <div className="flex justify-end">
            <Typography.Link
              href="#forgot-password"
              className="!text-[14px] !leading-[20px] !font-normal !text-[#636369] hover:!text-[#111827] dark:!text-[#889ba4] dark:hover:!text-white transition-colors"
            >
              Quên mật khẩu?
            </Typography.Link>
          </div>

          {/* Login button */}
          <Button
            type="submit"
            disabled={!password || isLoggingIn}
            variant="primary"
          >
            {isLoggingIn ? "Đang đăng nhập..." : "Đăng nhập"}
          </Button>

          {/* Switch link */}
          <Typography.Paragraph className="!text-center !text-[14px] !leading-[20px] !font-normal !text-[#636369] dark:!text-zinc-400 !mt-2 !mb-0">
            Bạn chưa có tài khoản?{" "}
            <Link
              to="/register"
              className="font-bold text-[#111827] dark:text-zinc-100 hover:underline"
            >
              Đăng ký miễn phí
            </Link>
          </Typography.Paragraph>
        </form>
      )}
    </div>
  );
}
