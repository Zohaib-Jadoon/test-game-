import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDocFromServer,
  initializeFirestore,
  limit,
  onSnapshot,
  orderBy,
  persistentLocalCache,
  persistentMultipleTabManager,
  query,
  serverTimestamp,
  setDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import type { GameMode } from '../game/rules';

const app = initializeApp(firebaseConfig);

export const db = initializeFirestore(
  app,
  {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  },
  firebaseConfig.firestoreDatabaseId,
);

export const auth = getAuth(app);
export const googleAuthProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Mandatory startup connectivity check
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
void testConnection();

export interface LeaderboardRecord {
  id: string;
  uid: string;
  displayName: string;
  score: number;
  wave: number;
  kills: number;
  mode: GameMode;
  rigUsed: string;
  isLive?: boolean;
}

export interface FriendshipRecord {
  id: string;
  requesterUid: string;
  recipientUid: string;
  requesterName: string;
  recipientName: string;
  status: 'pending' | 'accepted' | 'declined';
}

export interface EncryptedMessageRecord {
  id: string;
  senderUid: string;
  recipientUid: string;
  senderName: string;
  ciphertext: string;
  iv: string;
  senderPublicKey: string;
  createdAtMs?: number;
}

export const SEEDED_LEADERBOARD: LeaderboardRecord[] = [
  {
    id: 'seed-1',
    uid: 'champ-lyra',
    displayName: 'Lyra_Skyblade',
    score: 8420,
    wave: 7,
    kills: 54,
    mode: 'solo',
    rigUsed: 'ronin',
  },
  {
    id: 'seed-2',
    uid: 'champ-kairo',
    displayName: 'KairoForge',
    score: 6950,
    wave: 6,
    kills: 46,
    mode: 'coop2p',
    rigUsed: 'vanguard',
  },
  {
    id: 'seed-3',
    uid: 'champ-solis',
    displayName: 'Solis_Sentinel',
    score: 5180,
    wave: 5,
    kills: 37,
    mode: 'solo',
    rigUsed: 'sentinel',
  },
  {
    id: 'seed-4',
    uid: 'champ-tomas',
    displayName: 'VortexDuo',
    score: 3890,
    wave: 4,
    kills: 29,
    mode: 'coop2p',
    rigUsed: 'vanguard',
  },
  {
    id: 'seed-5',
    uid: 'champ-mira',
    displayName: 'MiraGLTF',
    score: 2640,
    wave: 3,
    kills: 21,
    mode: 'solo',
    rigUsed: 'ronin',
  },
];

export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleAuthProvider);
  return result.user;
}

export async function signOutPlayer(): Promise<void> {
  await signOut(auth);
}

export function subscribeLeaderboard(
  onData: (rows: LeaderboardRecord[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const path = 'leaderboards';
  const q = query(
    collection(db, path),
    where('score', '>=', 0),
    orderBy('score', 'desc'),
    limit(20),
  );
  return onSnapshot(
    q,
    (snap) => {
      const liveRows: LeaderboardRecord[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          uid: String(data.uid ?? ''),
          displayName: String(data.displayName ?? 'Pilot'),
          score: Number(data.score ?? 0),
          wave: Number(data.wave ?? 1),
          kills: Number(data.kills ?? 0),
          mode: (data.mode as GameMode) || 'solo',
          rigUsed: String(data.rigUsed ?? 'vanguard'),
          isLive: true,
        };
      });
      const merged = [...liveRows, ...SEEDED_LEADERBOARD]
        .sort((a, b) => b.score - a.score)
        .slice(0, 20);
      onData(merged);
    },
    (err) => {
      if (onError) {
        onError(err);
      } else {
        handleFirestoreError(err, OperationType.LIST, path);
      }
    },
  );
}

