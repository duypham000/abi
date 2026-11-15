import { useEffect, useState } from "react";

// Detects whether the primary input is touch (coarse pointer = finger).
// Use this to adapt interaction logic: skip hover effects, use touch gestures,
// handle multi-select differently, etc.
// For layout/display responsiveness, use CSS @media (max-width: ...) instead.
export function useTouchDevice() {
  const [isTouch, setIsTouch] = useState(
    () => window.matchMedia("(pointer: coarse)").matches
  );

  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const handler = (e: MediaQueryListEvent) => setIsTouch(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return isTouch;
}
