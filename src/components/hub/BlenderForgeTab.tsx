import React, { useEffect, useRef, useState } from 'react';
import {
  exportBuiltinRigAsGlb,
  loadBlenderAssetBuffer,
  loadBlenderAssetFile,
  type ImportedAssetSummary,
  type LoadedCustomRig,
} from '../../game/assetLoader';
import { BUILTIN_RIGS, type BuiltinRigId } from '../../game/proceduralModels';
import { USER_TEXTURE_PATHS } from '../../game/darkFantasyTextures';
import { generateBlenderAddonScript } from '../../utils/blenderBridge';

type ImportTargetSlot = 'hero' | 'prop' | 'enemy';

const CGTRADER_CATALOG = [
  {
    label: 'Free Fantasy Characters',
    detail: 'Dark elves, knights, archers (.GLB / .FBX)',
    url: 'https://www.cgtrader.com/free-3d-models/character/fantasy',
  },
  {
    label: 'Free Bows & Weapons',
    detail: 'Recurve bows, glaives, runic swords',
    url: 'https://www.cgtrader.com/free-3d-models/military/melee',
  },
  {
    label: 'Free Gothic Arenas & Ruins',
    detail: 'Cathedrals, pillars, citadel props',
    url: 'https://www.cgtrader.com/free-3d-models/architectural/other',
  },
  {
    label: 'Free Monsters & Bosses',
    detail: 'Golems, wraiths, dark creatures',
    url: 'https://www.cgtrader.com/free-3d-models/character/other',
  },
] as const;

const DARK_RANGER_TEXTURES = [
  { label: 'Armor Filigree', src: USER_TEXTURE_PATHS.armorAtlas },
  { label: 'Crimson Cloak', src: USER_TEXTURE_PATHS.cloakAtlas },
  { label: 'Carved Bow', src: USER_TEXTURE_PATHS.bowAtlas },
  { label: 'Silver Hair', src: USER_TEXTURE_PATHS.hair },
  { label: 'Elven Skin', src: USER_TEXTURE_PATHS.skin },
  { label: 'Scratched Iron', src: USER_TEXTURE_PATHS.metal },
] as const;

interface BlenderForgeTabProps {
  activeRigId: BuiltinRigId;
  customRigSummary: ImportedAssetSummary | null;
  customPropSummary: ImportedAssetSummary | null;
  customEnemySummary: ImportedAssetSummary | null;
  searchQuery: string;
  darkMode: boolean;
  onSelectBuiltinRig: (rigId: BuiltinRigId) => void;
  onApplyCustomRig: (loaded: LoadedCustomRig) => void;
  onApplyCustomSceneProp: (loaded: LoadedCustomRig | null) => void;
  onApplyCustomEnemyRig: (loaded: LoadedCustomRig | null) => void;
}

interface BridgeSession {
  sessionId: string;
  token: string;
  expiresAt: string;
}