export async function submitLeaderboardScore(params: {
  user: User;
  score: number;
  wave: number;
  kills: number;
  mode: GameMode;
  rigUsed: string;
}): Promise<void> {
  const safeId = `${params.user.uid}_${Date.now()}`.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 120);
  const path = `leaderboards/${safeId}`;
  try {
    await setDoc(doc(db, 'leaderboards', safeId), {
      uid: params.user.uid,
      displayName: (params.user.displayName || params.user.email?.split('@')[0] || 'Skyforge Pilot').slice(0, 48),
      score: Math.max(0, Math.min(99_999_999, Math.round(params.score))),
      wave: Math.max(1, Math.min(999, Math.round(params.wave))),
      kills: Math.max(0, Math.min(999_999, Math.round(params.kills))),
      mode: params.mode,
      rigUsed: params.rigUsed.slice(0, 32),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function syncFirestoreProfileAndSave(params: {
  user: User;
  publicKeyJwk: string;
  highestWave: number;
  bestScore: number;
  totalKills: number;
  preferredRig: string;
  locale: 'en' | 'es' | 'ja' | 'fr';
  darkMode: boolean;
  biometricEnabled: boolean;
  notificationsEnabled: boolean;
  deviceName: string;
  platform: 'mobile' | 'tablet' | 'desktop';
}): Promise<void> {
  const uid = params.user.uid;
  const displayName = (
    params.user.displayName ||
    params.user.email?.split('@')[0] ||
    'Skyforge Pilot'
  ).slice(0, 48);

  const pubPath = `users/${uid}/public/profile`;
  try {
    await setDoc(doc(db, 'users', uid, 'public', 'profile'), {
      uid,
      displayName,
      rigId: params.preferredRig.slice(0, 32),
      bestScore: Math.max(0, Math.min(99_999_999, Math.round(params.bestScore))),
      highestWave: Math.max(1, Math.min(999, Math.round(params.highestWave))),
      publicKeyJwk: params.publicKeyJwk.slice(0, 1024),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, pubPath);
  }

  const privPath = `users/${uid}/private/account`;
  try {
    await setDoc(doc(db, 'users', uid, 'private', 'account'), {
      uid,
      email: (params.user.email || `${uid}@skyforge.local`).slice(0, 160),
      locale: params.locale,
      darkMode: params.darkMode,
      biometricEnabled: params.biometricEnabled,
      notificationsEnabled: params.notificationsEnabled,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, privPath);
  }

  const savePath = `users/${uid}/saves/main`;
  try {
    await setDoc(doc(db, 'users', uid, 'saves', 'main'), {
      uid,
      deviceName: params.deviceName.slice(0, 64),
      platform: params.platform,
      highestWave: Math.max(1, Math.min(999, Math.round(params.highestWave))),
      bestScore: Math.max(0, Math.min(99_999_999, Math.round(params.bestScore))),
      totalKills: Math.max(0, Math.min(9_999_999, Math.round(params.totalKills))),
      preferredRig: params.preferredRig.slice(0, 32),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, savePath);
  }
}

export async function sendFirestoreEncryptedMessage(params: {
  user: User;
  recipientUid: string;
  ciphertext: string;
  iv: string;
  senderPublicKey: string;
}): Promise<void> {
  const safeId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const path = `messages/${safeId}`;
  try {
    await setDoc(doc(db, 'messages', safeId), {
      senderUid: params.user.uid,
      recipientUid: params.recipientUid.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128),
      senderName: (params.user.displayName || 'Skyforge Pilot').slice(0, 48),
      ciphertext: params.ciphertext.slice(0, 4096),
      iv: params.iv.slice(0, 64),
      senderPublicKey: params.senderPublicKey.slice(0, 1024),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export function subscribeUserMessages(
  uid: string,
  onData: (rows: EncryptedMessageRecord[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const path = 'messages';
  const q = query(collection(db, path), where('senderUid', '==', uid), limit(30));
  return onSnapshot(
    q,
    (snap) => {
      const msgs: EncryptedMessageRecord[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          senderUid: String(data.senderUid ?? ''),
          recipientUid: String(data.recipientUid ?? ''),
          senderName: String(data.senderName ?? 'Pilot'),
          ciphertext: String(data.ciphertext ?? ''),
          iv: String(data.iv ?? ''),
          senderPublicKey: String(data.senderPublicKey ?? ''),
        };
      });
      onData(msgs);
    },
    (err) => {
      if (onError) onError(err);
      else handleFirestoreError(err, OperationType.LIST, path);
    },
  );
}
