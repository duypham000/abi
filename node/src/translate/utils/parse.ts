import {
  DefinitionGroup,
  DictionaryGroup,
  SynonymGroup,
  TranslationResult,
} from '../types/dictionary.js';

/**
 * Google's translate_a/single endpoint returns a deeply nested, position-based
 * array (an internal API never meant for public consumption). The indices below
 * are derived from the dt flags we request: dt=t (translation), dt=bd
 * (dictionary), dt=ss (synonyms), dt=md (definitions), dt=ex (examples).
 * See docs/transdoc.md.
 *
 * Every access is defensive — for short words, phrases or unknown languages many
 * of these branches are simply null.
 */
function stripTags(text: string): string {
  return text.replace(/<\/?b>/g, '').trim();
}

export function parseGoogleResponse(
  raw: any,
  context: {
    query: string;
    sourceLang: string;
    targetLang: string;
  },
): TranslationResult {
  const result: TranslationResult = {
    query: context.query,
    sourceLang: context.sourceLang,
    targetLang: context.targetLang,
    detectedSourceLanguage: null,
    mainTranslation: '',
    originalText: '',
    dictionary: [],
    definitions: [],
    synonyms: [],
    examples: [],
    cached: false,
  };

  if (!Array.isArray(raw)) {
    return result;
  }

  // [0] Main translation — array of segments [translated, original, ...].
  if (Array.isArray(raw[0])) {
    const translated: string[] = [];
    const original: string[] = [];
    for (const segment of raw[0]) {
      if (Array.isArray(segment)) {
        if (typeof segment[0] === 'string') translated.push(segment[0]);
        if (typeof segment[1] === 'string') original.push(segment[1]);
      }
    }
    result.mainTranslation = translated.join('');
    result.originalText = original.join('');
  }

  // [2] Detected source language.
  if (typeof raw[2] === 'string') {
    result.detectedSourceLanguage = raw[2];
  }

  // [1] Dictionary: alternative translations grouped by part of speech.
  if (Array.isArray(raw[1])) {
    for (const group of raw[1]) {
      if (!Array.isArray(group)) continue;
      const partOfSpeech: string =
        typeof group[0] === 'string' ? group[0] : '';
      const terms: string[] = Array.isArray(group[1])
        ? group[1].filter((t: unknown): t is string => typeof t === 'string')
        : [];

      const entries =
        Array.isArray(group[2])
          ? group[2]
              .filter((e: unknown) => Array.isArray(e))
              .map((entry: any) => ({
                word: typeof entry[0] === 'string' ? entry[0] : '',
                reverseTranslations: Array.isArray(entry[1])
                  ? entry[1].filter(
                      (r: unknown): r is string => typeof r === 'string',
                    )
                  : [],
                score: typeof entry[3] === 'number' ? entry[3] : undefined,
              }))
          : [];

      const dictGroup: DictionaryGroup = { partOfSpeech, terms, entries };
      result.dictionary.push(dictGroup);
    }
  }

  // [12] Definitions grouped by part of speech.
  if (Array.isArray(raw[12])) {
    for (const group of raw[12]) {
      if (!Array.isArray(group)) continue;
      const partOfSpeech: string =
        typeof group[0] === 'string' ? group[0] : '';
      const items =
        Array.isArray(group[1])
          ? group[1]
              .filter((d: unknown) => Array.isArray(d))
              .map((def: any) => ({
                definition: typeof def[0] === 'string' ? def[0] : '',
                example: typeof def[2] === 'string' ? def[2] : undefined,
              }))
              .filter((d: { definition: string }) => d.definition.length > 0)
          : [];

      if (items.length > 0) {
        const defGroup: DefinitionGroup = { partOfSpeech, items };
        result.definitions.push(defGroup);
      }
    }
  }

  // [11] Synonyms grouped by part of speech (dt=ss). Each group is
  // [pos, clusters, baseWord, posIndex]; each cluster is
  // [[synonyms...], id, [[register]]?] where the register tag is optional.
  if (Array.isArray(raw[11])) {
    for (const group of raw[11]) {
      if (!Array.isArray(group)) continue;
      const partOfSpeech: string =
        typeof group[0] === 'string' ? group[0] : '';
      const clusters =
        Array.isArray(group[1])
          ? group[1]
              .filter((c: unknown) => Array.isArray(c))
              .map((cluster: any) => {
                const synonyms: string[] = Array.isArray(cluster[0])
                  ? cluster[0].filter(
                      (s: unknown): s is string => typeof s === 'string',
                    )
                  : [];
                const register: string | undefined =
                  Array.isArray(cluster[2]) &&
                  Array.isArray(cluster[2][0]) &&
                  typeof cluster[2][0][0] === 'string'
                    ? cluster[2][0][0]
                    : undefined;
                return register ? { register, synonyms } : { synonyms };
              })
              .filter((c: { synonyms: string[] }) => c.synonyms.length > 0)
          : [];

      if (clusters.length > 0) {
        const synGroup: SynonymGroup = { partOfSpeech, clusters };
        result.synonyms.push(synGroup);
      }
    }
  }

  // [13] Examples — nested as [[ [exampleHtml, ...], ... ]].
  if (Array.isArray(raw[13]) && Array.isArray(raw[13][0])) {
    for (const example of raw[13][0]) {
      if (Array.isArray(example) && typeof example[0] === 'string') {
        result.examples.push(stripTags(example[0]));
      }
    }
  }

  return result;
}
