import React, { useState } from 'react';
import type { User } from 'firebase/auth';
import type { GameMode } from '../game/rules';
import type { HudSnapshot, TelemetrySample } from '../game/SkyforgeEngine';
import type { ImportedAssetSummary, LoadedCustomRig } from '../game/assetLoader';
import type { BuiltinRigId } from '../game/proceduralModels';
import type { LeaderboardRecord } from '../lib/firebase';
import type { SerializedKeyPair } from '../utils/crypto';
import { LOCALE_LABELS, type Locale, type Translations } from '../utils/i18n';
import type { DailyChallenge } from '../utils/notifications';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { BlenderForgeTab } from './hub/BlenderForgeTab';
import { SocialE2EETab } from './hub/SocialE2EETab';
import { CloudSecurityTab, type CloudBackupRow } from './hub/CloudSecurityTab';
import { AiStrategistTab } from './hub/AiStrategistTab';
import { DocsMonitorTab } from './hub/DocsMonitorTab';

export type HubTab = 'leaderboard' | 'forge' | 'social' | 'cloud' | 'ai' | 'docs';

interface CitadelHubProps {
  open: boolean;
  activeTab: HubTab;
  onTabChange: (tab: HubTab) => void;
  onClose: () => void;
  user: User | null;
  ownKeys: SerializedKeyPair | null;
  isOnline: boolean;
  offlineQueueCount: number;
  leaderboard: LeaderboardRecord[];
  backups: CloudBackupRow[];
  syncStatus: string;
  challenges: DailyChallenge[];
  progress: { highestWave: number; bestScore: number; totalKills: number };
  hud: HudSnapshot;
  telemetry: TelemetrySample;
  fpsHistory: number[];
  activeRigId: BuiltinRigId;
  activeRigLabel: string;
  builtinRigSummary: ImportedAssetSummary | null;
  customRigSummary: ImportedAssetSummary | null;
  customPropSummary: ImportedAssetSummary | null;
  customEnemySummary: ImportedAssetSummary | null;
  locale: Locale;
  darkMode: boolean;
  t: Translations;
  onLocaleChange: (loc: Locale) => void;
  onToggleDarkMode: () => void;
  onSelectBuiltinRig: (rigId: BuiltinRigId) => void;
  onApplyCustomRig: (loaded: LoadedCustomRig) => void;
  onApplyCustomSceneProp: (loaded: LoadedCustomRig | null) => void;
  onApplyCustomEnemyRig: (loaded: LoadedCustomRig | null) => void;
  onSignIn: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onSyncSave: (isAutoBackup: boolean) => Promise<void>;
  onRestoreBackup: (backup: CloudBackupRow) => void;
  onClaimChallenge: (id: string) => void;
  onQueueOfflineMessage: (payload: Record<string, unknown>) => void;
  onLogTelemetryToSql: () => Promise<void>;
  telemetryFeedback: string | null;
}

