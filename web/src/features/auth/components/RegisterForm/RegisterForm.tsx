import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useRegisterMutation } from "@/infrastructure/api/authApi";
import { Alert, Typography } from "antd";
import { Input, ReadonlyInput } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import {
  GoogleIcon,
  AppleIcon,
  PencilIcon,
  VietnamFlagIcon,
  CheckIcon,
} from "@/components/icons";
import "./RegisterForm.scss";

interface RegisterFormProps {
  step: 1 | 2;
  setStep: (step: 1 | 2) => void;
}

export default function RegisterForm({ step, setStep }: RegisterFormProps) {
  const navigate = useNavigate();
  const [register, { isLoading, error }] = useRegisterMutation();

  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);

  const isEmailValid = (val: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
  };

  const handleEmailNext = (e: React.FormEvent) => {
    e.preventDefault();
    setEmailTouched(true);
    if (isEmailValid(email)) {
      setStep(2);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone || password.length < 6 || !termsAccepted) return;

    const prefix = email.split("@")[0];
    const username = prefix.length >= 3 ? prefix : email;

    try {
      await register({ username, email, password }).unwrap();
      navigate(`/verify?phone=${phone}`);
    } catch (err) {
      console.error("Register fail:", err);
    }
  };

  const errorMessage =
    error && "data" in error
      ? (error.data as { message?: string })?.message ?? "Đăng ký thất bại"
      : error
        ? "Đăng ký thất bại"
        : null;

  const handleGoogleSignup = () => {
    console.log("Sign up with Google");
  };

  const handleAppleSignup = () => {
    console.log("Sign up with Apple");
  };

  return (
    <div className="flex flex-col gap-4 w-full font-sans">
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
        <form onSubmit={handleEmailNext} className="flex flex-col gap-4 w-full">
          <div className="flex flex-col gap-4">
            <Button type="button" onClick={handleGoogleSignup} variant="social">
              <GoogleIcon />
              Tiếp tục với Google
            </Button>

            <Button type="button" onClick={handleAppleSignup} variant="social">
              <AppleIcon />
              Tiếp tục với Apple
            </Button>
          </div>

          <div className="flex items-center gap-4 w-full">
            <div className="h-[1px] flex-1 bg-[#ececed] dark:bg-zinc-800" />
            <Typography.Text className="!text-[14px] !leading-[20px] !font-normal !text-[#636369] dark:!text-zinc-400">
              hoặc
            </Typography.Text>
            <div className="h-[1px] flex-1 bg-[#ececed] dark:bg-zinc-800" />
          </div>

          <div className="flex flex-col gap-2">
            <Input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (emailTouched) setEmailTouched(false);
              }}
              placeholder="Nhập địa chỉ email của bạn..."
              isError={emailTouched && !isEmailValid(email)}
            />
            {emailTouched && !isEmailValid(email) && (
              <Typography.Text className="!text-xs !text-red-500 !font-medium !pl-1 block">
                Địa chỉ email không hợp lệ
              </Typography.Text>
            )}
          </div>

          <Button
            type="submit"
            disabled={!email || !isEmailValid(email)}
            variant="primary"
          >
            Tiếp tục
          </Button>

          <Typography.Paragraph className="!text-center !text-[14px] !leading-[20px] !font-normal !text-[#636369] dark:!text-zinc-400 !mt-2 !mb-0">
            Bạn đã có tài khoản?{" "}
            <Link
              to="/login"
              className="font-bold text-[#111827] dark:text-zinc-100 hover:underline"
            >
              Đăng nhập
            </Link>
          </Typography.Paragraph>
        </form>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-4 w-full animate-fade-in"
        >
          <ReadonlyInput
            value={email}
            actionIcon={<PencilIcon />}
            onActionClick={() => setStep(1)}
            actionTitle="Chỉnh sửa email"
          />

          <Input
            autoFocus
            type="tel"
            value={phone}
            onChange={(e) => {
              const val = e.target.value;
              if (/^\d*$/.test(val)) {
                setPhone(val);
              }
            }}
            placeholder="Nhập số điện thoại..."
            className="w-full"
            maxLength={10}
            prefix={
              <div className="flex items-center gap-4 pointer-events-none mr-2">
                <VietnamFlagIcon />
                <Typography.Text className="!text-[14px] !text-[#111827] dark:!text-zinc-100 !font-normal !leading-none">
                  +84
                </Typography.Text>
                <div className="h-6 w-[1px] bg-[#ececed] dark:bg-zinc-800 flex-shrink-0" />
              </div>
            }
          />

          <div className="flex flex-col gap-2">
            <Input.Password
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Nhập mật khẩu..."
              className="w-full"
            />
          </div>

          <div
            onClick={() => setTermsAccepted(!termsAccepted)}
            className="figma-checkbox-container"
          >
            <div className={`figma-checkbox ${termsAccepted ? "checked" : ""}`}>
              {termsAccepted && <CheckIcon />}
            </div>
            <Typography.Text className="!text-[12px] !leading-[18px] !font-normal !text-[#636369] dark:!text-zinc-400 select-none">
              Tôi đã đọc và đồng ý với{" "}
              <Typography.Link
                href="#terms"
                className="!text-[#111827] dark:!text-zinc-200 underline !font-medium"
              >
                Điều khoản sử dụng
              </Typography.Link>{" "}
              của Tomo.
            </Typography.Text>
          </div>

          <Button
            type="submit"
            disabled={
              phone.length < 9 ||
              password.length < 6 ||
              !termsAccepted ||
              isLoading
            }
            variant="primary"
          >
            {isLoading ? "Đang đăng ký..." : "Đăng ký"}
          </Button>

          <Typography.Paragraph className="!text-center !text-[14px] !leading-[20px] !font-normal !text-[#636369] dark:!text-zinc-400 !mt-2 !mb-0">
            Bạn đã có tài khoản?{" "}
            <Link
              to="/login"
              className="font-bold text-[#111827] dark:text-zinc-100 hover:underline"
            >
              Đăng nhập
            </Link>
          </Typography.Paragraph>
        </form>
      )}
    </div>
  );
}
