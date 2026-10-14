import { ReactNode } from "react";
import { AppBar } from "@/presentation/components/AppBar";
import { isMobile } from "@/infrastructure/platform";

interface AuthLayoutProps {
  children: ReactNode;
}

export function AuthLayout({ children }: AuthLayoutProps) {
  // Mobile is a single webview with no OS window chrome: the desktop AppBar would
  // just be an empty bar, so drop it and let the content clear the status bar via
  // pt-safe. Desktop (login window) keeps the AppBar.
  const mobile = isMobile();

  return (
    <div className="flex flex-col h-dvh">
      {!mobile && <AppBar variant="auth" />}
      <main
        className={`flex-1 overflow-auto pb-safe pl-safe pr-safe${
          mobile ? " pt-safe" : ""
        }`}
      >
        {children}
      </main>
    </div>
  );
}
