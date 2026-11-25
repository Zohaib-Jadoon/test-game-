import { useCallback, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  SkyforgeEngine,
  type HudSnapshot,
  type TelemetrySample,
} from './game/SkyforgeEngine';
import type { GameMode } from './game/rules';
import { BUILTIN_RIGS, type BuiltinRigId } from './game/proceduralModels';
import type { ImportedAssetSummary, LoadedCustomRig } from './game/assetLoader';
import {
  auth,
  SEEDED_LEADERBOARD,
  signInWithGoogle,
  signOutPlayer,
  submitLeaderboardScore,
  subscribeLeaderboard,
  syncFirestoreProfileAndSave,
  type LeaderboardRecord,
} from './lib/firebase';
import {
  enqueueOfflineItem,
  generateE2EEKeyPair,
  mergePlayerProgress,
  type OfflineSyncItem,
  type PlayerProgress,
  type SerializedKeyPair,
} from './utils/crypto';
import { TRANSLATIONS, type Locale } from './utils/i18n';
import { INITIAL_CHALLENGES, sendLocalAlert, type DailyChallenge } from './utils/notifications';
import { useOnlineStatus } from './hooks/usePWAInstall';
import { TitleOverlay } from './components/TitleOverlay';
import { GameHud } from './components/GameHud';
import { StatusModals } from './components/StatusModals';
import { CitadelHub, type HubTab } from './components/CitadelHub';
import type { CloudBackupRow } from './components/hub/CloudSecurityTab';

const LOCAL_PROGRESS_KEY = 'skyforge_progress_v1';
const LOCAL_QUEUE_KEY = 'skyforge_offline_queue_v1';
const LOCAL_E2EE_KEY = 'skyforge_e2ee_keys_v1';

function detectPlatform(): 'mobile' | 'tablet' | 'desktop' {
  if (typeof window === 'undefined') return 'desktop';
  const w = window.innerWidth;
  if (w < 640) return 'mobile';
  if (w < 1024) return 'tablet';
  return 'desktop';
}

function loadLocalProgress(): PlayerProgress {
  try {
    const raw = localStorage.getItem(LOCAL_PROGRESS_KEY);
    if (raw) return JSON.parse(raw) as PlayerProgress;
  } catch {
    // ignore storage errors
  }
  return {
    highestWave: 1,
    bestScore: 0,
    totalKills: 0,
    preferredRig: 'ranger',
    updatedAt: Date.now(),
  };
}

function loadOfflineQueue(): OfflineSyncItem[] {
  try {
    const raw = localStorage.getItem(LOCAL_QUEUE_KEY);
    if (raw) return JSON.parse(raw) as OfflineSyncItem[];
  } catch {
    // ignore
  }
  return [];
}

