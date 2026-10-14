import { isRejectedWithValue, type Middleware } from "@reduxjs/toolkit";
import type { FetchBaseQueryError } from "@reduxjs/toolkit/query";
import { message } from "antd";

/**
 * Pulls a human-friendly message out of an RTK Query error.
 * Returns null when the error should be swallowed (offline / aborted),
 * since those are surfaced by the online/offline indicator instead.
 */
function extractMessage(payload: unknown): string | null {
  const err = payload as FetchBaseQueryError | undefined;
  if (!err || typeof err !== "object" || !("status" in err)) return null;

  const status = err.status;

  // Network down — handled by the offline indicator, don't spam toasts.
  if (status === "FETCH_ERROR") return null;
  if (status === "TIMEOUT_ERROR") return "Yêu cầu quá thời gian chờ.";

  // Backend wraps responses as { status, code, message, data } — prefer its message.
  const data = (err as { data?: unknown }).data;
  if (data && typeof data === "object" && "message" in data) {
    const m = (data as { message?: unknown }).message;
    if (typeof m === "string" && m.trim()) return m;
  }

  // Non-JSON body (e.g. a plain-text 403 from a filter/gateway). RTK Query keeps
  // the real HTTP code in `originalStatus` — map that instead of a generic message.
  const httpStatus =
    typeof status === "number"
      ? status
      : status === "PARSING_ERROR"
        ? (err as { originalStatus?: number }).originalStatus
        : undefined;

  if (typeof httpStatus === "number") {
    if (httpStatus === 401) return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
    if (httpStatus === 403) return "Bạn không có quyền truy cập (CORS/gateway từ chối).";
    if (httpStatus === 404) return "Không tìm thấy tài nguyên yêu cầu.";
    if (httpStatus >= 500) return "Lỗi máy chủ. Vui lòng thử lại sau.";
    return `Yêu cầu thất bại (HTTP ${httpStatus}).`;
  }

  if (status === "PARSING_ERROR") return "Phản hồi không hợp lệ từ máy chủ.";

  return "Đã có lỗi xảy ra khi gọi máy chủ.";
}

/**
 * Global toast for failed API calls. Any rejected RTK Query request
 * (query or mutation) surfaces a single antd error toast. Duplicate
 * errors collapse onto the same key so simultaneous failures don't spam.
 */
export const errorToastMiddleware: Middleware = () => (next) => (action) => {
  if (isRejectedWithValue(action)) {
    const msg = extractMessage(action.payload);
    if (msg) {
      message.error({ content: msg, key: "api-error" });
    }
  }
  return next(action);
};
