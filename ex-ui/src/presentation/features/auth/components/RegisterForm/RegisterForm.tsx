import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useRegisterMutation } from "@/infrastructure/api/authApi";
import { Alert, Typography } from "antd";
import { Input, ReadonlyInput } from "@/presentation/components/ui/Input";
import { Button } from "@/presentation/components/ui/Button";
import { GoogleIcon, AppleIcon, PencilIcon, VietnamFlagIcon, CheckIcon } from "@/presentation/components/icons";
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

  // Validate Email
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

    // Auto-generate username from email prefix or full email if prefix is too short
    const prefix = email.split("@")[0];
    const username = prefix.length >= 3 ? prefix : email;

    try {
      await register({ username, email, password }).unwrap();
      // Redirect to OTP verification screen with phone number
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
        /* ================= STEP 1 ================= */
        <form onSubmit={handleEmailNext} className="flex flex-col gap-4 w-full">
          {/* Social login buttons */}
          <div className="flex flex-col gap-4">
            <Button
              type="button"
              onClick={handleGoogleSignup}
              variant="social"
            >
              {/* Google icon */}
              <GoogleIcon />
              Tiếp tục với Google
            </Button>

            <Button
              type="button"
              onClick={handleAppleSignup}
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

          {/* Email input field */}
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

          {/* Continue button */}
          <Button
            type="submit"
            disabled={!email || !isEmailValid(email)}
            variant="primary"
          >
            Tiếp tục
          </Button>

          {/* Switch link */}
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
        /* ================= STEP 2 ================= */
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 w-full animate-fade-in">
          {/* Readonly Email Display Box */}
          <ReadonlyInput
            value={email}
            actionIcon={<PencilIcon />}
            onActionClick={() => setStep(1)}
            actionTitle="Chỉnh sửa email"
          />

          {/* Phone number input with country code */}
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
                {/* Vietnam Flag */}
                <VietnamFlagIcon />
                <Typography.Text className="!text-[14px] !text-[#111827] dark:!text-zinc-100 !font-normal !leading-none">+84</Typography.Text>
                {/* Divider vertical bar */}
                <div className="h-6 w-[1px] bg-[#ececed] dark:bg-zinc-800 flex-shrink-0"></div>
              </div>
            }
          />

          {/* Password Input field */}
          <div className="flex flex-col gap-2">
            <Input.Password
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Nhập mật khẩu..."
              className="w-full"
            />
          </div>

          {/* Terms checkbox */}
          <div
            onClick={() => setTermsAccepted(!termsAccepted)}
            className="figma-checkbox-container"
          >
            <div className={`figma-checkbox ${termsAccepted ? "checked" : ""}`}>
              {termsAccepted && (
                <CheckIcon />
              )}
            </div>
            <Typography.Text className="!text-[12px] !leading-[18px] !font-normal !text-[#636369] dark:!text-zinc-400 select-none">
              Tôi đã đọc và đồng ý với{" "}
              <Typography.Link href="#terms" className="!text-[#111827] dark:!text-zinc-200 underline !font-medium">
                Điều khoản sử dụng
              </Typography.Link>{" "}
              của Nebula.
            </Typography.Text>
          </div>

          {/* Register Submit button */}
          <Button
            type="submit"
            disabled={phone.length < 9 || password.length < 6 || !termsAccepted || isLoading}
            variant="primary"
          >
            {isLoading ? "Đang đăng ký..." : "Đăng ký"}
          </Button>

          {/* Switch link */}
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
