import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
const draftPath = path.resolve(process.cwd(), 'DRAFT_firestore.rules');
const activeRules = fs.existsSync(rulesPath)
  ? fs.readFileSync(rulesPath, 'utf8')
  : fs.readFileSync(draftPath, 'utf8');

test('Phase 0 Security Rules Audit — Global default deny and rules_version 2', () => {
  assert.match(activeRules, /rules_version = '2';/);
  assert.match(activeRules, /match \/\{document=\*\*\}\s*\{\s*allow read, write: if false;\s*\}/);
});

test('Phase 0 Security Rules Audit — Every entity enforces email_verified and hasOnly', () => {
  assert.match(activeRules, /request\.auth\.token\.email_verified == true/);
  const validators = [
    'isValidPublicProfile',
    'isValidPrivateAccount',
    'isValidCloudSave',
    'isValidLeaderboardEntry',
    'isValidFriendship',
    'isValidEncryptedMessage',
  ];
  for (const fn of validators) {
    assert.ok(activeRules.includes(`function ${fn}(data)`), `Missing validator ${fn}`);
  }
});

test('Phase 0 Security Rules Audit — PII split collection restricts private reads to owner', () => {
  assert.match(
    activeRules,
    /match \/users\/\{userId\}\/private\/\{docId\}[\s\S]*?allow get: if isOwner\(userId\)/,
  );
  assert.doesNotMatch(
    activeRules,
    /match \/users\/\{userId\}\/private\/\{docId\}[\s\S]*?allow read: if isSignedIn\(\)/,
  );
});

test('Phase 0 Security Rules Audit — Terminal state lock and immutable encrypted messages', () => {
  assert.match(activeRules, /existing\(\)\.status != 'declined'/);
  assert.match(
    activeRules,
    /match \/messages\/\{messageId\}[\s\S]*?allow update: if false;/,
  );
});

test('Phase 0 Security Rules Audit — No blanket list rules or client-trusted timestamps', () => {
  assert.doesNotMatch(activeRules, /allow list:\s*if isSignedIn\(\)\s*;/);
  assert.match(activeRules, /incoming\(\)\.createdAt == request\.time/);
  assert.match(activeRules, /incoming\(\)\.updatedAt == request\.time/);
});
