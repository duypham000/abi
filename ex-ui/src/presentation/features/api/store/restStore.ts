import { create } from "zustand";
import { nanoid } from "nanoid";
import type {
  ApiRequest,
  ApiResponse,
  ApiCollection,
  ApiEnvironment,
  HistoryItem,
  RequestTab,
  ResponseTab,
  LeftPanelTab,
  RestTab,
} from "../types/rest";
import { createDefaultRequest } from "../types/rest";

function makeDefaultTab(): RestTab {
  const req = { ...createDefaultRequest(), id: nanoid() };
  return {
    id: nanoid(),
    name: "Untitled",
    isDirty: false,
    snapshot: { request: req, response: null, activeRequestTab: "params", activeResponseTab: "body" },
  };
}

interface RestState {
  // Transient — represent the currently active tab
  currentRequest: ApiRequest;
  activeRequestTab: RequestTab;
  response: ApiResponse | null;
  isLoading: boolean;
  abortController: AbortController | null;
  activeResponseTab: ResponseTab;
  // Tab management
  tabs: RestTab[];
  activeTabId: string;
  // Persisted
  collections: ApiCollection[];
  environments: ApiEnvironment[];
  activeEnvironmentId: string | null;
  history: HistoryItem[];
  // UI
  leftPanelTab: LeftPanelTab;
  leftPanelCollapsed: boolean;
  // Actions — transient
  setCurrentRequest: (patch: Partial<ApiRequest>) => void;
  replaceCurrentRequest: (req: ApiRequest) => void;
  setActiveRequestTab: (tab: RequestTab) => void;
  setResponse: (r: ApiResponse | null) => void;
  setLoading: (v: boolean) => void;
  setAbortController: (ac: AbortController | null) => void;
  setActiveResponseTab: (tab: ResponseTab) => void;
  // Actions — tabs
  addTab: () => void;
  closeTab: (id: string) => void;
  duplicateTab: (id: string) => void;
  renameTab: (id: string, name: string) => void;
  setActiveTabId: (id: string) => void;
  // Actions — collections
  setCollections: (c: ApiCollection[]) => void;
  addCollection: (name: string) => void;
  deleteCollection: (id: string) => void;
  renameCollection: (id: string, name: string) => void;
  saveRequestToCollection: (name: string, collectionId: string, folderId?: string) => void;
  // Actions — environments
  setEnvironments: (envs: ApiEnvironment[]) => void;
  addEnvironment: (name: string) => void;
  deleteEnvironment: (id: string) => void;
  updateEnvironment: (id: string, patch: Partial<ApiEnvironment>) => void;
  setActiveEnvironmentId: (id: string | null) => void;
  // Actions — history
  pushHistory: (item: HistoryItem) => void;
  clearHistory: () => void;
  // Actions — UI
  setLeftPanelTab: (tab: LeftPanelTab) => void;
  setLeftPanelCollapsed: (v: boolean) => void;
}

const _firstTab = makeDefaultTab();

