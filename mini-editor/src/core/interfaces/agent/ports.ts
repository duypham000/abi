import type { AgentRuntimeConfig, VoiceOption } from "./config";
import type {
  AgentSession,
  CheckpointSnapshot,
  WorkspaceContextItem,
} from "./session";

export interface IAgentStoragePort {
  loadSessions(): Promise<AgentSession[]>;
  saveSessions(sessions: AgentSession[]): Promise<void>;
  loadActiveSessionId(): Promise<string | null>;
  saveActiveSessionId(sessionId: string | null): Promise<void>;
  loadConfig(): Promise<AgentRuntimeConfig | null>;
  saveConfig(config: AgentRuntimeConfig): Promise<void>;
  loadCheckpoints(): Promise<CheckpointSnapshot[]>;
  saveCheckpoints(checkpoints: CheckpointSnapshot[]): Promise<void>;
  clearAll(): Promise<void>;
}

export interface IWorkspaceBridgePort {
  listWorkspaceContextItems(): Promise<WorkspaceContextItem[]>;
  searchWorkspaceContextItems(query: string): Promise<WorkspaceContextItem[]>;
  readWorkspaceItemContent(item: WorkspaceContextItem): Promise<string>;
  openWorkspaceItem(item: WorkspaceContextItem): Promise<void>;
  insertMarkdownSnippet(
    markdown: string,
    targetDocId?: number | string
  ): Promise<boolean>;
}

export interface SpeechDictationOptions {
  lang?: string;
  onInterim?: (text: string) => void;
  onFinal: (text: string) => void;
  onError?: (message: string) => void;
  onEnd?: () => void;
}

export interface SpeechDictationController {
  stop: () => void;
  abort: () => void;
  isMockFallback: boolean;
}

export interface IVoiceServicePort {
  listVoices(): VoiceOption[];
  generateSynthesizedWavBase64(durationSec: number, baseFreq?: number): string;
  playVoicePreview(voiceId: string): Promise<void>;
  stopVoicePreview(): void;
  speakText(text: string, voiceId?: string): Promise<void>;
  stopSpeaking(): void;
  isSpeechRecognitionSupported(): boolean;
  startSpeechDictation(
    options: SpeechDictationOptions
  ): SpeechDictationController;
}
