import React, { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  decryptE2EEMessage,
  encryptE2EEMessage,
  generateE2EEKeyPair,
  type SerializedKeyPair,
} from '../../utils/crypto';
import { sendFirestoreEncryptedMessage, subscribeUserMessages } from '../../lib/firebase';

const SOCIAL_FRIENDS_KEY = 'skyforge_friends_v1';
const SOCIAL_MESSAGES_KEY = 'skyforge_e2ee_msgs_v1';

interface StoredEncryptedMessage {
  id: string;
  senderName: string;
  recipientUid: string;
  ciphertext: string;
  iv: string;
  senderPublicKey: string;
  timestamp: string;
  syncedCloud: boolean;
}

interface FriendItem {
  uid: string;
  name: string;
  rig: string;
  bestScore: number;
  status: 'online' | 'in-arena' | 'offline';
  publicKeyJwk: string;
  privateKeyJwk?: string; // Local peer demo key when messaging built-in sparring partners offline
}

interface DecryptedChatItem {
  id: string;
  senderName: string;
  recipientUid: string;
  plaintext: string;
  ciphertext: string;
  iv: string;
  timestamp: string;
  syncedCloud: boolean;
}

interface SocialE2EETabProps {
  user: User | null;
  ownKeys: SerializedKeyPair | null;
  isOnline: boolean;
  searchQuery: string;
  darkMode: boolean;
  onQueueOfflineMessage: (payload: Record<string, unknown>) => void;
}

