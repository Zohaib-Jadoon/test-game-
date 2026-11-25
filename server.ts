import 'dotenv/config';
import crypto from 'node:crypto';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { requireAuth, type AuthRequest } from './src/middleware/auth.ts';
import {
  MAX_BRIDGE_GLB_BYTES,
  sanitizeBlenderFilename,
  validateGlbHeader,
} from './src/utils/blenderBridge.ts';
import {
  getOrCreateUser,
  getPlayerMatches,
  listCloudBackups,
  recordMatch,
  recordPerformanceLog,
  saveCloudSnapshot,
} from './src/db/repository.ts';
import { isSqlConfigured } from './src/db/index.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

// Security headers & low-latency response timing
app.use((_req, res, next) => {
  const startNs = process.hrtime.bigint();
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  const origEnd = res.end.bind(res);
  res.end = ((...args: Parameters<typeof res.end>) => {
    if (!res.headersSent) {
      const elapsedMs = Number(process.hrtime.bigint() - startNs) / 1e6;
      res.setHeader('X-Response-Time', `${elapsedMs.toFixed(1)}ms`);
    }
    return origEnd(...args);
  }) as typeof res.end;
  next();
});

// Lightweight fixed-window API rate limiter (ponytail: in-memory Map, swap to Redis for multi-instance)
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_REQUESTS = 180;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

app.use('/api', (req, res, next) => {
  if (req.path === '/health') return next();
  const key = req.ip || 'unknown';
  const now = Date.now();
  let bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + RATE_WINDOW_MS };
    rateBuckets.set(key, bucket);
  }
  bucket.count += 1;
  res.setHeader('X-RateLimit-Limit', String(RATE_MAX_REQUESTS));
  res.setHeader('X-RateLimit-Remaining', String(Math.max(0, RATE_MAX_REQUESTS - bucket.count)));
  if (bucket.count > RATE_MAX_REQUESTS) {
    return res.status(429).json({ error: 'Too many API requests. Please retry shortly.' });
  }
  next();
});

const requireSqlConfigured: express.RequestHandler = (_req, res, next) => {
  if (!isSqlConfigured()) {
    return res.status(503).json({
      error: 'PostgreSQL database is not configured. Set DATABASE_URL or SQL_HOST in .env.',
    });
  }
  next();
};

function getGeminiClient() {
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Health check (lightweight, no DB startup probe)
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'skyforge-arena',
    dbConfigured: isSqlConfigured(),
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY?.trim()),
    timestamp: new Date().toISOString(),
  });
});

// ---------------------------------------------------------------------------
// Live Blender Bridge (Authenticated ephemeral GLB sync sessions in memory)
// ---------------------------------------------------------------------------
interface BlenderBridgeSession {
  sessionId: string;
  tokenHash: Buffer;
  createdAt: number;
  expiresAt: number;
  version: number;
  fileName: string | null;
  glbBuffer: Buffer | null;
  updatedAt: string | null;
}

const BRIDGE_SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_BRIDGE_SESSIONS = 25;
const blenderBridgeSessions = new Map<string, BlenderBridgeSession>();

function pruneExpiredBridgeSessions() {
  const now = Date.now();
  for (const [id, session] of blenderBridgeSessions) {
    if (session.expiresAt <= now) {
      blenderBridgeSessions.delete(id);
    }
  }
  while (blenderBridgeSessions.size >= MAX_BRIDGE_SESSIONS) {
    const oldestKey = blenderBridgeSessions.keys().next().value;
    if (!oldestKey) break;
    blenderBridgeSessions.delete(oldestKey);
  }
}

function verifyBridgeSessionAuth(
  req: express.Request,
  res: express.Response,
): BlenderBridgeSession | null {
  pruneExpiredBridgeSessions();
  const sessionId = typeof req.params.sessionId === 'string' ? req.params.sessionId : '';
  if (!/^[a-f0-9]{16,32}$/.test(sessionId)) {
    res.status(400).json({ error: 'Invalid bridge session ID.' });
    return null;
  }
  const session = blenderBridgeSessions.get(sessionId);
  if (!session) {
    res.status(404).json({ error: 'Bridge session not found or expired.' });
    return null;
  }
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing Bridge Bearer token.' });
    return null;
  }
  const candidateToken = authHeader.slice('Bearer '.length).trim();
  const candidateHash = crypto.createHash('sha256').update(candidateToken).digest();
  if (!crypto.timingSafeEqual(candidateHash, session.tokenHash)) {
    res.status(403).json({ error: 'Invalid Bridge token.' });
    return null;
  }
  return session;
}

