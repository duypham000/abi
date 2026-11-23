import type { ArtifactDataPart } from "@/core/interfaces/agent";
import { generateSynthesizedWavBase64 } from "../../voice/voiceService";
import {
  createMockUsage,
  getProviderForModel,
  utf8ToBase64,
  type MockStreamBuilder,
  type StreamScenarioContext,
} from "./streamBuilder";

const GENERATED_DIAGRAM_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="320" viewBox="0 0 720 320">
  <defs>
    <linearGradient id="g1" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#09090b"/>
      <stop offset="100%" stop-color="#172554"/>
    </linearGradient>
    <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#22d3ee"/>
      <stop offset="100%" stop-color="#a855f7"/>
    </linearGradient>
  </defs>
  <rect width="720" height="320" rx="16" fill="url(#g1)"/>
  <circle cx="620" cy="60" r="90" fill="#38bdf8" fill-opacity="0.08"/>
  <circle cx="100" cy="280" r="110" fill="#a855f7" fill-opacity="0.08"/>
  <text x="32" y="44" fill="#f8fafc" font-family="ui-sans-serif,system-ui,sans-serif" font-size="18" font-weight="700">Generative Workspace Studio — Preview &amp; Voice Output</text>
  <rect x="32" y="76" width="200" height="190" rx="12" fill="#0f172a" stroke="#22d3ee" stroke-opacity="0.6"/>
  <text x="48" y="106" fill="#22d3ee" font-family="ui-monospace,monospace" font-size="12" font-weight="700">JSX + WEB PREVIEW</text>
  <rect x="48" y="122" width="168" height="28" rx="6" fill="#1e293b"/>
  <rect x="48" y="160" width="120" height="18" rx="4" fill="#334155"/>
  <rect x="48" y="188" width="144" height="18" rx="4" fill="#334155"/>
  <rect x="48" y="220" width="90" height="28" rx="8" fill="url(#accent)"/>
  <rect x="260" y="76" width="200" height="190" rx="12" fill="#0f172a" stroke="#a855f7" stroke-opacity="0.6"/>
  <text x="276" y="106" fill="#c084fc" font-family="ui-monospace,monospace" font-size="12" font-weight="700">AUDIO + TRANSCRIPT</text>
  <path d="M280 175 Q295 130 310 175 T340 175 T370 175 T400 175 T430 175" fill="none" stroke="#c084fc" stroke-width="3" stroke-linecap="round"/>
  <text x="276" y="232" fill="#cbd5e1" font-family="ui-sans-serif,system-ui,sans-serif" font-size="11">16-bit PCM WAV + Timed Cues</text>
  <rect x="488" y="76" width="200" height="190" rx="12" fill="#0f172a" stroke="#34d399" stroke-opacity="0.6"/>
  <text x="504" y="106" fill="#34d399" font-family="ui-monospace,monospace" font-size="12" font-weight="700">ARTIFACT DRAWER</text>
  <text x="504" y="142" fill="#e2e8f0" font-family="ui-sans-serif,system-ui,sans-serif" font-size="12">Versioned Live Sandboxes</text>
  <text x="504" y="166" fill="#94a3b8" font-family="ui-sans-serif,system-ui,sans-serif" font-size="11">Copy • Download • Insert Doc</text>
</svg>`;

const INTERACTIVE_HTML_PREVIEW = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, -apple-system, sans-serif; background: #09090b; color: #fafafa; padding: 18px; }
  .shell { border: 1px solid #27272a; border-radius: 14px; background: #18181b; padding: 16px; }
  .row { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
  button { background: #2563eb; color: #fff; border: 0; border-radius: 8px; padding: 7px 12px; font-size: 12px; cursor: pointer; font-weight: 600; }
  button:hover { background: #1d4ed8; }
  .metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 14px; }
  .tile { background: #09090b; border: 1px solid #27272a; border-radius: 10px; padding: 10px; }
  .tile small { color: #a1a1aa; display: block; font-size: 11px; }
  .tile span { font-size: 18px; font-weight: 700; margin-top: 4px; display: block; }
</style>
</head>
<body>
  <div class="shell">
    <div class="row">
      <div>
        <div style="font-weight:700;font-size:15px;">Tomo Workspace Release Pulse</div>
        <div style="color:#a1a1aa;font-size:12px;">Interactive sandboxed HTML preview</div>
      </div>
      <button id="refreshBtn" type="button">Ping Nodes</button>
    </div>
    <div class="metrics">
      <div class="tile"><small>Active Rooms</small><span id="rooms">12</span></div>
      <div class="tile"><small>Yjs Sync RTT</small><span id="rtt">11ms</span></div>
      <div class="tile"><small>Build Status</small><span style="color:#34d399;">Clean</span></div>
    </div>
  </div>
  <script>
    const btn = document.getElementById("refreshBtn");
    const rttEl = document.getElementById("rtt");
    btn.addEventListener("click", () => {
      const nextRtt = 8 + Math.floor(Math.random() * 9);
      rttEl.textContent = nextRtt + "ms";
      console.log("[TomoPreview] Pinged Yjs hub -> " + nextRtt + "ms");
    });
  </script>
</body>
</html>`;