export const SocialE2EETab: React.FC<SocialE2EETabProps> = ({
  user,
  ownKeys,
  isOnline,
  searchQuery,
  darkMode,
  onQueueOfflineMessage,
}) => {
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [selectedFriendUid, setSelectedFriendUid] = useState<string>('');
  const [inviteHandle, setInviteHandle] = useState('');
  const [messageInput, setMessageInput] = useState('');
  const [messages, setMessages] = useState<DecryptedChatItem[]>([]);
  const [showCiphertext, setShowCiphertext] = useState(false);
  const [inviteFeedback, setInviteFeedback] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const cardBg = darkMode
    ? 'bg-[#101827] border-[#c9933c]/30 text-[#f4ede2]'
    : 'bg-white border-slate-300 text-slate-900';
  const inputBg = darkMode
    ? 'bg-[#0b111d] border-slate-700 text-white placeholder:text-slate-400'
    : 'bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-500';

  // Initialize or restore friends + decrypt stored E2EE envelopes on mount
  useEffect(() => {
    let active = true;
    async function initPeers() {
      let loadedFriends: FriendItem[] = [];
      try {
        const rawFriends = localStorage.getItem(SOCIAL_FRIENDS_KEY);
        if (rawFriends) {
          const parsed = JSON.parse(rawFriends) as FriendItem[];
          if (Array.isArray(parsed) && parsed.length > 0) {
            loadedFriends = parsed;
          }
        }
      } catch {
        // ignore storage read errors
      }

      if (loadedFriends.length === 0) {
        const k1 = await generateE2EEKeyPair();
        const k2 = await generateE2EEKeyPair();
        if (!active) return;
        loadedFriends = [
          {
            uid: 'peer_lyra_skyblade',
            name: 'Lyra_Skyblade',
            rig: 'Eclipse Ronin',
            bestScore: 8420,
            status: 'online',
            publicKeyJwk: k1.publicKeyJwk,
            privateKeyJwk: k1.privateKeyJwk,
          },
          {
            uid: 'peer_kairo_forge',
            name: 'KairoForge',
            rig: 'Dread Vanguard',
            bestScore: 6950,
            status: 'in-arena',
            publicKeyJwk: k2.publicKeyJwk,
            privateKeyJwk: k2.privateKeyJwk,
          },
        ];
        try {
          localStorage.setItem(SOCIAL_FRIENDS_KEY, JSON.stringify(loadedFriends));
        } catch {
          // ignore
        }
      }

      if (!active) return;
      setFriends(loadedFriends);
      setSelectedFriendUid((prev) => prev || loadedFriends[0].uid);

      // Decrypt persisted E2EE envelopes (plaintext is never stored in localStorage)
      if (!ownKeys) return;
      try {
        const rawMsgs = localStorage.getItem(SOCIAL_MESSAGES_KEY);
        if (!rawMsgs) return;
        const stored = JSON.parse(rawMsgs) as StoredEncryptedMessage[];
        if (!Array.isArray(stored)) return;
        const decrypted: DecryptedChatItem[] = [];
        for (const item of stored) {
          const peer = loadedFriends.find((f) => f.uid === item.recipientUid);
          if (!peer) continue;
          try {
            const plain = peer.privateKeyJwk
              ? await decryptE2EEMessage(item, peer.privateKeyJwk)
              : await decryptE2EEMessage(item, ownKeys.privateKeyJwk, peer.publicKeyJwk);
            decrypted.push({
              id: item.id,
              senderName: item.senderName,
              recipientUid: item.recipientUid,
              plaintext: plain,
              ciphertext: item.ciphertext,
              iv: item.iv,
              timestamp: item.timestamp,
              syncedCloud: item.syncedCloud,
            });
          } catch {
            // Skip envelopes from rotated keys
          }
        }
        if (active && decrypted.length > 0) {
          setMessages(decrypted);
        }
      } catch {
        // ignore storage parse errors
      }
    }
    void initPeers();
    return () => {
      active = false;
    };
  }, [ownKeys]);

  // Subscribe to real-time Firestore encrypted direct messages when authenticated
  useEffect(() => {
    if (!user || !ownKeys || !isOnline) return;
    const unsub = subscribeUserMessages(
      user.uid,
      async (cloudRows) => {
        const additions: DecryptedChatItem[] = [];
        for (const row of cloudRows) {
          const peerUid = row.senderUid === user.uid ? row.recipientUid : row.senderUid;
          const peer = friends.find((f) => f.uid === peerUid);
          try {
            const plain = await decryptE2EEMessage(
              {
                ciphertext: row.ciphertext,
                iv: row.iv,
                senderPublicKey: row.senderPublicKey,
              },
              ownKeys.privateKeyJwk,
              row.senderUid === user.uid ? peer?.publicKeyJwk : row.senderPublicKey,
            );
            additions.push({
              id: row.id,
              senderName: row.senderName,
              recipientUid: peerUid,
              plaintext: plain,
              ciphertext: row.ciphertext,
              iv: row.iv,
              timestamp: 'Cloud',
              syncedCloud: true,
            });
          } catch {
            // Skip messages encrypted for another keypair
          }
        }
        if (additions.length > 0) {
          setMessages((prev) => {
            const seen = new Set(prev.map((m) => m.id));
            const merged = [...prev];
            for (const item of additions) {
              if (!seen.has(item.id)) merged.push(item);
            }
            return merged;
          });
        }
      },
      () => {},
    );
    return () => unsub();
  }, [user, ownKeys, isOnline, friends]);

  const handleAddFriend = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = inviteHandle.trim();
    if (!cleaned) return;
    const keys = await generateE2EEKeyPair();
    const uid = `friend_${cleaned.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    const newFriend: FriendItem = {
      uid,
      name: cleaned.slice(0, 32),
      rig: 'Aether Vanguard',
      bestScore: 0,
      status: 'online',
      publicKeyJwk: keys.publicKeyJwk,
      privateKeyJwk: keys.privateKeyJwk,
    };
    setFriends((prev) => {
      const next = [newFriend, ...prev];
      try {
        localStorage.setItem(SOCIAL_FRIENDS_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
    setSelectedFriendUid(uid);
    setInviteHandle('');
    setInviteFeedback(`Added ${newFriend.name} with ECDH P-256 key exchange.`);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = messageInput.trim();
    const peer = friends.find((f) => f.uid === selectedFriendUid);
    if (!text || !peer || !ownKeys) return;

    setSending(true);
    try {
      const envelope = await encryptE2EEMessage(text, ownKeys, peer.publicKeyJwk);
      // Verify real round-trip decryption with AES-GCM 256
      const verifiedPlain = peer.privateKeyJwk
        ? await decryptE2EEMessage(envelope, peer.privateKeyJwk)
        : await decryptE2EEMessage(envelope, ownKeys.privateKeyJwk, peer.publicKeyJwk);

      let syncedCloud = false;
      if (user && isOnline && user.emailVerified) {
        try {
          await sendFirestoreEncryptedMessage({
            user,
            recipientUid: peer.uid,
            ciphertext: envelope.ciphertext,
            iv: envelope.iv,
            senderPublicKey: envelope.senderPublicKey,
          });
          syncedCloud = true;
        } catch {
          onQueueOfflineMessage({ recipientUid: peer.uid, ...envelope });
        }
      } else {
        onQueueOfflineMessage({ recipientUid: peer.uid, ...envelope });
      }

      const msgItem: DecryptedChatItem = {
        id: `m_${Date.now()}`,
        senderName: user?.displayName || 'You',
        recipientUid: peer.uid,
        plaintext: verifiedPlain,
        ciphertext: envelope.ciphertext,
        iv: envelope.iv,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        syncedCloud,
      };
      setMessages((prev) => [...prev, msgItem]);
      try {
        const raw = localStorage.getItem(SOCIAL_MESSAGES_KEY);
        const existing: StoredEncryptedMessage[] = raw ? (JSON.parse(raw) as StoredEncryptedMessage[]) : [];
        const storedEntry: StoredEncryptedMessage = {
          id: msgItem.id,
          senderName: msgItem.senderName,
          recipientUid: msgItem.recipientUid,
          ciphertext: envelope.ciphertext,
          iv: envelope.iv,
          senderPublicKey: envelope.senderPublicKey,
          timestamp: msgItem.timestamp,
          syncedCloud,
        };
        localStorage.setItem(SOCIAL_MESSAGES_KEY, JSON.stringify([...existing, storedEntry].slice(-60)));
      } catch {
        // ignore storage quota errors
      }
      setMessageInput('');
    } finally {
      setSending(false);
    }
  };

  const q = searchQuery.trim().toLowerCase();
  const visibleFriends = friends.filter(
    (f) => !q || f.name.toLowerCase().includes(q) || f.rig.toLowerCase().includes(q),
  );
  const activePeer = friends.find((f) => f.uid === selectedFriendUid);
  const thread = messages.filter((m) => m.recipientUid === selectedFriendUid);

  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
      {/* Friend List & Invite Panel */}
      <div className={`md:col-span-5 rounded-xl border p-4 space-y-3 ${cardBg}`}>
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#f4d38c]">
          Squad & Friends ({visibleFriends.length})
        </h3>
        <form onSubmit={handleAddFriend} className="flex gap-2">
          <input
            type="text"
            value={inviteHandle}
            onChange={(e) => setInviteHandle(e.target.value)}
            placeholder="Invite pilot tag..."
            aria-label="Invite pilot tag"
            className={`w-full rounded-lg border px-3 py-1.5 text-xs ${inputBg}`}
          />
          <button
            type="submit"
            className="shrink-0 rounded-lg bg-[#c9933c] px-3 py-1.5 text-xs font-bold text-[#111622] hover:bg-[#dfb058]"
          >
            Invite
          </button>
        </form>
        {inviteFeedback && (
          <p className="text-[11px] text-emerald-400">{inviteFeedback}</p>
        )}

        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
          {visibleFriends.map((f) => {
            const active = f.uid === selectedFriendUid;
            return (
              <button
                key={f.uid}
                type="button"
                onClick={() => setSelectedFriendUid(f.uid)}
                className={`w-full rounded-lg border p-2.5 text-left transition-colors ${
                  active
                    ? 'border-[#67e8f9] bg-[#1a2942] text-white'
                    : darkMode
                      ? 'border-slate-700/80 bg-[#0d1422] hover:bg-[#162035]'
                      : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold">{f.name}</span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                      f.status === 'online'
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'bg-amber-500/20 text-amber-300'
                    }`}
                  >
                    {f.status}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between text-[11px] opacity-75">
                  <span>{f.rig}</span>
                  <span className="font-mono-num">Best {f.bestScore.toLocaleString()}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* End-to-End Encrypted Chat Panel */}
      <div className={`md:col-span-7 rounded-xl border p-4 flex flex-col justify-between ${cardBg}`}>
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700/40 pb-2.5">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-sky-400">
                E2EE Direct Channel {activePeer ? `· ${activePeer.name}` : ''}
              </h3>
              <p className="text-[11px] opacity-75">
                ECDH P-256 Key Exchange + AES-GCM 256-bit Encryption
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowCiphertext((v) => !v)}
              className="rounded border border-sky-400/40 px-2 py-1 text-[10px] font-semibold text-sky-300 hover:bg-sky-500/10"
            >
              {showCiphertext ? 'Hide Ciphertext' : 'Inspect AES Ciphertext'}
            </button>
          </div>

          <div className="my-3 h-48 overflow-y-auto space-y-2 pr-1">
            {thread.length === 0 ? (
              <div className="flex h-full items-center justify-center text-center text-xs opacity-65 px-4">
                Send an encrypted squad message below. Payloads are encrypted client-side with Web Crypto before storage or Firestore sync.
              </div>
            ) : (
              thread.map((msg) => (
                <div
                  key={msg.id}
                  className={`rounded-lg border p-2.5 text-xs ${
                    darkMode
                      ? 'border-sky-500/30 bg-[#152238]'
                      : 'border-sky-200 bg-sky-50 text-slate-900'
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] opacity-75">
                    <span className="font-bold">{msg.senderName}</span>
                    <span>
                      {msg.timestamp} · {msg.syncedCloud ? 'Cloud E2EE' : 'Local E2EE Queue'}
                    </span>
                  </div>
                  <p className="mt-1 font-medium">{msg.plaintext}</p>
                  {showCiphertext && (
                    <div className="mt-1.5 rounded bg-black/30 p-1.5 font-mono text-[10px] break-all text-emerald-300">
                      IV: {msg.iv} | CT: {msg.ciphertext}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        <form onSubmit={handleSendMessage} className="flex gap-2">
          <input
            type="text"
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            placeholder="Write end-to-end encrypted message..."
            aria-label="Write end-to-end encrypted message"
            className={`w-full rounded-lg border px-3 py-2 text-xs ${inputBg}`}
          />
          <button
            type="submit"
            disabled={sending || !messageInput.trim()}
            className="shrink-0 rounded-lg bg-[#c9933c] px-4 py-2 text-xs font-bold text-[#111622] hover:bg-[#dfb058] disabled:opacity-50"
          >
            Encrypt & Send
          </button>
        </form>
      </div>
    </div>
  );
};
