import React, { useState } from 'react';
import { listManifestAssets } from '../../game/assets/manifest';
import type { AssetCategory } from '../../game/types';
import {
  generateBlenderAddonScript,
  MAX_BRIDGE_GLB_BYTES,
  validateGlbHeader,
} from '../../utils/blenderBridge';

interface BlenderDevDrawerProps {
  onClose: () => void;
  onPreviewGlb: (assetId: string, buffer: ArrayBuffer, category: AssetCategory) => Promise<void>;
}

export const BlenderDevDrawer: React.FC<BlenderDevDrawerProps> = ({ onClose, onPreviewGlb }) => {
  const assets = listManifestAssets();
  const [filter, setFilter] = useState<AssetCategory | 'all'>('all');
  const [sessionInfo, setSessionInfo] = useState<{ sessionId: string; token: string } | null>(null);
  const [bridgeStatus, setBridgeStatus] = useState<string>('Idle (Developer Tool Only)');
  const [targetAssetId, setTargetAssetId] = useState<string>('chr_kaelen');

  const filtered = filter === 'all' ? assets : assets.filter((a) => a.category === filter);

  const createSession = async () => {
    try {
      setBridgeStatus('Creating live Blender bridge session...');
      const res = await fetch('/api/blender-bridge/sessions', { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { sessionId: string; token: string };
      setSessionInfo(data);
      setBridgeStatus(`Active Session: ${data.sessionId} (limit ${(MAX_BRIDGE_GLB_BYTES / (1024 * 1024)).toFixed(0)} MB)`);
    } catch (err) {
      setBridgeStatus(`Bridge unavailable: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const pullLatestFromBridge = async () => {
    if (!sessionInfo) return;
    try {
      const res = await fetch(`/api/blender-bridge/${sessionInfo.sessionId}/asset`, {
        headers: { Authorization: `Bearer ${sessionInfo.token}` },
      });
      if (!res.ok) {
        setBridgeStatus(`No GLB pushed yet (HTTP ${res.status}).`);
        return;
      }
      const buf = await res.arrayBuffer();
      const check = validateGlbHeader(new Uint8Array(buf));
      if (!check.valid) {
        setBridgeStatus(`Rejected invalid GLB: ${check.reason}`);
        return;
      }
      await onPreviewGlb(targetAssetId, buf, 'hero');
      setBridgeStatus(`Pulled ${(buf.byteLength / 1024).toFixed(1)} KB GLB into ${targetAssetId}.`);
    } catch (err) {
      setBridgeStatus(`Pull failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const downloadAddon = () => {
    if (!sessionInfo) return;
    const script = generateBlenderAddonScript({
      serverUrl: window.location.origin,
      sessionId: sessionInfo.sessionId,
      token: sessionInfo.token,
    });
    const blob = new Blob([script], { type: 'text/x-python' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'eidrath_blender_bridge.py';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleLocalFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    const check = validateGlbHeader(new Uint8Array(buf));
    if (!check.valid) {
      setBridgeStatus(`Rejected ${file.name}: ${check.reason}`);
      return;
    }
    await onPreviewGlb(targetAssetId, buf, 'hero');
    setBridgeStatus(`Loaded local GLB ${file.name} (${(buf.byteLength / 1024).toFixed(1)} KB) -> ${targetAssetId}.`);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#101316]/90 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl max-h-[88vh] overflow-y-auto border border-[#9C7848] bg-[#1B2024] p-6 space-y-5">
        <div className="flex items-center justify-between border-b border-[#68717A]/40 pb-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.25em] text-[#9C7848]">Developer Tooling Only</p>
            <h2
              className="text-xl uppercase tracking-[0.16em] text-[#D9D1BE]"
              style={{ fontFamily: "'Cinzel', Georgia, serif" }}
            >
              EIDRATH Blender Asset Forge & Manifest
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 border border-[#68717A] text-xs uppercase text-[#D9D1BE] hover:border-[#9C7848]"
          >
            Close
          </button>
        </div>

        {/* Live Blender Bridge Controls */}
        <div className="border border-[#68717A]/45 bg-[#22272B] p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs uppercase tracking-widest text-[#9C7848]">Live Blender Bridge</span>
            <span className="text-xs font-mono text-[#6D9CB6]">{bridgeStatus}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={targetAssetId}
              onChange={(e) => setTargetAssetId(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-[#171B1E] border border-[#68717A]/60 text-[#D9D1BE]"
            >
              {assets.slice(0, 20).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.id} ({a.category})
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={createSession}
              className="px-3 py-1.5 text-xs uppercase border border-[#9C7848] bg-[#9C7848]/20 text-[#D9D1BE]"
            >
              Start Bridge Session
            </button>
            {sessionInfo && (
              <>
                <button
                  type="button"
                  onClick={downloadAddon}
                  className="px-3 py-1.5 text-xs uppercase border border-[#68717A] text-[#D9D1BE]"
                >
                  Download Blender Add-on (.py)
                </button>
                <button
                  type="button"
                  onClick={pullLatestFromBridge}
                  className="px-3 py-1.5 text-xs uppercase border border-[#6D9CB6] text-[#6D9CB6]"
                >
                  Pull Latest GLB
                </button>
              </>
            )}
            <label className="px-3 py-1.5 text-xs uppercase border border-[#68717A] text-[#D9D1BE] cursor-pointer">
              Test Local .glb
              <input type="file" accept=".glb" onChange={handleLocalFileUpload} className="hidden" />
            </label>
          </div>
        </div>

        {/* Manifest Table */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs uppercase tracking-widest text-[#9C7848]">
              Registered Blender 5.3 Assets ({filtered.length} / {assets.length})
            </span>
            <div className="flex flex-wrap gap-1">
              {(['all', 'hero', 'companion', 'npc', 'enemy', 'boss', 'weapon', 'world', 'prop'] as const).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setFilter(cat)}
                  className={`px-2 py-0.5 text-[10px] uppercase border ${
                    filter === cat ? 'border-[#9C7848] text-[#D9D1BE]' : 'border-[#68717A]/40 text-[#68717A]'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto border border-[#68717A]/35">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#161A1E] text-[#9C7848] sticky top-0">
                <tr>
                  <th className="p-2">Asset ID</th>
                  <th className="p-2">Category</th>
                  <th className="p-2">Height (m)</th>
                  <th className="p-2">Clips</th>
                  <th className="p-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#68717A]/20 text-[#D9D1BE]/85">
                {filtered.map((a) => (
                  <tr key={a.id} className="hover:bg-[#22272B]">
                    <td className="p-2 font-mono">{a.id}</td>
                    <td className="p-2 uppercase text-[10px]">{a.category}</td>
                    <td className="p-2 font-mono">{a.expectedHeightM.toFixed(2)}m</td>
                    <td className="p-2 font-mono">{a.animations.length}</td>
                    <td className="p-2 text-[#6D9CB6] uppercase text-[10px]">{a.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
