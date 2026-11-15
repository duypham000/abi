import { useState, useEffect, useRef, useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import { RootState, AppDispatch } from "@/presentation/store";
import {
  updateShortcut,
  resetShortcuts,
  ShortcutSettings,
} from "@/presentation/store/settingsSlice";
import {
  registerShortcut,
  unregisterShortcut,
  isShortcutRegistered,
} from "@/infrastructure/tauri/shortcutService";
import "@/presentation/features/settings/pages/SettingsPage/SettingsPage.scss";
import "./ShortcutSection.scss";

const SHORTCUT_LABELS: Record<keyof ShortcutSettings, string> = {
  quickCreateDoc: "Quick create doc",
  showMainWindow: "Show main window",
  openSearch: "Open search overlay",
};

const SHORTCUT_DESCS: Record<keyof ShortcutSettings, string> = {
  quickCreateDoc: "Open a new doc in a small floating window",
  showMainWindow: "Bring the Tomo window to the front",
  openSearch: "Open the fullscreen search overlay",
};

// A single recorded key: `accel` is the Tauri accelerator token used for
// registration, `display` is the friendly label shown while recording.
interface KeyToken {
  accel: string;
  display: string;
  isModifier: boolean;
}

// Hardware-only keys that should never be recorded. The Fn key fires
// inconsistently across laptops (often not at all; sometimes as e.key="Fn"
// or e.code="Fn"). Explicitly block them so they cannot accidentally shadow a
// real modifier (e.g. when BIOS fn/ctrl swap is active).
const BLOCKED_KEYS = new Set(["Fn", "FnLock", "Symbol", "SymbolLock", "Hyper"]);

// Map the four modifiers by their stable `e.key`. Note: the hardware "Fn" key
// generally does NOT emit a JS keydown on most laptops, so it cannot be
// captured here. The Windows/Super key arrives as `e.key === "Meta"`.
const MODIFIER_TOKENS: Record<string, KeyToken> = {
  Control: { accel: "Control", display: "Ctrl", isModifier: true },
  Shift: { accel: "Shift", display: "Shift", isModifier: true },
  Alt: { accel: "Alt", display: "Alt", isModifier: true },
  Meta: { accel: "Super", display: "Win", isModifier: true },
};

// Canonical ordering of modifiers in the final accelerator string.
const MODIFIER_ORDER = ["Control", "Alt", "Shift", "Super"];

// Map non-modifier keys via `e.code` (layout-stable) to a Tauri accelerator key
// name. Using `e.code` rather than `e.key` avoids the broken `Shift+1 → "!"`
// problem that produced unregistrable accelerator strings.
function codeToAccel(code: string, fallbackKey: string): string | null {
  if (code.startsWith("Key")) return code.slice(3); // KeyN -> N
  if (code.startsWith("Digit")) return code.slice(5); // Digit1 -> 1
  if (code.startsWith("Numpad")) return code; // Numpad0, NumpadAdd, ...
  if (/^F\d{1,2}$/.test(code)) return code; // F1..F24
  if (code.startsWith("Arrow")) return code.slice(5); // ArrowUp -> Up

  const direct: Record<string, string> = {
    Space: "Space",
    Enter: "Enter",
    Tab: "Tab",
    Backspace: "Backspace",
    Delete: "Delete",
    Escape: "Escape",
    Home: "Home",
    End: "End",
    PageUp: "PageUp",
    PageDown: "PageDown",
    Insert: "Insert",
    Minus: "-",
    Equal: "=",
    BracketLeft: "[",
    BracketRight: "]",
    Backslash: "\\",
    Semicolon: ";",
    Quote: "'",
    Comma: ",",
    Period: ".",
    Slash: "/",
    Backquote: "`",
  };
  if (direct[code]) return direct[code];

  // Fallback: single printable character from e.key.
  if (fallbackKey && fallbackKey.length === 1) return fallbackKey.toUpperCase();
  return null;
}

function keyToToken(e: KeyboardEvent): KeyToken | null {
  if (BLOCKED_KEYS.has(e.key) || BLOCKED_KEYS.has(e.code)) return null;
  const mod = MODIFIER_TOKENS[e.key];
  if (mod) return mod;

  const accel = codeToAccel(e.code, e.key);
  if (!accel) return null;
  return { accel, display: accel, isModifier: false };
}

// Build the final combo from the set of pressed tokens: modifiers first (in
// canonical order), then the single main key.
function buildCombo(tokens: KeyToken[]): {
  accel: string;
  display: string;
  valid: boolean;
} {
  const mods = tokens.filter((t) => t.isModifier);
  const keys = tokens.filter((t) => !t.isModifier);

  const orderedMods = MODIFIER_ORDER.map((m) =>
    mods.find((t) => t.accel === m)
  ).filter((t): t is KeyToken => Boolean(t));

  // A single function/standalone key (e.g. F5) is allowed; only a
  // modifier-only combo is rejected (Tauri can't register those).
  const mainKey = keys[0];
  const ordered = mainKey ? [...orderedMods, mainKey] : orderedMods;
  const valid = Boolean(mainKey);

  return {
    accel: ordered.map((t) => t.accel).join("+"),
    display: ordered.map((t) => t.display).join("+"),
    valid,
  };
}

interface ShortcutRecorderProps {
  value: string;
  onChange: (value: string) => void;
  onConflict?: (accel: string) => string | null;
}

function ShortcutRecorder({ value, onChange, onConflict }: ShortcutRecorderProps) {
  const [recording, setRecording] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const ref = useRef<HTMLButtonElement>(null);
  // Ordered set of currently-pressed tokens, keyed by accel. Kept in a ref so
  // the keydown/keyup handlers always read the live set (no stale closures).
  const downKeys = useRef<Map<string, KeyToken>>(new Map());

  const stop = useCallback(() => {
    setRecording(false);
    downKeys.current.clear();
  }, []);

  // Cancel without recording anything (mouse interaction / focus loss).
  const cancel = useCallback(() => {
    setPreview(null);
    setConflict(null);
    stop();
  }, [stop]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.repeat) return; // ignore auto-repeat, but still swallow the event
    const token = keyToToken(e);
    if (!token) return;
    if (!downKeys.current.has(token.accel)) {
      downKeys.current.set(token.accel, token);
    }
    const { display } = buildCombo([...downKeys.current.values()]);
    setPreview(display);
  }, []);

  // First keyup ends the session: finalize with the accumulated key set.
  const handleKeyUp = useCallback(
    (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      const tokens = [...downKeys.current.values()];
      const { accel, display, valid } = buildCombo(tokens);
      if (!valid) {
        // Modifier-only — nothing to register; keep listening for a real combo.
        return;
      }
      setPreview(display);
      onChange(accel);
      const local = onConflict?.(accel) ?? null;
      setConflict(local);
      stop();

      // Best-effort OS-level check: warn if the combo is already registered as
      // a global shortcut. Only surfaces when no local conflict was found.
      if (!local) {
        isShortcutRegistered(accel)
          .then((taken) => {
            if (taken) setConflict("Phím tắt này đã được đăng ký — sẽ ghi đè");
          })
          .catch(() => {});
      }
    },
    [onChange, onConflict, stop]
  );

  useEffect(() => {
    if (!recording) return;

    const onMouse = (e: Event) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      cancel();
    };
    const onVisibility = () => cancel();

    // Capture phase + stopImmediatePropagation isolates the recording from the
    // rest of the app while it is active.
    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("keyup", handleKeyUp, true);
    window.addEventListener("mousedown", onMouse, true);
    window.addEventListener("click", onMouse, true);
    window.addEventListener("contextmenu", onMouse, true);
    window.addEventListener("wheel", onMouse, true);
    window.addEventListener("blur", onVisibility, true);
    document.addEventListener("visibilitychange", onVisibility, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keyup", handleKeyUp, true);
      window.removeEventListener("mousedown", onMouse, true);
      window.removeEventListener("click", onMouse, true);
      window.removeEventListener("contextmenu", onMouse, true);
      window.removeEventListener("wheel", onMouse, true);
      window.removeEventListener("blur", onVisibility, true);
      document.removeEventListener("visibilitychange", onVisibility, true);
    };
  }, [recording, handleKeyDown, handleKeyUp, cancel]);

  const displayValue = recording ? preview ?? "Press keys…" : value;

  return (
    <div className="shortcut-recorder-wrap">
      <button
        ref={ref}
        className={`shortcut-recorder ${recording ? "recording" : ""}`}
        onClick={() => {
          downKeys.current.clear();
          setPreview(null);
          setConflict(null);
          setRecording(true);
        }}
        title={recording ? "Press a key combination" : "Click to record shortcut"}
      >
        <kbd className="shortcut-kbd">{displayValue}</kbd>
        {recording && <span className="shortcut-recording-hint">recording…</span>}
      </button>
      {conflict && <div className="shortcut-conflict">{conflict}</div>}
    </div>
  );
}

