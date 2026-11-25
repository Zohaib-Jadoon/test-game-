import React, { useState } from 'react';
import type { User } from 'firebase/auth';
import {
  clearBiometricEnrollment,
  enrollBiometricPasskey,
  getBiometricStatus,
  verifyBiometricPasskey,
  type BiometricStatus,
} from '../../utils/biometrics';
import {
  getNotificationPermission,
  requestPushNotifications,
  sendLocalAlert,
  type DailyChallenge,
} from '../../utils/notifications';
import type { Translations } from '../../utils/i18n';

export interface CloudBackupRow {
  id: number;
  deviceName: string;
  platform: string;
  version: number;
  highestWave: number;
  bestScore: number;
  totalKills: number;
  isAutoBackup: boolean;
  createdAt: string;
}

interface CloudSecurityTabProps {
  user: User | null;
  isOnline: boolean;
  offlineQueueCount: number;
  backups: CloudBackupRow[];
  syncStatus: string;
  challenges: DailyChallenge[];
  progress: { highestWave: number; bestScore: number; totalKills: number };
  darkMode: boolean;
  t: Translations;
  onSignIn: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onSyncSave: (isAutoBackup: boolean) => Promise<void>;
  onRestoreBackup: (backup: CloudBackupRow) => void;
  onClaimChallenge: (id: string) => void;
}

