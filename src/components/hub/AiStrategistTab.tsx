import React, { useState } from 'react';
import type { HudSnapshot } from '../../game/SkyforgeEngine';
import type { ImportedAssetSummary } from '../../game/assetLoader';

interface AiStrategistTabProps {
  hud: HudSnapshot;
  activeRigLabel: string;
  customRigSummary: ImportedAssetSummary | null;
  darkMode: boolean;
}

export const AiStrategistTab: React.FC<AiStrategistTabProps> = ({
  hud,
  activeRigLabel,
  customRigSummary,
  darkMode,
}) => {
  const [quickPrompt, setQuickPrompt] = useState(
    'How do I counter Golem Chargers and Wisp Kiters simultaneously on Wave 4?',
  );
  const [quickResult, setQuickResult] = useState<{ text: string; latencyMs: number } | null>(null);
  const [quickError, setQuickError] = useState<string | null>(null);
  const [quickLoading, setQuickLoading] = useState(false);

  const [deepPrompt, setDeepPrompt] = useState(
    'Design an optimal 2-player local co-op wave-clear strategy and Blender GLTF rigging checklist to keep draw calls low on mobile.',
  );
  const [deepResult, setDeepResult] = useState<{ text: string; latencyMs: number } | null>(null);
  const [deepError, setDeepError] = useState<string | null>(null);
  const [deepLoading, setDeepLoading] = useState(false);

  const cardBg = darkMode
    ? 'bg-[#101827] border-[#c9933c]/30 text-[#f4ede2]'
    : 'bg-white border-slate-300 text-slate-900';
  const inputBg = darkMode
    ? 'bg-[#0b111d] border-slate-700 text-white'
    : 'bg-slate-50 border-slate-300 text-slate-900';

  const runQuickTip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickPrompt.trim()) return;
    setQuickLoading(true);
    setQuickError(null);
    try {
      const res = await fetch('/api/ai/quick-tip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: quickPrompt,
          context: {
            wave: hud.wave,
            score: hud.score,
            mode: hud.mode,
            rig: activeRigLabel,
          },
        }),
      });
      const data = (await res.json()) as { text?: string; latencyMs?: number; error?: string };
      if (!res.ok) {
        setQuickError(data.error || 'Low-latency callout failed.');
      } else {
        setQuickResult({ text: data.text || '', latencyMs: data.latencyMs || 0 });
      }
    } catch {
      setQuickError('Network unavailable — AI strategist requires an online connection.');
    } finally {
      setQuickLoading(false);
    }
  };

  const runDeepAnalysis = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deepPrompt.trim()) return;
    setDeepLoading(true);
    setDeepError(null);
    try {
      const res = await fetch('/api/ai/deep-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: deepPrompt,
          telemetry: {
            wave: hud.wave,
            score: hud.score,
            kills: hud.kills,
            mode: hud.mode,
            activeRig: activeRigLabel,
            customRig: customRigSummary,
          },
        }),
      });
      const data = (await res.json()) as { text?: string; latencyMs?: number; error?: string };
      if (!res.ok) {
        setDeepError(data.error || 'Deep thinking analysis failed.');
      } else {
        setDeepResult({ text: data.text || '', latencyMs: data.latencyMs || 0 });
      }
    } catch {
      setDeepError('Network unavailable — Deep analysis requires an online connection.');
    } finally {
      setDeepLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Low-Latency Tactical Callout (gemini-3.1-flash-lite) */}
      <form onSubmit={runQuickTip} className={`rounded-xl border p-4 flex flex-col gap-3 ${cardBg}`}>
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-sky-400">
            Instant Tactical Callout
          </h3>
          <span className="rounded bg-sky-500/20 px-2 py-0.5 font-mono text-[10px] font-bold text-sky-300">
            gemini-3.1-flash-lite
          </span>
        </div>
        <textarea
          rows={3}
          value={quickPrompt}
          onChange={(e) => setQuickPrompt(e.target.value)}
          aria-label="Low-latency tactical question"
          className={`w-full rounded-lg border p-2.5 text-xs ${inputBg}`}
        />
        <button
          type="submit"
          disabled={quickLoading}
          className="rounded-lg bg-sky-600 px-4 py-2 text-xs font-bold text-white hover:bg-sky-500 disabled:opacity-50"
        >
          {quickLoading ? 'Responding...' : 'Get Fast Tactical Tip'}
        </button>

        {quickError && (
          <div className="rounded-lg border border-red-500/40 bg-red-950/50 p-2.5 text-xs text-red-200">
            {quickError}
          </div>
        )}
        {quickResult && (
          <div className="rounded-lg border border-sky-500/30 bg-black/20 p-3 text-xs leading-relaxed">
            <div className="mb-1 text-[10px] font-mono text-sky-300">
              Latency: {quickResult.latencyMs}ms
            </div>
            <p className="whitespace-pre-wrap">{quickResult.text}</p>
          </div>
        )}
      </form>

      {/* High-Thinking Deep Strategy & Rig Audit (gemini-4-carbon, ThinkingLevel.HIGH) */}
      <form
        onSubmit={runDeepAnalysis}
        className={`rounded-xl border p-4 flex flex-col gap-3 ${cardBg}`}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#f4d38c]">
            Deep Strategy & Blender Audit
          </h3>
          <span className="rounded bg-amber-500/20 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-300">
            gemini-4-carbon · HIGH
          </span>
        </div>
        <textarea
          rows={3}
          value={deepPrompt}
          onChange={(e) => setDeepPrompt(e.target.value)}
          aria-label="High-thinking deep analysis prompt"
          className={`w-full rounded-lg border p-2.5 text-xs ${inputBg}`}
        />
        <button
          type="submit"
          disabled={deepLoading}
          className="rounded-lg bg-[#c9933c] px-4 py-2 text-xs font-bold text-[#111622] hover:bg-[#dfb058] disabled:opacity-50"
        >
          {deepLoading ? 'Deep Thinking...' : 'Run High-Thinking Analysis'}
        </button>

        {deepError && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-950/60 p-2.5 text-xs text-amber-200">
            {deepError}
          </div>
        )}
        {deepResult && (
          <div className="max-h-56 overflow-y-auto rounded-lg border border-[#c9933c]/35 bg-black/20 p-3 text-xs leading-relaxed">
            <div className="mb-1 text-[10px] font-mono text-amber-300">
              High Thinking · {deepResult.latencyMs}ms
            </div>
            <p className="whitespace-pre-wrap">{deepResult.text}</p>
          </div>
        )}
      </form>
    </div>
  );
};
