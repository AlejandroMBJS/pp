import * as THREE from 'three';
import DxfParser from 'dxf-parser';
import { NURBSCurve } from 'three/examples/jsm/curves/NURBSCurve.js';

const MAX_ENTITIES = 50_000;
const CHUNK_SIZE = 800;
const MAX_DXF_BYTES = 200 * 1024 * 1024; // 200 MB - allows large technical drawings

export type ProgressCallback = (pct: number, label: string) => void;

/**
 * Fetch a DXF from a URL (with optional auth headers) and render it.
 * Reports progress 0-100 via onProgress.
 */
export async function renderDxfFromUrl(
  url: string,
  headers?: Record<string, string>,
  onProgress?: ProgressCallback
): Promise<THREE.Group> {
  onProgress?.(2, 'Downloading technical file…');

  // Stream the response so we can report download progress.
  // If the backend returns 404 the DXF preview conversion may still be running —
  // retry up to ~15 s before giving up.
  const init: RequestInit = headers ? { headers } : {};
  const MAX_ATTEMPTS = 8;
  let res = await fetch(url, init);
  for (let attempt = 1; !res.ok && res.status === 404 && attempt < MAX_ATTEMPTS; attempt++) {
    const wait = attempt * 2000; // 2s, 4s, 6s…
    onProgress?.(2, `Conversion in progress… retrying (${attempt}/${MAX_ATTEMPTS - 1})`);
    await new Promise<void>(r => setTimeout(r, wait));
    res = await fetch(url, init);
  }
  if (!res.ok) throw new Error(`Failed to download file: ${res.status}`);

  const contentLength = Number(res.headers.get('content-length') ?? 0);
  let received = 0;
  const chunks: Uint8Array[] = [];
  const reader = res.body!.getReader();
  let capped = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (contentLength > 0) {
      const pct = Math.round((received / Math.max(contentLength, received)) * 30);
      onProgress?.(2 + pct, `Downloading… ${(received / 1_048_576).toFixed(1)} MB`);
    }
    if (received >= MAX_DXF_BYTES) {
      capped = true;
      await reader.cancel();
      break;
    }
  }

  if (capped) {
    onProgress?.(32, `Large file: using first ${(MAX_DXF_BYTES / 1_048_576).toFixed(0)} MB…`);
  }
  const blob = new Blob(chunks);
  const text = await blob.text();
  return renderDxf(text, onProgress, 30);
}

/**
 * Render a DXF string. Yields control to the browser between geometry chunks
 * so the UI stays responsive and a real progress bar can be shown.
 * onProgress receives values 0-100.
 * startPct allows composition (e.g. 30 if download was already 0-30).
 */
export async function renderDxf(
  dxfData: string,
  onProgress?: ProgressCallback,
  startPct = 0
): Promise<THREE.Group> {
  const parseStart = startPct;
  const parseEnd = startPct + 15;

  onProgress?.(parseStart, 'Parsing DXF…');

  // Truncate oversized files before parsing — parseSync blocks the main thread
  let processedData = dxfData.length > MAX_DXF_BYTES
    ? truncateDxf(dxfData, MAX_DXF_BYTES)
    : dxfData.trim();

  if (!processedData.toUpperCase().endsWith('EOF')) {
    processedData += '\n0\nEOF';
  }

  // yield once so the progress bar paints before the synchronous parse
  await new Promise<void>(r => setTimeout(r, 0));

  // parseSync blocks briefly — unavoidable without a Worker, but fast relative to render
  const parser = new DxfParser();
  let dxf: any;
  try {
    dxf = parser.parseSync(processedData);
  } catch {
    throw new Error('Unable to parse DXF. The file may be binary or malformed.');
  }

  onProgress?.(parseEnd, 'Building geometry…');

  const group = new THREE.Group();
  if (!dxf?.entities?.length) return group;

  // Share materials by colour — avoids thousands of identical Material objects
  const materialCache = new Map<number | string, THREE.LineBasicMaterial>();
  const getMat = (color: any) => {
    const hex = aciToHex(color);
    let m = materialCache.get(hex);
    if (!m) { m = new THREE.LineBasicMaterial({ color: hex }); materialCache.set(hex, m); }
    return m;
  };

  const total = Math.min(dxf.entities.length, MAX_ENTITIES);
  const renderRange = 100 - parseEnd;

  for (let i = 0; i < total; i += CHUNK_SIZE) {
    const end = Math.min(i + CHUNK_SIZE, total);
    for (let j = i; j < end; j++) {
      const geo = buildGeometry(dxf.entities[j]);
      if (geo) group.add(new THREE.Line(geo, getMat(dxf.entities[j].color)));
    }
    const pct = parseEnd + Math.round((end / total) * renderRange);
    const shown = dxf.entities.length > MAX_ENTITIES
      ? `${end.toLocaleString()} / ${MAX_ENTITIES.toLocaleString()} (limit)`
      : `${end.toLocaleString()} / ${total.toLocaleString()}`;
    onProgress?.(pct, `Rendering entities... ${shown}`);
    // Yield to browser so it can paint the progress bar
    await new Promise<void>(r => setTimeout(r, 0));
  }

  return group;
}

// ─── DXF text truncation ─────────────────────────────────────────────────────

/**
 * Truncate a large DXF string to maxBytes while ending on a clean line boundary.
 * Appends ENDSEC+EOF so dxf-parser can close any open section.
 */
