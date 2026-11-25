export interface BiometricStatus {
  supported: boolean;
  enrolled: boolean;
  credentialId: string | null;
  lastVerifiedAt: string | null;
}

const STORAGE_KEY = 'skyforge_biometric_cred_v1';

export function getBiometricStatus(): BiometricStatus {
  const supported =
    typeof window !== 'undefined' &&
    typeof window.PublicKeyCredential !== 'undefined' &&
    typeof navigator.credentials !== 'undefined';

  let credentialId: string | null = null;
  let lastVerifiedAt: string | null = null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { credentialId?: string; lastVerifiedAt?: string };
      credentialId = parsed.credentialId ?? null;
      lastVerifiedAt = parsed.lastVerifiedAt ?? null;
    }
  } catch {
    // Ignore storage read errors in restricted contexts
  }

  return {
    supported,
    enrolled: Boolean(credentialId),
    credentialId,
    lastVerifiedAt,
  };
}

function bufferToBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToUint8Array(base64Url: string): Uint8Array {
  const padded = base64Url.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((base64Url.length + 3) % 4);
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

export async function enrollBiometricPasskey(userName: string): Promise<{
  ok: boolean;
  message: string;
  status: BiometricStatus;
}> {
  const status = getBiometricStatus();
  if (!status.supported) {
    return {
      ok: false,
      message: 'WebAuthn platform authenticator is not available in this browser.',
      status,
    };
  }

  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const userId = crypto.getRandomValues(new Uint8Array(16));
    const cred = (await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: {
          name: 'Skyforge Arena',
          id: window.location.hostname || 'localhost',
        },
        user: {
          id: userId,
          name: userName || 'pilot@skyforge.arena',
          displayName: userName || 'Skyforge Pilot',
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'preferred',
        },
        timeout: 30000,
      },
    })) as PublicKeyCredential | null;

    if (!cred) {
      return { ok: false, message: 'Biometric enrollment was cancelled.', status };
    }

    const credId = bufferToBase64Url(cred.rawId);
    const now = new Date().toISOString();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ credentialId: credId, lastVerifiedAt: now }),
    );
    return {
      ok: true,
      message: 'Biometric passkey enrolled for this device.',
      status: getBiometricStatus(),
    };
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : 'Authenticator unavailable';
    return {
      ok: false,
      message: `Biometric prompt could not complete (${reason}). Standard Google Auth remains active.`,
      status,
    };
  }
}

export async function verifyBiometricPasskey(): Promise<{
  ok: boolean;
  message: string;
  status: BiometricStatus;
}> {
  const status = getBiometricStatus();
  if (!status.supported || !status.credentialId) {
    return {
      ok: false,
      message: 'Enroll a device passkey first before verifying.',
      status,
    };
  }

  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [
          {
            type: 'public-key',
            id: base64UrlToUint8Array(status.credentialId) as BufferSource,
          },
        ],
        userVerification: 'preferred',
        timeout: 30000,
      },
    });
    if (!assertion) {
      return { ok: false, message: 'Verification cancelled.', status };
    }
    const now = new Date().toISOString();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ credentialId: status.credentialId, lastVerifiedAt: now }),
    );
    return {
      ok: true,
      message: 'Biometric identity verified.',
      status: getBiometricStatus(),
    };
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : 'Verification failed';
    return {
      ok: false,
      message: `Biometric check did not complete (${reason}).`,
      status,
    };
  }
}

export function clearBiometricEnrollment(): BiometricStatus {
  localStorage.removeItem(STORAGE_KEY);
  return getBiometricStatus();
}
