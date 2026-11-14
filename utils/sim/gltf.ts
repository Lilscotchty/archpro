// utils/sim/gltf.ts — writes a SimModel as a binary glTF (.glb): metres, +Y up, one mesh per part, PBR base colours.
import { DEFAULT_COLORS, MatKey, SimModel } from './types';

const hexToRgb = (h: string): [number, number, number] => {
  const n = parseInt(h.replace('#', ''), 16);
  const lin = (c: number) => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };   // sRGB -> linear
  return [lin((n >> 16) & 255), lin((n >> 8) & 255), lin(n & 255)];
};

export function buildGLB(model: SimModel, colors: Record<MatKey, string> = DEFAULT_COLORS, name = 'ArchPro model'): ArrayBuffer {
  const parts = model.parts.filter(p => p.kind !== 'ground');
  const matKeys = Array.from(new Set(parts.map(p => p.material)));
  const materials = matKeys.map(k => {
    const [r, g, b] = hexToRgb(colors[k] ?? DEFAULT_COLORS[k]);
    const glass = k === 'glass';
    return { name: k, pbrMetallicRoughness: { baseColorFactor: [r, g, b, glass ? 0.35 : 1], metallicFactor: 0, roughnessFactor: glass ? 0.1 : 0.85 }, ...(glass ? { alphaMode: 'BLEND' } : {}), doubleSided: false };
  });

  const chunks: Uint8Array[] = [];
  let offset = 0;
  const bufferViews: object[] = [], accessors: object[] = [], meshes: object[] = [], nodes: object[] = [];
  const addView = (data: ArrayBufferView, target: number) => {
    const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    const pad = (4 - (bytes.byteLength % 4)) % 4;
    const padded = new Uint8Array(bytes.byteLength + pad); padded.set(bytes);
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.byteLength, target });
    chunks.push(padded); offset += padded.byteLength;
    return bufferViews.length - 1;
  };

  parts.forEach(p => {
    const pos = new Float32Array(p.positions), nor = new Float32Array(p.normals), idx = new Uint32Array(p.indices);
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < pos.length; i += 3) for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], pos[i + a]); mx[a] = Math.max(mx[a], pos[i + a]); }
    const vp = addView(pos, 34962), vn = addView(nor, 34962), vi = addView(idx, 34963);
    accessors.push({ bufferView: vp, componentType: 5126, count: pos.length / 3, type: 'VEC3', min: mn, max: mx });
    accessors.push({ bufferView: vn, componentType: 5126, count: nor.length / 3, type: 'VEC3' });
    accessors.push({ bufferView: vi, componentType: 5125, count: idx.length, type: 'SCALAR' });
    const a = accessors.length - 3;
    meshes.push({ name: p.name, primitives: [{ attributes: { POSITION: a, NORMAL: a + 1 }, indices: a + 2, material: matKeys.indexOf(p.material) }] });
    nodes.push({ name: p.name, mesh: meshes.length - 1, extras: p.sourceId ? { planElement: p.sourceId, kind: p.kind, level: p.level } : { kind: p.kind } });
  });

  const json = {
    asset: { version: '2.0', generator: 'ArchPro' },
    scene: 0,
    scenes: [{ name, nodes: nodes.map((_, i) => i) }],
    nodes, meshes, materials, accessors, bufferViews,
    buffers: [{ byteLength: offset }],
  };
  let jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jpad = (4 - (jsonBytes.byteLength % 4)) % 4;
  if (jpad) { const t = new Uint8Array(jsonBytes.byteLength + jpad).fill(0x20); t.set(jsonBytes); jsonBytes = t; }

  const total = 12 + 8 + jsonBytes.byteLength + 8 + offset;
  const out = new ArrayBuffer(total), dv = new DataView(out), u8 = new Uint8Array(out);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, jsonBytes.byteLength, true); dv.setUint32(16, 0x4e4f534a, true); u8.set(jsonBytes, 20);
  let p = 20 + jsonBytes.byteLength;
  dv.setUint32(p, offset, true); dv.setUint32(p + 4, 0x004e4942, true); p += 8;
  for (const c of chunks) { u8.set(c, p); p += c.byteLength; }
  return out;
}