export default function ShortcutSection() {
  const dispatch = useDispatch<AppDispatch>();
  const { shortcuts } = useSelector((state: RootState) => state.settings);
  const [pending, setPending] = useState<Partial<ShortcutSettings>>({});
  const [saving, setSaving] = useState(false);

  const hasPending = Object.keys(pending).length > 0;

  const handleChange = (key: keyof ShortcutSettings, value: string) => {
    setPending((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      for (const [key, value] of Object.entries(pending) as [
        keyof ShortcutSettings,
        string
      ][]) {
        const old = shortcuts[key];
        if (old) {
          await unregisterShortcut(old).catch(() => {});
        }
        await registerShortcut(value, key);
        dispatch(updateShortcut({ key, value }));
      }
      setPending({});
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    for (const value of Object.values(shortcuts)) {
      await unregisterShortcut(value).catch(() => {});
    }
    dispatch(resetShortcuts());
    setPending({});
  };

  const currentValue = (key: keyof ShortcutSettings) =>
    pending[key] ?? shortcuts[key];

  // Warn if the recorded combo duplicates another binding (saved or pending).
  const checkConflict =
    (key: keyof ShortcutSettings) => (accel: string): string | null => {
      for (const other of Object.keys(SHORTCUT_LABELS) as (keyof ShortcutSettings)[]) {
        if (other === key) continue;
        if (currentValue(other) === accel) {
          return `Trùng với "${SHORTCUT_LABELS[other]}"`;
        }
      }
      return null;
    };

  return (
    <div>
      <h2 className="settings-section-title">Shortcuts</h2>

      <div className="settings-card">
        {(Object.keys(SHORTCUT_LABELS) as (keyof ShortcutSettings)[]).map(
          (key) => (
            <div className="settings-row" key={key}>
              <div>
                <div className="settings-row-label">{SHORTCUT_LABELS[key]}</div>
                <div className="settings-row-desc">{SHORTCUT_DESCS[key]}</div>
              </div>
              <ShortcutRecorder
                value={currentValue(key)}
                onChange={(v) => handleChange(key, v)}
                onConflict={checkConflict(key)}
              />
            </div>
          )
        )}
      </div>

      <div className="shortcut-actions">
        <button
          className="settings-btn primary"
          onClick={handleSave}
          disabled={!hasPending || saving}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button className="settings-btn" onClick={handleReset}>
          Reset to defaults
        </button>
      </div>
    </div>
  );
}
