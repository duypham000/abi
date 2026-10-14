import React from "react";
import { FileText, FileEdit, ChevronRight, Sparkles } from "lucide-react";

interface MobileMenuViewProps {
  onSelectFeature: (feature: "docs" | "rename") => void;
}

export const MobileMenuView: React.FC<MobileMenuViewProps> = ({ onSelectFeature }) => {
  return (
    <div className="w-full max-w-xl mx-auto p-5 sm:p-8 flex flex-col gap-6">
      {/* Welcome Banner */}
      <div className="p-6 rounded-3xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-xl shadow-blue-500/20 relative overflow-hidden">
        <div className="absolute -right-6 -bottom-6 w-32 h-32 bg-white/10 rounded-full blur-2xl pointer-events-none" />
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-200 mb-2">
          <Sparkles className="w-4 h-4 text-amber-300" />
          Tomo Mobile
        </div>
        <h1 className="text-2xl font-black mb-1">Danh Mục Chức Năng</h1>
        <p className="text-xs text-blue-100/90 leading-relaxed max-w-sm">
          Chọn công cụ làm việc bên dưới để mở giao diện tối ưu hóa cho thiết bị di động.
        </p>
      </div>

      {/* Grid View Menu — Only 2 Features */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Feature 1: Docs */}
        <div
          onClick={() => onSelectFeature("docs")}
          className="group relative p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 hover:border-blue-500 dark:hover:border-blue-500 shadow-lg shadow-slate-200/50 dark:shadow-none hover:shadow-xl hover:shadow-blue-500/10 cursor-pointer transition-all duration-300 transform active:scale-[0.98] flex flex-col justify-between"
        >
          <div>
            <div className="w-14 h-14 rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-4 group-hover:scale-110 group-hover:bg-blue-600 group-hover:text-white transition-all duration-300 shadow-sm">
              <FileText className="w-7 h-7" />
            </div>

            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
              Tài Liệu (Docs)
            </h3>
            
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Quản lý, tạo mới và xem tài liệu, ghi chú cá nhân dạng bản dựng nhẹ.
            </p>
          </div>

          <div className="mt-6 flex items-center justify-between text-xs font-semibold text-blue-600 dark:text-blue-400 pt-3 border-t border-slate-100 dark:border-slate-800/60">
            <span>Mở Docs</span>
            <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </div>
        </div>

        {/* Feature 2: Rename */}
        <div
          onClick={() => onSelectFeature("rename")}
          className="group relative p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 hover:border-indigo-500 dark:hover:border-indigo-500 shadow-lg shadow-slate-200/50 dark:shadow-none hover:shadow-xl hover:shadow-indigo-500/10 cursor-pointer transition-all duration-300 transform active:scale-[0.98] flex flex-col justify-between"
        >
          <div>
            <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-4 group-hover:scale-110 group-hover:bg-indigo-600 group-hover:text-white transition-all duration-300 shadow-sm">
              <FileEdit className="w-7 h-7" />
            </div>

            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-1 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
              Đổi Tên File
            </h3>
            
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Tự duyệt folder và đổi đuôi tệp tin hàng loạt trực tiếp trên máy.
            </p>
          </div>

          <div className="mt-6 flex items-center justify-between text-xs font-semibold text-indigo-600 dark:text-indigo-400 pt-3 border-t border-slate-100 dark:border-slate-800/60">
            <span>Thực hiện Đổi tên</span>
            <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </div>
        </div>
      </div>
    </div>
  );
};