export const CloudSecurityTab: React.FC<CloudSecurityTabProps> = ({
  user,
  isOnline,
  offlineQueueCount,
  backups,
  syncStatus,
  challenges,
  progress,
  darkMode,
  t,
  onSignIn,
  onSignOut,
  onSyncSave,
  onRestoreBackup,
  onClaimChallenge,
}) => {
  const [bioStatus, setBioStatus] = useState<BiometricStatus>(() => getBiometricStatus());
  const [bioMessage, setBioMessage] = useState<string | null>(null);
  const [notifPerm, setNotifPerm] = useState(() => getNotificationPermission());
  const [busy, setBusy] = useState(false);

  const cardBg = darkMode
    ? 'bg-[#101827] border-[#c9933c]/30 text-[#f4ede2]'
    : 'bg-white border-slate-300 text-slate-900';

  const handleEnrollBio = async () => {
    const res = await enrollBiometricPasskey(user?.email || 'pilot@skyforge.arena');
    setBioStatus(res.status);
    setBioMessage(res.message);
  };

  const handleVerifyBio = async () => {
    const res = await verifyBiometricPasskey();
    setBioStatus(res.status);
    setBioMessage(res.message);
  };

  const handleEnablePush = async () => {
    const res = await requestPushNotifications();
    setNotifPerm(res.permission);
    if (res.granted) {
      sendLocalAlert(
        'Skyforge Daily Challenges Active',
        'Daily reward alerts and seasonal wave notifications are enabled.',
      );
    }
  };

  return (
    <div className="space-y-4">
      {/* Google Auth + Cross-Platform Save Card */}
      <div className={`rounded-xl border p-4 ${cardBg}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#f4d38c]">
              Cloud Profile & Cross-Platform Sync
            </h3>
            {user ? (
              <p className="mt-1 text-sm font-semibold">
                {user.displayName || user.email}{' '}
                <span className="ml-1 text-xs font-normal opacity-75">({user.email})</span>
              </p>
            ) : (
              <p className="mt-1 text-xs opacity-80">
                Sign in with Google to sync progress across Mobile, Tablet, and Desktop via Firestore & Cloud SQL.
              </p>
            )}
          </div>

          {user ? (
            <button
              type="button"
              onClick={() => void onSignOut()}
              className="rounded-lg border border-slate-500 px-3.5 py-2 text-xs font-semibold hover:bg-white/10"
            >
              {t.signOut}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void onSignIn()}
              className="rounded-lg bg-[#c9933c] px-4 py-2 text-xs font-bold text-[#111622] hover:bg-[#dfb058]"
            >
              {t.signInGoogle}
            </button>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await onSyncSave(false);
              setBusy(false);
            }}
            className="rounded-lg bg-sky-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-sky-500 disabled:opacity-50"
          >
            {t.syncNow}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await onSyncSave(true);
              setBusy(false);
            }}
            className="rounded-lg border border-[#c9933c]/60 px-3.5 py-2 text-xs font-semibold text-[#f4d38c] hover:bg-[#c9933c]/15"
          >
            {t.backupNow}
          </button>
          <span className="ml-auto text-xs opacity-80">
            {isOnline ? 'Connected' : 'Offline'} · Queued: {offlineQueueCount} · {syncStatus}
          </span>
        </div>

        {/* Cloud SQL Automated Backups History */}
        {backups.length > 0 && (
          <div className="mt-4 border-t border-slate-700/40 pt-3">
            <h4 className="text-[11px] font-bold uppercase tracking-wider opacity-80">
              Automated Cloud Backups ({backups.length})
            </h4>
            <div className="mt-2 space-y-1.5 max-h-36 overflow-y-auto">
              {backups.map((b) => (
                <div
                  key={b.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-black/20 px-3 py-2 text-xs"
                >
                  <div>
                    <span className="font-mono-num font-bold text-[#f4d38c]">v{b.version}</span>{' '}
                    · {b.deviceName} ({b.platform}) · Best{' '}
                    <span className="font-mono-num font-semibold">
                      {b.bestScore.toLocaleString()}
                    </span>{' '}
                    · Wave {b.highestWave}
                  </div>
                  <button
                    type="button"
                    onClick={() => onRestoreBackup(b)}
                    className="rounded border border-sky-400/50 px-2.5 py-1 text-[11px] font-semibold text-sky-300 hover:bg-sky-500/15"
                  >
                    Restore
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Biometric WebAuthn Passkey Lock + Push Notifications */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className={`rounded-xl border p-4 ${cardBg}`}>
          <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400">
            OS Biometric Passkey Lock (WebAuthn)
          </h3>
          <p className="mt-1 text-xs opacity-80">
            Uses your OS platform authenticator (Windows Hello, Face ID, Touch ID, Android BiometricPrompt). Raw biometric templates never leave your device or touch Skyforge servers.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleEnrollBio()}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500"
            >
              {bioStatus.enrolled ? 'Re-Enroll Biometrics' : 'Enable Biometric Lock'}
            </button>
            {bioStatus.enrolled && (
              <>
                <button
                  type="button"
                  onClick={() => void handleVerifyBio()}
                  className="rounded-lg border border-emerald-400/50 px-3 py-1.5 text-xs font-semibold text-emerald-300"
                >
                  Verify Now
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setBioStatus(clearBiometricEnrollment());
                    setBioMessage('Biometric enrollment cleared.');
                  }}
                  className="rounded-lg border border-slate-500 px-2.5 py-1.5 text-xs opacity-80"
                >
                  Clear
                </button>
              </>
            )}
          </div>
          {bioMessage && <p className="mt-2 text-[11px] text-amber-300">{bioMessage}</p>}
        </div>

        <div className={`rounded-xl border p-4 ${cardBg}`}>
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400">
              Daily Challenges & Push Alerts
            </h3>
            <button
              type="button"
              onClick={() => void handleEnablePush()}
              className="rounded-lg border border-amber-400/60 px-2.5 py-1 text-[11px] font-semibold text-amber-300 hover:bg-amber-500/15"
            >
              {notifPerm === 'granted' ? 'Alerts Enabled' : 'Enable Push Alerts'}
            </button>
          </div>
          <div className="mt-3 space-y-2">
            {challenges.map((c) => {
              const current =
                c.metric === 'kills'
                  ? progress.totalKills
                  : c.metric === 'wave'
                    ? progress.highestWave
                    : progress.bestScore;
              const ready = current >= c.target;
              return (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-2 rounded-lg bg-black/20 px-3 py-2 text-xs"
                >
                  <div>
                    <div className="font-bold">{c.title}</div>
                    <div className="text-[11px] opacity-75">
                      {c.description} ({Math.min(current, c.target)}/{c.target})
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={!ready || c.claimed}
                    onClick={() => onClaimChallenge(c.id)}
                    className={`shrink-0 rounded px-2.5 py-1 text-[11px] font-bold ${
                      c.claimed
                        ? 'bg-emerald-900/50 text-emerald-300'
                        : ready
                          ? 'bg-[#c9933c] text-[#111622]'
                          : 'bg-slate-700/50 text-slate-400'
                    }`}
                  >
                    {c.claimed ? 'Claimed' : ready ? 'Claim' : 'In Progress'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
