import { useEffect, useRef } from "react";
import { getItem, setItem } from "@/infrastructure/tauri/kvStore";
import { useRestStore } from "../store/restStore";
import { useApiSettingsStore } from "../store/apiSettingsStore";
import type { RestTab } from "../types/rest";

const REST_KEY = "api_client_rest";
const SETTINGS_KEY = "api_client_settings";
const DEBOUNCE_MS = 800;

export function useApiPersistence() {
  const restTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settingsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Hydrate REST state
    getItem(REST_KEY).then((raw) => {
      if (!raw) return;
      try {
        const data = JSON.parse(raw);

        // Restore tabs if present (strip any binaryFile from snapshots)
        const restoredTabs: RestTab[] | undefined = data.tabs?.map((t: RestTab) => ({
          ...t,
          snapshot: {
            ...t.snapshot,
            request: { ...t.snapshot.request, body: { ...t.snapshot.request.body, binaryFile: undefined } },
          },
        }));

        useRestStore.setState({
          collections: data.collections ?? [],
          environments: data.environments ?? [],
          activeEnvironmentId: data.activeEnvironmentId ?? null,
          history: (data.history ?? []).slice(0, 100),
          ...(restoredTabs ? { tabs: restoredTabs } : {}),
          ...(data.activeTabId ? { activeTabId: data.activeTabId } : {}),
          ...(data.currentRequest ? { currentRequest: data.currentRequest } : {}),
        });
      } catch {
        // ignore corrupt data
      }
    });

    // Hydrate Settings
    getItem(SETTINGS_KEY).then((raw) => {
      if (!raw) return;
      try {
        const data = JSON.parse(raw);
        useApiSettingsStore.setState({
          language: data.language,
          queryParamsEncoding: data.queryParamsEncoding,
          experiments: { ...useApiSettingsStore.getState().experiments, ...data.experiments },
          theme: { ...useApiSettingsStore.getState().theme, ...data.theme },
          interceptor: { ...useApiSettingsStore.getState().interceptor, ...data.interceptor },
        });
      } catch {
        // ignore corrupt data
      }
    });
  }, []);

  // Subscribe and persist REST (debounced)
  useEffect(() => {
    const unsubRest = useRestStore.subscribe((state) => {
      if (restTimerRef.current) clearTimeout(restTimerRef.current);
      restTimerRef.current = setTimeout(() => {
        // Exclude non-serializable binaryFile from currentRequest body
        const { binaryFile: _f, ...serializableBody } = state.currentRequest.body;

        // Serialize tabs — strip response (can be large) and binaryFile from snapshots
        const serializableTabs = state.tabs.map((t) => ({
          ...t,
          snapshot: {
            ...t.snapshot,
            response: null,
            request: { ...t.snapshot.request, body: { ...t.snapshot.request.body, binaryFile: undefined } },
          },
        }));

        setItem(
          REST_KEY,
          JSON.stringify({
            collections: state.collections,
            environments: state.environments,
            activeEnvironmentId: state.activeEnvironmentId,
            history: state.history,
            currentRequest: { ...state.currentRequest, body: serializableBody },
            tabs: serializableTabs,
            activeTabId: state.activeTabId,
          })
        );
      }, DEBOUNCE_MS);
    });

    return () => {
      unsubRest();
      if (restTimerRef.current) clearTimeout(restTimerRef.current);
    };
  }, []);

  // Subscribe and persist Settings (debounced)
  useEffect(() => {
    const unsubSettings = useApiSettingsStore.subscribe((state) => {
      if (settingsTimerRef.current) clearTimeout(settingsTimerRef.current);
      settingsTimerRef.current = setTimeout(() => {
        setItem(
          SETTINGS_KEY,
          JSON.stringify({
            language: state.language,
            queryParamsEncoding: state.queryParamsEncoding,
            experiments: state.experiments,
            theme: state.theme,
            interceptor: state.interceptor,
          })
        );
      }, DEBOUNCE_MS);
    });

    return () => {
      unsubSettings();
      if (settingsTimerRef.current) clearTimeout(settingsTimerRef.current);
    };
  }, []);
}
