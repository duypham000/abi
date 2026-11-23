import type {
  IVoiceServicePort,
  SpeechDictationController,
  SpeechDictationOptions,
  VoiceOption,
} from "@/core/interfaces/agent";

export const VOICE_CATALOG: VoiceOption[] = [
  {
    id: "alloy",
    name: "Alloy",
    gender: "non-binary",
    accent: "american",
    age: "30s",
    language: "en-US",
    description: "Balanced neutral studio voice ideal for technical walkthroughs.",
    previewFrequencyHz: 330,
    rate: 1.0,
  },
  {
    id: "nova",
    name: "Nova",
    gender: "female",
    accent: "american",
    age: "20s",
    language: "en-US",
    description: "Warm, articulate narrator suited for documentation and summaries.",
    previewFrequencyHz: 440,
    rate: 1.02,
  },
  {
    id: "shimmer",
    name: "Shimmer",
    gender: "female",
    accent: "british",
    age: "30s",
    language: "en-GB",
    description: "Crisp, expressive British cadence for briefings and UI demos.",
    previewFrequencyHz: 493.88,
    rate: 0.98,
  },
  {
    id: "sage",
    name: "Sage",
    gender: "female",
    accent: "canadian",
    age: "40s",
    language: "en-US",
    description: "Calm, measured tone suited for architectural reviews and plans.",
    previewFrequencyHz: 392,
    rate: 0.95,
  },
  {
    id: "orion",
    name: "Orion",
    gender: "male",
    accent: "american",
    age: "30s",
    language: "en-US",
    description: "Deep, confident engineering voice for diagnostics and reports.",
    previewFrequencyHz: 261.63,
    rate: 1.0,
  },
  {
    id: "linh-vi",
    name: "Linh (Vietnamese)",
    gender: "female",
    accent: "vietnamese",
    age: "20s",
    language: "vi-VN",
    description: "Natural Vietnamese & bilingual technical assistant voice.",
    previewFrequencyHz: 523.25,
    rate: 1.0,
  },
];

interface BrowserSpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface BrowserSpeechRecognitionResult {
  readonly length: number;
  readonly isFinal: boolean;
  [index: number]: BrowserSpeechRecognitionAlternative | undefined;
}

interface BrowserSpeechRecognitionResultList {
  readonly length: number;
  [index: number]: BrowserSpeechRecognitionResult | undefined;
}

interface BrowserSpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: BrowserSpeechRecognitionResultList;
}

interface BrowserSpeechRecognitionErrorEvent extends Event {
  readonly error: string;
}

interface BrowserSpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((ev: BrowserSpeechRecognitionEvent) => void) | null;
  onerror: ((ev: BrowserSpeechRecognitionErrorEvent) => void) | null;
  onend: ((ev: Event) => void) | null;
}

type SpeechRecognitionCtor = new () => BrowserSpeechRecognition;

let activePreviewAudio: HTMLAudioElement | null = null;

function uint8ArrayToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    let chunk = "";
    for (let j = 0; j < slice.length; j += 1) {
      chunk += String.fromCharCode(slice[j]);
    }
    parts.push(chunk);
  }
  return btoa(parts.join(""));
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i += 1) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}

/**
 * Generates a valid 16-bit mono PCM WAV encoded as raw base64 (without data URI prefix).
 * Produces a gentle harmonic chime/pad so AudioPlayer plays cleanly offline and advances currentTime.
 */
