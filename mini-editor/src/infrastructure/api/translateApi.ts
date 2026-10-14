import { baseApi } from "./baseApi";

export interface DictionaryEntry {
  word: string;
  reverseTranslations: string[];
  score?: number;
}

export interface DictionaryGroup {
  partOfSpeech: string;
  terms: string[];
  entries: DictionaryEntry[];
}

export interface DefinitionItem {
  definition: string;
  example?: string;
}

export interface DefinitionGroup {
  partOfSpeech: string;
  items: DefinitionItem[];
}

export interface SynonymCluster {
  synonyms: string[];
  register?: string;
}

export interface SynonymGroup {
  partOfSpeech: string;
  clusters: SynonymCluster[];
}

export interface TranslationResult {
  query: string;
  sourceLang: string;
  targetLang: string;
  detectedSourceLanguage: string | null;
  mainTranslation: string;
  originalText: string;
  dictionary: DictionaryGroup[];
  definitions: DefinitionGroup[];
  synonyms: SynonymGroup[];
  examples: string[];
  cached: boolean;
}

function stripTags(text: string): string {
  return text.replace(/<\/?b>/g, "").replace(/<\/?i>/g, "").trim();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseGoogleResponseWeb(raw: any, query: string, sourceLang: string, targetLang: string): TranslationResult {
  const result: TranslationResult = {
    query,
    sourceLang,
    targetLang,
    detectedSourceLanguage: null,
    mainTranslation: "",
    originalText: "",
    dictionary: [],
    definitions: [],
    synonyms: [],
    examples: [],
    cached: false,
  };

  if (!Array.isArray(raw)) return result;

  if (Array.isArray(raw[0])) {
    const translated: string[] = [];
    const original: string[] = [];
    for (const segment of raw[0]) {
      if (Array.isArray(segment)) {
        if (typeof segment[0] === "string") translated.push(segment[0]);
        if (typeof segment[1] === "string") original.push(segment[1]);
      }
    }
    result.mainTranslation = translated.join("");
    result.originalText = original.join("");
  }

  if (typeof raw[2] === "string") {
    result.detectedSourceLanguage = raw[2];
  }

  if (Array.isArray(raw[1])) {
    for (const group of raw[1]) {
      if (!Array.isArray(group)) continue;
      const partOfSpeech = typeof group[0] === "string" ? group[0] : "";
      const terms: string[] = Array.isArray(group[1])
        ? group[1].filter((t: unknown): t is string => typeof t === "string")
        : [];
      const entries = Array.isArray(group[2])
        ? group[2]
            .filter((e: unknown) => Array.isArray(e))
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .map((entry: any) => ({
              word: typeof entry[0] === "string" ? entry[0] : "",
              reverseTranslations: Array.isArray(entry[1])
                ? entry[1].filter((r: unknown): r is string => typeof r === "string")
                : [],
              score: typeof entry[3] === "number" ? entry[3] : undefined,
            }))
        : [];
      result.dictionary.push({ partOfSpeech, terms, entries });
    }
  }

  if (Array.isArray(raw[12])) {
    for (const group of raw[12]) {
      if (!Array.isArray(group)) continue;
      const partOfSpeech = typeof group[0] === "string" ? group[0] : "";
      const items = Array.isArray(group[1])
        ? group[1]
            .filter((d: unknown) => Array.isArray(d))
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .map((def: any) => ({
              definition: typeof def[0] === "string" ? def[0] : "",
              example: typeof def[2] === "string" ? def[2] : undefined,
            }))
            .filter((d: { definition: string }) => d.definition.length > 0)
        : [];
      if (items.length > 0) {
        result.definitions.push({ partOfSpeech, items });
      }
    }
  }

  if (Array.isArray(raw[11])) {
    for (const group of raw[11]) {
      if (!Array.isArray(group)) continue;
      const partOfSpeech = typeof group[0] === "string" ? group[0] : "";
      const clusters = Array.isArray(group[1])
        ? group[1]
            .filter((c: unknown) => Array.isArray(c))
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .map((cluster: any) => {
              const synonyms: string[] = Array.isArray(cluster[0])
                ? cluster[0].filter((s: unknown): s is string => typeof s === "string")
                : [];
              const register: string | undefined =
                Array.isArray(cluster[2]) &&
                Array.isArray(cluster[2][0]) &&
                typeof cluster[2][0][0] === "string"
                  ? cluster[2][0][0]
                  : undefined;
              return register ? { register, synonyms } : { synonyms };
            })
            .filter((c: { synonyms: string[] }) => c.synonyms.length > 0)
        : [];
      if (clusters.length > 0) {
        result.synonyms.push({ partOfSpeech, clusters });
      }
    }
  }

  if (Array.isArray(raw[13]) && Array.isArray(raw[13][0])) {
    for (const example of raw[13][0]) {
      if (Array.isArray(example) && typeof example[0] === "string") {
        result.examples.push(stripTags(example[0]));
      }
    }
  }

  return result;
}

export const translateApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    translate: builder.query<
      TranslationResult,
      { q: string; sl: string; tl: string }
    >({
      queryFn: async ({ q, sl, tl }) => {
        const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
        if (isTauri) {
          try {
            const { invoke } = await import("@tauri-apps/api/core");
            const data = await invoke<TranslationResult>("cmd_translate", { q, sl, tl });
            return { data };
          } catch (err: unknown) {
            const errMsg = String(err);
            const is429 = errMsg.includes("429") || errMsg.includes("Too Many Requests");
            return {
              error: {
                status: is429 ? 429 : 500,
                statusText: errMsg,
                data: errMsg,
              },
            };
          }
        } else {
          // 1. Thử gọi Node Translate Microservice (thông qua proxy /api/v1/translate)
          try {
            const nodeRes = await fetch(
              `/api/v1/translate?q=${encodeURIComponent(q)}&sl=${encodeURIComponent(sl)}&tl=${encodeURIComponent(tl)}`
            );
            if (nodeRes.ok) {
              const nodeData = await nodeRes.json();
              if (nodeData && typeof nodeData === "object" && "mainTranslation" in nodeData) {
                return { data: nodeData as TranslationResult };
              }
            }
          } catch {
            // Node service offline, fallback trực tiếp sang Google Translate
          }

          // 2. Fallback trực tiếp tới Google Translate
          try {
            const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(sl)}&tl=${encodeURIComponent(tl)}&hl=${encodeURIComponent(tl)}&q=${encodeURIComponent(q)}&dt=t&dt=bd&dt=ss&dt=md&dt=ex`;
            const res = await fetch(url);
            if (!res.ok) {
              return { error: { status: res.status, statusText: res.statusText, data: "Google Translate API request failed" } };
            }
            const raw = await res.json();
            const data = parseGoogleResponseWeb(raw, q, sl, tl);
            return { data };
          } catch (err: unknown) {
            return { error: { status: 500, statusText: String(err), data: String(err) } };
          }
        }
      },
    }),
  }),
  overrideExisting: false,
});

export const { useTranslateQuery } = translateApi;
