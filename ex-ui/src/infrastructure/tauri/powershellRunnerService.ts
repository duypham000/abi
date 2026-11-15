import { invoke } from "@tauri-apps/api/core";
import { getItem, setItem } from "./kvStore";
import type {
  PowerShellScript,
  PowerShellRunHistory,
  PowerShellParam,
  PowerShellParamType,
} from "@/core/interfaces/powershellRunner";

const SCRIPTS_KEY = "ps_runner_scripts_v1";
const HISTORY_KEY = "ps_runner_history_v1";
const MAX_HISTORY = 200;

export async function selectFolder(): Promise<string | null> {
  try {
    const selected = await invoke<string | null>("cmd_select_folder");
    return selected;
  } catch (err) {
    console.error("Failed to select folder", err);
    return null;
  }
}

export async function selectFile(): Promise<string | null> {
  try {
    const selected = await invoke<string | null>("cmd_select_file");
    return selected;
  } catch (err) {
    console.error("Failed to select file", err);
    return null;
  }
}

export async function isProcessAlive(pid: number): Promise<boolean> {
  try {
    return await invoke<boolean>("cmd_is_process_alive", { pid });
  } catch {
    return false;
  }
}

export async function loadPowerShellScripts(): Promise<PowerShellScript[]> {
  const raw = await getItem(SCRIPTS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as PowerShellScript[];
  } catch {
    return [];
  }
}

export async function savePowerShellScripts(scripts: PowerShellScript[]): Promise<void> {
  await setItem(SCRIPTS_KEY, JSON.stringify(scripts));
}

export async function loadPowerShellHistory(): Promise<PowerShellRunHistory[]> {
  const raw = await getItem(HISTORY_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as PowerShellRunHistory[];
  } catch {
    return [];
  }
}

export async function appendPowerShellHistory(
  entry: PowerShellRunHistory
): Promise<PowerShellRunHistory[]> {
  const history = await loadPowerShellHistory();
  const updated = [entry, ...history].slice(0, MAX_HISTORY);
  await setItem(HISTORY_KEY, JSON.stringify(updated));
  return updated;
}

export async function updatePowerShellHistoryStatus(
  id: string,
  status: "success" | "failed",
  endedAt: string
): Promise<PowerShellRunHistory[]> {
  const history = await loadPowerShellHistory();
  const updated = history.map((h) =>
    h.id === id ? { ...h, status, endedAt } : h
  );
  await setItem(HISTORY_KEY, JSON.stringify(updated));
  return updated;
}

export async function clearPowerShellHistory(): Promise<void> {
  await setItem(HISTORY_KEY, JSON.stringify([]));
}

/**
 * Scans PowerShell script content to find and extract parameter definitions
 * from the param(...) block, handling metadata attributes like ValidateSet or Parameter.
 */
export function parsePowerShellParams(scriptContent: string): PowerShellParam[] {
  // Strip block comments <# ... #>
  const cleanContent = scriptContent
    .replace(/<#[\s\S]*?#>/g, "")
    // Strip line comments
    .replace(/^[ \t]*#.*$/gm, "");

  const paramMatch = cleanContent.match(/param\s*\(([\s\S]*?)\)/i);
  if (!paramMatch) return [];

  const paramBlock = paramMatch[1];
  const params: PowerShellParam[] = [];

  // Match all variable names starting with $
  const varRegex = /\$([a-zA-Z0-9_]+)/g;
  let match;

  while ((match = varRegex.exec(paramBlock)) !== null) {
    const varName = match[1];
    const varIndex = match.index;

    // 1. Find type: look backward from varIndex
    const precedingText = paramBlock.substring(0, varIndex);
    // Find all bracketed blocks like [type]
    const bracketMatches = [...precedingText.matchAll(/\[([a-zA-Z0-9_]+)\]/g)];
    const lastBracketMatch = bracketMatches.pop();
    
    let rawType = "string";
    if (lastBracketMatch) {
      // If there's only whitespace or other brackets between the bracket and the $, it's the type!
      const bracketIndex = lastBracketMatch.index ?? 0;
      const between = precedingText.substring(bracketIndex + lastBracketMatch[0].length).trim();
      if (/^(?:\[[^\]]+\]\s*)*$/.test(between)) {
        rawType = lastBracketMatch[1].toLowerCase();
      }
    }

    let type: PowerShellParamType = "string";
    if (rawType === "switch" || rawType === "bool" || rawType === "boolean") {
      type = "switch";
    } else if (rawType === "int" || rawType === "int32" || rawType === "long") {
      type = "int";
    }

    // 2. Find default value: look forward from the end of the variable name
    const varEndIndex = varIndex + varName.length + 1; // +1 for the $ symbol
    const restText = paramBlock.substring(varEndIndex);
    
    // Find the next comma that is at depth 0 of parentheses/brackets
    let depth = 0;
    let limitIndex = restText.length;
    for (let i = 0; i < restText.length; i++) {
      const char = restText[i];
      if (char === "(" || char === "[" || char === "{") {
        depth++;
      } else if (char === ")" || char === "]" || char === "}") {
        depth--;
      } else if (char === "," && depth <= 0) {
        limitIndex = i;
        break;
      }
    }
    
    const valuePart = restText.substring(0, limitIndex).trim();
    let defaultValue: string | boolean | number | undefined = undefined;

    if (valuePart.startsWith("=")) {
      const rawDefault = valuePart.substring(1).trim();
      if (type === "switch") {
        defaultValue = rawDefault.toLowerCase() === "$true" || rawDefault === "1";
      } else if (type === "int") {
        defaultValue = parseInt(rawDefault, 10) || 0;
      } else {
        defaultValue = rawDefault.replace(/^["']|["']$/g, "");
      }
    } else if (type === "switch") {
      defaultValue = false;
    }

    params.push({ name: varName, type, defaultValue });
  }

  return params;
}
