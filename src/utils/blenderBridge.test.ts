import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateBlenderAddonScript,
  sanitizeBlenderFilename,
  sanitizePythonString,
  validateGlbHeader,
} from './blenderBridge';

function makeValidGlbBytes(totalSize = 32): Uint8Array {
  const buf = new Uint8Array(totalSize);
  // Magic: "glTF"
  buf[0] = 0x67;
  buf[1] = 0x6c;
  buf[2] = 0x54;
  buf[3] = 0x46;
  const view = new DataView(buf.buffer);
  view.setUint32(4, 2, true); // version 2
  view.setUint32(8, totalSize, true); // length
  return buf;
}

test('validateGlbHeader accepts valid glTF 2.0 binary headers', () => {
  const valid = makeValidGlbBytes(64);
  const res = validateGlbHeader(valid);
  assert.equal(res.valid, true);
  assert.equal(res.declaredLength, 64);
});

test('validateGlbHeader rejects non-GLB payloads, wrong versions, and truncated buffers', () => {
  assert.equal(validateGlbHeader(new Uint8Array([1, 2, 3])).valid, false);

  const wrongMagic = makeValidGlbBytes(32);
  wrongMagic[0] = 0x00;
  assert.equal(validateGlbHeader(wrongMagic).valid, false);

  const wrongVersion = makeValidGlbBytes(32);
  new DataView(wrongVersion.buffer).setUint32(4, 1, true);
  assert.equal(validateGlbHeader(wrongVersion).valid, false);

  const badLength = makeValidGlbBytes(32);
  new DataView(badLength.buffer).setUint32(8, 9999, true);
  assert.equal(validateGlbHeader(badLength).valid, false);
});

test('sanitizeBlenderFilename strips path traversal and guarantees .glb suffix', () => {
  assert.equal(sanitizeBlenderFilename('../../etc/passwd'), 'passwd.glb');
  assert.equal(sanitizeBlenderFilename('C:\\Users\\Artist\\Hero Rig!.glb'), 'Hero_Rig_.glb');
  assert.equal(sanitizeBlenderFilename(''), 'blender-live-sync.glb');
  assert.equal(sanitizeBlenderFilename('sky_knight.GLB'), 'sky_knight.GLB');
});

test('generateBlenderAddonScript outputs valid Blender add-on and escapes unsafe characters', () => {
  const escaped = sanitizePythonString('https://example.com"\nimport os');
  assert.equal(escaped.includes('\n'), false);
  assert.equal(escaped.includes('\\"'), true);

  const script = generateBlenderAddonScript({
    serverUrl: 'https://arena.example.com/',
    sessionId: 'abc123session',
    token: 'tok_secret_value',
  });

  assert.match(script, /"name": "Skyforge Arena Live Bridge"/);
  assert.match(script, /default="https:\/\/arena\.example\.com"/);
  assert.match(script, /default="abc123session"/);
  assert.match(script, /\/api\/blender-bridge\/\{session_id\}\/push/);
  assert.match(script, /"Authorization": f"Bearer \{token\}"/);
  assert.match(script, /bpy\.ops\.export_scene\.gltf/);
});
