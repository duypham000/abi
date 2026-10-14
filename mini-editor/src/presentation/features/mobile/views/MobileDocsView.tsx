import React from "react";
import DocsPage from "@/presentation/features/docs/pages/DocsPage/DocsPage";

export const MobileDocsView: React.FC = () => {
  return (
    <div className="w-full h-full p-2 sm:p-4 overflow-y-auto">
      <DocsPage />
    </div>
  );
};