export const BlenderForgeTab: React.FC<BlenderForgeTabProps> = ({
  activeRigId,
  customRigSummary,
  customPropSummary,
  customEnemySummary,
  searchQuery,
  darkMode,
  onSelectBuiltinRig,
  onApplyCustomRig,
  onApplyCustomSceneProp,
  onApplyCustomEnemyRig,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lastVersionRef = useRef<number>(0);
  const onApplyRef = useRef(onApplyCustomRig);
  onApplyRef.current = onApplyCustomRig;

  const [importTarget, setImportTarget] = useState<ImportTargetSlot>('hero');
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Live Blender Bridge state (token held strictly in React memory)
  const [bridgeSession, setBridgeSession] = useState<BridgeSession | null>(null);
  const [bridgeBusy, setBridgeBusy] = useState(false);
  const [bridgePushingTest, setBridgePushingTest] = useState(false);
  const [bridgeVersion, setBridgeVersion] = useState(0);
  const [bridgeLastFile, setBridgeLastFile] = useState<string | null>(null);
  const [bridgeError, setBridgeError] = useState<string | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const serverOrigin = typeof window !== 'undefined' ? window.location.origin : '';

  // Poll active Live Blender Bridge session for newly pushed .glb assets
  useEffect(() => {
    if (!bridgeSession) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch(`/api/blender-bridge/${bridgeSession.sessionId}/status`, {
          headers: { Authorization: `Bearer ${bridgeSession.token}` },
          cache: 'no-store',
        });
        if (!res.ok) {
          if (res.status === 404 && !cancelled) {
            setBridgeError('Bridge session expired. Start a fresh session to reconnect Blender.');
            setBridgeSession(null);
          }
          return;
        }
        const data = (await res.json()) as {
          version: number;
          fileName: string | null;
        };
        if (cancelled) return;

        if (data.version > lastVersionRef.current) {
          const assetRes = await fetch(`/api/blender-bridge/${bridgeSession.sessionId}/asset`, {
            headers: { Authorization: `Bearer ${bridgeSession.token}` },
            cache: 'no-store',
          });
          if (!assetRes.ok || cancelled) return;
          const fileName = assetRes.headers.get('X-Blender-Filename') || data.fileName || 'blender-live-sync.glb';
          const buffer = await assetRes.arrayBuffer();
          if (cancelled) return;

          const loaded = await loadBlenderAssetBuffer(buffer, fileName);
          if (cancelled) return;

          lastVersionRef.current = data.version;
          setBridgeVersion(data.version);
          setBridgeLastFile(fileName);
          onApplyRef.current(loaded);
          setStatusMsg(
            `Live Bridge Sync #${data.version}: Hot-swapped ${fileName} directly onto Player 1 in the 3D arena!`,
          );
          setErrorMsg(null);
        }
      } catch {
        // Ignore transient network poll hiccups while offline
      }
    };

    const timer = window.setInterval(() => {
      void poll();
    }, 1800);
    void poll();

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [bridgeSession]);

  const cardBg = darkMode
    ? 'bg-[#101827] border-[#c9933c]/30 text-[#f4ede2]'
    : 'bg-white border-slate-300 text-slate-900';
  const mutedText = darkMode ? 'text-slate-300' : 'text-slate-600';

  const handleStartBridge = async () => {
    setBridgeBusy(true);
    setBridgeError(null);
    try {
      const res = await fetch('/api/blender-bridge/sessions', { method: 'POST' });
      if (!res.ok) {
        throw new Error(`Unable to start Live Blender Bridge (HTTP ${res.status}).`);
      }
      const created = (await res.json()) as BridgeSession;
      lastVersionRef.current = 0;
      setBridgeVersion(0);
      setBridgeLastFile(null);
      setBridgeSession(created);
    } catch (err: unknown) {
      setBridgeError(err instanceof Error ? err.message : 'Failed to start bridge session.');
    } finally {
      setBridgeBusy(false);
    }
  };

  const handleStopBridge = async () => {
    if (!bridgeSession) return;
    const current = bridgeSession;
    setBridgeSession(null);
    lastVersionRef.current = 0;
    setBridgeVersion(0);
    setBridgeLastFile(null);
    try {
      await fetch(`/api/blender-bridge/${current.sessionId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${current.token}` },
      });
    } catch {
      // Best-effort cleanup
    }
  };

  const handleDownloadAddon = () => {
    if (!bridgeSession) return;
    const script = generateBlenderAddonScript({
      serverUrl: serverOrigin,
      sessionId: bridgeSession.sessionId,
      token: bridgeSession.token,
    });
    const blob = new Blob([script], { type: 'text/x-python;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'skyforge_blender_bridge.py';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setStatusMsg(
      'Downloaded skyforge_blender_bridge.py — install it in Blender (Edit > Preferences > Add-ons > Install) to push rigs with one click.',
    );
  };

  const handleTestLivePush = async () => {
    if (!bridgeSession) return;
    setBridgePushingTest(true);
    setBridgeError(null);
    try {
      const blob = await exportBuiltinRigAsGlb(activeRigId);
      const buffer = await blob.arrayBuffer();
      const res = await fetch(`/api/blender-bridge/${bridgeSession.sessionId}/push`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${bridgeSession.token}`,
          'Content-Type': 'model/gltf-binary',
          'X-Blender-Filename': `blender_${activeRigId}_live.glb`,
        },
        body: buffer,
      });
      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(errBody.error || `Push failed (HTTP ${res.status})`);
      }
      // Immediately fetch and apply the pushed asset rather than waiting for next poll tick
      const assetRes = await fetch(`/api/blender-bridge/${bridgeSession.sessionId}/asset`, {
        headers: { Authorization: `Bearer ${bridgeSession.token}` },
        cache: 'no-store',
      });
      if (assetRes.ok) {
        const version = Number(assetRes.headers.get('X-Blender-Version') || bridgeVersion + 1);
        const fileName = assetRes.headers.get('X-Blender-Filename') || `blender_${activeRigId}_live.glb`;
        const received = await assetRes.arrayBuffer();
        const loaded = await loadBlenderAssetBuffer(received, fileName);
        lastVersionRef.current = version;
        setBridgeVersion(version);
        setBridgeLastFile(fileName);
        onApplyCustomRig(loaded);
        setStatusMsg(
          `Live Bridge Sync #${version}: Hot-swapped ${fileName} directly onto Player 1 in the 3D arena!`,
        );
      }
    } catch (err: unknown) {
      setBridgeError(err instanceof Error ? err.message : 'Test bridge push failed.');
    } finally {
      setBridgePushingTest(false);
    }
  };

  const handleCopy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(label);
      window.setTimeout(() => setCopiedField(null), 1800);
    } catch {
      // Clipboard may be unavailable in restricted contexts
    }
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setLoading(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const loaded = await loadBlenderAssetFile(file);
      if (importTarget === 'prop') {
        onApplyCustomSceneProp(loaded);
        setStatusMsg(
          `Placed ${loaded.summary.fileName} (${loaded.summary.format}) onto the 4 perimeter arena pedestals!`,
        );
      } else if (importTarget === 'enemy') {
        onApplyCustomEnemyRig(loaded);
        setStatusMsg(
          `Assigned ${loaded.summary.fileName} (${loaded.summary.format}) to incoming Arena Enemies!`,
        );
      } else {
        onApplyCustomRig(loaded);
        setStatusMsg(
          `Loaded ${loaded.summary.fileName} (${loaded.summary.format}) directly onto Player 1 in the 3D arena!`,
        );
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to parse 3D file.');
    } finally {
      setLoading(false);
    }
  };

  const handleExportGlb = async () => {
    setExporting(true);
    setErrorMsg(null);
    try {
      const blob = await exportBuiltinRigAsGlb(activeRigId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `skyforge-${activeRigId}-blender-ready.glb`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setStatusMsg(
        `Exported skyforge-${activeRigId}-blender-ready.glb — import it into Blender, sculpt or recolor it, and drop it back here.`,
      );
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'GLB export failed.');
    } finally {
      setExporting(false);
    }
  };

  const q = searchQuery.trim().toLowerCase();
  const filteredRigs = BUILTIN_RIGS.filter(
    (r) =>
      !q ||
      r.name.toLowerCase().includes(q) ||
      r.role.toLowerCase().includes(q) ||
      r.id.toLowerCase().includes(q),
  );

  return (
    <div className="space-y-4">
      {/* Live Blender Bridge (Direct Add-on Connection) */}
      <div className={`rounded-xl border p-4 ${cardBg}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-display text-sm font-bold tracking-wide">
              <span className={darkMode ? 'text-[#67e8f9]' : 'text-sky-800'}>
                Live Blender Bridge (Blender 3.6 / 4.x Add-on)
              </span>
            </h3>
            <p className={`mt-0.5 text-xs ${mutedText}`}>
              Connect your desktop Blender directly to Skyforge Arena to push edited characters or auto-sync on Ctrl+S.
            </p>
          </div>

          {!bridgeSession ? (
            <button
              type="button"
              disabled={bridgeBusy}
              onClick={() => void handleStartBridge()}
              className="rounded-lg bg-sky-500 px-3.5 py-2 text-xs font-extrabold text-slate-950 hover:bg-sky-400 disabled:opacity-50"
            >
              {bridgeBusy ? 'Starting Bridge...' : 'Start Live Bridge'}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleStopBridge()}
              className="rounded-lg border border-red-400/60 bg-red-950/60 px-3 py-1.5 text-xs font-bold text-red-200 hover:bg-red-900/70"
            >
              Disconnect Bridge
            </button>
          )}
        </div>

        {bridgeSession && (
          <div className="mt-3.5 space-y-3 border-t border-slate-700/40 pt-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-emerald-400">
                Listening for Blender pushes
                {bridgeVersion > 0 && bridgeLastFile
                  ? ` · Sync #${bridgeVersion} (${bridgeLastFile})`
                  : ' · Waiting for first export'}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownloadAddon}
                  className="rounded-lg bg-[#c9933c] px-3 py-1.5 text-xs font-bold text-[#111622] hover:bg-[#dfb058]"
                >
                  Download Blender Add-on (.py)
                </button>
                <button
                  type="button"
                  disabled={bridgePushingTest}
                  onClick={() => void handleTestLivePush()}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                    darkMode
                      ? 'border-sky-400/50 bg-[#182438] text-sky-200 hover:bg-[#223450]'
                      : 'border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200'
                  } disabled:opacity-50`}
                >
                  {bridgePushingTest ? 'Pushing...' : 'Test Live Push'}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
              <div className={`rounded-lg border p-2.5 ${darkMode ? 'border-slate-700 bg-[#0b111d]' : 'border-slate-200 bg-slate-50'}`}>
                <div className="flex items-center justify-between text-[10px] font-bold uppercase opacity-70">
                  <span>Server URL</span>
                  <button
                    type="button"
                    onClick={() => void handleCopy('url', serverOrigin)}
                    className="text-sky-400 hover:underline"
                  >
                    {copiedField === 'url' ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <div className="mt-1 truncate font-mono-num text-[11px]">{serverOrigin}</div>
              </div>

              <div className={`rounded-lg border p-2.5 ${darkMode ? 'border-slate-700 bg-[#0b111d]' : 'border-slate-200 bg-slate-50'}`}>
                <div className="flex items-center justify-between text-[10px] font-bold uppercase opacity-70">
                  <span>Session ID</span>
                  <button
                    type="button"
                    onClick={() => void handleCopy('session', bridgeSession.sessionId)}
                    className="text-sky-400 hover:underline"
                  >
                    {copiedField === 'session' ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <div className="mt-1 truncate font-mono-num text-[11px]">{bridgeSession.sessionId}</div>
              </div>

              <div className={`rounded-lg border p-2.5 ${darkMode ? 'border-slate-700 bg-[#0b111d]' : 'border-slate-200 bg-slate-50'}`}>
                <div className="flex items-center justify-between text-[10px] font-bold uppercase opacity-70">
                  <span>Bridge Token</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowToken((v) => !v)}
                      className="text-slate-400 hover:underline"
                    >
                      {showToken ? 'Hide' : 'Show'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleCopy('token', bridgeSession.token)}
                      className="text-sky-400 hover:underline"
                    >
                      {copiedField === 'token' ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
                <div className="mt-1 truncate font-mono-num text-[11px]">
                  {showToken ? bridgeSession.token : '••••••••••••••••••••••••'}
                </div>
              </div>
            </div>

            <ol className={`list-decimal pl-4 space-y-1 text-[11px] ${mutedText}`}>
              <li>
                Click <strong>Download Blender Add-on (.py)</strong> — your Server URL, Session ID, and temporary Bridge Token are already pre-filled.
              </li>
              <li>
                In Blender, open <strong>Edit → Preferences → Add-ons → Install...</strong>, select <code>skyforge_blender_bridge.py</code>, and enable <strong>Skyforge Arena Live Bridge</strong>.
              </li>
              <li>
                Press <strong>N</strong> in the 3D Viewport, open the <strong>Skyforge</strong> tab, and click <strong>Push Character to Arena</strong> (or enable <strong>Auto-Sync on Save</strong>).
              </li>
            </ol>
          </div>
        )}

        {bridgeError && (
          <p className="mt-3 rounded-md border border-red-500/40 bg-red-900/50 px-3 py-1.5 text-xs text-red-200">
            {bridgeError}
          </p>
        )}
      </div>

      {/* CGTrader Free 3D Models Hub + Active Dark Ranger Texture Pack */}
      <div className={`rounded-xl border p-4 ${cardBg}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-display text-sm font-bold tracking-wide">
              <span className={darkMode ? 'text-[#e8c684]' : 'text-amber-900'}>
                CGTrader Free 3D Model Library (.GLB / .GLTF / .FBX)
              </span>
            </h3>
            <p className={`mt-0.5 text-xs ${mutedText}`}>
              Download any free character, weapon, gothic arena prop, or monster from CGTrader, then drop the .GLB/.FBX below into any live scene slot.
            </p>
          </div>
          <a
            href="https://www.cgtrader.com/free-3d-models"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg bg-[#9f1d3f] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-[#b8254c]"
          >
            Browse CGTrader Free
          </a>
        </div>

        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {CGTRADER_CATALOG.map((item) => (
            <a
              key={item.label}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`rounded-lg border p-2.5 transition-colors ${
                darkMode
                  ? 'border-[#c8a96e]/30 bg-[#0d0a16] hover:border-[#e8c684]'
                  : 'border-slate-200 bg-slate-50 hover:border-amber-500'
              }`}
            >
              <div className="text-xs font-bold">{item.label}</div>
              <div className={`mt-0.5 text-[11px] ${mutedText}`}>{item.detail}</div>
            </a>
          ))}
        </div>

        <div className="mt-3.5 border-t border-slate-700/40 pt-3">
          <div className="text-[10px] font-bold uppercase tracking-wider opacity-75">
            Bound Dark Ranger PBR Texture Pack (Active in 3D Scene)
          </div>
          <div className="mt-2 grid grid-cols-3 sm:grid-cols-6 gap-2">
            {DARK_RANGER_TEXTURES.map((tex) => (
              <div
                key={tex.label}
                className={`overflow-hidden rounded-md border text-center ${
                  darkMode ? 'border-slate-700 bg-[#0b0814]' : 'border-slate-200 bg-slate-50'
                }`}
              >
                <img
                  src={tex.src}
                  alt={tex.label}
                  className="h-12 w-full object-cover"
                  loading="lazy"
                />
                <div className="truncate px-1 py-1 text-[10px] font-medium">{tex.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Multi-Slot CGTrader / Blender GLB/GLTF/FBX Dropzone */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void handleFile(e.dataTransfer.files?.[0]);
        }}
        className={`rounded-xl border-2 border-dashed p-5 text-center transition-colors ${
          darkMode
            ? 'border-[#c8a96e]/55 bg-[#120d1e]'
            : 'border-amber-500/70 bg-amber-50/70'
        }`}
      >
        <h3 className="font-display text-base font-bold">
          <span className={darkMode ? 'text-[#e8c684]' : 'text-amber-900'}>
            Import CGTrader / Blender 3D Asset (.GLB / .GLTF / .FBX)
          </span>
        </h3>
        <p className={`mt-1 text-xs ${mutedText}`}>
          Choose a target slot below, then drop any .GLB, .GLTF, or .FBX file to auto-normalize scale, ground feet at y = 0, and bind animations live.
        </p>

        {/* Target Slot Selector */}
        <div className="mt-3 inline-flex flex-wrap items-center justify-center gap-1.5 rounded-lg border border-[#c8a96e]/35 bg-black/25 p-1">
          {(
            [
              { id: 'hero', label: 'Player 1 Hero' },
              { id: 'prop', label: 'Arena Props (x4)' },
              { id: 'enemy', label: 'Enemy Models' },
            ] as const
          ).map((slot) => (
            <button
              key={slot.id}
              type="button"
              onClick={() => setImportTarget(slot.id)}
              className={`rounded-md px-3 py-1 text-xs font-bold transition-colors ${
                importTarget === slot.id
                  ? 'bg-[#9f1d3f] text-white'
                  : darkMode
                    ? 'text-slate-300 hover:bg-white/10'
                    : 'text-slate-700 hover:bg-black/10'
              }`}
            >
              {slot.label}
            </button>
          ))}
        </div>

        {(customPropSummary || customEnemySummary) && (
          <div className="mt-2.5 flex flex-wrap items-center justify-center gap-2 text-[11px]">
            {customPropSummary && (
              <span className="inline-flex items-center gap-1.5 rounded bg-purple-900/50 border border-purple-400/40 px-2.5 py-0.5 text-purple-200">
                Props: {customPropSummary.fileName}
                <button
                  type="button"
                  onClick={() => onApplyCustomSceneProp(null)}
                  className="font-bold text-rose-300 hover:underline"
                >
                  Clear
                </button>
              </span>
            )}
            {customEnemySummary && (
              <span className="inline-flex items-center gap-1.5 rounded bg-rose-900/50 border border-rose-400/40 px-2.5 py-0.5 text-rose-200">
                Enemies: {customEnemySummary.fileName}
                <button
                  type="button"
                  onClick={() => onApplyCustomEnemyRig(null)}
                  className="font-bold text-amber-300 hover:underline"
                >
                  Clear
                </button>
              </span>
            )}
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".glb,.gltf,.fbx"
          className="hidden"
          onChange={(e) => void handleFile(e.target.files?.[0])}
        />

        <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
          <button
            type="button"
            disabled={loading}
            onClick={() => fileInputRef.current?.click()}
            className="rounded-lg bg-[#9f1d3f] border border-[#e8c684]/50 px-4 py-2 text-xs font-bold text-white hover:bg-[#b8254c] disabled:opacity-50"
          >
            {loading ? 'Parsing 3D Asset...' : 'Upload .GLB / .GLTF / .FBX'}
          </button>
          <button
            type="button"
            disabled={exporting}
            onClick={() => void handleExportGlb()}
            className={`rounded-lg border px-4 py-2 text-xs font-semibold ${
              darkMode
                ? 'border-[#67e8f9]/50 bg-[#182438] text-[#bae6fd] hover:bg-[#21314b]'
                : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-100'
            }`}
          >
            {exporting ? 'Exporting...' : 'Export Active Rig (.GLB for Blender)'}
          </button>
        </div>

        {statusMsg && (
          <p className="mt-3 rounded-md bg-emerald-900/50 border border-emerald-500/40 px-3 py-1.5 text-xs text-emerald-200">
            {statusMsg}
          </p>
        )}
        {errorMsg && (
          <p className="mt-3 rounded-md bg-red-900/50 border border-red-500/40 px-3 py-1.5 text-xs text-red-200">
            {errorMsg}
          </p>
        )}
      </div>

      {/* Live Custom Rig Telemetry Inspector */}
      {customRigSummary && (
        <div className={`rounded-xl border p-4 ${cardBg}`}>
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-sky-400">
              Active Custom Blender Rig
            </h4>
            <span className="rounded bg-sky-500/20 px-2 py-0.5 font-mono-num text-[11px] font-bold text-sky-300">
              {customRigSummary.format}
            </span>
          </div>
          <p className="mt-1 text-sm font-semibold">{customRigSummary.fileName}</p>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
            <div className="rounded bg-black/20 p-2">
              <div className="text-[10px] uppercase opacity-70">Meshes</div>
              <div className="font-mono-num text-sm font-bold">{customRigSummary.meshCount}</div>
            </div>
            <div className="rounded bg-black/20 p-2">
              <div className="text-[10px] uppercase opacity-70">Triangles</div>
              <div className="font-mono-num text-sm font-bold">
                {customRigSummary.triangleCount.toLocaleString()}
              </div>
            </div>
            <div className="rounded bg-black/20 p-2">
              <div className="text-[10px] uppercase opacity-70">Materials</div>
              <div className="font-mono-num text-sm font-bold">{customRigSummary.materialCount}</div>
            </div>
            <div className="rounded bg-black/20 p-2">
              <div className="text-[10px] uppercase opacity-70">Clips</div>
              <div className="font-mono-num text-sm font-bold">
                {customRigSummary.animationNames.length}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Ready-Made Procedural Hero Rigs */}
      <div>
        <h4 className="mb-2 text-xs font-bold uppercase tracking-wider opacity-80">
          Ready-Made Arena Rigs
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {filteredRigs.map((rig) => {
            const isSelected = !customRigSummary && activeRigId === rig.id;
            return (
              <button
                key={rig.id}
                type="button"
                onClick={() => onSelectBuiltinRig(rig.id)}
                className={`rounded-xl border p-3.5 text-left transition-all ${
                  isSelected
                    ? 'border-[#f4d38c] bg-[#1e2c45] text-[#f8fafc] shadow-md'
                    : cardBg
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="h-3.5 w-3.5 rounded-sm border border-white/30"
                    style={{ backgroundColor: rig.primaryHex }}
                  />
                  <span
                    className="h-3.5 w-3.5 rounded-sm border border-white/30"
                    style={{ backgroundColor: rig.accentHex }}
                  />
                  <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-[#f4d38c]">
                    {isSelected ? 'Equipped' : 'Equip'}
                  </span>
                </div>
                <div className="mt-2 text-sm font-bold">{rig.name}</div>
                <div className={`mt-0.5 text-xs ${isSelected ? 'text-slate-300' : mutedText}`}>
                  {rig.role}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
