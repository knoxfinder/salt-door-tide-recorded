/**
 * salt-door-tide — a deterministic procedural entry for make.fun ai-excited-01.
 *
 * The picture: a scarlet doorway stands on a cracked salt flat, and the ocean
 * pours up out of it as a twisting spout that feeds a luminous ring hanging in
 * the sky. Broken architecture floats around the column, a tide of shallow
 * water has reached the foreground, and one tiny observer stands on the flat,
 * backlit, for scale.
 *
 * The whole scene is drawn analytically per pixel from a fixed integer hash, so
 * two runs on the same Node version write byte-identical PNGs. No randomness,
 * no clock, no network, standard library only.
 *
 * Output: $MAKEFUN_OUTPUT_DIR/entry.png (default /output/entry.png).
 */

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const WIDTH = 1024;
const HEIGHT = 1024;

// ---------------------------------------------------------------- math helpers

function clamp01(x) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function mix(a, b, t) {
  return a + (b - a) * t;
}

// Works for reversed edges too (e0 > e1), which the shading relies on.
function smoothstep(e0, e1, x) {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

// Deterministic integer hash in [0,1). Every texture in the image is built on it.
function hash2(x, y) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function vnoise(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  return mix(mix(a, b, u), mix(c, d, u), v);
}

function fbm(x, y, octaves) {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * vnoise(x * freq, y * freq);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

// ---------------------------------------------------------------- scene layout

const VH = -0.10; // horizon line
const RING_CX = 0.0;
const RING_CY = 0.55;
const RING_R = 0.25;
const RING_W = 0.028;
const DOOR_HW = 0.16; // doorway half width
const DOOR_YT = 0.24; // centre of the arch's semicircle
const DOOR_FRAME = 0.052; // scarlet frame thickness
const COL_TOP = 0.58; // where the waterspout reaches the ring
const TIDE_D = 0.55; // depth below the horizon where the shallow tide begins

// Floating slabs: x, y, half-length, half-thickness, tilt.
const SLABS = [
  [-0.58, 0.30, 0.190, 0.050, -0.30],
  [0.60, 0.16, 0.150, 0.040, 0.22],
  [-0.30, 0.62, 0.140, 0.034, 0.45],
  [0.24, 0.46, 0.120, 0.030, -0.35],
  [-0.42, 0.86, 0.120, 0.030, 0.20],
  [0.10, 0.94, 0.150, 0.030, 0.10],
  [-0.30, 0.09, 0.130, 0.034, -0.10],
  [0.34, 0.74, 0.095, 0.028, 0.40],
];

const FX = -0.015; // tiny observer's horizontal position
const FH = 0.072; // tiny observer's height

// Scratch buffers reused per pixel so the hot loop allocates nothing.
const SCENE = [0, 0, 0];
const REFL = [0, 0, 0];

// The sky and everything standing in it, including the doorway and the spout.
function skyScene(u, v, out) {
  // Base gradient: cold deep sky, warm near the doorway on the horizon.
  const t = clamp01((v - VH) / (1 - VH));
  let r = mix(0.030, 0.004, t);
  let g = mix(0.085, 0.016, t);
  let b = mix(0.160, 0.055, t);

  const hg = Math.exp(-(u * u) / 0.22 - ((v - VH) * (v - VH)) / 0.014);
  r += 0.34 * hg;
  g += 0.080 * hg;
  b += 0.032 * hg;

  // Sparse stars, brighter high up.
  if (v > 0.04) {
    const gx = Math.floor(u * 150 + 1000);
    const gy = Math.floor(v * 150 + 1000);
    const sr = hash2(gx, gy);
    if (sr > 0.982) {
      const fx = u * 150 + 1000 - gx - 0.5;
      const fy = v * 150 + 1000 - gy - 0.5;
      const pt = Math.exp(-(fx * fx + fy * fy) * 60.0);
      const tw = 0.55 + 0.45 * hash2(gx + 17, gy + 5);
      const s = (pt * (sr - 0.982)) / 0.018 * tw * smoothstep(0.04, 0.45, v);
      r += s * 0.80;
      g += s * 0.86;
      b += s;
    }
  }

  // The luminous ring: a hot band, a wide halo, a lit interior and a soft rim.
  const rdx = u - RING_CX;
  const rdy = v - RING_CY;
  const rd = Math.sqrt(rdx * rdx + rdy * rdy);
  const band = Math.exp(-((rd - RING_R) * (rd - RING_R)) / (RING_W * RING_W));
  const halo = Math.exp(-((rd - RING_R) * (rd - RING_R)) / (RING_W * RING_W * 12.0));
  const innerRim = Math.exp(-((rd - (RING_R - RING_W * 1.5)) * (rd - (RING_R - RING_W * 1.5))) / (RING_W * RING_W * 0.5));
  r += band * 1.25 + halo * 0.42 + innerRim * 0.50;
  g += band * 0.98 + halo * 0.30 + innerRim * 0.58;
  b += band * 0.62 + halo * 0.16 + innerRim * 0.72;

  const fill = clamp01(1 - rd / RING_R);
  const fillGlow = fill * fill * fill;
  r += fillGlow * 0.12;
  g += fillGlow * 0.19;
  b += fillGlow * 0.26;

  // Faint rays fanning off the ring.
  const rayAng = Math.atan2(rdy, rdx);
  const rays = 0.5 + 0.5 * Math.sin(rayAng * 17.0 + 1.7);
  const rayFall = Math.exp(-Math.abs(rd - RING_R) / 0.6);
  const ray = rays * rayFall * 0.11;
  r += ray * 1.00;
  g += ray * 0.82;
  b += ray * 0.52;

  // Doorway: rectangle plus semicircular arch, as one signed distance.
  const dRect = Math.max(Math.abs(u) - DOOR_HW, VH - v, v - DOOR_YT);
  const cdx = u;
  const cdy = v - DOOR_YT;
  const dCirc = Math.sqrt(cdx * cdx + cdy * cdy) - DOOR_HW;
  const dUnion = Math.min(dRect, dCirc);
  const opening = smoothstep(0.006, -0.006, dUnion);
  const frame = smoothstep(DOOR_FRAME, 0.0, dUnion) - opening;

  if (opening > 0.001) {
    const s = clamp01((v - VH) / (DOOR_YT + DOOR_HW - VH));
    const sw = fbm(u * 8.0, v * 8.0 - s * 6.0, 3);
    const churn = 0.5 + 0.5 * Math.sin(s * 22.0 + sw * 8.0 + u * 12.0);
    const pr = mix(0.46, 0.06, churn);
    const pg = mix(0.03, 0.32, churn);
    const pb = mix(0.04, 0.46, churn);
    r = mix(r, pr, opening);
    g = mix(g, pg, opening);
    b = mix(b, pb, opening);
  }

  if (frame > 0.001) {
    const lit = smoothstep(-DOOR_FRAME, 0.022, dUnion);
    const fr = mix(1.00, 0.50, lit);
    const fg = mix(0.12, 0.02, lit);
    const fb = mix(0.08, 0.03, lit);
    r = mix(r, fr, frame);
    g = mix(g, fg, frame);
    b = mix(b, fb, frame);
  }

  const dOut = Math.max(dUnion, 0);
  const glow = Math.exp(-dOut * 16.0);
  r += glow * 0.60;
  g += glow * 0.06;
  b += glow * 0.05;

  // The waterspout: ocean climbing out of the door and into the ring.
  if (v > VH && v < COL_TOP + 0.06) {
    const s = clamp01((v - VH) / (COL_TOP - VH));
    const cxs = 0.07 * Math.sin(s * Math.PI * 2.0) + 0.05 * Math.sin(s * Math.PI);
    const rad = mix(0.140, 0.026, s) * (1.0 + 0.10 * Math.sin(s * 11.0));
    const dxn = (u - cxs) / rad;
    const adx = Math.abs(dxn);
    if (adx < 1.5) {
      const nz = Math.sqrt(Math.max(0, 1 - Math.min(dxn * dxn, 1)));
      const ang = Math.atan2(dxn, nz);
      const stripe = 0.5 + 0.5 * Math.sin(ang * 3.0 + s * 20.0);
      const crest = 0.5 + 0.5 * Math.sin(s * 30.0 - ang * 2.0 + fbm(u * 6.0, v * 6.0, 2) * 5.0);
      let lit = 0.24 + 0.55 * nz + 0.45 * stripe * crest + 0.35 * (1.0 - nz);
      lit = clamp01(lit);
      let wr = mix(0.02, 0.62, lit);
      let wg = mix(0.24, 0.97, lit);
      let wb = mix(0.46, 1.00, lit);
      const foam = smoothstep(0.58, 1.0, adx);
      wr = mix(wr, 0.94, foam * 0.78);
      wg = mix(wg, 0.99, foam * 0.78);
      wb = mix(wb, 1.00, foam * 0.78);
      const alpha = smoothstep(1.25, 0.90, adx);
      r = mix(r, wr, alpha);
      g = mix(g, wg, alpha);
      b = mix(b, wb, alpha);
      r += alpha * (1 - nz) * 0.24;
      g += alpha * (1 - nz) * 0.30;
      b += alpha * (1 - nz) * 0.36;
    }

    // Spray: a few bright droplets thrown off the spout.
    if (adx < 2.6) {
      const gx = Math.floor(u * 220 + 2000);
      const gy = Math.floor(v * 220 + 2000);
      const sr = hash2(gx, gy);
      if (sr > 0.9955) {
        const fx = u * 220 + 2000 - gx - 0.5;
        const fy = v * 220 + 2000 - gy - 0.5;
        const pt = Math.exp(-(fx * fx + fy * fy) * 90.0);
        const sp = (pt * (sr - 0.9955)) / 0.0045 * smoothstep(2.6, 0.6, adx) * (1.0 - s);
        r += sp * 0.90;
        g += sp * 0.95;
        b += sp;
      }
    }
  }

  // Floating architecture: tilted slabs, dark faces with lit rims.
  for (let i = 0; i < SLABS.length; i++) {
    const sl = SLABS[i];
    const ca = Math.cos(sl[4]);
    const sa = Math.sin(sl[4]);
    const px = u - sl[0];
    const py = v - sl[1];
    const lx = px * ca + py * sa;
    const ly = -px * sa + py * ca;
    const hw = sl[2];
    const hh = sl[3];
    if (Math.abs(lx) < hw + 0.01 && Math.abs(ly) < hh + 0.01) {
      const cov = smoothstep(hw + 0.004, hw - 0.004, Math.abs(lx)) * smoothstep(hh + 0.004, hh - 0.004, Math.abs(ly));
      const face = clamp01(ly / hh * 0.5 + 0.5);
      const base = 0.085 + 0.22 * face;
      let sr = base;
      let sg = base * 1.03;
      let sb = base * 1.20;
      const edge = Math.max(smoothstep(hh - 0.014, hh, ly), smoothstep(hw - 0.014, hw, Math.abs(lx)));
      sr += edge * 0.80;
      sg += edge * 0.62;
      sb += edge * 0.38;
      r = mix(r, sr, cov);
      g = mix(g, sg, cov);
      b = mix(b, sb, cov);
      const ug = smoothstep(-hh, -hh - 0.05, ly) * cov;
      r += ug * 0.06;
      g += ug * 0.12;
      b += ug * 0.17;
    }
  }

  // Horizon haze so the flat and the sky melt into each other.
  const haze = smoothstep(0.20, -0.02, v - VH) * 0.55;
  r = mix(r, 0.10, haze);
  g = mix(g, 0.15, haze);
  b = mix(b, 0.21, haze);

  out[0] = r;
  out[1] = g;
  out[2] = b;
}

// The salt flat: dry cracked crust far out, a shallow tide in the foreground,
// and a wobbling mirror of the sky over both.
function ground(u, v, out) {
  const d = VH - v; // depth below the horizon, > 0

  const wob = 0.010 * Math.sin(u * 42.0 + d * 26.0) + 0.006 * Math.sin(u * 95.0);
  skyScene(u + wob, VH + d * 0.96, REFL);

  // Dry salt crust.
  const grain = fbm(u * 42.0, v * 42.0, 2);
  let sr = 0.74 + 0.14 * grain;
  let sg = 0.72 + 0.13 * grain;
  let sb = 0.67 + 0.12 * grain;

  // Perspective-scaled crack network.
  const w = 1.0 / (d + 0.035);
  const cracks = Math.pow(1.0 - Math.abs(2.0 * fbm(u * w * 0.5, w * 0.5, 4) - 1.0), 7.0);
  const cf = cracks * smoothstep(0.95, 0.15, d);
  sr = mix(sr, 0.24, cf * 0.8);
  sg = mix(sg, 0.26, cf * 0.8);
  sb = mix(sb, 0.33, cf * 0.8);

  // Mirror weight is strongest at the horizon, and cracks break it up.
  const rw = clamp01(0.75 * Math.exp(-d * 3.5) + 0.35 * Math.exp(-d * 0.9));
  const k = rw * (1.0 - cf * 0.7);
  sr = mix(sr, REFL[0] * 0.92 + 0.010, k);
  sg = mix(sg, REFL[1] * 0.94 + 0.015, k);
  sb = mix(sb, REFL[2] * 0.98 + 0.020, k);

  // Pools of light spilling from the doorway and the ring.
  const doorPool = Math.exp(-(u * u) / 0.055) * Math.exp(-d * 3.0);
  sr += doorPool * 0.55;
  sg += doorPool * 0.09;
  sb += doorPool * 0.06;
  const ringPool = Math.exp(-(u * u) / 0.20) * Math.exp(-d * 2.2);
  sr += ringPool * 0.18;
  sg += ringPool * 0.26;
  sb += ringPool * 0.30;

  // The observer's dark smudge of a reflection.
  const sref = Math.exp(-((u - FX) * (u - FX)) / 0.0009) * Math.exp(-d * 13.0);
  sr = mix(sr, 0.05, sref * 0.6);
  sg = mix(sg, 0.06, sref * 0.6);
  sb = mix(sb, 0.09, sref * 0.6);

  // Shallow tide: a mirror-like sheet with ripples and a foaming leading edge.
  const tide = smoothstep(TIDE_D - 0.03, TIDE_D + 0.05, d);
  if (tide > 0.001) {
    const ripple = 0.020 * Math.sin(u * 55.0 + d * 70.0) + 0.012 * Math.sin(u * 130.0 - d * 20.0);
    const wr = 0.040 + 0.10 * smoothstep(TIDE_D, 1.1, d);
    let tr = mix(wr, REFL[0] * 0.88 + 0.02, 0.68);
    let tg = mix(wr * 1.6, REFL[1] * 0.92 + 0.04, 0.68);
    let tb = mix(wr * 2.4, REFL[2] * 0.97 + 0.06, 0.68);
    const spec = Math.pow(clamp01(ripple * 4.0 + 0.5), 6.0);
    tr += spec * 0.35;
    tg += spec * 0.40;
    tb += spec * 0.45;
    const foamEdge = smoothstep(TIDE_D + 0.06, TIDE_D + 0.01, d) * smoothstep(TIDE_D - 0.03, TIDE_D + 0.005, d);
    const foamStreak = Math.pow(clamp01(ripple * 3.0 + 0.5), 3.0) * tide;
    const foam = clamp01(foamEdge * 1.1 + foamStreak * 0.25);
    tr = mix(tr, 0.90, foam);
    tg = mix(tg, 0.94, foam);
    tb = mix(tb, 0.96, foam);
    sr = mix(sr, tr, tide);
    sg = mix(sg, tg, tide);
    sb = mix(sb, tb, tide);
  }

  // Foreground falls into shadow.
  const vb = smoothstep(0.20, 1.0, d);
  sr *= mix(1.0, 0.76, vb);
  sg *= mix(1.0, 0.76, vb);
  sb *= mix(1.0, 0.82, vb);

  out[0] = sr;
  out[1] = sg;
  out[2] = sb;
}

// Silhouette coverage of the tiny observer, feet at fy.
function figure(u, v, fy) {
  const s = FH;
  const lx = u - FX;
  const ly = v - fy;

  const hx = lx;
  const hy = ly - 0.90 * s;
  const head = Math.sqrt(hx * hx + hy * hy) - 0.075 * s;

  const ty = ly - 0.60 * s;
  const torso = Math.max(Math.abs(lx) - 0.085 * s, Math.abs(ty) - 0.20 * s) - 0.02 * s;

  const leg1 = Math.max(Math.abs(lx - 0.05 * s) - 0.035 * s, Math.abs(ly - 0.20 * s) - 0.22 * s);
  const leg2 = Math.max(Math.abs(lx + 0.05 * s) - 0.035 * s, Math.abs(ly - 0.20 * s) - 0.22 * s);

  const dd = Math.min(head, Math.min(torso, Math.min(leg1, leg2)));
  return smoothstep(0.006, -0.004, dd);
}

// ---------------------------------------------------------------- the renderer

function render(pixels) {
  let o = 0;
  for (let py = 0; py < HEIGHT; py++) {
    const v = 1 - (py + 0.5) / HEIGHT * 2;
    for (let px = 0; px < WIDTH; px++) {
      const u = (px + 0.5) / WIDTH * 2 - 1;

      let r;
      let g;
      let b;
      if (v >= VH) {
        skyScene(u, v, SCENE);
        r = SCENE[0];
        g = SCENE[1];
        b = SCENE[2];
      } else {
        ground(u, v, SCENE);
        r = SCENE[0];
        g = SCENE[1];
        b = SCENE[2];
      }

      // The observer stands on the flat, silhouetted against the doorway.
      const fig = figure(u, v, VH - 0.008);
      if (fig > 0.001) {
        r = mix(r, 0.020, fig);
        g = mix(g, 0.024, fig);
        b = mix(b, 0.045, fig);
        const rim = fig * (1 - fig) * 4.0;
        r += rim * 0.65;
        g += rim * 0.34;
        b += rim * 0.12;
      }

      // Gentle vignette, then clamp.
      const vig = 1 - 0.30 * (u * u * 0.55 + v * v * 0.9);
      r = clamp01(r * vig);
      g = clamp01(g * vig);
      b = clamp01(b * vig);

      pixels[o++] = (r * 255 + 0.5) | 0;
      pixels[o++] = (g * 255 + 0.5) | 0;
      pixels[o++] = (b * 255 + 0.5) | 0;
    }
  }
}

// ---------------------------------------------------------------- PNG encoding

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function encodePNG(width, height, pixels) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour RGB
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const at = y * (stride + 1);
    raw[at] = 0; // filter type 0
    raw.set(pixels.subarray(y * stride, (y + 1) * stride), at + 1);
  }

  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([signature, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

// ------------------------------------------------------------------- entrypoint

function main() {
  const pixels = new Uint8Array(WIDTH * HEIGHT * 3);
  render(pixels);
  const png = encodePNG(WIDTH, HEIGHT, pixels);

  const dir = process.env.MAKEFUN_OUTPUT_DIR || "/output";
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "entry.png"), png);
}

main();