app.post('/api/blender-bridge/sessions', (_req, res) => {
  pruneExpiredBridgeSessions();
  const sessionId = crypto.randomBytes(12).toString('hex');
  const token = crypto.randomBytes(24).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(token).digest();
  const now = Date.now();
  const expiresAt = now + BRIDGE_SESSION_TTL_MS;

  blenderBridgeSessions.set(sessionId, {
    sessionId,
    tokenHash,
    createdAt: now,
    expiresAt,
    version: 0,
    fileName: null,
    glbBuffer: null,
    updatedAt: null,
  });

  res.status(201).json({
    sessionId,
    token,
    expiresAt: new Date(expiresAt).toISOString(),
  });
});

app.post(
  '/api/blender-bridge/:sessionId/push',
  express.raw({
    type: ['model/gltf-binary', 'application/octet-stream'],
    limit: `${MAX_BRIDGE_GLB_BYTES}b`,
  }),
  (req, res) => {
    const session = verifyBridgeSessionAuth(req, res);
    if (!session) return;

    if (!Buffer.isBuffer(req.body)) {
      return res.status(400).json({ error: 'Expected binary .glb payload.' });
    }
    const validation = validateGlbHeader(new Uint8Array(req.body.buffer, req.body.byteOffset, req.body.byteLength));
    if (!validation.valid) {
      return res.status(400).json({ error: validation.reason ?? 'Invalid GLB binary.' });
    }

    const fileName = sanitizeBlenderFilename(req.headers['x-blender-filename']);
    session.glbBuffer = Buffer.from(req.body);
    session.fileName = fileName;
    session.version += 1;
    session.updatedAt = new Date().toISOString();
    session.expiresAt = Date.now() + BRIDGE_SESSION_TTL_MS;

    return res.json({
      ok: true,
      sessionId: session.sessionId,
      version: session.version,
      fileName: session.fileName,
      byteLength: session.glbBuffer.byteLength,
      updatedAt: session.updatedAt,
    });
  },
);

app.get('/api/blender-bridge/:sessionId/status', (req, res) => {
  const session = verifyBridgeSessionAuth(req, res);
  if (!session) return;

  return res.json({
    sessionId: session.sessionId,
    version: session.version,
    fileName: session.fileName,
    byteLength: session.glbBuffer?.byteLength ?? 0,
    updatedAt: session.updatedAt,
    expiresAt: new Date(session.expiresAt).toISOString(),
  });
});

app.get('/api/blender-bridge/:sessionId/asset', (req, res) => {
  const session = verifyBridgeSessionAuth(req, res);
  if (!session) return;
  if (!session.glbBuffer || !session.fileName) {
    return res.status(404).json({ error: 'No GLB asset pushed to this bridge session yet.' });
  }

  res.setHeader('Content-Type', 'model/gltf-binary');
  res.setHeader('X-Blender-Filename', session.fileName);
  res.setHeader('X-Blender-Version', String(session.version));
  res.setHeader('Cache-Control', 'no-store');
  return res.send(session.glbBuffer);
});

app.delete('/api/blender-bridge/:sessionId', (req, res) => {
  const session = verifyBridgeSessionAuth(req, res);
  if (!session) return;
  blenderBridgeSessions.delete(session.sessionId);
  return res.json({ ok: true });
});

