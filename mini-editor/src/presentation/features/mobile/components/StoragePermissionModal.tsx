import React from "react";
import { ShieldAlert, FolderKey } from "lucide-react";

interface StoragePermissionModalProps {
  isOpen: boolean;
  onRequestPermission: () => void;
  onClose?: () => void;
}

export const StoragePermissionModal: React.FC<StoragePermissionModalProps> = ({
  isOpen,
  onRequestPermission,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-sm overflow-hidden bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100">
        <div className="p-6 text-center">
          <div className="w-16 h-16 mx-auto mb-4 flex items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500">
            <FolderKey className="w-9 h-9" />
          </div>

          <h3 className="text-xl font-bold mb-2">Cần quyền truy cập bộ nhớ</h3>
          
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-6 leading-relaxed">
            Để quét thư mục và đổi tên file hàng loạt trực tiếp trên thiết bị, ứng dụng cần được cấp quyền đọc và chỉnh sửa bộ nhớ tệp tin.
          </p>

          <div className="flex flex-col gap-2">
            <button
              onClick={onRequestPermission}
              className="w-full py-3 px-4 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold rounded-xl shadow-lg shadow-blue-500/20 transition-all text-sm"
            >
              <ShieldAlert className="w-4 h-4" />
              Cấp quyền truy cập bộ nhớ
            </button>

            {onClose && (
              <button
                onClick={onClose}
                className="w-full py-2.5 px-4 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 font-medium text-xs rounded-lg transition-colors"
              >
                Hủy / Để sau
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
