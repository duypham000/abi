import { useEffect, useState } from "react";
import { Loading } from "@/presentation/components/ui/Loading/Loading";
import { Button } from "@/presentation/components/ui/Button";
import { TomoIcon } from "@/presentation/components/icons/TomoIcon";
import { CloseIcon } from "@/presentation/components/icons/WindowIcons";
import { useWindowControls } from "@/presentation/hooks/useWindowControls";
import type { BootstrapState } from "@/presentation/hooks/useBootstrap";
import "./InitScreen.scss";

/** Rotating reminders shown while the app is initializing. */
const TIPS: string[] = [
  "Ctrl+Shift+N để tạo ghi chú nhanh từ bất cứ đâu.",
  "Tài liệu được lưu offline và tự đồng bộ khi có mạng trở lại.",
  "Ghim cửa sổ popup để nó luôn nổi trên cùng khi làm việc.",
  "Bạn có thể cộng tác thời gian thực trên cùng một tài liệu.",
  "Mở Cài đặt để tùy chỉnh phím tắt theo ý bạn.",
];

const TIP_INTERVAL_MS = 3500;

type InitScreenProps = Pick<BootstrapState, "phase" | "step" | "sessionExpired" | "retry">;

export function InitScreen({ phase, step, sessionExpired, retry }: InitScreenProps) {
  const { hide } = useWindowControls();
  const [tipIndex, setTipIndex] = useState(0);

  const isError = phase === "error";

  useEffect(() => {
    if (isError || sessionExpired) return;
    const id = setInterval(
      () => setTipIndex((i) => (i + 1) % TIPS.length),
      TIP_INTERVAL_MS
    );
    return () => clearInterval(id);
  }, [isError, sessionExpired]);

  return (
    <div className="init-screen" data-tauri-drag-region>
      <div className="init-screen__titlebar" data-tauri-drag-region>
        <button
          type="button"
          className="init-screen__close"
          onClick={hide}
          title="Ẩn xuống khay — tiếp tục tải nền"
          aria-label="Ẩn xuống khay"
        >
          <CloseIcon />
        </button>
      </div>

      <div className="init-screen__body">
        <div className="init-screen__brand animate-fade-in-up">
          <TomoIcon className="init-screen__logo" />
          <span className="init-screen__name">Tomo</span>
        </div>

        {isError ? (
          <div className="init-screen__error animate-fade-in">
            <p className="init-screen__error-title">Không thể kết nối máy chủ</p>
            <p className="init-screen__error-desc">
              Kiểm tra kết nối mạng của bạn rồi thử lại.
            </p>
            <div className="init-screen__actions">
              <Button variant="primary" onClick={retry}>
                Thử lại
              </Button>
              <Button variant="social" onClick={hide}>
                Ẩn xuống khay
              </Button>
            </div>
          </div>
        ) : (
          <div className="init-screen__status">
            <Loading size="lg" />
            <p className="init-screen__step">
              {sessionExpired ? "Phiên đăng nhập đã hết hạn" : step}
            </p>

            <div className="init-screen__tip" aria-live="polite">
              {sessionExpired ? (
                <span>Đang chuyển đến trang đăng nhập…</span>
              ) : (
                <span key={tipIndex} className="init-screen__tip-text">
                  <span className="init-screen__tip-label">Mẹo</span>
                  {TIPS[tipIndex]}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