// Authenticated Cloud SQL Profile sync
app.post('/api/profile/sync', requireAuth, requireSqlConfigured, async (req: AuthRequest, res) => {
  try {
    const uid = req.user!.uid;
    const email = req.user!.email || `${uid}@skyforge.local`;
    const displayName =
      typeof req.body?.displayName === 'string' ? req.body.displayName : req.user!.name;
    const photoUrl =
      typeof req.body?.photoUrl === 'string' ? req.body.photoUrl : req.user!.picture;
    const user = await getOrCreateUser(uid, email, displayName, photoUrl);
    res.json({ user });
  } catch (error: unknown) {
    console.error('Profile sync error:', error);
    const message = error instanceof Error ? error.message : 'Profile sync failed';
    res.status(500).json({ error: message });
  }
});

// Cross-platform Cloud SQL Save & Automated Cloud Backups
app.get('/api/saves', requireAuth, requireSqlConfigured, async (req: AuthRequest, res) => {
  try {
    const backups = await listCloudBackups(req.user!.uid);
    res.json({ backups });
  } catch (error: unknown) {
    console.error('Failed to fetch cloud saves:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch cloud saves';
    res.status(500).json({ error: message });
  }
});

app.post('/api/saves', requireAuth, requireSqlConfigured, async (req: AuthRequest, res) => {
  try {
    const uid = req.user!.uid;
    const email = req.user!.email || `${uid}@skyforge.local`;
    const body = req.body ?? {};
    const snapshot = await saveCloudSnapshot({
      uid,
      email,
      displayName: req.user!.name,
      photoUrl: req.user!.picture,
      deviceName: typeof body.deviceName === 'string' ? body.deviceName : 'Web Browser',
      platform: typeof body.platform === 'string' ? body.platform : 'desktop',
      highestWave: Number(body.highestWave) || 1,
      bestScore: Number(body.bestScore) || 0,
      totalKills: Number(body.totalKills) || 0,
      unlockedRigs: Array.isArray(body.unlockedRigs)
        ? body.unlockedRigs.filter((x: unknown): x is string => typeof x === 'string')
        : ['vanguard', 'sentinel', 'ronin'],
      settingsJson:
        typeof body.settingsJson === 'string' ? body.settingsJson : JSON.stringify(body.settings ?? {}),
      isAutoBackup: Boolean(body.isAutoBackup),
    });
    res.status(201).json({ snapshot });
  } catch (error: unknown) {
    console.error('Failed to save cloud snapshot:', error);
    const message = error instanceof Error ? error.message : 'Failed to save cloud snapshot';
    res.status(500).json({ error: message });
  }
});

// Cloud SQL Match History
app.get('/api/matches', requireAuth, requireSqlConfigured, async (req: AuthRequest, res) => {
  try {
    const matches = await getPlayerMatches(req.user!.uid);
    res.json({ matches });
  } catch (error: unknown) {
    console.error('Failed to fetch matches:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch matches';
    res.status(500).json({ error: message });
  }
});

app.post('/api/matches', requireAuth, requireSqlConfigured, async (req: AuthRequest, res) => {
  try {
    const uid = req.user!.uid;
    const email = req.user!.email || `${uid}@skyforge.local`;
    const body = req.body ?? {};
    const match = await recordMatch({
      uid,
      email,
      displayName: req.user!.name,
      photoUrl: req.user!.picture,
      mode: typeof body.mode === 'string' ? body.mode : 'solo',
      score: Number(body.score) || 0,
      wave: Number(body.wave) || 1,
      kills: Number(body.kills) || 0,
      durationSec: Number(body.durationSec) || 0,
      rigUsed: typeof body.rigUsed === 'string' ? body.rigUsed : 'vanguard',
    });
    res.status(201).json({ match });
  } catch (error: unknown) {
    console.error('Failed to record match:', error);
    const message = error instanceof Error ? error.message : 'Failed to record match';
    res.status(500).json({ error: message });
  }
});

// Real-Time Performance Monitoring Log (Cloud SQL)
app.post('/api/telemetry', requireAuth, requireSqlConfigured, async (req: AuthRequest, res) => {
  try {
    const uid = req.user!.uid;
    const email = req.user!.email || `${uid}@skyforge.local`;
    const body = req.body ?? {};
    const log = await recordPerformanceLog({
      uid,
      email,
      avgFps: Number(body.avgFps) || 60,
      avgFrameMs: Number(body.avgFrameMs) || 16.6,
      drawCalls: Number(body.drawCalls) || 0,
      deviceType: typeof body.deviceType === 'string' ? body.deviceType : 'desktop',
    });
    res.status(201).json({ log });
  } catch (error: unknown) {
    console.error('Failed to record telemetry:', error);
    const message = error instanceof Error ? error.message : 'Failed to record telemetry';
    res.status(500).json({ error: message });
  }
});

// Low-Latency AI Tactical Tip (gemini-3.1-flash-lite)
app.post('/api/ai/quick-tip', async (req, res) => {
  try {
    const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim().slice(0, 600) : '';
    const context = req.body?.context ?? {};
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required.' });
    }
    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({
        error: 'Gemini API key is not configured in Settings > Secrets.',
      });
    }

    const ai = getGeminiClient();
    const startMs = Date.now();
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite',
      contents: `Context: ${JSON.stringify(context).slice(0, 400)}\nPlayer question: ${prompt}`,
      config: {
        systemInstruction:
          'You are the Skyforge Arena tactical announcer and Blender 3D asset advisor. Respond in 2-3 punchy, actionable sentences with specific combat counters (Golem Charger, Wisp Kiter, Shard Swarmer) or GLTF/FBX export tips.',
      },
    });
    const latencyMs = Date.now() - startMs;
    res.json({
      model: 'gemini-3.1-flash-lite',
      latencyMs,
      text: response.text ?? '',
    });
  } catch (error: unknown) {
    console.error('Quick tip Gemini error:', error);
    const status =
      typeof error === 'object' && error !== null && 'status' in error
        ? Number((error as { status?: number }).status) || 502
        : 502;
    const message =
      error instanceof Error
        ? error.message
        : 'Unable to reach Gemini low-latency service.';
    res.status(status >= 400 && status < 600 ? status : 502).json({ error: message });
  }
});

