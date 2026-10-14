/**
 * Clean, frontend-friendly shape produced from Google's nested-array response.
 */

export interface DictionaryEntry {
  /** A target-language word, e.g. "chạy". */
  word: string;
  /** Source-language words that map back to `word`, e.g. ["run", "operate"]. */
  reverseTranslations: string[];
  /** Google's frequency/relevance score for the term, when present. */
  score?: number;
}

export interface DictionaryGroup {
  /** Part of speech: "verb", "noun", "adjective"... (localized to `hl`). */
  partOfSpeech: string;
  /** Flat list of alternative translations for this part of speech. */
  terms: string[];
  /** Detailed entries with reverse translations. */
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
  /** Usage register for this cluster, e.g. "informal", "rare". Optional. */
  register?: string;
  synonyms: string[];
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
