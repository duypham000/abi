import { Suspense, lazy } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import "katex/dist/katex.min.css";
import { RequireAuth } from "@/routes/RequireAuth";
import { AppShell } from "@/layout/AppShell";
import { Loading } from "@/components/ui/Loading/Loading";
import LoginPage from "@/features/auth/pages/LoginPage";
import RegisterPage from "@/features/auth/pages/RegisterPage";
import VerifyPage from "@/features/auth/pages/VerifyPage";
import ApiKeysPage from "@/features/api-keys/pages/ApiKeysPage";
import DocsPage from "@/features/docs/pages/DocsPage";
import CanvasListPage from "@/features/canvas/pages/CanvasListPage";

const DocEditorPage = lazy(() => import("@/features/docs/pages/DocEditorPage"));
const CanvasEditorPage = lazy(
  () => import("@/features/canvas/pages/CanvasEditorPage")
);

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/verify" element={<VerifyPage />} />

        <Route element={<RequireAuth />}>
          <Route element={<AppShell />}>
            <Route index element={<Navigate to="/docs" replace />} />
            <Route path="docs" element={<DocsPage />} />
            <Route
              path="docs/:id"
              element={
                <Suspense fallback={<Loading variant="fullscreen" />}>
                  <DocEditorPage />
                </Suspense>
              }
            />
            <Route path="canvas" element={<CanvasListPage />} />
            <Route
              path="canvas/:id"
              element={
                <Suspense fallback={<Loading variant="fullscreen" />}>
                  <CanvasEditorPage />
                </Suspense>
              }
            />
            <Route path="api-keys" element={<ApiKeysPage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/docs" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
