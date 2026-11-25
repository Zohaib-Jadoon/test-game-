# Skyforge Arena — Firestore Security Specification (Phase 0)

## 1. Data Invariants
1. **PII Isolation**: User emails and private preferences reside solely under `/users/{userId}/private/{docId}` and are readable/writable only by `request.auth.uid == userId`.
2. **Identity Integrity**: Every write verifies `request.auth != null`, `request.auth.token.email_verified == true`, and enforces that author/owner UID fields strictly equal `request.auth.uid`.
3. **Immutable Ownership & Timestamps**: `uid`, `senderUid`, `requesterUid`, and `createdAt` cannot be modified after creation; `createdAt` and `updatedAt` must strictly equal `request.time`.
4. **No Shadow Fields**: Every create checks both `hasAll` and `hasOnly`; every update uses `affectedKeys().hasOnly(...)` combined with the full `isValid*` blueprint.
5. **Terminal State Locking**: Once a `Friendship` reaches `'declined'`, no further mutations are permitted.
6. **Scoped Queries**: `allow list` rules explicitly constrain `resource.data` (no blanket `allow list: if isSignedIn()`).

## 2. The Dirty Dozen Adversarial Payloads
1. **Shadow Field Injection on Leaderboard**: `{ uid: authUid, displayName: "Ace", score: 500, wave: 3, kills: 12, mode: "solo", rigUsed: "vanguard", isAdmin: true, createdAt: serverTimestamp, updatedAt: serverTimestamp }` -> MUST DENY.
2. **Identity Spoofing on Leaderboard**: `{ uid: "other-user-uid", ... }` -> MUST DENY.
3. **PII Cross-User Read**: `GET /users/victimUid/private/account` as `attackerUid` -> MUST DENY.
4. **Unverified Email Write**: Creating a leaderboard score with `email_verified: false` -> MUST DENY.
5. **Document ID Poisoning**: Creating `/leaderboards/<200-char-invalid-id!@#>` -> MUST DENY.
6. **Value Poisoning on Update**: Updating `score` to a string `"999999"` or negative `-50` -> MUST DENY.
7. **Timestamp Forgery**: Setting `createdAt` to a client-chosen past timestamp instead of `request.time` -> MUST DENY.
8. **Immutable Field Tampering**: Updating `createdAt` or `uid` on an existing save -> MUST DENY.
9. **E2EE Message Eavesdropping**: Listing `/messages` without matching `senderUid == uid` or `recipientUid == uid` -> MUST DENY.
10. **Message Impersonation**: Creating `/messages/{id}` where `senderUid != request.auth.uid` -> MUST DENY.
11. **Oversized String Resource Poisoning**: Creating `/messages/{id}` with 10KB `ciphertext` (> 4096 bytes) -> MUST DENY.
12. **Terminal Friendship Re-open**: Updating a `declined` friendship back to `accepted` -> MUST DENY.
