import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Alert, Input, Typography } from "antd";
import { Button } from "@/presentation/components/ui/Button";
import { PhoneIcon, PencilIcon } from "@/presentation/components/icons";
import "./VerifyPage.scss";
import { TomoIcon } from "@/presentation/components/icons/TomoIcon";

export default function VerifyPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const rawPhone = searchParams.get("phone") || "0912345678";
  
  // Format phone to mask, e.g., 0912345678 -> *******678
  const formatMaskedPhone = (phone: string) => {
    if (phone.length >= 3) {
      return "*******" + phone.slice(-3);
    }
    return phone;
  };
  const maskedPhone = formatMaskedPhone(rawPhone);

  const [otpString, setOtpString] = useState("");
  const [timeLeft, setTimeLeft] = useState<number>(98); // 01:38 = 98 seconds
  const [isResending, setIsResending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Countdown timer logic
  useEffect(() => {
    if (timeLeft <= 0) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [timeLeft]);

  // Format time to MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const handleResend = () => {
    setIsResending(true);
    setTimeout(() => {
      setTimeLeft(98);
      setErrorMessage(null);
      setSuccessMessage("Mã OTP mới đã được gửi!");
      setOtpString("");
      setIsResending(false);
    }, 800);
  };

  const handleConfirm = () => {
    if (otpString.length < 6) return;

    // Simulate OTP verification (correct code is 230561 or any code)
    if (otpString === "123456") {
      setSuccessMessage("Xác thực thành công! Đang chuyển hướng...");
      setErrorMessage(null);
      setTimeout(() => {
        navigate("/");
      }, 1500);
    } else {
      setErrorMessage("Mã xác thực không hợp lệ. Vui lòng kiểm tra lại!");
    }
  };

  const isOtpComplete = otpString.length === 6;

  return (
    <div className="min-h-full w-full flex flex-col items-center justify-between auth-bg p-4 md:p-6 transition-colors duration-300 font-sans">
      {/* Top spacing */}
      <div className="h-4"></div>

      {/* Main card */}
      <div className="flex flex-col items-center gap-8 animate-fade-in-up">
        {/* Logo Nebula */}
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate("/login")}>
          <TomoIcon />
        </div>

        {/* Auth figma card wrapper */}
        <div className="auth-card-figma flex flex-col gap-6 !pb-8">
          <div className="text-center flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Typography.Title level={1} className="!text-[28px] !leading-[36px] !font-bold !text-[#111827] dark:!text-zinc-50 !tracking-tight !text-center !mb-0">
                Xác thực OTP
              </Typography.Title>
              <Typography.Paragraph className="!text-base !text-[#636369] dark:!text-zinc-400 !text-center !mb-0">
                Nhập mã xác nhận được gửi đến số điện thoại:
              </Typography.Paragraph>
            </div>

            {/* Phone Badge container */}
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => navigate("/register")}
                className="flex items-center gap-3 bg-[#f5f5f5] hover:bg-[#ebebeb] dark:bg-zinc-800 dark:hover:bg-zinc-700 rounded-full px-4 pr-3 h-10 transition-colors duration-150 outline-none border-none cursor-pointer group"
                title="Sửa số điện thoại"
              >
                <div className="flex items-center gap-2">
                  <PhoneIcon />
                  <Typography.Text className="!text-[14px] !text-[#111827] dark:!text-zinc-100 !font-normal">
                    {maskedPhone}
                  </Typography.Text>
                </div>
                <div className="text-[#636369] group-hover:text-[#111827] dark:text-[#889ba4] dark:group-hover:text-white transition-colors duration-150 flex items-center justify-center">
                  <PencilIcon />
                </div>
              </button>
            </div>
          </div>

          {errorMessage && (
            <Alert message={errorMessage} type="error" showIcon closable className="rounded-xl" />
          )}
          {successMessage && (
            <Alert message={successMessage} type="success" showIcon closable className="rounded-xl" />
          )}

          {/* OTP boxes layout */}
          <div className="flex flex-col gap-4">
            <Typography.Text className="!text-sm !font-medium !text-[#111827] dark:!text-zinc-300 !text-center block">
              Vui lòng nhập mã OTP bên dưới
            </Typography.Text>

            <div className="flex justify-center w-full">
              <Input.OTP
                length={6}
                value={otpString}
                onChange={setOtpString}
                formatter={(str) => str.replace(/\D/g, '')}
                className="figma-otp w-full justify-between"
              />
            </div>

            {/* Countdown / Resend code */}
            <div className="flex flex-col items-center gap-2 mt-1">
              <Typography.Text className="!text-[14px] !text-[#636369] dark:!text-zinc-400">
                {timeLeft > 0 ? (
                  <>Mã có hiệu lực trong <strong className="text-[#111827] dark:text-zinc-150 font-normal">{formatTime(timeLeft)}</strong></>
                ) : (
                  "Mã xác thực đã hết hạn"
                )}
              </Typography.Text>
              
              <button
                type="button"
                onClick={handleResend}
                disabled={timeLeft > 0 || isResending}
                className={`text-[14px] font-bold bg-transparent border-none cursor-pointer outline-none transition-colors w-full ${
                  timeLeft > 0
                    ? "text-[#c5c5c7] dark:text-zinc-600 cursor-not-allowed"
                    : "text-[#111827] hover:underline dark:text-zinc-200"
                }`}
              >
                {isResending ? "Đang gửi..." : "Gửi lại mã"}
              </button>
            </div>
          </div>

          {/* Confirm button */}
          <Button
            onClick={handleConfirm}
            disabled={!isOtpComplete}
            variant="primary"
          >
            Xác nhận
          </Button>
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