// High-Thinking Deep Strategy & Blender Asset Analysis (gemini-4-carbon, ThinkingLevel.HIGH, no maxOutputTokens)
app.post('/api/ai/deep-analysis', async (req, res) => {
  try {
    const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim().slice(0, 1200) : '';
    const telemetry = req.body?.telemetry ?? {};
    if (!prompt) {
      return res.status(400).json({ error: 'Analysis prompt is required.' });
    }
    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({
        error: 'Gemini API key is not configured in Settings > Secrets.',
      });
    }

    const ai = getGeminiClient();
    const startMs = Date.now();
    const response = await ai.models.generateContent({
      model: 'gemini-4-carbon',
      contents: `Match & Rig Telemetry: ${JSON.stringify(telemetry).slice(0, 1000)}\nDeep Analysis Request: ${prompt}`,
      config: {
        systemInstruction:
          'You are the Skyforge Arena Grandmaster Tactician and Technical 3D Pipeline Architect. Provide a thorough, structured breakdown covering wave survival tactics, local 2P synergy, enemy telegraph counters, or Blender-to-Three.js GLTF/FBX rigging optimization.',
        thinkingConfig: {
          thinkingLevel: ThinkingLevel.HIGH,
        },
      },
    });
    const latencyMs = Date.now() - startMs;
    res.json({
      model: 'gemini-4-carbon',
      thinkingLevel: 'HIGH',
      latencyMs,
      text: response.text ?? '',
    });
  } catch (error: unknown) {
    console.error('Deep analysis Gemini error:', error);
    const status =
      typeof error === 'object' && error !== null && 'status' in error
        ? Number((error as { status?: number }).status) || 502
        : 502;
    const rawMsg = error instanceof Error ? error.message : 'Deep analysis request failed.';
    const friendly =
      status === 403 || status === 429
        ? `${rawMsg} Note: gemini-4-carbon requires a billing-enabled API key in Settings > Secrets.`
        : rawMsg;
    res.status(status >= 400 && status < 600 ? status : 502).json({ error: friendly });
  }
});

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';
  const port = Number(process.env.PORT) || 3000;

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Skyforge Arena server listening on http://0.0.0.0:${port}`);
  });
}

startServer();