export function generateSynthesizedWavBase64(
  durationSec: number,
  baseFreq = 440
): string {
  const safeDuration = Math.max(0.25, Math.min(durationSec, 15));
  const sampleRate = 16000;
  const numChannels = 1;
  const bitsPerSample = 16;
  const numSamples = Math.floor(sampleRate * safeDuration);
  const dataSize = numSamples * numChannels * (bitsPerSample / 8);
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // RIFF chunk descriptor
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, "WAVE");

  // fmt sub-chunk
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // AudioFormat = PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * (bitsPerSample / 8), true);
  view.setUint16(32, numChannels * (bitsPerSample / 8), true);
  view.setUint16(34, bitsPerSample, true);

  // data sub-chunk
  writeAscii(view, 36, "data");
  view.setUint32(40, dataSize, true);

  // Gentle major-ninth arpeggio chord progression with smooth envelope
  const chordMultipliers = [1.0, 1.25, 1.5, 1.875];
  const segmentLength = safeDuration / chordMultipliers.length;

  for (let i = 0; i < numSamples; i += 1) {
    const t = i / sampleRate;
    const noteIndex = Math.min(
      chordMultipliers.length - 1,
      Math.floor(t / segmentLength)
    );
    const localT = t - noteIndex * segmentLength;
    const noteFreq = baseFreq * chordMultipliers[noteIndex];

    const attack = Math.min(1, localT / 0.04);
    const release = Math.min(1, Math.max(0, (segmentLength - localT) / 0.12));
    const globalFadeOut = Math.min(1, Math.max(0, (safeDuration - t) / 0.15));
    const envelope = attack * release * globalFadeOut;

    const fundamental = Math.sin(2 * Math.PI * noteFreq * t);
    const softFifth = 0.35 * Math.sin(2 * Math.PI * (noteFreq * 1.5) * t);
    const warmOctave = 0.2 * Math.sin(2 * Math.PI * (noteFreq * 0.5) * t);
    const sample = (fundamental + softFifth + warmOctave) * 0.28 * envelope;
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(44 + i * 2, Math.round(clamped * 32767), true);
  }

  return uint8ArrayToBase64(new Uint8Array(buffer));
}

export function stopVoicePreview(): void {
  if (activePreviewAudio) {
    try {
      activePreviewAudio.pause();
      activePreviewAudio.currentTime = 0;
    } catch {
      // ignore playback cleanup errors
    }
    activePreviewAudio = null;
  }
}

export async function playVoicePreview(voiceId: string): Promise<void> {
  stopVoicePreview();
  if (typeof window === "undefined" || typeof Audio === "undefined") {
    return;
  }

  const voice =
    VOICE_CATALOG.find((item) => item.id === voiceId) ?? VOICE_CATALOG[0];
  const base64 = generateSynthesizedWavBase64(1.1, voice.previewFrequencyHz);
  const audio = new Audio(`data:audio/wav;base64,${base64}`);
  activePreviewAudio = audio;

  return new Promise<void>((resolve) => {
    const cleanup = () => {
      if (activePreviewAudio === audio) {
        activePreviewAudio = null;
      }
      resolve();
    };
    audio.addEventListener("ended", cleanup, { once: true });
    audio.addEventListener("error", cleanup, { once: true });
    audio.play().catch(cleanup);
  });
}

export function stopSpeaking(): void {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // ignore speechSynthesis errors
    }
  }
}

export async function speakText(text: string, voiceId?: string): Promise<void> {
  if (
    typeof window === "undefined" ||
    !("speechSynthesis" in window) ||
    typeof SpeechSynthesisUtterance === "undefined"
  ) {
    return;
  }

  const cleaned = text.trim();
  if (!cleaned) return;

  stopSpeaking();

  const voiceOption = VOICE_CATALOG.find((v) => v.id === voiceId);
  const utterance = new SpeechSynthesisUtterance(cleaned);
  utterance.lang = voiceOption?.language ?? "en-US";
  utterance.rate = voiceOption?.rate ?? 1.0;

  try {
    const voices = window.speechSynthesis.getVoices();
    const langPrefix = (voiceOption?.language ?? "en").slice(0, 2).toLowerCase();
    const matched = voices.find((v) =>
      v.lang.toLowerCase().startsWith(langPrefix)
    );
    if (matched) {
      utterance.voice = matched;
    }
  } catch {
    // ignore voice list errors
  }

  return new Promise<void>((resolve) => {
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    try {
      window.speechSynthesis.speak(utterance);
    } catch {
      resolve();
    }
  });
}

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const win = window as unknown as Record<string, unknown>;
  const ctor = win.SpeechRecognition ?? win.webkitSpeechRecognition;
  return typeof ctor === "function" ? (ctor as SpeechRecognitionCtor) : null;
}

