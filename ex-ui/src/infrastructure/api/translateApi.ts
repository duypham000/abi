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

export const translateApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    translate: builder.query<
      TranslationResult,
      { q: string; sl: string; tl: string }
    >({
      query: ({ q, sl, tl }) => ({
        url: "/translate",
        params: { q, sl, tl },
      }),
    }),
  }),
  overrideExisting: false,
});

export const { useTranslateQuery } = translateApi;
