// Tiny dependency-free PNG reader and animated GIF writer, used by record-demo.js.
const zlib = require('zlib');

// RGBA pixels from a PNG (8-bit RGB or RGBA, non-interlaced, as browsers produce).
function readPng(buf) {
  let p = 8, w = 0, h = 0, ct = 0; const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8), d = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); ct = d[9]; if (d[8] !== 8 || d[12] !== 0) throw new Error('unsupported PNG'); }
    else if (type === 'IDAT') idat.push(d);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  const bpp = ct === 6 ? 4 : ct === 2 ? 3 : 0; if (!bpp) throw new Error('unsupported PNG colour type ' + ct);
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * bpp, out = Buffer.alloc(w * h * 4), prev = Buffer.alloc(stride), cur = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      cur[x] = v & 255;
    }
    for (let x = 0; x < w; x++) { out[(y * w + x) * 4] = cur[x * bpp]; out[(y * w + x) * 4 + 1] = cur[x * bpp + 1]; out[(y * w + x) * 4 + 2] = cur[x * bpp + 2]; out[(y * w + x) * 4 + 3] = 255; }
    cur.copy(prev);
  }
  return { w, h, rgba: out };
}

// One shared palette (the 256 most common colours, rounded), then nearest-colour mapping.
function buildPalette(frames) {
  const count = new Map();
  for (const f of frames) for (let i = 0; i < f.rgba.length; i += 16) { const k = ((f.rgba[i] >> 2) << 12) | ((f.rgba[i + 1] >> 2) << 6) | (f.rgba[i + 2] >> 2); count.set(k, (count.get(k) || 0) + 1); }
  const top = [...count].sort((a, b) => b[1] - a[1]).slice(0, 256).map(([k]) => [((k >> 12) & 63) << 2 | 2, ((k >> 6) & 63) << 2 | 2, (k & 63) << 2 | 2]);
  while (top.length < 256) top.push([0, 0, 0]);
  const cache = new Map();
  const index = (r, g, b) => {
    const k = (r << 16) | (g << 8) | b; let v = cache.get(k); if (v !== undefined) return v;
    let best = 0, bd = 1e9;
    for (let i = 0; i < 256; i++) { const p = top[i], d = (p[0] - r) ** 2 * 2 + (p[1] - g) ** 2 * 4 + (p[2] - b) ** 2 * 3; if (d < bd) { bd = d; best = i; } }
    cache.set(k, best); return best;
  };
  return { colors: top, index };
}

// GIF LZW compression of colour indices (8-bit codes).
function lzw(indices) {
  const out = []; let cur = 0, bits = 0;
  const emit = (code, size) => { cur |= code << bits; bits += size; while (bits >= 8) { out.push(cur & 255); cur >>>= 8; bits -= 8; } };
  const CLEAR = 256, END = 257; let size = 9, next = 258, dict = new Map();
  emit(CLEAR, size);
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const c = indices[i], key = prefix * 256 + c;
    const hit = dict.get(key);
    if (hit !== undefined) { prefix = hit; continue; }
    emit(prefix, size);
    if (next < 4096) { dict.set(key, next++); if (next > (1 << size) && size < 12) size++; }
    else { emit(CLEAR, size); dict = new Map(); size = 9; next = 258; }
    prefix = c;
  }
  emit(prefix, size); emit(END, size); if (bits > 0) out.push(cur & 255);
  return Buffer.from(out);
}
const blocks = data => { const parts = []; for (let i = 0; i < data.length; i += 255) { const s = data.subarray(i, i + 255); parts.push(Buffer.from([s.length]), s); } parts.push(Buffer.from([0])); return Buffer.concat(parts); };

// frames: [{ w, h, rgba, delay (ms) }] all the same size. Only changed areas are stored after the first frame.
function writeGif(frames) {
  const { w, h } = frames[0], pal = buildPalette(frames);
  const mapped = frames.map(f => { const idx = new Uint8Array(w * h); for (let i = 0, j = 0; i < idx.length; i++, j += 4) idx[i] = pal.index(f.rgba[j], f.rgba[j + 1], f.rgba[j + 2]); return idx; });
  const head = Buffer.alloc(13); head.write('GIF89a', 0, 'ascii'); head.writeUInt16LE(w, 6); head.writeUInt16LE(h, 8); head[10] = 0xF7; head[11] = 0; head[12] = 0;
  const gct = Buffer.from(pal.colors.flat());
  const loop = Buffer.from([0x21, 0xFF, 0x0B, ...Buffer.from('NETSCAPE2.0'), 0x03, 0x01, 0x00, 0x00, 0x00]);
  const parts = [head, gct, loop];
  let prev = null, pending = null;
  const flush = () => { if (!pending) return; const { x, y, fw, fh, data, delay } = pending;
    const gce = Buffer.from([0x21, 0xF9, 0x04, 0x04, 0, 0, 0, 0]); gce.writeUInt16LE(Math.max(2, Math.round(delay / 10)), 4);
    const desc = Buffer.alloc(10); desc[0] = 0x2C; desc.writeUInt16LE(x, 1); desc.writeUInt16LE(y, 3); desc.writeUInt16LE(fw, 5); desc.writeUInt16LE(fh, 7); desc[9] = 0;
    parts.push(gce, desc, Buffer.from([8]), blocks(lzw(data))); pending = null; };
  mapped.forEach((idx, n) => {
    let x0 = 0, y0 = 0, x1 = w - 1, y1 = h - 1;
    if (prev) {
      x0 = w; y0 = h; x1 = -1; y1 = -1;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (idx[y * w + x] !== prev[y * w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      if (x1 < 0) { if (pending) pending.delay += frames[n].delay; return; }
    }
    flush();
    const fw = x1 - x0 + 1, fh = y1 - y0 + 1, data = new Uint8Array(fw * fh);
    for (let y = 0; y < fh; y++) data.set(idx.subarray((y0 + y) * w + x0, (y0 + y) * w + x0 + fw), y * fw);
    pending = { x: x0, y: y0, fw, fh, data, delay: frames[n].delay };
    prev = idx;
  });
  flush(); parts.push(Buffer.from([0x3B]));
  return Buffer.concat(parts);
}

module.exports = { readPng, writeGif };
