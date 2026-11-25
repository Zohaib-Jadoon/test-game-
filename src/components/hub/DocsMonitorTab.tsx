import React from 'react';
import type { TelemetrySample } from '../../game/SkyforgeEngine';
import { DEVELOPER_DOCS } from '../../utils/docsData';

interface DocsMonitorTabProps {
  telemetry: TelemetrySample;
  fpsHistory: number[];
  searchQuery: string;
  darkMode: boolean;
  onLogTelemetryToSql: () => Promise<void>;
  telemetryFeedback: string | null;
}

export const DocsMonitorTab: React.FC<DocsMonitorTabProps> = ({
  telemetry,
  fpsHistory,
  searchQuery,
  darkMode,
  onLogTelemetryToSql,
  telemetryFeedback,
}) => {
  const cardBg = darkMode
    ? 'bg-[#101827] border-[#c9933c]/30 text-[#f4ede2]'
    : 'bg-white border-slate-300 text-slate-900';

  const q = searchQuery.trim().toLowerCase();
  const docs = DEVELOPER_DOCS.filter(
    (d) =>
      !q ||
      d.title.toLowerCase().includes(q) ||
      d.summary.toLowerCase().includes(q) ||
      d.category.toLowerCase().includes(q) ||
      d.bullets.some((b) => b.toLowerCase().includes(q)),
  );

  return (
    <div className="space-y-4">
      {/* Real-Time Performance Monitoring Dashboard */}
      <div className={`rounded-xl border p-4 ${cardBg}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-sky-400">
              Real-Time Renderer & Sync Performance Monitor
            </h3>
            <p className="text-[11px] opacity-75">
              Pipeline: {telemetry.isSoftwareGl ? 'Software WebGL (Paced)' : 'Hardware GPU WebGL2'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void onLogTelemetryToSql()}
            className="rounded-lg border border-sky-400/50 px-3 py-1.5 text-xs font-semibold text-sky-300 hover:bg-sky-500/15"
          >
            Snapshot to Cloud SQL
          </button>
        </div>

        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center">
          <div className="rounded-lg bg-black/20 p-2.5">
            <div className="text-[10px] uppercase opacity-70">FPS</div>
            <div className="font-mono-num text-lg font-bold text-emerald-400">{telemetry.fps}</div>
          </div>
          <div className="rounded-lg bg-black/20 p-2.5">
            <div className="text-[10px] uppercase opacity-70">Frame Time</div>
            <div className="font-mono-num text-lg font-bold text-sky-300">
              {telemetry.frameMs}ms
            </div>
          </div>
          <div className="rounded-lg bg-black/20 p-2.5">
            <div className="text-[10px] uppercase opacity-70">Draw Calls</div>
            <div className="font-mono-num text-lg font-bold text-[#f4d38c]">
              {telemetry.drawCalls}
            </div>
          </div>
          <div className="rounded-lg bg-black/20 p-2.5">
            <div className="text-[10px] uppercase opacity-70">Triangles</div>
            <div className="font-mono-num text-lg font-bold">
              {telemetry.triangles.toLocaleString()}
            </div>
          </div>
        </div>

        {/* Minimal Sparkline Bar Chart */}
        <div className="mt-3 flex h-12 items-end gap-1 rounded-lg bg-black/20 px-2 py-1.5">
          {fpsHistory.map((val, idx) => (
            <div
              key={idx}
              className="flex-1 rounded-t bg-sky-400/80"
              style={{ height: `${Math.max(12, Math.min(100, (val / 65) * 100))}%` }}
            />
          ))}
        </div>
        {telemetryFeedback && (
          <p className="mt-2 text-xs text-emerald-400">{telemetryFeedback}</p>
        )}
      </div>

      {/* Comprehensive Developer Documentation Suite */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#f4d38c]">
          Developer & Blender Pipeline Documentation ({docs.length})
        </h3>
        {docs.map((doc) => (
          <article key={doc.id} className={`rounded-xl border p-4 ${cardBg}`}>
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-bold">{doc.title}</h4>
              <span className="rounded bg-[#c9933c]/20 px-2 py-0.5 text-[10px] font-bold uppercase text-[#f4d38c]">
                {doc.category}
              </span>
            </div>
            <p className="mt-1 text-xs opacity-80">{doc.summary}</p>
            <ul className="mt-2.5 list-disc space-y-1 pl-4 text-xs opacity-90">
              {doc.bullets.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </div>
  );
};