export async function runGenerativeUiAndMediaScenario(
  ctx: StreamScenarioContext,
  builder: MockStreamBuilder
): Promise<void> {
  const { config, prompt } = ctx;
  const nowIso = new Date().toISOString();
  const provider = getProviderForModel(config.modelId);
  const voiceId = config.voiceId || "nova";

  builder.start(undefined, {
    modelId: config.modelId,
    provider,
    createdAt: nowIso,
    scenarioTag: "generative-media",
  });

  await builder.step(async () => {
    await builder.reasoning(
      `Generating interactive preview, SVG architecture visual, playable synthesized WAV speech, and versioned artifact for: "${prompt.slice(0, 80)}".`
    );

    if (builder.isToolEnabled("generate_image")) {
      await builder.toolCompleted(
        "generate_image",
        {
          prompt: "Tomo generative UI + voice + artifact studio architecture card",
          aspectRatio: "16:9",
          style: "dark-technical-diagram",
        },
        {
          mediaType: "image/svg+xml",
          width: 720,
          height: 320,
          alt: "Generative Workspace Studio diagram",
        },
        "Generate Architecture Graphic"
      );
    }

    builder.data("generated-image", {
      prompt: "Tomo generative UI + voice + artifact studio architecture card",
      base64: utf8ToBase64(GENERATED_DIAGRAM_SVG),
      mediaType: "image/svg+xml",
      alt: "Generative Workspace Studio — Preview & Voice Output",
    });

    // Progressive JSXPreview stream
    builder.data(
      "jsx-preview",
      {
        title: "Streaming JSX Card Preview",
        isStreaming: true,
        jsx: `<div className="rounded-lg border bg-card p-4 space-y-2">\n  <div className="flex items-center justify-between">\n    <span className="font-semibold text-sm">Release Pulse Card</span>`,
      },
      "jsx-preview-live"
    );

    await builder.delay(3);

    builder.data(
      "jsx-preview",
      {
        title: "Streaming JSX Card Preview",
        isStreaming: false,
        jsx: `<div className="rounded-lg border bg-card p-4 space-y-2">\n  <div className="flex items-center justify-between">\n    <span className="font-semibold text-sm">Release Pulse Card</span>\n    <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-500">Live</span>\n  </div>\n  <p className="text-xs text-muted-foreground">Interactive JSX component rendered directly in the conversation stream.</p>\n</div>`,
      },
      "jsx-preview-live"
    );

    const logs = [
      {
        level: "log" as const,
        message: "[TomoPreview] Release Pulse widget hydrated in sandbox",
        timestampIso: nowIso,
      },
      {
        level: "log" as const,
        message: "[AudioSynth] Generated 16-bit PCM WAV (3.6s, 16kHz)",
        timestampIso: nowIso,
      },
    ];

    builder.data("web-preview", {
      title: "Tomo Release Pulse (Interactive HTML)",
      defaultUrl: "https://tomo.local/preview/release-pulse",
      htmlSrcDoc: INTERACTIVE_HTML_PREVIEW,
      consoleLogs: logs,
    });

    builder.data("sandbox", {
      title: "Sandbox: Audio Frame Verification",
      language: "typescript",
      code: `const sampleRate = 16000;\nconst durationSec = 3.6;\nconsole.log({ frames: Math.floor(sampleRate * durationSec), channels: 1 });`,
      output: `{ frames: 57600, channels: 1 }`,
      state: "output-available",
    });

    if (builder.isToolEnabled("synthesize_speech")) {
      await builder.toolCompleted(
        "synthesize_speech",
        {
          text: "Interactive preview, architecture graphic, and release pulse artifact are ready.",
          voiceId,
          format: "wav",
        },
        {
          voiceId,
          durationSec: 3.6,
          mediaType: "audio/wav",
          segmentCount: 3,
        },
        "Synthesize Voice Narration"
      );
    }

    const base64Audio = generateSynthesizedWavBase64(3.6, 440);
    builder.data("audio-speech", {
      title: `Voice Briefing (${voiceId})`,
      voiceId,
      durationSec: 3.6,
      base64Audio,
      mediaType: "audio/wav",
      segments: [
        {
          text: "Interactive Release Pulse widget is now live,",
          startSecond: 0,
          endSecond: 1.2,
        },
        {
          text: "paired with the generated architecture graphic",
          startSecond: 1.2,
          endSecond: 2.4,
        },
        {
          text: "and a versioned HTML artifact in your drawer.",
          startSecond: 2.4,
          endSecond: 3.6,
        },
      ],
    });

    const artifact: ArtifactDataPart = {
      id: `art-ui-${Date.now().toString(36)}`,
      version: 1,
      title: "ReleasePulsePreview.html",
      description: "Self-contained interactive HTML/JS Release Pulse widget.",
      kind: "web",
      language: "html",
      content: INTERACTIVE_HTML_PREVIEW,
      previewUrl: "https://tomo.local/preview/release-pulse",
      consoleLogs: logs,
      updatedAt: nowIso,
    };
    builder.data("artifact", artifact, artifact.id);

    await builder.text(
      `Generated your **multimodal preview suite**:\n- **Image:** Crisp SVG architecture diagram embedded as base64.\n- **AudioPlayer + Transcription:** Playable 16-bit PCM WAV with timed word segments.\n- **JSXPreview & WebPreview:** Interactive widget + inspectable **Artifact Drawer** entry.`
    );

    builder.data("suggestions", {
      items: [
        "/workflow Orchestrate a 3-subagent review of this UI widget",
        "/code Convert ReleasePulsePreview into a React + Tailwind module",
      ],
    });
  });

  builder.finish(
    {
      durationMs: builder.elapsedMs(),
      usage: createMockUsage(1410, 1080, 220, 180),
      finishReason: "stop",
    },
    "stop"
  );
}
