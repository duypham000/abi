import React, { useState } from "react";
import { ArrowLeft, Grid, FileText, FileEdit } from "lucide-react";
import { MobileMenuView } from "@/presentation/features/mobile/views/MobileMenuView";
import { MobileDocsView } from "@/presentation/features/mobile/views/MobileDocsView";
import { MobileRenameView } from "@/presentation/features/mobile/views/MobileRenameView";

export const MobileShell: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"menu" | "docs" | "rename">("menu");

  return (
    <div className="w-screen h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 overflow-hidden font-sans">
      {/* Mobile Top App Bar with Safe Area Top */}
      <header
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 0.5rem)",
          paddingBottom: "0.5rem",
        }}
        className="px-4 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 flex items-center justify-between flex-shrink-0 z-30 shadow-sm"
      >
        <div className="flex items-center gap-3">
          {activeTab !== "menu" ? (
            <button
              onClick={() => setActiveTab("menu")}
              className="p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors flex items-center gap-1.5 text-xs font-semibold"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Menu</span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold text-sm shadow-md shadow-blue-500/30">
                T
              </div>
              <span className="font-extrabold text-base tracking-tight text-slate-900 dark:text-white">
                Tomo <span className="text-blue-600 text-xs font-semibold uppercase">Mobile</span>
              </span>
            </div>
          )}
        </div>

        {/* Quick Nav Badges */}
        {activeTab !== "menu" && (
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs">
            <button
              onClick={() => setActiveTab("docs")}
              className={`px-3 py-1 rounded-lg flex items-center gap-1 transition-all ${
                activeTab === "docs"
                  ? "bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 font-bold shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              Docs
            </button>
            <button
              onClick={() => setActiveTab("rename")}
              className={`px-3 py-1 rounded-lg flex items-center gap-1 transition-all ${
                activeTab === "rename"
                  ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 font-bold shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <FileEdit className="w-3.5 h-3.5" />
              Rename
            </button>
          </div>
        )}
      </header>

      {/* Main View Area */}
      <main className="flex-1 overflow-y-auto relative">
        {activeTab === "menu" && (
          <MobileMenuView onSelectFeature={(feat) => setActiveTab(feat)} />
        )}
        {activeTab === "docs" && <MobileDocsView />}
        {activeTab === "rename" && <MobileRenameView />}
      </main>

      {/* Mobile Bottom Navigation Bar with Safe Area Bottom */}
      <nav
        style={{
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 0.5rem)",
          paddingTop: "0.5rem",
        }}
        className="px-6 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-around flex-shrink-0 z-30"
      >
        <button
          onClick={() => setActiveTab("menu")}
          className={`flex flex-col items-center gap-1 text-[11px] font-medium transition-colors ${
            activeTab === "menu" ? "text-blue-600 dark:text-blue-400 font-bold" : "text-slate-400 hover:text-slate-600"
          }`}
        >
          <Grid className="w-5 h-5" />
          Menu Grid
        </button>

        <button
          onClick={() => setActiveTab("docs")}
          className={`flex flex-col items-center gap-1 text-[11px] font-medium transition-colors ${
            activeTab === "docs" ? "text-blue-600 dark:text-blue-400 font-bold" : "text-slate-400 hover:text-slate-600"
          }`}
        >
          <FileText className="w-5 h-5" />
          Tài Liệu
        </button>

        <button
          onClick={() => setActiveTab("rename")}
          className={`flex flex-col items-center gap-1 text-[11px] font-medium transition-colors ${
            activeTab === "rename" ? "text-indigo-600 dark:text-indigo-400 font-bold" : "text-slate-400 hover:text-slate-600"
          }`}
        >
          <FileEdit className="w-5 h-5" />
          Đổi Tên File
        </button>
      </nav>
    </div>
  );
};
