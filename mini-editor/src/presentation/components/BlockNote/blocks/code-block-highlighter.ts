import type { Highlighter, BundledLanguage } from "shiki";

let highlighterPromise: Promise<Highlighter> | null = null;
const loadedLangs = new Set<string>();

export const SHIKI_THEME_LIGHT = "github-light" as const;
export const SHIKI_THEME_DARK = "github-dark" as const;
export const SHIKI_THEME = SHIKI_THEME_LIGHT;

export function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = import("shiki").then(({ getSingletonHighlighter }) =>
      getSingletonHighlighter({
        themes: [SHIKI_THEME_LIGHT, SHIKI_THEME_DARK],
        langs: ["typescript", "javascript", "tsx", "jsx", "json", "mermaid"],
      })
    );
    loadedLangs.add("typescript");
    loadedLangs.add("javascript");
    loadedLangs.add("tsx");
    loadedLangs.add("jsx");
    loadedLangs.add("json");
    loadedLangs.add("mermaid");
  }
  return highlighterPromise;
}

const NON_HIGHLIGHTABLE = new Set(["plaintext", "text"]);

export async function ensureLanguage(lang: string): Promise<string> {
  if (NON_HIGHLIGHTABLE.has(lang)) return "plaintext";
  if (loadedLangs.has(lang)) return lang;
  try {
    const hi = await getHighlighter();
    await hi.loadLanguage(lang as BundledLanguage);
    loadedLangs.add(lang);
    return lang;
  } catch {
    return "plaintext";
  }
}

export async function highlightToHtml(code: string, lang: string, isDark?: boolean): Promise<string> {
  const hi = await getHighlighter();
  const effective = await ensureLanguage(lang);
  return hi.codeToHtml(code, {
    lang: effective as BundledLanguage,
    theme: isDark ? SHIKI_THEME_DARK : SHIKI_THEME_LIGHT,
  });
}
