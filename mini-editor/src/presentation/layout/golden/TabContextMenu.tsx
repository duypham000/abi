import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import type { ComponentItem, Stack } from "golden-layout";
import { useDocPopup } from "@/presentation/hooks/useDocPopup";
import { usePanelPopup } from "@/presentation/hooks/usePanelPopup";
import { PANEL_TYPES } from "./panelRegistry";
import "./TabContextMenu.scss";

export interface TabContextMenuPayload {
  x: number;
  y: number;
  componentType: string;
  componentState: Record<string, unknown>;
  componentItem: ComponentItem;
  stack: Stack;
}

declare global {
  interface WindowEventMap {
    "gl-tab-contextmenu": CustomEvent<TabContextMenuPayload>;
  }
}

function getTabEl(item: ComponentItem): HTMLElement | undefined {
  return (item as unknown as { tab?: { element: HTMLElement } }).tab?.element;
}

function isPinned(item: ComponentItem): boolean {
  return getTabEl(item)?.classList.contains("gl-tab--pinned") ?? false;
}

export function TabContextMenu() {
  const [menu, setMenu] = useState<TabContextMenuPayload | null>(null);
  const { openDocPopup, openDraftPopup } = useDocPopup();
  const { openPanelPopup } = usePanelPopup();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: CustomEvent<TabContextMenuPayload>) => setMenu(e.detail);
    window.addEventListener("gl-tab-contextmenu", handler);
    return () => window.removeEventListener("gl-tab-contextmenu", handler);
  }, []);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(null);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(null); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [!!menu]);

  const dismiss = useCallback(() => setMenu(null), []);

  if (!menu) return null;

  const { x, y, componentItem, stack, componentType, componentState } = menu;

  const stackItems = stack.contentItems as unknown as ComponentItem[];
  const thisIdx = stackItems.indexOf(componentItem);

  const itemsToRight = stackItems.slice(thisIdx + 1).filter(i => !isPinned(i));
  const otherItems  = stackItems.filter((i, idx) => idx !== thisIdx && !isPinned(i));

  const tabEl  = getTabEl(componentItem);
  const pinned = tabEl?.classList.contains("gl-tab--pinned") ?? false;


  // Position: keep menu on-screen
  const left = Math.min(x, window.innerWidth  - 232);
  const top  = Math.min(y, window.innerHeight - 240);

  const act = {
    close() {
      componentItem.close();
      dismiss();
    },
    closeAll() {
      [...stackItems].filter(i => !isPinned(i)).reverse().forEach(i => i.close());
      dismiss();
    },
    closeAllRight() {
      [...itemsToRight].reverse().forEach(i => i.close());
      dismiss();
    },
    closeAllExcept() {
      [...otherItems].reverse().forEach(i => i.close());
      dismiss();
    },
    newWindow() {
      if (componentType === PANEL_TYPES.DOC_EDITOR) {
        openDocPopup(componentState.id as number);
        openDraftPopup(componentState.localId as string);
      } else {
        openPanelPopup(componentType, componentState);
      }
      dismiss();
    },
    pin() {
      if (!tabEl) return;
      const nowPinned = tabEl.classList.toggle("gl-tab--pinned");
      const closeBtn = tabEl.querySelector<HTMLElement>(".lm_close_tab");
      if (closeBtn) closeBtn.style.display = nowPinned ? "none" : "";
      dismiss();
    },
  };

  return createPortal(
    <div
      ref={menuRef}
      className="tab-ctx-menu"
      style={{ left, top }}
      onContextMenu={e => e.preventDefault()}
    >
      <button className="tab-ctx-menu__item" onClick={act.close}>Close</button>

      <div className="tab-ctx-menu__sep" />

      <button className="tab-ctx-menu__item" onClick={act.closeAll}>
        Close All
      </button>
      <button
        className="tab-ctx-menu__item"
        onClick={act.closeAllRight}
        disabled={itemsToRight.length === 0}
      >
        Close All to the Right
      </button>
      <button
        className="tab-ctx-menu__item"
        onClick={act.closeAllExcept}
        disabled={otherItems.length === 0}
      >
        Close All Except This
      </button>

      <div className="tab-ctx-menu__sep" />

      <button className="tab-ctx-menu__item" onClick={act.newWindow}>
        Open in New Window
      </button>

      <button className="tab-ctx-menu__item tab-ctx-menu__item--pin" onClick={act.pin}>
        {pinned ? "📌 Unpin Tab" : "📌 Pin Tab"}
      </button>
    </div>,
    document.body
  );
}
