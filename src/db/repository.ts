import { desc, eq } from 'drizzle-orm';
import { db } from './index.ts';
import { cloudSaves, matchHistory, performanceLogs, users } from './schema.ts';

export async function getOrCreateUser(
  uid: string,
  email: string,
  displayName?: string,
  photoUrl?: string,
) {
  try {
    const safeName = (displayName || email.split('@')[0] || 'Skyforge Pilot').slice(0, 64);
    const safePhoto = (photoUrl || '').slice(0, 512);
    const result = await db
      .insert(users)
      .values({
        uid,
        email: email.slice(0, 160),
        displayName: safeName,
        photoUrl: safePhoto,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email: email.slice(0, 160),
          displayName: safeName,
          photoUrl: safePhoto,
          updatedAt: new Date(),
        },
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error('Database user upsert failed:', error);
    throw new Error('Failed to synchronize player profile.', { cause: error });
  }
}

export async function saveCloudSnapshot(params: {
  uid: string;
  email: string;
  displayName?: string;
  photoUrl?: string;
  deviceName: string;
  platform: string;
  highestWave: number;
  bestScore: number;
  totalKills: number;
  unlockedRigs: string[];
  settingsJson: string;
  isAutoBackup: boolean;
}) {
  try {
    const user = await getOrCreateUser(
      params.uid,
      params.email,
      params.displayName,
      params.photoUrl,
    );

    const existing = await db
      .select({ version: cloudSaves.version })
      .from(cloudSaves)
      .where(eq(cloudSaves.userId, user.id))
      .orderBy(desc(cloudSaves.version))
      .limit(1);

    const nextVersion = existing.length > 0 ? existing[0].version + 1 : 1;

    const inserted = await db
      .insert(cloudSaves)
      .values({
        userId: user.id,
        deviceName: params.deviceName.slice(0, 80),
        platform: params.platform.slice(0, 32),
        version: nextVersion,
        highestWave: Math.max(1, Math.min(999, Math.round(params.highestWave))),
        bestScore: Math.max(0, Math.min(99_999_999, Math.round(params.bestScore))),
        totalKills: Math.max(0, Math.min(9_999_999, Math.round(params.totalKills))),
        unlockedRigs: JSON.stringify(params.unlockedRigs.slice(0, 16)),
        settingsJson: params.settingsJson.slice(0, 4096),
        isAutoBackup: params.isAutoBackup,
      })
      .returning();

    return inserted[0];
  } catch (error) {
    console.error('Database cloud save failed:', error);
    throw new Error('Failed to persist cloud save snapshot.', { cause: error });
  }
}

export async function listCloudBackups(uid: string) {
  try {
    return await db
      .select({
        id: cloudSaves.id,
        deviceName: cloudSaves.deviceName,
        platform: cloudSaves.platform,
        version: cloudSaves.version,
        highestWave: cloudSaves.highestWave,
        bestScore: cloudSaves.bestScore,
        totalKills: cloudSaves.totalKills,
        unlockedRigs: cloudSaves.unlockedRigs,
        settingsJson: cloudSaves.settingsJson,
        isAutoBackup: cloudSaves.isAutoBackup,
        createdAt: cloudSaves.createdAt,
      })
      .from(cloudSaves)
      .innerJoin(users, eq(cloudSaves.userId, users.id))
      .where(eq(users.uid, uid))
      .orderBy(desc(cloudSaves.version))
      .limit(12);
  } catch (error) {
    console.error('Database list backups failed:', error);
    throw new Error('Failed to load cloud backups.', { cause: error });
  }
}

export async function recordMatch(params: {
  uid: string;
  email: string;
  displayName?: string;
  photoUrl?: string;
  mode: string;
  score: number;
  wave: number;
  kills: number;
  durationSec: number;
  rigUsed: string;
}) {
  try {
    const user = await getOrCreateUser(
      params.uid,
      params.email,
      params.displayName,
      params.photoUrl,
    );

    const inserted = await db
      .insert(matchHistory)
      .values({
        userId: user.id,
        mode: params.mode.slice(0, 24),
        score: Math.max(0, Math.min(99_999_999, Math.round(params.score))),
        wave: Math.max(1, Math.min(999, Math.round(params.wave))),
        kills: Math.max(0, Math.min(999_999, Math.round(params.kills))),
        durationSec: Math.max(0, Math.min(86_400, Math.round(params.durationSec))),
        rigUsed: params.rigUsed.slice(0, 48),
      })
      .returning();

    return inserted[0];
  } catch (error) {
    console.error('Database match insert failed:', error);
    throw new Error('Failed to record match history.', { cause: error });
  }
}

export async function getPlayerMatches(uid: string) {
  try {
    return await db
      .select({
        id: matchHistory.id,
        mode: matchHistory.mode,
        score: matchHistory.score,
        wave: matchHistory.wave,
        kills: matchHistory.kills,
        durationSec: matchHistory.durationSec,
        rigUsed: matchHistory.rigUsed,
        createdAt: matchHistory.createdAt,
      })
      .from(matchHistory)
      .innerJoin(users, eq(matchHistory.userId, users.id))
      .where(eq(users.uid, uid))
      .orderBy(desc(matchHistory.createdAt))
      .limit(20);
  } catch (error) {
    console.error('Database match fetch failed:', error);
    throw new Error('Failed to load match history.', { cause: error });
  }
}

export async function recordPerformanceLog(params: {
  uid: string;
  email: string;
  avgFps: number;
  avgFrameMs: number;
  drawCalls: number;
  deviceType: string;
}) {
  try {
    const user = await getOrCreateUser(params.uid, params.email);
    const inserted = await db
      .insert(performanceLogs)
      .values({
        userId: user.id,
        avgFps: Math.max(1, Math.min(240, params.avgFps)),
        avgFrameMs: Math.max(1, Math.min(1000, params.avgFrameMs)),
        drawCalls: Math.max(0, Math.min(10000, Math.round(params.drawCalls))),
        deviceType: params.deviceType.slice(0, 32),
      })
      .returning();
    return inserted[0];
  } catch (error) {
    console.error('Database performance log failed:', error);
    throw new Error('Failed to record performance telemetry.', { cause: error });
  }
}
