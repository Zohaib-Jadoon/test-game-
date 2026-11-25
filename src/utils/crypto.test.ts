import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decryptE2EEMessage,
  encryptE2EEMessage,
  enqueueOfflineItem,
  generateE2EEKeyPair,
  mergePlayerProgress,
} from './crypto';

test('Web Crypto ECDH + AES-GCM encrypts and decrypts E2EE messages between two peers', async () => {
  const alice = await generateE2EEKeyPair();
  const bob = await generateE2EEKeyPair();

  const secret = 'Squad up on Wave 6 — watch the Golem Charger!';
  const envelope = await encryptE2EEMessage(secret, alice, bob.publicKeyJwk);

  assert.notEqual(envelope.ciphertext, secret);
  assert.ok(envelope.iv.length >= 12);

  const bobPlain = await decryptE2EEMessage(envelope, bob.privateKeyJwk);
  assert.equal(bobPlain, secret);

  // Alice can also decrypt her own sent message using Bob's public key
  const alicePlain = await decryptE2EEMessage(envelope, alice.privateKeyJwk, bob.publicKeyJwk);
  assert.equal(alicePlain, secret);
});

test('AES-GCM rejects tampered ciphertext or wrong recipient key', async () => {
  const alice = await generateE2EEKeyPair();
  const bob = await generateE2EEKeyPair();
  const eve = await generateE2EEKeyPair();

  const envelope = await encryptE2EEMessage('Confidential tactic', alice, bob.publicKeyJwk);

  await assert.rejects(() => decryptE2EEMessage(envelope, eve.privateKeyJwk));

  const tampered = { ...envelope, ciphertext: 'AAAA' + envelope.ciphertext.slice(4) };
  await assert.rejects(() => decryptE2EEMessage(tampered, bob.privateKeyJwk));
});

test('mergePlayerProgress preserves highest cross-platform progress and latest rig', () => {
  const merged = mergePlayerProgress(
    { highestWave: 5, bestScore: 4200, totalKills: 38, preferredRig: 'vanguard', updatedAt: 1000 },
    { highestWave: 3, bestScore: 5100, totalKills: 25, preferredRig: 'ronin', updatedAt: 2000 },
  );
  assert.equal(merged.highestWave, 5);
  assert.equal(merged.bestScore, 5100);
  assert.equal(merged.totalKills, 38);
  assert.equal(merged.preferredRig, 'ronin');
  assert.equal(merged.updatedAt, 2000);
});

test('enqueueOfflineItem deduplicates by id and bounds queue size', () => {
  let q = enqueueOfflineItem([], { id: 'a', kind: 'score', payload: { s: 1 }, createdAt: 1 }, 2);
  q = enqueueOfflineItem(q, { id: 'b', kind: 'save', payload: { s: 2 }, createdAt: 2 }, 2);
  q = enqueueOfflineItem(q, { id: 'c', kind: 'message', payload: { s: 3 }, createdAt: 3 }, 2);
  assert.equal(q.length, 2);
  assert.deepEqual(
    q.map((i) => i.id),
    ['b', 'c'],
  );
});