function truncateDxf(text: string, maxBytes: number): string {
  if (text.length <= maxBytes) return text;
  
  const searchStart = Math.max(0, maxBytes - 50000);
  const searchText = text.substring(searchStart, maxBytes + 10000);
  
  const entityEndMatch = searchText.lastIndexOf('\n  0\n');
  if (entityEndMatch !== -1) {
    const cutPoint = searchStart + entityEndMatch;
    const truncated = text.substring(0, cutPoint);
    return truncated + '\n0\nENDSEC\n0\nEOF';
  }
  
  const cut = text.lastIndexOf('\n', maxBytes);
  const truncated = cut > 0 ? text.substring(0, cut) : text.substring(0, maxBytes);
  return truncated + '\n0\nENDSEC\n0\nEOF';
}

// ─── AutoCAD Color Index (ACI) → three.js hex ────────────────────────────────
// dxf-parser returns entity.color as an ACI integer (0-256), NOT an RGB hex.
// ACI 7 = white in AutoCAD, but 7 as a THREE hex = 0x000007 (invisible on dark bg).

const ACI_STANDARD: Record<number, number> = {
  0: 0xffffff, // by block → white
  1: 0xff0000, // red
  2: 0xffff00, // yellow
  3: 0x00ff00, // green
  4: 0x00ffff, // cyan
  5: 0x0000ff, // blue
  6: 0xff00ff, // magenta
  7: 0xffffff, // white (AutoCAD white on dark bg)
  8: 0x808080, // dark grey
  9: 0xc0c0c0, // light grey
  256: 0xcccccc, // by layer → fallback
};

function aciToHex(color: any): number {
  if (color == null) return 0xcccccc;
  // Already looks like a real hex color (> 256)
  if (typeof color === 'number' && color > 256) return color;
  const std = ACI_STANDARD[color as number];
  if (std !== undefined) return std;
  // ACI 10-249: approximate via the AutoCAD color wheel
  // The wheel cycles hue in 10-unit bands, each with 5 shades.
  if (typeof color === 'number' && color >= 10 && color <= 249) {
    const band = Math.floor((color - 10) / 10);
    const shade = (color - 10) % 10;
    const hue = (band / 24) * 360;
    const lightness = [100, 80, 60, 40, 20, 100, 80, 60, 40, 20][shade] ?? 60;
    return hslToHex(hue, 100, lightness);
  }
  return 0xcccccc;
}

function hslToHex(h: number, s: number, l: number): number {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return Math.round((l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255);
  };
  return (f(0) << 16) | (f(8) << 8) | f(4);
}

// ─── Geometry builders ────────────────────────────────────────────────────────

function buildGeometry(entity: any): THREE.BufferGeometry | null {
  switch (entity.type) {
    case 'LINE': {
      const v = entity.vertices;
      if (!v?.[0] || !v?.[1]) return null;
      return new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(v[0].x, v[0].y, v[0].z || 0),
        new THREE.Vector3(v[1].x, v[1].y, v[1].z || 0),
      ]);
    }
    case 'LWPOLYLINE':
    case 'POLYLINE': {
      if (!entity.vertices?.length) return null;
      const pts = entity.vertices.map((v: any) => new THREE.Vector3(v.x, v.y, v.z || 0));
      if (entity.shape) pts.push(pts[0].clone());
      return new THREE.BufferGeometry().setFromPoints(pts);
    }
    case 'CIRCLE': {
      const c = entity.center;
      if (!c) return null;
      const pts = [];
      for (let i = 0; i <= 64; i++) {
        const t = (i / 64) * Math.PI * 2;
        pts.push(new THREE.Vector3(c.x + Math.cos(t) * entity.radius, c.y + Math.sin(t) * entity.radius, c.z || 0));
      }
      return new THREE.BufferGeometry().setFromPoints(pts);
    }
    case 'ARC': {
      const c = entity.center;
      if (!c) return null;
      const delta = entity.endAngle < entity.startAngle
        ? entity.endAngle + 2 * Math.PI - entity.startAngle
        : entity.endAngle - entity.startAngle;
      const pts = [];
      for (let i = 0; i <= 32; i++) {
        const t = entity.startAngle + (i / 32) * delta;
        pts.push(new THREE.Vector3(c.x + Math.cos(t) * entity.radius, c.y + Math.sin(t) * entity.radius, c.z || 0));
      }
      return new THREE.BufferGeometry().setFromPoints(pts);
    }
    case 'SPLINE':
      return buildSplineGeometry(entity);
    default:
      return null;
  }
}

function buildSplineGeometry(entity: any): THREE.BufferGeometry | null {
  const cp = Array.isArray(entity.controlPoints) ? entity.controlPoints : [];
  if (cp.length < 2) return null;
  try {
    const degree = typeof entity.degreeOfSplineCurve === 'number' ? entity.degreeOfSplineCurve : 3;
    const knots = Array.isArray(entity.knotValues) ? entity.knotValues : [];
    if (knots.length >= cp.length + degree + 1) {
      const nPts = cp.map((p: any) => new THREE.Vector4(p.x, p.y, p.z || 0, 1));
      const curve = new NURBSCurve(degree, knots, nPts);
      const sampled = curve.getPoints(Math.max(24, cp.length * 8));
      if (entity.closed && sampled.length > 0) sampled.push(sampled[0].clone());
      return new THREE.BufferGeometry().setFromPoints(sampled);
    }
  } catch { /* fall through */ }
  const pts = cp.map((p: any) => new THREE.Vector3(p.x, p.y, p.z || 0));
  if (entity.closed && pts.length > 0) pts.push(pts[0].clone());
  return new THREE.BufferGeometry().setFromPoints(pts);
}
