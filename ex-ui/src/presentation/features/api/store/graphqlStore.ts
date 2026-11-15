import { create } from "zustand";
import { nanoid } from "nanoid";
import type { GqlTab, GqlOptionTab, GqlSchemaType } from "../types/graphql";

function createDefaultGqlTab(): GqlTab {
  return {
    id: nanoid(),
    name: "Untitled",
    request: {
      id: nanoid(),
      name: "Untitled",
      url: "",
      query: "",
      variables: "{}",
      headers: [],
      auth: { type: "none" },
    },
    isDirty: false,
    response: null,
    connectionState: "DISCONNECTED",
    isLoading: false,
    schema: null,
  };
}

interface GraphqlState {
  tabs: GqlTab[];
  activeTabId: string;
  activeOptionTab: GqlOptionTab;
  // Actions
  addTab: () => void;
  closeTab: (id: string) => void;
  setActiveTabId: (id: string) => void;
  setActiveOptionTab: (tab: GqlOptionTab) => void;
  updateTab: (id: string, patch: Partial<GqlTab>) => void;
  updateTabRequest: (
    tabId: string,
    patch: Partial<GqlTab["request"]>
  ) => void;
  renameTab: (id: string, name: string) => void;
  duplicateTab: (id: string) => void;
  setSchema: (tabId: string, schema: GqlSchemaType[] | null) => void;
}

export const useGraphqlStore = create<GraphqlState>((set) => {
  const defaultTab = createDefaultGqlTab();
  return {
    tabs: [defaultTab],
    activeTabId: defaultTab.id,
    activeOptionTab: "query",

    addTab: () => {
      const tab = createDefaultGqlTab();
      set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }));
    },

    closeTab: (id) =>
      set((s) => {
        const remaining = s.tabs.filter((t) => t.id !== id);
        if (!remaining.length) {
          const newTab = createDefaultGqlTab();
          return { tabs: [newTab], activeTabId: newTab.id };
        }
        const newActiveId =
          s.activeTabId === id
            ? remaining[remaining.length - 1].id
            : s.activeTabId;
        return { tabs: remaining, activeTabId: newActiveId };
      }),

    setActiveTabId: (id) => set({ activeTabId: id }),
    setActiveOptionTab: (tab) => set({ activeOptionTab: tab }),

    updateTab: (id, patch) =>
      set((s) => ({
        tabs: s.tabs.map((t) => (t.id === id ? { ...t, ...patch } : t)),
      })),

    updateTabRequest: (tabId, patch) =>
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === tabId
            ? { ...t, isDirty: true, request: { ...t.request, ...patch } }
            : t
        ),
      })),

    renameTab: (id, name) =>
      set((s) => ({
        tabs: s.tabs.map((t) => (t.id === id ? { ...t, name } : t)),
      })),

    duplicateTab: (id) =>
      set((s) => {
        const original = s.tabs.find((t) => t.id === id);
        if (!original) return {};
        const copy = {
          ...original,
          id: nanoid(),
          name: `${original.name} (copy)`,
          isDirty: false,
        };
        const idx = s.tabs.findIndex((t) => t.id === id);
        const tabs = [
          ...s.tabs.slice(0, idx + 1),
          copy,
          ...s.tabs.slice(idx + 1),
        ];
        return { tabs, activeTabId: copy.id };
      }),

    setSchema: (tabId, schema) =>
      set((s) => ({
        tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, schema } : t)),
      })),
  };
});