export const CitadelHub: React.FC<CitadelHubProps> = ({
  open,
  activeTab,
  onTabChange,
  onClose,
  user,
  ownKeys,
  isOnline,
  offlineQueueCount,
  leaderboard,
  backups,
  syncStatus,
  challenges,
  progress,
  hud,
  telemetry,
  fpsHistory,
  activeRigId,
  activeRigLabel,
  builtinRigSummary,
  customRigSummary,
  customPropSummary,
  customEnemySummary,
  locale,
  darkMode,
  t,
  onLocaleChange,
  onToggleDarkMode,
  onSelectBuiltinRig,
  onApplyCustomRig,
  onApplyCustomSceneProp,
  onApplyCustomEnemyRig,
  onSignIn,
  onSignOut,
  onSyncSave,
  onRestoreBackup,
  onClaimChallenge,
  onQueueOfflineMessage,
  onLogTelemetryToSql,
  telemetryFeedback,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [modeFilter, setModeFilter] = useState<'all' | GameMode>('all');
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();

  if (!open) return null;

  const shellBg = darkMode
    ? 'bg-[#161022] border-[#c8a96e]/55 text-[#f4eaf2]'
    : 'bg-[#f8fafc] border-slate-300 text-slate-900';

  const q = searchQuery.trim().toLowerCase();
  const filteredLeaderboard = leaderboard.filter((row) => {
    if (modeFilter !== 'all' && row.mode !== modeFilter) return false;
    if (!q) return true;
    return (
      row.displayName.toLowerCase().includes(q) ||
      row.rigUsed.toLowerCase().includes(q) ||
      row.mode.toLowerCase().includes(q)
    );
  });

  const tabs: Array<{ id: HubTab; label: string }> = [
    { id: 'leaderboard', label: t.tabLeaderboard },
    { id: 'forge', label: t.tabForge },
    { id: 'social', label: t.tabSocial },
    { id: 'cloud', label: t.tabCloud },
    { id: 'ai', label: t.tabAi },
    { id: 'docs', label: t.tabDocs },
  ];

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-[#090d16]/82 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Citadel Hub"
    >
      <div
        className={`flex h-full max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border-2 shadow-2xl ${shellBg}`}
      >
        {/* Top Bar: Title, Global Search, Locale, Dark Mode, PWA Install, Close */}
        <div className="flex flex-wrap items-center gap-2.5 border-b border-[#c9933c]/30 px-4 py-3 sm:px-6">
          <h2 className="font-display text-lg font-extrabold tracking-wider text-[#f4d38c] mr-2">
            <span className={darkMode ? 'text-[#f4d38c]' : 'text-amber-900'}>CITADEL HUB</span>
          </h2>

          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t.searchPlaceholder}
            aria-label="Global hub search"
            className={`flex-1 min-w-[170px] rounded-lg border px-3 py-1.5 text-xs ${
              darkMode
                ? 'border-slate-700 bg-[#0c1220] text-white placeholder:text-slate-400'
                : 'border-slate-300 bg-white text-slate-900 placeholder:text-slate-500'
            }`}
          />

          <select
            aria-label="Select Language"
            value={locale}
            onChange={(e) => onLocaleChange(e.target.value as Locale)}
            className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${
              darkMode
                ? 'border-slate-700 bg-[#0c1220] text-[#f4ede2]'
                : 'border-slate-300 bg-white text-slate-900'
            }`}
          >
            {(Object.keys(LOCALE_LABELS) as Locale[]).map((code) => (
              <option key={code} value={code}>
                {LOCALE_LABELS[code]}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={onToggleDarkMode}
            className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${
              darkMode
                ? 'border-slate-700 bg-[#0c1220] text-amber-200 hover:bg-[#1a253b]'
                : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-100'
            }`}
          >
            {darkMode ? t.lightMode : t.darkMode}
          </button>

          {!isInstalled && isInstallable && (
            <button
              type="button"
              onClick={() => void install()}
              className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-sky-500"
            >
              {t.installApp}
            </button>
          )}
          {!isInstalled && !isInstallable && isIOS && (
            <button
              type="button"
              onClick={() => setShowIOSGuide((v) => !v)}
              className="rounded-lg border border-sky-400/50 px-2.5 py-1.5 text-xs font-semibold text-sky-300"
            >
              Install iOS
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            aria-label="Close Citadel Hub"
            className="rounded-lg border border-[#c9933c]/60 bg-[#c9933c] px-3 py-1.5 text-xs font-extrabold text-[#111622] hover:bg-[#dfb058]"
          >
            Close
          </button>
        </div>

        {showIOSGuide && (
          <div className="border-b border-sky-500/30 bg-sky-950/60 px-6 py-2 text-xs text-sky-100">
            iOS Install: Tap the Safari <strong>Share</strong> icon, then choose{' '}
            <strong>Add to Home Screen</strong> for full-screen offline play.
          </div>
        )}

        {/* Navigation Tabs */}
        <div
          className="flex items-center gap-1.5 overflow-x-auto border-b border-[#c9933c]/25 px-4 py-2 sm:px-6"
          role="tablist"
        >
          {tabs.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onTabChange(tab.id)}
                className={`shrink-0 rounded-lg px-3.5 py-2 text-xs font-bold transition-colors ${
                  active
                    ? 'bg-[#c9933c] text-[#111622]'
                    : darkMode
                      ? 'text-slate-300 hover:bg-[#202d44]'
                      : 'text-slate-700 hover:bg-slate-200'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Scrollable Tab Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {activeTab === 'leaderboard' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#f4d38c]">
                    <span className={darkMode ? 'text-[#f4d38c]' : 'text-amber-900'}>
                      Real-Time Firebase Arena Leaderboards
                    </span>
                  </h3>
                  <p className="text-xs opacity-75">
                    Live Firestore synchronization across mobile and desktop players.
                  </p>
                </div>

                <div className="flex items-center gap-1.5">
                  {(['all', 'solo', 'coop2p', 'duel2p'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setModeFilter(m)}
                      className={`rounded-md px-2.5 py-1 text-[11px] font-bold uppercase ${
                        modeFilter === m
                          ? 'bg-[#c9933c] text-[#111622]'
                          : darkMode
                            ? 'bg-[#1b263b] text-slate-300'
                            : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-[#c9933c]/30">
                <table className="w-full text-left text-xs">
                  <thead
                    className={
                      darkMode ? 'bg-[#0e1523] text-[#f4d38c]' : 'bg-slate-200 text-slate-800'
                    }
                  >
                    <tr>
                      <th className="px-3.5 py-2.5">Rank</th>
                      <th className="px-3.5 py-2.5">Pilot</th>
                      <th className="px-3.5 py-2.5">Mode</th>
                      <th className="px-3.5 py-2.5">Rig</th>
                      <th className="px-3.5 py-2.5 text-right">Wave</th>
                      <th className="px-3.5 py-2.5 text-right">Score</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/30">
                    {filteredLeaderboard.map((row, idx) => (
                      <tr
                        key={row.id}
                        className={darkMode ? 'bg-[#101827]/90 hover:bg-[#19253c]' : 'bg-white hover:bg-slate-50'}
                      >
                        <td className="px-3.5 py-2.5 font-mono-num font-bold text-[#f4d38c]">
                          #{idx + 1}
                        </td>
                        <td className="px-3.5 py-2.5 font-semibold">
                          {row.displayName}
                          {row.isLive && (
                            <span className="ml-2 rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300">
                              LIVE
                            </span>
                          )}
                        </td>
                        <td className="px-3.5 py-2.5 uppercase text-[11px] opacity-80">
                          {row.mode}
                        </td>
                        <td className="px-3.5 py-2.5 opacity-85">{row.rigUsed}</td>
                        <td className="px-3.5 py-2.5 text-right font-mono-num">{row.wave}</td>
                        <td className="px-3.5 py-2.5 text-right font-mono-num font-bold text-sky-400">
                          {row.score.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                    {filteredLeaderboard.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center opacity-70">
                          No leaderboard entries match your search filter.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'forge' && (
            <BlenderForgeTab
              activeRigId={activeRigId}
              builtinRigSummary={builtinRigSummary}
              customRigSummary={customRigSummary}
              customPropSummary={customPropSummary}
              customEnemySummary={customEnemySummary}
              searchQuery={searchQuery}
              darkMode={darkMode}
              onSelectBuiltinRig={onSelectBuiltinRig}
              onApplyCustomRig={onApplyCustomRig}
              onApplyCustomSceneProp={onApplyCustomSceneProp}
              onApplyCustomEnemyRig={onApplyCustomEnemyRig}
            />
          )}

          {activeTab === 'social' && (
            <SocialE2EETab
              user={user}
              ownKeys={ownKeys}
              isOnline={isOnline}
              searchQuery={searchQuery}
              darkMode={darkMode}
              onQueueOfflineMessage={onQueueOfflineMessage}
            />
          )}

          {activeTab === 'cloud' && (
            <CloudSecurityTab
              user={user}
              isOnline={isOnline}
              offlineQueueCount={offlineQueueCount}
              backups={backups}
              syncStatus={syncStatus}
              challenges={challenges}
              progress={progress}
              darkMode={darkMode}
              t={t}
              onSignIn={onSignIn}
              onSignOut={onSignOut}
              onSyncSave={onSyncSave}
              onRestoreBackup={onRestoreBackup}
              onClaimChallenge={onClaimChallenge}
            />
          )}

          {activeTab === 'ai' && (
            <AiStrategistTab
              hud={hud}
              activeRigLabel={activeRigLabel}
              customRigSummary={customRigSummary}
              darkMode={darkMode}
            />
          )}

          {activeTab === 'docs' && (
            <DocsMonitorTab
              telemetry={telemetry}
              fpsHistory={fpsHistory}
              searchQuery={searchQuery}
              darkMode={darkMode}
              onLogTelemetryToSql={onLogTelemetryToSql}
              telemetryFeedback={telemetryFeedback}
            />
          )}
        </div>
      </div>
    </div>
  );
};
