export interface SerializedKeyPair {
  publicKeyJwk: string;
  privateKeyJwk: string;
}

export interface EncryptedEnvelope {
  ciphertext: string;
  iv: string;
  senderPublicKey: string;
}

export interface OfflineSyncItem {
  id: string;
  kind: 'save' | 'score' | 'message';
  payload: Record<string, unknown>;
  createdAt: number;
}

export interface PlayerProgress {
  highestWave: number;
  bestScore: number;
  totalKills: number;
  preferredRig: string;
  updatedAt: number;
}

function getSubtle(): SubtleCrypto {
  const cryptoObj = globalThis.crypto;
  if (!cryptoObj || !cryptoObj.subtle) {
    throw new Error('Web Crypto API is unavailable in this environment.');
  }
  return cryptoObj.subtle;
}

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin);
}

function fromBase64(base64: string): Uint8Array {
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

export async function generateE2EEKeyPair(): Promise<SerializedKeyPair> {
  const subtle = getSubtle();
  const keyPair = await subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey'],
  );
  const publicJwk = await subtle.exportKey('jwk', keyPair.publicKey);
  const privateJwk = await subtle.exportKey('jwk', keyPair.privateKey);
  return {
    publicKeyJwk: JSON.stringify(publicJwk),
    privateKeyJwk: JSON.stringify(privateJwk),
  };
}

async function deriveSharedAesKey(
  ownPrivateKeyJwk: string,
  peerPublicKeyJwk: string,
): Promise<CryptoKey> {
  const subtle = getSubtle();
  const privateKey = await subtle.importKey(
    'jwk',
    JSON.parse(ownPrivateKeyJwk) as JsonWebKey,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveKey'],
  );
  const publicKey = await subtle.importKey(
    'jwk',
    JSON.parse(peerPublicKeyJwk) as JsonWebKey,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  return subtle.deriveKey(
    { name: 'ECDH', public: publicKey },
    privateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptE2EEMessage(
  plaintext: string,
  senderKeys: SerializedKeyPair,
  recipientPublicKeyJwk: string,
): Promise<EncryptedEnvelope> {
  const subtle = getSubtle();
  const sharedKey = await deriveSharedAesKey(senderKeys.privateKeyJwk, recipientPublicKeyJwk);
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const encrypted = await subtle.encrypt({ name: 'AES-GCM', iv }, sharedKey, encoded);
  return {
    ciphertext: toBase64(new Uint8Array(encrypted)),
    iv: toBase64(iv),
    senderPublicKey: senderKeys.publicKeyJwk,
  };
}

export async function decryptE2EEMessage(
  envelope: EncryptedEnvelope,
  recipientPrivateKeyJwk: string,
  peerPublicKeyJwk?: string,
): Promise<string> {
  const subtle = getSubtle();
  const sharedKey = await deriveSharedAesKey(
    recipientPrivateKeyJwk,
    peerPublicKeyJwk || envelope.senderPublicKey,
  );
  const iv = fromBase64(envelope.iv);
  const cipherBytes = fromBase64(envelope.ciphertext);
  const decrypted = await subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    sharedKey,
    cipherBytes as BufferSource,
  );
  return new TextDecoder().decode(decrypted);
}

/**
 * Monotonic cross-platform merge so offline mobile sessions never overwrite higher desktop progress.
 */
export function mergePlayerProgress(
  local: PlayerProgress,
  remote: PlayerProgress,
): PlayerProgress {
  const newestRig = remote.updatedAt > local.updatedAt ? remote.preferredRig : local.preferredRig;
  return {
    highestWave: Math.max(local.highestWave, remote.highestWave),
    bestScore: Math.max(local.bestScore, remote.bestScore),
    totalKills: Math.max(local.totalKills, remote.totalKills),
    preferredRig: newestRig || 'vanguard',
    updatedAt: Math.max(local.updatedAt, remote.updatedAt),
  };
}

export function enqueueOfflineItem(
  queue: OfflineSyncItem[],
  item: OfflineSyncItem,
  maxItems = 50,
): OfflineSyncItem[] {
  const deduped = queue.filter((q) => q.id !== item.id);
  const next = [...deduped, item];
  return next.slice(-maxItems);
}