export function isSpeechRecognitionSupported(): boolean {
  return getSpeechRecognitionCtor() !== null;
}

export function startSpeechDictation(
  options: SpeechDictationOptions
): SpeechDictationController {
  const Ctor = getSpeechRecognitionCtor();

  if (Ctor) {
    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = options.lang ?? "en-US";

    let stopped = false;

    recognition.onresult = (event) => {
      let interim = "";
      let finalChunk = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const res = event.results[i];
        if (!res) continue;
        const transcript = res[0]?.transcript ?? "";
        if (res.isFinal) {
          finalChunk += transcript;
        } else {
          interim += transcript;
        }
      }
      if (interim && options.onInterim) {
        options.onInterim(interim);
      }
      if (finalChunk.trim()) {
        options.onFinal(finalChunk.trim());
      }
    };

    recognition.onerror = (event) => {
      options.onError?.(event.error || "Speech recognition error");
    };

    recognition.onend = () => {
      if (!stopped) {
        stopped = true;
        options.onEnd?.();
      }
    };

    try {
      recognition.start();
    } catch (err) {
      options.onError?.(
        err instanceof Error ? err.message : "Failed to start dictation"
      );
    }

    return {
      isMockFallback: false,
      stop: () => {
        if (!stopped) {
          stopped = true;
          try {
            recognition.stop();
          } catch {
            // ignore stop errors
          }
          options.onEnd?.();
        }
      },
      abort: () => {
        if (!stopped) {
          stopped = true;
          try {
            recognition.abort();
          } catch {
            // ignore abort errors
          }
          options.onEnd?.();
        }
      },
    };
  }

  // Clean simulated bilingual dictation fallback when Web Speech API is unavailable
  const isVietnamese = (options.lang ?? "en-US")
    .toLowerCase()
    .startsWith("vi");
  const samplePhrases = isVietnamese
    ? [
        "Kiểm tra đồng bộ Yjs",
        "và tạo báo cáo test coverage cho workspace",
      ]
    : [
        "Audit the Yjs offline sync pipeline",
        "and generate a passing test plan",
      ];

  let closed = false;
  const timers: number[] = [];

  if (typeof window !== "undefined") {
    timers.push(
      window.setTimeout(() => {
        if (!closed) {
          options.onInterim?.(samplePhrases[0]);
        }
      }, 450)
    );
    timers.push(
      window.setTimeout(() => {
        if (!closed) {
          options.onInterim?.(`${samplePhrases[0]} ${samplePhrases[1]}`);
        }
      }, 950)
    );
    timers.push(
      window.setTimeout(() => {
        if (!closed) {
          closed = true;
          options.onFinal(`${samplePhrases[0]} ${samplePhrases[1]}`);
          options.onEnd?.();
        }
      }, 1450)
    );
  }

  const clearAll = () => {
    for (const id of timers) {
      window.clearTimeout(id);
    }
  };

  return {
    isMockFallback: true,
    stop: () => {
      if (!closed) {
        closed = true;
        clearAll();
        options.onFinal(samplePhrases.join(" "));
        options.onEnd?.();
      }
    },
    abort: () => {
      if (!closed) {
        closed = true;
        clearAll();
        options.onEnd?.();
      }
    },
  };
}

export const voiceService: IVoiceServicePort = {
  listVoices: () => VOICE_CATALOG,
  generateSynthesizedWavBase64,
  playVoicePreview,
  stopVoicePreview,
  speakText,
  stopSpeaking,
  isSpeechRecognitionSupported,
  startSpeechDictation,
};