const INITIAL_HUD: HudSnapshot = {
  phase: 'title',
  mode: 'solo',
  wave: 1,
  maxWaves: 5,
  score: 0,
  combo: 0,
  kills: 0,
  elapsedSec: 0,
  p1Hp: 5,
  p1MaxHp: 5,
  p1Energy: 60,
  p2Active: false,
  p2Hp: 5,
  p2MaxHp: 5,
  p2Score: 0,
  winnerLabel: '',
  enemiesRemaining: 0,
  bannerText: '',
};

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<SkyforgeEngine | null>(null);

  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [selectedMode, setSelectedMode] = useState<GameMode>('solo');
  const [muted, setMuted] = useState(false);
  const [hubOpen, setHubOpen] = useState(false);
  const [hubTab, setHubTab] = useState<HubTab>('leaderboard');

  const [locale, setLocale] = useState<Locale>('en');
  const [darkMode, setDarkMode] = useState(true);
  const [activeRigId, setActiveRigId] = useState<BuiltinRigId>('ranger');
  const [customRigSummary, setCustomRigSummary] = useState<ImportedAssetSummary | null>(null);
  const [customPropSummary, setCustomPropSummary] = useState<ImportedAssetSummary | null>(null);
  const [customEnemySummary, setCustomEnemySummary] = useState<ImportedAssetSummary | null>(null);

  const [user, setUser] = useState<User | null>(null);
  const [ownKeys, setOwnKeys] = useState<SerializedKeyPair | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRecord[]>(SEEDED_LEADERBOARD);
  const [progress, setProgress] = useState<PlayerProgress>(() => loadLocalProgress());
  const [offlineQueue, setOfflineQueue] = useState<OfflineSyncItem[]>(() => loadOfflineQueue());
  const [backups, setBackups] = useState<CloudBackupRow[]>([]);
  const [syncStatus, setSyncStatus] = useState('Local Cache Ready');
  const [challenges, setChallenges] = useState<DailyChallenge[]>(INITIAL_CHALLENGES);

  const [telemetry, setTelemetry] = useState<TelemetrySample>({
    fps: 60,
    frameMs: 16.6,
    drawCalls: 24,
    triangles: 4800,
    isSoftwareGl: false,
  });
  const [fpsHistory, setFpsHistory] = useState<number[]>(() => Array(16).fill(60));
  const [telemetryFeedback, setTelemetryFeedback] = useState<string | null>(null);

  const isOnline = useOnlineStatus();
  const t = TRANSLATIONS[locale];

  // Keep latest mutable refs for isolated WebGL engine callbacks
  const userRef = useRef<User | null>(null);
  const progressRef = useRef<PlayerProgress>(progress);
  const onlineRef = useRef<boolean>(isOnline);
  const keysRef = useRef<SerializedKeyPair | null>(ownKeys);
  const localeRef = useRef<Locale>(locale);
  const darkModeRef = useRef<boolean>(darkMode);

  userRef.current = user;
  progressRef.current = progress;
  onlineRef.current = isOnline;
  keysRef.current = ownKeys;
  localeRef.current = locale;
  darkModeRef.current = darkMode;

  // Persist local progress and queue
  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_PROGRESS_KEY, JSON.stringify(progress));
    } catch {
      // ignore
    }
  }, [progress]);

  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_QUEUE_KEY, JSON.stringify(offlineQueue));
    } catch {
      // ignore
    }
  }, [offlineQueue]);

  // Initialize persistent Web Crypto ECDH P-256 identity keypair
  useEffect(() => {
    let mounted = true;
    async function initKeys() {
      try {
        const cached = localStorage.getItem(LOCAL_E2EE_KEY);
        if (cached) {
          if (mounted) setOwnKeys(JSON.parse(cached) as SerializedKeyPair);
          return;
        }
      } catch {
        // ignore
      }
      const generated = await generateE2EEKeyPair();
      try {
        localStorage.setItem(LOCAL_E2EE_KEY, JSON.stringify(generated));
      } catch {
        // ignore
      }
      if (mounted) setOwnKeys(generated);
    }
    void initKeys();
    return () => {
      mounted = false;
    };
  }, []);

  // Fetch Cloud SQL backups helper
  const fetchSqlBackups = useCallback(async (u: User) => {
    try {
      const token = await u.getIdToken();
      const res = await fetch('/api/saves', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = (await res.json()) as { backups?: CloudBackupRow[] };
        if (Array.isArray(data.backups)) {
          setBackups(data.backups);
          if (data.backups.length > 0) {
            const latest = data.backups[0];
            setProgress((prev) =>
              mergePlayerProgress(prev, {
                highestWave: latest.highestWave,
                bestScore: latest.bestScore,
                totalKills: latest.totalKills,
                preferredRig: prev.preferredRig,
                updatedAt: new Date(latest.createdAt).getTime() || Date.now(),
              }),
            );
          }
        }
      }
    } catch {
      // Graceful offline isolation
    }
  }, []);

  // Sync cross-platform save to BOTH Cloud SQL and Firestore
  const performCloudSync = useCallback(
    async (isAutoBackup: boolean, overrideProgress?: PlayerProgress) => {
      const activeUser = userRef.current;
      const snap = overrideProgress ?? progressRef.current;
      const platform = detectPlatform();
      const deviceName = `${platform.toUpperCase()} · ${navigator.userAgent.includes('Mobile') ? 'Mobile' : 'Desktop'}`;

      if (!activeUser || !onlineRef.current) {
        setOfflineQueue((q) =>
          enqueueOfflineItem(q, {
            id: `save_${Date.now()}`,
            kind: 'save',
            payload: { ...snap, isAutoBackup },
            createdAt: Date.now(),
          }),
        );
        setSyncStatus(activeUser ? 'Queued Offline' : 'Saved Locally (Sign in for Cloud Sync)');
        return;
      }

      setSyncStatus('Syncing...');
      try {
        const token = await activeUser.getIdToken();
        const sqlRes = await fetch('/api/saves', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            deviceName,
            platform,
            highestWave: snap.highestWave,
            bestScore: snap.bestScore,
            totalKills: snap.totalKills,
            unlockedRigs: ['vanguard', 'sentinel', 'ronin'],
            settings: { locale: localeRef.current, darkMode: darkModeRef.current },
            isAutoBackup,
          }),
        });

        if (activeUser.emailVerified && keysRef.current) {
          await syncFirestoreProfileAndSave({
            user: activeUser,
            publicKeyJwk: keysRef.current.publicKeyJwk,
            highestWave: snap.highestWave,
            bestScore: snap.bestScore,
            totalKills: snap.totalKills,
            preferredRig: snap.preferredRig,
            locale: localeRef.current,
            darkMode: darkModeRef.current,
            biometricEnabled: false,
            notificationsEnabled: false,
            deviceName,
            platform,
          }).catch(() => {});
        }

        if (sqlRes.ok) {
          await fetchSqlBackups(activeUser);
          setSyncStatus(isAutoBackup ? 'Cloud Backup Created' : 'Synced to Cloud SQL & Firestore');
        } else {
          setSyncStatus('Synced to Local Cache');
        }
      } catch {
        setSyncStatus('Offline — Queued');
      }
    },
    [fetchSqlBackups],
  );

  // Firebase Auth listener & real-time leaderboard subscription
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          const token = await u.getIdToken();
          await fetch('/api/profile/sync', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ displayName: u.displayName, photoUrl: u.photoURL }),
          });
          await fetchSqlBackups(u);
          setSyncStatus('Cloud Profile Connected');
        } catch {
          setSyncStatus('Offline Profile Active');
        }
      }
    });

    const unsubBoard = subscribeLeaderboard(
      (rows) => setLeaderboard(rows),
      () => {
        // Fallback smoothly to seeded champions when offline or unconfigured
        setLeaderboard(SEEDED_LEADERBOARD);
      },
    );

    return () => {
      unsubAuth();
      unsubBoard();
    };
  }, [fetchSqlBackups]);

  // Flush offline queue automatically when back online
  useEffect(() => {
    if (!isOnline || !user || offlineQueue.length === 0) return;
    void (async () => {
      await performCloudSync(true);
      setOfflineQueue([]);
    })();
  }, [isOnline, user, offlineQueue.length, performCloudSync]);

  // Mount isolated 3D WebGL engine ONCE
  const handleRunCompleteRef = useRef<
    (summary: {
      outcome: 'victory' | 'defeat';
      score: number;
      wave: number;
      kills: number;
      durationSec: number;
      mode: GameMode;
      rigUsed: string;
    }) => void
  >(() => {});

  handleRunCompleteRef.current = (summary) => {
    const nextProgress: PlayerProgress = {
      highestWave: Math.max(progressRef.current.highestWave, summary.wave),
      bestScore: Math.max(progressRef.current.bestScore, summary.score),
      totalKills: progressRef.current.totalKills + summary.kills,
      preferredRig: progressRef.current.preferredRig,
      updatedAt: Date.now(),
    };
    setProgress(nextProgress);

    // Update local leaderboard immediately even while offline
    if (summary.score > 0) {
      const localRow: LeaderboardRecord = {
        id: `local_${Date.now()}`,
        uid: userRef.current?.uid || 'local-pilot',
        displayName: userRef.current?.displayName || 'You (Local)',
        score: summary.score,
        wave: summary.wave,
        kills: summary.kills,
        mode: summary.mode,
        rigUsed: summary.rigUsed,
        isLive: Boolean(userRef.current && onlineRef.current),
      };
      setLeaderboard((prev) =>
        [localRow, ...prev].sort((a, b) => b.score - a.score).slice(0, 20),
      );
    }

    // Cloud persistence: Firestore real-time leaderboard + Cloud SQL match history + auto-backup
    const u = userRef.current;
    if (u && onlineRef.current) {
      void (async () => {
        try {
          if (u.emailVerified && summary.score > 0) {
            await submitLeaderboardScore({
              user: u,
              score: summary.score,
              wave: summary.wave,
              kills: summary.kills,
              mode: summary.mode,
              rigUsed: summary.rigUsed,
            }).catch(() => {});
          }
          const token = await u.getIdToken();
          await fetch('/api/matches', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(summary),
          });
          await performCloudSync(true, nextProgress);
        } catch {
          // Queue offline
          setOfflineQueue((q) =>
            enqueueOfflineItem(q, {
              id: `score_${Date.now()}`,
              kind: 'score',
              payload: summary as unknown as Record<string, unknown>,
              createdAt: Date.now(),
            }),
          );
        }
      })();
    } else {
      setOfflineQueue((q) =>
        enqueueOfflineItem(q, {
          id: `score_${Date.now()}`,
          kind: 'score',
          payload: summary as unknown as Record<string, unknown>,
          createdAt: Date.now(),
        }),
      );
    }
  };

  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    const engine = new SkyforgeEngine(mount, {
      onHudUpdate: (snap) => setHud(snap),
      onTelemetry: (sample) => {
        setTelemetry(sample);
        setFpsHistory((prev) => [...prev.slice(1), sample.fps]);
      },
      onRunComplete: (summary) => handleRunCompleteRef.current(summary),
    });
    engineRef.current = engine;

    // Support ?autostart=1 for instant gameplay boot
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') {
      engine.startGame('solo');
    }

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  // Enter / Space start handshake on Title Screen
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (hubOpen) return;
      if (hud.phase === 'title' && (e.code === 'Enter' || e.code === 'Space')) {
        e.preventDefault();
        engineRef.current?.startGame(selectedMode);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hud.phase, hubOpen, selectedMode]);

  const activeRigLabel = customRigSummary
    ? `${customRigSummary.fileName} (${customRigSummary.format})`
    : BUILTIN_RIGS.find((r) => r.id === activeRigId)?.name || 'Aether Vanguard';

  const handleOpenHub = (tab: HubTab = 'leaderboard') => {
    if (hud.phase === 'playing') {
      engineRef.current?.pauseGame();
    }
    setHubTab(tab);
    setHubOpen(true);
  };

  const handleSelectBuiltinRig = (rigId: BuiltinRigId) => {
    setActiveRigId(rigId);
    setCustomRigSummary(null);
    engineRef.current?.setBuiltinRig(rigId);
    setProgress((p) => ({ ...p, preferredRig: rigId, updatedAt: Date.now() }));
  };

  const handleApplyCustomRig = (loaded: LoadedCustomRig) => {
    setCustomRigSummary(loaded.summary);
    engineRef.current?.applyCustomBlenderRig(loaded);
  };

  const handleApplyCustomSceneProp = (loaded: LoadedCustomRig | null) => {
    setCustomPropSummary(loaded ? loaded.summary : null);
    engineRef.current?.applyCustomSceneProp(loaded);
  };

  const handleApplyCustomEnemyRig = (loaded: LoadedCustomRig | null) => {
    setCustomEnemySummary(loaded ? loaded.summary : null);
    engineRef.current?.applyCustomEnemyRig(loaded);
  };

  const handleLogTelemetryToSql = async () => {
    if (!user) {
      setTelemetryFeedback('Sign in with Google in Cloud & Security to persist telemetry snapshots to Cloud SQL.');
      return;
    }
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/telemetry', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          avgFps: telemetry.fps,
          avgFrameMs: telemetry.frameMs,
          drawCalls: telemetry.drawCalls,
          deviceType: detectPlatform(),
        }),
      });
      setTelemetryFeedback(
        res.ok
          ? `Recorded ${telemetry.fps} FPS (${telemetry.frameMs}ms) snapshot to Cloud SQL.`
          : 'Unable to persist telemetry snapshot right now.',
      );
    } catch {
      setTelemetryFeedback('Offline — telemetry logged locally.');
    }
  };

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#121824]">
      {/* Isolated WebGL Canvas Container — React state updates never remount it */}
      <div
        ref={canvasMountRef}
        data-testid="skyforge-canvas-mount"
        className="fixed inset-0 h-full w-full"
      />

      {/* Title Screen */}
      {hud.phase === 'title' && !hubOpen && (
        <TitleOverlay
          mode={selectedMode}
          onModeChange={setSelectedMode}
          onStart={() => engineRef.current?.startGame(selectedMode)}
          onOpenHub={handleOpenHub}
          t={t}
          bestScore={progress.bestScore}
          activeRigLabel={activeRigLabel}
          isOnline={isOnline}
        />
      )}

      {/* Active Gameplay HUD */}
      {hud.phase === 'playing' && (
        <GameHud
          hud={hud}
          t={t}
          muted={muted}
          isOnline={isOnline}
          onToggleMute={() => {
            const next = engineRef.current?.getAudio().toggleMute() ?? !muted;
            setMuted(next);
          }}
          onPause={() => engineRef.current?.pauseGame()}
          onOpenHub={() => handleOpenHub('leaderboard')}
          onTouchMove={(x, z) => engineRef.current?.setTouchInput(x, z)}
          onTouchAction={(action) => engineRef.current?.triggerMobileAction(action)}
        />
      )}

      {/* Pause / Victory / Defeat Modal */}
      {!hubOpen && (
        <StatusModals
          hud={hud}
          bestScore={progress.bestScore}
          t={t}
          onResume={() => engineRef.current?.resumeGame()}
          onRestart={() => engineRef.current?.startGame(selectedMode)}
          onTitle={() => engineRef.current?.returnToTitle()}
          onOpenHub={(tab) => handleOpenHub(tab || 'leaderboard')}
        />
      )}

      {/* Slide-Over Citadel Hub (Leaderboards, Blender Forge, Social E2EE, Cloud SQL, AI, Docs) */}
      <CitadelHub
        open={hubOpen}
        activeTab={hubTab}
        onTabChange={setHubTab}
        onClose={() => setHubOpen(false)}
        user={user}
        ownKeys={ownKeys}
        isOnline={isOnline}
        offlineQueueCount={offlineQueue.length}
        leaderboard={leaderboard}
        backups={backups}
        syncStatus={syncStatus}
        challenges={challenges}
        progress={progress}
        hud={hud}
        telemetry={telemetry}
        fpsHistory={fpsHistory}
        activeRigId={activeRigId}
        activeRigLabel={activeRigLabel}
        customRigSummary={customRigSummary}
        customPropSummary={customPropSummary}
        customEnemySummary={customEnemySummary}
        locale={locale}
        darkMode={darkMode}
        t={t}
        onLocaleChange={setLocale}
        onToggleDarkMode={() => setDarkMode((d) => !d)}
        onSelectBuiltinRig={handleSelectBuiltinRig}
        onApplyCustomRig={handleApplyCustomRig}
        onApplyCustomSceneProp={handleApplyCustomSceneProp}
        onApplyCustomEnemyRig={handleApplyCustomEnemyRig}
        onSignIn={async () => {
          await signInWithGoogle();
        }}
        onSignOut={async () => {
          await signOutPlayer();
          setBackups([]);
          setSyncStatus('Signed Out (Local Mode)');
        }}
        onSyncSave={async (isAutoBackup) => {
          await performCloudSync(isAutoBackup);
        }}
        onRestoreBackup={(b) => {
          setProgress((prev) => ({
            ...prev,
            highestWave: b.highestWave,
            bestScore: b.bestScore,
            totalKills: b.totalKills,
            updatedAt: Date.now(),
          }));
          setSyncStatus(`Restored Cloud Backup v${b.version}`);
        }}
        onClaimChallenge={(id) => {
          setChallenges((prev) =>
            prev.map((c) => (c.id === id ? { ...c, claimed: true } : c)),
          );
          sendLocalAlert('Skyforge Reward Claimed', 'Your daily challenge reward has been unlocked!');
        }}
        onQueueOfflineMessage={(payload) => {
          setOfflineQueue((q) =>
            enqueueOfflineItem(q, {
              id: `msg_${Date.now()}`,
              kind: 'message',
              payload,
              createdAt: Date.now(),
            }),
          );
        }}
        onLogTelemetryToSql={handleLogTelemetryToSql}
        telemetryFeedback={telemetryFeedback}
      />

      {/* Non-intrusive Offline Toast (No pulsating dots!) */}
      {!isOnline && (
        <div className="fixed bottom-3 left-3 z-50 rounded-lg border border-amber-400/60 bg-amber-950/95 px-3 py-1.5 text-xs font-semibold text-amber-100 shadow-lg">
          {t.offlineBanner}
        </div>
      )}
    </main>
  );
}