export const useRestStore = create<RestState>((set) => ({
  currentRequest: { ..._firstTab.snapshot.request },
  activeRequestTab: "params",
  response: null,
  isLoading: false,
  abortController: null,
  activeResponseTab: "body",
  tabs: [_firstTab],
  activeTabId: _firstTab.id,
  collections: [],
  environments: [],
  activeEnvironmentId: null,
  history: [],
  leftPanelTab: "collections",
  leftPanelCollapsed: false,

  setCurrentRequest: (patch) =>
    set((s) => {
      const newRequest = { ...s.currentRequest, ...patch };
      return {
        currentRequest: newRequest,
        tabs: s.tabs.map((t) =>
          t.id === s.activeTabId
            ? { ...t, isDirty: true, snapshot: { ...t.snapshot, request: newRequest } }
            : t
        ),
      };
    }),

  replaceCurrentRequest: (req) =>
    set((s) => ({
      currentRequest: req,
      tabs: s.tabs.map((t) =>
        t.id === s.activeTabId
          ? { ...t, isDirty: true, snapshot: { ...t.snapshot, request: req } }
          : t
      ),
    })),

  setActiveRequestTab: (tab) => set({ activeRequestTab: tab }),
  setResponse: (r) => set({ response: r }),
  setLoading: (v) => set({ isLoading: v }),
  setAbortController: (ac) => set({ abortController: ac }),
  setActiveResponseTab: (tab) => set({ activeResponseTab: tab }),

  setActiveTabId: (id) =>
    set((s) => {
      const newTab = s.tabs.find((t) => t.id === id);
      if (!newTab) return s;
      const updatedTabs = s.tabs.map((t) =>
        t.id === s.activeTabId
          ? {
              ...t,
              snapshot: {
                request: s.currentRequest,
                response: s.response,
                activeRequestTab: s.activeRequestTab,
                activeResponseTab: s.activeResponseTab,
              },
            }
          : t
      );
      return {
        tabs: updatedTabs,
        activeTabId: id,
        currentRequest: newTab.snapshot.request,
        response: newTab.snapshot.response,
        activeRequestTab: newTab.snapshot.activeRequestTab,
        activeResponseTab: newTab.snapshot.activeResponseTab,
        isLoading: false,
      };
    }),

  addTab: () =>
    set((s) => {
      const newTab = makeDefaultTab();
      const updatedTabs = s.tabs.map((t) =>
        t.id === s.activeTabId
          ? {
              ...t,
              snapshot: {
                request: s.currentRequest,
                response: s.response,
                activeRequestTab: s.activeRequestTab,
                activeResponseTab: s.activeResponseTab,
              },
            }
          : t
      );
      return {
        tabs: [...updatedTabs, newTab],
        activeTabId: newTab.id,
        currentRequest: { ...newTab.snapshot.request },
        response: null,
        activeRequestTab: "params" as RequestTab,
        activeResponseTab: "body" as ResponseTab,
        isLoading: false,
      };
    }),

  closeTab: (id) =>
    set((s) => {
      if (s.tabs.length === 1) {
        const freshTab = makeDefaultTab();
        return {
          tabs: [freshTab],
          activeTabId: freshTab.id,
          currentRequest: { ...freshTab.snapshot.request },
          response: null,
          activeRequestTab: "params" as RequestTab,
          activeResponseTab: "body" as ResponseTab,
          isLoading: false,
        };
      }
      const idx = s.tabs.findIndex((t) => t.id === id);
      const remaining = s.tabs.filter((t) => t.id !== id);
      if (id !== s.activeTabId) return { tabs: remaining };
      const nextTab = remaining[Math.min(idx, remaining.length - 1)];
      return {
        tabs: remaining,
        activeTabId: nextTab.id,
        currentRequest: nextTab.snapshot.request,
        response: nextTab.snapshot.response,
        activeRequestTab: nextTab.snapshot.activeRequestTab,
        activeResponseTab: nextTab.snapshot.activeResponseTab,
        isLoading: false,
      };
    }),

  duplicateTab: (id) =>
    set((s) => {
      const source = id === s.activeTabId
        ? { ...s.tabs.find((t) => t.id === id)!, snapshot: { request: s.currentRequest, response: s.response, activeRequestTab: s.activeRequestTab, activeResponseTab: s.activeResponseTab } }
        : s.tabs.find((t) => t.id === id);
      if (!source) return s;
      const copy: RestTab = {
        id: nanoid(),
        name: `${source.name} (copy)`,
        isDirty: source.isDirty,
        snapshot: { ...source.snapshot, request: { ...source.snapshot.request, id: nanoid() } },
      };
      const idx = s.tabs.findIndex((t) => t.id === id);
      const newTabs = [...s.tabs.slice(0, idx + 1), copy, ...s.tabs.slice(idx + 1)];
      return { tabs: newTabs };
    }),

  renameTab: (id, name) =>
    set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, name } : t)) })),

  setCollections: (c) => set({ collections: c }),
  addCollection: (name) =>
    set((s) => ({
      collections: [
        ...s.collections,
        { id: nanoid(), name, folders: [], requests: [], headers: [], auth: { type: "none" } },
      ],
    })),
  deleteCollection: (id) =>
    set((s) => ({ collections: s.collections.filter((c) => c.id !== id) })),
  renameCollection: (id, name) =>
    set((s) => ({ collections: s.collections.map((c) => (c.id === id ? { ...c, name } : c)) })),

  saveRequestToCollection: (name, collectionId, folderId) =>
    set((s) => {
      const req: ApiRequest = { ...s.currentRequest, id: nanoid(), name };
      return {
        collections: s.collections.map((c) => {
          if (c.id !== collectionId) return c;
          if (folderId) {
            return {
              ...c,
              folders: c.folders.map((f) =>
                f.id === folderId ? { ...f, requests: [...f.requests, req] } : f
              ),
            };
          }
          return { ...c, requests: [...c.requests, req] };
        }),
      };
    }),

  setEnvironments: (envs) => set({ environments: envs }),
  addEnvironment: (name) =>
    set((s) => ({ environments: [...s.environments, { id: nanoid(), name, variables: [] }] })),
  deleteEnvironment: (id) =>
    set((s) => ({ environments: s.environments.filter((e) => e.id !== id) })),
  updateEnvironment: (id, patch) =>
    set((s) => ({ environments: s.environments.map((e) => (e.id === id ? { ...e, ...patch } : e)) })),
  setActiveEnvironmentId: (id) => set({ activeEnvironmentId: id }),

  pushHistory: (item) =>
    set((s) => ({ history: [item, ...s.history].slice(0, 100) })),
  clearHistory: () => set({ history: [] }),

  setLeftPanelTab: (tab) => set({ leftPanelTab: tab }),
  setLeftPanelCollapsed: (v) => set({ leftPanelCollapsed: v }),
}));
