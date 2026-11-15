export interface CodeLanguage {
  id: string;
  label: string;
  aliases?: string[];
}

export const CODE_LANGUAGES: CodeLanguage[] = [
  { id: "plaintext", label: "Plain Text", aliases: ["text", "txt"] },
  { id: "bash", label: "Bash", aliases: ["sh", "shell", "zsh"] },
  { id: "c", label: "C" },
  { id: "cpp", label: "C++", aliases: ["c++"] },
  { id: "csharp", label: "C#", aliases: ["cs"] },
  { id: "css", label: "CSS" },
  { id: "dart", label: "Dart" },
  { id: "diff", label: "Diff" },
  { id: "dockerfile", label: "Dockerfile", aliases: ["docker"] },
  { id: "elixir", label: "Elixir", aliases: ["ex"] },
  { id: "erlang", label: "Erlang", aliases: ["erl"] },
  { id: "go", label: "Go", aliases: ["golang"] },
  { id: "graphql", label: "GraphQL", aliases: ["gql"] },
  { id: "groovy", label: "Groovy" },
  { id: "haskell", label: "Haskell", aliases: ["hs"] },
  { id: "html", label: "HTML" },
  { id: "java", label: "Java" },
  { id: "javascript", label: "JavaScript", aliases: ["js"] },
  { id: "json", label: "JSON" },
  { id: "jsx", label: "JSX" },
  { id: "julia", label: "Julia" },
  { id: "kotlin", label: "Kotlin", aliases: ["kt"] },
  { id: "less", label: "Less" },
  { id: "lua", label: "Lua" },
  { id: "makefile", label: "Makefile", aliases: ["make"] },
  { id: "markdown", label: "Markdown", aliases: ["md"] },
  { id: "matlab", label: "MATLAB" },
  { id: "mermaid", label: "Mermaid" },
  { id: "nix", label: "Nix" },
  { id: "objective-c", label: "Objective-C", aliases: ["objc"] },
  { id: "perl", label: "Perl" },
  { id: "php", label: "PHP" },
  { id: "powershell", label: "PowerShell", aliases: ["ps", "ps1"] },
  { id: "python", label: "Python", aliases: ["py"] },
  { id: "r", label: "R" },
  { id: "ruby", label: "Ruby", aliases: ["rb"] },
  { id: "rust", label: "Rust", aliases: ["rs"] },
  { id: "scala", label: "Scala" },
  { id: "scss", label: "SCSS" },
  { id: "shell", label: "Shell", aliases: ["sh"] },
  { id: "sql", label: "SQL" },
  { id: "svelte", label: "Svelte" },
  { id: "swift", label: "Swift" },
  { id: "toml", label: "TOML" },
  { id: "tsx", label: "TSX" },
  { id: "typescript", label: "TypeScript", aliases: ["ts"] },
  { id: "vue", label: "Vue" },
  { id: "xml", label: "XML" },
  { id: "yaml", label: "YAML", aliases: ["yml"] },
];

const LANG_INDEX = new Map<string, CodeLanguage>();
for (const l of CODE_LANGUAGES) {
  LANG_INDEX.set(l.id, l);
  l.aliases?.forEach((a) => LANG_INDEX.set(a, l));
}

export function findLanguage(id: string | undefined | null): CodeLanguage {
  if (!id) return LANG_INDEX.get("plaintext")!;
  return LANG_INDEX.get(id.toLowerCase()) ?? LANG_INDEX.get("plaintext")!;
}
