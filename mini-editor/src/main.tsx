import ReactDOM from "react-dom/client";
import { Provider } from "react-redux";
import { store } from "@/presentation/store";
import MainGate from "@/presentation/features/bootstrap/MainGate";
import { isMobile, resolveMobile } from "@/infrastructure/platform";
import "./App.css";
import "./index.css";

// On mobile (single webview), pin the UI to light. The `.force-light` class on
// <html> is the gate: CSS `dark:` utilities and `@media (prefers-color-scheme:
// dark)` blocks are written to NOT apply under it (see index.css + the gated
// scss). Desktop never gets the class, so its rendering is untouched.
function forceLightThemeOnMobile(): void {
  if (!isMobile()) return;
  document.documentElement.classList.add("force-light");
  // Kill the inline dark boot-bg immediately (it paints before the gated CSS).
  const bootBg = document.getElementById("boot-bg");
  if (bootBg) bootBg.style.background = "#ffffff";
  document.documentElement.style.background = "#ffffff";
  document.body.style.background = "#ffffff";
}

// index.html serves the main window and every popup. The full loading screen
// lives in a dedicated splash window (see src/splash/) which boots the session
// and warms shared caches before opening this window. Here we only hydrate auth
// from the local store (MainGate) and render the app — no loading screen.
//
// Resolve the platform BEFORE the first render so `isMobile()` is correct on
// first paint (avoids a wrong-branch flash in routing/chrome).
void resolveMobile().then(() => {
  forceLightThemeOnMobile();
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <Provider store={store}>
      <MainGate />
    </Provider>
  );
});
