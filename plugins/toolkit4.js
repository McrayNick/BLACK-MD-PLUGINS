'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const axios = global.axios || require('axios');

const BM = '𝐁𝐋𝐀𝐂𝐊-𝐌𝐃';
const TAG = `_${BM}_`;
const UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36';

function ffmpegBin() {
  try { return require('../lib/stickerlite').ffmpegBin(); } catch (_) { return 'ffmpeg'; }
}
function ff(args, timeout = 180000) {
  return new Promise((resolve, reject) => {
    execFile(ffmpegBin(), args, { timeout, maxBuffer: 30 * 1024 * 1024 }, (err, _o, stderr) => {
      if (err) return reject(new Error(String(stderr || err.message).trim().split('\n').slice(-2).join(' ').slice(0, 220)));
      resolve();
    });
  });
}
function probe(file) {
  return new Promise((resolve) => {
    execFile(ffmpegBin(), ['-hide_banner', '-i', file], { timeout: 30000 }, (_e, _o, stderr) => {
      const s = String(stderr || '');
      const dim = s.match(/Video:.*?(\d{2,5})x(\d{2,5})/);
      const dur = s.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
      resolve({
        w: dim ? Number(dim[1]) : 0, h: dim ? Number(dim[2]) : 0,
        seconds: dur ? Number(dur[1]) * 3600 + Number(dur[2]) * 60 + Number(dur[3]) : 0,
        hasAudio: /Audio:/.test(s), hasVideo: /Video:/.test(s)
      });
    });
  });
}
function makeDir(tag) {
  const d = path.join(os.tmpdir(), `${tag}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
  fs.mkdirSync(d, { recursive: true });
  return d;
}
const rmDir = (d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} };
const num = (jid) => String(jid || '').split('@')[0].split(':')[0];
const even = (n) => Math.max(2, Math.round(n / 2) * 2);
const pickOne = (a, r = Math.random) => a[Math.floor(r() * a.length)];

function mediaTarget(m) {
  const pick = (t) => (t && ((t.msg || t).mimetype || '')) ? t : null;
  return pick(m.quoted) || pick(m);
}
const mimeOf = (t) => ((t && (t.msg || t).mimetype) || '').toLowerCase();
async function downloadTarget(client, t) {
  if (typeof t.download === 'function') { const b = await t.download(); if (b && b.length) return b; }
  if (typeof client.downloadMediaMessage === 'function') { const b = await client.downloadMediaMessage(t); if (b && b.length) return b; }
  throw new Error('could not download the media');
}
const extFor = (mime) => (/webp/.test(mime) ? 'webp' : /png/.test(mime) ? 'png' : /gif/.test(mime) ? 'gif'
  : /mp4|video/.test(mime) ? 'mp4' : /ogg|opus/.test(mime) ? 'ogg' : /mpeg|mp3/.test(mime) ? 'mp3'
  : /audio/.test(mime) ? 'm4a' : 'jpg');
const quotedText = (m) => (m.quoted ? [m.quoted.text, m.quoted.body, m.quoted.caption, m.quoted.msg?.text].find(Boolean) || '' : '');
async function needMedia(client, m, kinds, usage) {
  const t = mediaTarget(m);
  const mime = mimeOf(t);
  if (!t || !kinds.test(mime)) { await m.reply(usage); return null; }
  return { t, mime, buf: await downloadTarget(client, t) };
}

function seedFrom(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = (Math.imul(h ^ (h >>> 16), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const dayKey = () => new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10);

const THEMES = {
  cyan: { c: [0, 229, 255], bg: [6, 10, 28], bg2: [20, 8, 60] },
  magenta: { c: [255, 46, 200], bg: [18, 4, 28], bg2: [50, 6, 70] },
  green: { c: [57, 255, 120], bg: [2, 14, 10], bg2: [4, 40, 30] },
  gold: { c: [255, 196, 46], bg: [14, 10, 4], bg2: [50, 30, 6] },
  red: { c: [255, 60, 70], bg: [16, 4, 6], bg2: [60, 8, 14] },
  blue: { c: [70, 140, 255], bg: [4, 8, 24], bg2: [10, 30, 90] },
  purple: { c: [178, 102, 255], bg: [10, 4, 24], bg2: [40, 10, 80] },
  orange: { c: [255, 138, 31], bg: [16, 8, 2], bg2: [60, 24, 4] }
};
const COLOR_WORDS = { red: '#ff3c46', orange: '#ff8a1f', yellow: '#ffd23c', gold: '#ffc42e', green: '#2fd45f', teal: '#14b8a6', cyan: '#00e5ff', blue: '#468cff', navy: '#0b1f5c', purple: '#9b5cff', violet: '#8a2be2', pink: '#ff6fb5', magenta: '#ff2ec8', brown: '#8b5a2b', black: '#0a0a0f', white: '#ffffff', grey: '#808080', gray: '#808080', silver: '#c0c0c0', maroon: '#800000', lime: '#a3e635' };
function parseHex(s) {
  s = String(s || '').trim().toLowerCase();
  if (COLOR_WORDS[s]) s = COLOR_WORDS[s];
  const m = s.match(/^#?([0-9a-f]{6})$/) || s.match(/^#?([0-9a-f]{3})$/);
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map(c => c + c).join('') : m[1];
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
}
const hx = (c) => '0x' + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

async function textLayer(text, width, sizes = [128, 64, 32], maxHeight = 400) {
  const Jimp = require('jimp');
  const key = { 128: Jimp.FONT_SANS_128_WHITE, 64: Jimp.FONT_SANS_64_WHITE, 32: Jimp.FONT_SANS_32_WHITE };
  const pad = 10, maxW = width - pad * 2;
  let font = null, size = sizes[sizes.length - 1];
  for (const s of sizes) {
    size = s; font = await Jimp.loadFont(key[s]);
    if (Jimp.measureTextHeight(font, text, maxW) <= maxHeight - pad * 2) break;
  }
  const th = Jimp.measureTextHeight(font, text, maxW);
  const img = new Jimp(width, th + pad * 2, 0x00000000);
  img.print(font, pad, pad, { text, alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER }, maxW);
  return { png: await img.getBufferAsync(Jimp.MIME_PNG), h: th + pad * 2, size };
}

function bgChain(w, h, A, B, grid = true, col = '0xffffff') {
  return `format=gbrp,geq=r='${A[0]}+(${B[0] - A[0]})*X/W':g='${A[1]}+(${B[1] - A[1]})*X/W':b='${A[2]}+(${B[2] - A[2]})*(1-Y/H)'` +
    (grid ? `,drawgrid=w=${Math.round(h / 8)}:h=${Math.round(h / 8)}:t=1:c=${col}@0.06` : '') + ',vignette=PI/4,format=rgba';
}

async function cardImage(dir, { w, h, rgb, items, pic }) {
  const base = rgb || THEMES.cyan.c;
  const A = base.map(v => Math.round(v * 0.06 + 6)), B = base.map(v => Math.round(v * 0.28 + 8));
  const col = hx(base);
  const layers = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const L = await textLayer(it.text, Math.round(w * (it.width || 0.86)), it.sizes || [128, 64, 32], it.maxH || Math.round(h * 0.5));
    const f = path.join(dir, `it${i}.png`); fs.writeFileSync(f, L.png);
    layers.push({ f, h: L.h, glow: it.glow !== false, gap: it.gap == null ? 24 : it.gap });
  }
  const picSize = pic ? Math.round(Math.min(w, h) * 0.32) : 0;
  const total = (pic ? picSize + 40 : 0) + layers.reduce((s, l) => s + l.h + l.gap, 0) - (layers.length ? layers[layers.length - 1].gap : 0);
  let y = Math.max(40, Math.round((h - total) / 2));
  const inputs = ['-f', 'lavfi', '-i', `color=c=black:s=${w}x${h}:d=1`];
  let fc = `[0:v]${bgChain(w, h, A, B, true, col)}[bg0]`, last = 'bg0', idx = 1;
  const [cr, cg, cb] = base.map(v => (v / 255).toFixed(3));
  const tint = `colorchannelmixer=rr=${cr}:rg=0:rb=0:gr=0:gg=${cg}:gb=0:br=0:bg=0:bb=${cb}`;
  if (pic) {
    const pf = path.join(dir, 'pic.png'); fs.writeFileSync(pf, pic);
    inputs.push('-i', pf);
    const r = picSize / 2;
    fc += `;[${idx}:v]scale=${picSize}:${picSize}:force_original_aspect_ratio=increase,crop=${picSize}:${picSize},format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(lte(hypot(X-${r},Y-${r}),${r}),255,0)'[pc];` +
      `[pc]split=2[p1][p2];[p1]scale=${picSize + 24}:${picSize + 24},format=rgba,geq=r=${base[0]}:g=${base[1]}:b=${base[2]}:a='if(lte(hypot(X-${r + 12},Y-${r + 12}),${r + 12}),255,0)',gblur=sigma=6[ring];` +
      `[${last}][ring]overlay=x=(W-w)/2:y=${y - 12}[r1];[r1][p2]overlay=x=(W-w)/2:y=${y}[r2]`;
    last = 'r2'; idx++; y += picSize + 40;
  }
  for (const l of layers) {
    inputs.push('-i', l.f);
    if (l.glow) {
      fc += `;[${idx}:v]format=rgba,split=2[n${idx}a][n${idx}b];[n${idx}a]gblur=sigma=${Math.max(4, Math.round(h / 60))},${tint}[g${idx}];` +
        `[${last}][g${idx}]overlay=x=(W-w)/2:y=${y}[m${idx}];[m${idx}][n${idx}b]overlay=x=(W-w)/2:y=${y}[o${idx}]`;
    } else {
      fc += `;[${last}][${idx}:v]overlay=x=(W-w)/2:y=${y}[o${idx}]`;
    }
    last = `o${idx}`; idx++; y += l.h + l.gap;
  }
  const bw = Math.round(Math.min(w, h) * 0.06), th = Math.max(3, Math.round(h * 0.006)), mg = Math.round(Math.min(w, h) * 0.05);
  const boxes = [[mg, mg, bw, th], [mg, mg, th, bw], [w - mg - bw, mg, bw, th], [w - mg - th, mg, th, bw], [mg, h - mg - th, bw, th], [mg, h - mg - bw, th, bw], [w - mg - bw, h - mg - th, bw, th], [w - mg - th, h - mg - bw, th, bw]]
    .map(([x, yy, a, b]) => `drawbox=x=${x}:y=${yy}:w=${a}:h=${b}:color=${col}@0.95:t=fill`).join(',');
  fc += `;[${last}]${boxes},format=rgb24[v]`;
  const out = path.join(dir, 'card.png');
  await ff(['-y', ...inputs, '-filter_complex', fc, '-map', '[v]', '-frames:v', '1', out], 90000);
  return fs.readFileSync(out);
}

async function profilePic(client, jid) {
  try {
    const url = await client.profilePictureUrl(jid, 'image');
    if (!url) return null;
    const r = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000, headers: { 'User-Agent': UA } });
    return Buffer.from(r.data);
  } catch (_) { return null; }
}

async function audioJob(client, m, af, label, note) {
  const x = await needMedia(client, m, /audio|video/, 'Reply to a *voice note, song or video* with this command.');
  if (!x) return;
  await m.reply(`${label} _working..._`);
  const dir = makeDir('afx');
  try {
    const inFile = path.join(dir, `in.${extFor(x.mime)}`); fs.writeFileSync(inFile, x.buf);
    if (/video/.test(x.mime)) {
      const info = await probe(inFile);
      if (!info.hasAudio) return m.reply('⚠️ That video has no sound to change.');
      const out = path.join(dir, 'out.mp4');
      await ff(['-y', '-i', inFile, '-map', '0:v:0', '-map', '0:a:0', '-c:v', 'copy', '-af', af, '-c:a', 'aac', '-b:a', '160k', '-movflags', 'faststart', out]);
      await client.sendMessage(m.chat, { video: fs.readFileSync(out), mimetype: 'video/mp4', caption: `${label} ${note || ''}`.trim() }, { quoted: m });
    } else if (/ogg|opus/.test(x.mime)) {
      const out = path.join(dir, 'out.ogg');
      const common = ['-y', '-i', inFile, '-vn', '-map_metadata', '-1', '-af', af, '-ar', '48000', '-ac', '1'];
      try { await ff([...common, '-c:a', 'libopus', '-b:a', '32k', '-application', 'voip', '-f', 'ogg', out]); }
      catch (_) { await ff([...common, '-c:a', 'opus', '-strict', '-2', '-b:a', '32k', '-f', 'ogg', out]); }
      const oi = await probe(out);
      await client.sendMessage(m.chat, { audio: fs.readFileSync(out), mimetype: 'audio/ogg; codecs=opus', ptt: true, seconds: Math.max(1, Math.round(oi.seconds || 1)) }, { quoted: m });
    } else {
      const out = path.join(dir, 'out.mp3');
      await ff(['-y', '-i', inFile, '-vn', '-af', af, '-c:a', 'libmp3lame', '-b:a', '192k', out]);
      await client.sendMessage(m.chat, { audio: fs.readFileSync(out), mimetype: 'audio/mpeg', ptt: false, fileName: 'audio.mp3' }, { quoted: m });
    }
  } finally { rmDir(dir); }
}

const mathMap = (up, lo, exc = {}) => (ch) => {
  if (exc[ch]) return exc[ch];
  const c = ch.charCodeAt(0);
  if (c >= 65 && c <= 90) return String.fromCodePoint(up + c - 65);
  if (c >= 97 && c <= 122) return String.fromCodePoint(lo + c - 97);
  return ch;
};
const SMALLCAPS = { a: 'ᴀ', b: 'ʙ', c: 'ᴄ', d: 'ᴅ', e: 'ᴇ', f: 'ꜰ', g: 'ɢ', h: 'ʜ', i: 'ɪ', j: 'ᴊ', k: 'ᴋ', l: 'ʟ', m: 'ᴍ', n: 'ɴ', o: 'ᴏ', p: 'ᴘ', q: 'ǫ', r: 'ʀ', s: 'ꜱ', t: 'ᴛ', u: 'ᴜ', v: 'ᴠ', w: 'ᴡ', x: 'x', y: 'ʏ', z: 'ᴢ' };
const NICK_FONTS = [
  mathMap(0x1D400, 0x1D41A), mathMap(0x1D4D0, 0x1D4EA), mathMap(0x1D56C, 0x1D586), mathMap(0x1D538, 0x1D552, { C: 'ℂ', H: 'ℍ', N: 'ℕ', P: 'ℙ', Q: 'ℚ', R: 'ℝ', Z: 'ℤ' }),
  (c) => SMALLCAPS[c.toLowerCase()] || c, mathMap(0x1D63C, 0x1D656), mathMap(0x24B6, 0x24D0)
];
const NICK_FRAMES = [
  '꧁༺ {n} ༻꧂', '★彡 {n} 彡★', '『{n}』', '✦•······• {n} •······•✦', '☠️ {n} ☠️', '⚡ {n} ⚡', '【{n}】', '•°¯`•.•´¯`•. {n} .•´¯`•.•°', '♛ {n} ♛', '༒ {n} ༒', '⫷ {n} ⫸', '▄︻デ {n} ══━一', '🔥 {n} 🔥', '❖ {n} ❖'
];
const ZALGO_UP = ['̍', '̎', '̄', '̅', '̿', '̑', '̆', '̐', '͒', '͗', '͑', '̇', '̈', '̊', '͂', '̓', '̈́', '͊', '͋', '͌', '̃', '̂', '̌', '͐', '̀', '́', '̋', '̏', '̒', '̓', '̔', '̽', '̉', 'ͣ', 'ͤ', 'ͥ', 'ͦ', 'ͧ', 'ͨ', 'ͩ', 'ͪ', 'ͫ', 'ͬ', 'ͭ', 'ͮ', 'ͯ'];
const ZALGO_MID = ['̕', '̛', '̀', '́', '͘', '̡', '̢', '̧', '̨', '̴', '̵', '̶', '͜', '͝', '͞', '͟', '͠', '͢', '̸', '̷', '͡'];
const ZALGO_DOWN = ['̖', '̗', '̘', '̙', '̜', '̝', '̞', '̟', '̠', '̤', '̥', '̦', '̩', '̪', '̫', '̬', '̭', '̮', '̯', '̰', '̱', '̲', '̳', '̹', '̺', '̻', '̼', 'ͅ', '͇', '͈', '͉', '͍', '͎', '͓', '͔', '͕', '͖', '͙', '͚', '̣'];
function zalgo(text, level) {
  const n = { low: [1, 2, 1], mid: [3, 1, 3], max: [6, 2, 6] }[level] || [3, 1, 3];
  const pick = (a, k) => Array.from({ length: Math.floor(Math.random() * k) + (k ? 1 : 0) }, () => pickOne(a)).join('');
  return Array.from(text).map(ch => /\s/.test(ch) ? ch : ch + pick(ZALGO_UP, n[0]) + pick(ZALGO_MID, n[1]) + pick(ZALGO_DOWN, n[2])).join('');
}

const FRAMES = [
  { name: 'Double line', top: '╔{h}╗', mid: '║ {t} ║', bot: '╚{h}╝', h: '═' },
  { name: 'Rounded', top: '╭{h}╮', mid: '│ {t} │', bot: '╰{h}╯', h: '─' },
  { name: 'Heavy', top: '┏{h}┓', mid: '┃ {t} ┃', bot: '┗{h}┛', h: '━' },
  { name: 'Stars', top: '✦{h}✦', mid: '✧ {t} ✧', bot: '✦{h}✦', h: '✦' },
  { name: 'Plain', top: '+{h}+', mid: '| {t} |', bot: '+{h}+', h: '-' },
  { name: 'Hearts', top: '♥{h}♥', mid: '♡ {t} ♡', bot: '♥{h}♥', h: '♥' }
];
function frameText(text, f) {
  const lines = String(text).split('\n').flatMap(l => { const out = []; let s = l.trim(); while (s.length > 22) { let cut = s.lastIndexOf(' ', 22); if (cut < 6) cut = 22; out.push(s.slice(0, cut).trim()); s = s.slice(cut).trim(); } out.push(s); return out; });
  const w = Math.max(...lines.map(l => Array.from(l).length));
  const bar = f.h.repeat(w + 2);
  return [f.top.replace('{h}', bar), ...lines.map(l => f.mid.replace('{t}', l + ' '.repeat(w - Array.from(l).length))), f.bot.replace('{h}', bar)].join('\n');
}

const RAINBOW_SQ = ['🟥', '🟧', '🟨', '🟩', '🟦', '🟪'];
const RAINBOW_HEART = ['❤️', '🧡', '💛', '💚', '💙', '💜'];

const GLYPHS = (() => {
  const g = {
    A: [' ### ', '#   #', '#####', '#   #', '#   #'], B: ['#### ', '#   #', '#### ', '#   #', '#### '], C: [' ####', '#    ', '#    ', '#    ', ' ####'],
    D: ['#### ', '#   #', '#   #', '#   #', '#### '], E: ['#####', '#    ', '#### ', '#    ', '#####'], F: ['#####', '#    ', '#### ', '#    ', '#    '],
    G: [' ####', '#    ', '#  ##', '#   #', ' ####'], H: ['#   #', '#   #', '#####', '#   #', '#   #'], I: ['#####', '  #  ', '  #  ', '  #  ', '#####'],
    J: ['#####', '   # ', '   # ', '#  # ', ' ##  '], K: ['#   #', '#  # ', '###  ', '#  # ', '#   #'], L: ['#    ', '#    ', '#    ', '#    ', '#####'],
    M: ['#   #', '## ##', '# # #', '#   #', '#   #'], N: ['#   #', '##  #', '# # #', '#  ##', '#   #'], O: [' ### ', '#   #', '#   #', '#   #', ' ### '],
    P: ['#### ', '#   #', '#### ', '#    ', '#    '], Q: [' ### ', '#   #', '# # #', '#  # ', ' ## #'], R: ['#### ', '#   #', '#### ', '#  # ', '#   #'],
    S: [' ####', '#    ', ' ### ', '    #', '#### '], T: ['#####', '  #  ', '  #  ', '  #  ', '  #  '], U: ['#   #', '#   #', '#   #', '#   #', ' ### '],
    V: ['#   #', '#   #', '#   #', ' # # ', '  #  '], W: ['#   #', '#   #', '# # #', '## ##', '#   #'], X: ['#   #', ' # # ', '  #  ', ' # # ', '#   #'],
    Y: ['#   #', ' # # ', '  #  ', '  #  ', '  #  '], Z: ['#####', '   # ', '  #  ', ' #   ', '#####'],
    0: [' ### ', '#  ##', '# # #', '##  #', ' ### '], 1: ['  #  ', ' ##  ', '  #  ', '  #  ', ' ### '], 2: [' ### ', '#   #', '  ## ', ' #   ', '#####'],
    3: ['#### ', '    #', ' ### ', '    #', '#### '], 4: ['#   #', '#   #', '#####', '    #', '    #'], 5: ['#####', '#    ', '#### ', '    #', '#### '],
    6: [' ### ', '#    ', '#### ', '#   #', ' ### '], 7: ['#####', '   # ', '  #  ', ' #   ', ' #   '], 8: [' ### ', '#   #', ' ### ', '#   #', ' ### '],
    9: [' ### ', '#   #', ' ####', '    #', ' ### '], ' ': ['   ', '   ', '   ', '   ', '   '], '!': ['  #  ', '  #  ', '  #  ', '     ', '  #  '],
    '?': [' ### ', '    #', '  ## ', '     ', '  #  '], '-': ['     ', '     ', '#####', '     ', '     '], '.': ['     ', '     ', '     ', '     ', '  #  ']
  };
  return g;
})();
function asciiArt(text, fill) {
  const chars = Array.from(text.toUpperCase()).filter(c => GLYPHS[c]);
  const rowsOut = [];
  for (let i = 0; i < chars.length; i += 5) {
    const chunk = chars.slice(i, i + 5);
    for (let r = 0; r < 5; r++) rowsOut.push(chunk.map(c => GLYPHS[c][r].replace(/#/g, fill)).join(' ').replace(/\s+$/, ''));
    rowsOut.push('');
  }
  return rowsOut.join('\n').trimEnd();
}

const AURAS = [
  { name: 'Crimson Fire', rgb: [220, 38, 60], mean: 'raw power, passion and a bold presence' },
  { name: 'Royal Violet', rgb: [150, 90, 255], mean: 'wisdom, mystery and a sharp mind' },
  { name: 'Emerald Calm', rgb: [40, 200, 120], mean: 'healing energy, loyalty and growth' },
  { name: 'Golden Sun', rgb: [255, 196, 46], mean: 'confidence, luck and big main-character energy' },
  { name: 'Ocean Blue', rgb: [70, 140, 255], mean: 'deep thinking, honesty and calm leadership' },
  { name: 'Rose Pink', rgb: [255, 105, 180], mean: 'warm love, kindness and charm' },
  { name: 'Silver Moon', rgb: [200, 205, 220], mean: 'intuition, balance and quiet strength' },
  { name: 'Turquoise Spark', rgb: [30, 210, 220], mean: 'creativity, humour and fresh ideas' },
  { name: 'Amber Glow', rgb: [255, 138, 31], mean: 'hustle, courage and friendly energy' },
  { name: 'Obsidian Shadow', rgb: [130, 130, 160], mean: 'mystery, focus and unstoppable drive' }
];
const AURA_TRAITS = ['natural leader', 'loyal friend', 'quick thinker', 'secret softie', 'life of the party', 'quiet genius', 'born hustler', 'peacemaker', 'risk taker', 'creative soul', 'deep feeler', 'funny one', 'protector', 'dreamer', 'problem solver', 'magnetic talker'];

const SIGNS = [
  ['Capricorn', '♑', 12, 22, 1, 19], ['Aquarius', '♒', 1, 20, 2, 18], ['Pisces', '♓', 2, 19, 3, 20], ['Aries', '♈', 3, 21, 4, 19], ['Taurus', '♉', 4, 20, 5, 20], ['Gemini', '♊', 5, 21, 6, 20],
  ['Cancer', '♋', 6, 21, 7, 22], ['Leo', '♌', 7, 23, 8, 22], ['Virgo', '♍', 8, 23, 9, 22], ['Libra', '♎', 9, 23, 10, 22], ['Scorpio', '♏', 10, 23, 11, 21], ['Sagittarius', '♐', 11, 22, 12, 21]
];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
function signFromText(t) {
  t = String(t || '').toLowerCase();
  const byName = SIGNS.find(s => t.includes(s[0].toLowerCase()));
  if (byName) return byName;
  let d = null, mo = null, m;
  if ((m = t.match(/(\d{1,2})\s*(?:st|nd|rd|th)?\s*(?:of\s*)?([a-z]{3})/))) { d = Number(m[1]); mo = MONTHS.indexOf(m[2]) + 1; }
  else if ((m = t.match(/([a-z]{3})[a-z]*\s*(\d{1,2})/))) { mo = MONTHS.indexOf(m[1]) + 1; d = Number(m[2]); }
  else if ((m = t.match(/(?:\d{4}-)?(\d{1,2})[-/](\d{1,2})$/))) { mo = Number(m[1]); d = Number(m[2]); if (mo > 12) { [mo, d] = [d, mo]; } }
  if (!d || !mo || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return SIGNS.find(s => (mo === s[2] && d >= s[3]) || (mo === s[4] && d <= s[5])) || null;
}
const ZODIAC_LINES = [
  'A small risk pays off today. Say yes to the invitation you were unsure about.', 'Someone is thinking about you. Send the message you have been holding back.',
  'Money moves better when you slow down. Check twice before you spend.', 'Your energy is high. Finish the one task you keep postponing.',
  'Listen more than you talk today. A useful hint is hiding in a casual chat.', 'A friend needs your calm voice. Be the steady one.',
  'Good news travels toward you. Keep your phone close and your mood light.', 'Do not argue with the tired and the hungry. Eat, drink water, then decide.',
  'A door that looked closed is only stuck. Push gently and try again.', 'Today suits starting, not perfecting. Post it, send it, begin it.',
  'Your humour carries you through a tense moment.', 'Plans change, and the change is kinder than your plan. Stay flexible.'
];
const MOODS = ['bold', 'dreamy', 'focused', 'playful', 'calm', 'restless', 'hopeful', 'confident'];
const LUCKY_COLOURS = ['red', 'gold', 'green', 'blue', 'purple', 'white', 'orange', 'black', 'pink', 'teal'];

const VIBES = {
  Happy: { words: /\b(happy|joy|glad|great|awesome|amazing|blessed|yay|good|fun|smile|love it|thank|thanks|best|win|won|congrats|nice)\b|[😊😄😁😀😃🥳🎉😍]/g, rgb: [255, 196, 46], line: 'Sunshine energy. People feel better around you.' },
  Sad: { words: /\b(sad|cry|crying|hurt|pain|lonely|miss|missing|sorry|tired of|depressed|down|lost|broken|alone)\b|[😢😭😔😞💔🥺]/g, rgb: [70, 120, 220], line: 'Heavy heart today. Be gentle with yourself.' },
  Hyped: { words: /\b(let'?s go|hype|fire|lit|crazy|insane|wow|omg|turn up|party|vibes|goat|huge|finally|ready)\b|[🔥🚀⚡💥🤩]/g, rgb: [255, 90, 40], line: 'Pure hype. Everything is moving fast and loud.' },
  Angry: { words: /\b(angry|mad|hate|annoyed|rude|stupid|trash|idiot|furious|fed up|enough|wtf|useless)\b|[😡🤬😤👿]/g, rgb: [220, 38, 60], line: 'Steam rising. Breathe first, reply later.' },
  Romantic: { words: /\b(love|babe|baby|heart|kiss|darling|sweetheart|miss you|crush|bae|forever|romantic|cuddle|date)\b|[❤️💕😘🥰💘💖]/g, rgb: [255, 105, 180], line: 'Soft and sweet. Love is in the air.' },
  Chill: { words: /\b(chill|relax|calm|peace|vibe|easy|slow|weekend|rest|quiet|okay|fine|sawa|poa)\b|[😌😎🌴☕]/g, rgb: [40, 200, 170], line: 'Easy and calm. Nothing is rushing you.' },
  Hustle: { words: /\b(work|hustle|money|grind|business|goal|plan|build|boss|client|sales|deal|grow|focus|pesa|kazi)\b|[💰💼📈💪]/g, rgb: [150, 90, 255], line: 'Locked in. You are building something.' },
  Sleepy: { words: /\b(sleep|sleepy|tired|nap|bed|yawn|exhausted|night|goodnight|lala)\b|[😴🥱🛌🌙]/g, rgb: [110, 110, 190], line: 'Low battery. A proper rest is the best plan.' }
};
function readVibe(text) {
  const scores = {};
  for (const [k, v] of Object.entries(VIBES)) { const hits = (String(text).toLowerCase().match(v.words) || []).length; if (hits) scores[k] = hits; }
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const mood = ranked[0] ? ranked[0][0] : 'Chill';
  const total = Object.values(scores).reduce((a, b) => a + b, 0);
  const pct = ranked[0] ? Math.min(98, Math.round(55 + (ranked[0][1] / Math.max(1, total)) * 25 + Math.min(18, ranked[0][1] * 6))) : 50;
  return { mood, pct, second: ranked[1] ? ranked[1][0] : null };
}

module.exports = [

  {
    command: ['nickname'],
    aliases: ['nick', 'nicks', 'fancyname'],
    description: 'Stylish nickname and bio ideas (.nickname Black)',
    category: 'fun',
    handler: async (client, m, { text }) => {
      const name = String(text || quotedText(m) || '').trim().slice(0, 24);
      if (!name) return m.reply(`✨ *${BM} Nickname*\n\n*.nickname Black*\n*.nickname Jane Wanjiru*\n\nYou get styled names with symbols you can copy into WhatsApp, Instagram or games.`);
      const lines = [];
      const rnd = seedFrom(name + 'n');
      const fonts = NICK_FONTS.slice().sort(() => rnd() - 0.5);
      NICK_FRAMES.slice().sort(() => rnd() - 0.5).slice(0, 12).forEach((fr, i) => {
        const f = fonts[i % fonts.length];
        lines.push(`${i + 1}. ${fr.replace('{n}', Array.from(name).map(f).join(''))}`);
      });
      m.reply(`✨ *${BM} Nickname ideas*\n\n${lines.join('\n')}\n\n_Long-press a line to copy it._`);
    }
  },

  {
    command: ['glitch'],
    aliases: ['zalgo', 'glitchtext', 'cursedtext'],
    description: 'Glitchy cursed text (.glitch low|mid|max <text>)',
    category: 'fun',
    handler: async (client, m, { text }) => {
      let t = String(text || '').trim();
      let level = 'mid';
      const lv = t.match(/^(low|mid|max|extreme)\b\s*([\s\S]*)$/i);
      if (lv) { level = lv[1].toLowerCase() === 'extreme' ? 'max' : lv[1].toLowerCase(); t = lv[2].trim(); }
      if (!t) t = quotedText(m).trim();
      if (!t) return m.reply(`👾 *${BM} Glitch*\n\n*.glitch Black Merchant*\n*.glitch max Black Merchant*\nLevels: low, mid, max`);
      if (t.length > 120) return m.reply('⚠️ Keep it under 120 characters.');
      m.reply(zalgo(t, level));
    }
  },

  {
    command: ['frame'],
    aliases: ['boxtext', 'textframe'],
    description: 'Put text in a decorative box (.frame <text> or .frame 2 <text>)',
    category: 'fun',
    handler: async (client, m, { text }) => {
      let t = String(text || '').trim(), pick = null;
      const mm = t.match(/^(\d)\s+([\s\S]+)$/);
      if (mm && Number(mm[1]) >= 1 && Number(mm[1]) <= FRAMES.length) { pick = Number(mm[1]) - 1; t = mm[2].trim(); }
      if (!t) t = quotedText(m).trim();
      if (!t) return m.reply(`🖼️ *${BM} Frame*\n\n*.frame Welcome to the family*\n*.frame 2 Welcome to the family*  (pick a style 1 to ${FRAMES.length})\n\nStyles: ${FRAMES.map((f, i) => `${i + 1} ${f.name}`).join(', ')}`);
      if (t.length > 300) return m.reply('⚠️ Keep it under 300 characters.');
      if (pick !== null) return m.reply('```\n' + frameText(t, FRAMES[pick]) + '\n```');
      m.reply(FRAMES.slice(0, 3).map((f, i) => `*${i + 1}. ${f.name}*\n` + '```\n' + frameText(t, f) + '\n```').join('\n') + `\n_More: *.frame 4 text* to *.frame ${FRAMES.length} text*_`);
    }
  },

  {
    command: ['rainbow'],
    aliases: ['colortext', 'rainbowtext'],
    description: 'Rainbow-coloured text (.rainbow <text>)',
    category: 'fun',
    handler: async (client, m, { text }) => {
      const t = String(text || quotedText(m) || '').trim();
      if (!t) return m.reply(`🌈 *${BM} Rainbow*\n\n*.rainbow Good vibes only*`);
      if (t.length > 80) return m.reply('⚠️ Keep it under 80 characters.');
      const bar = RAINBOW_SQ.join('').repeat(2);
      let i = 0;
      const letters = Array.from(t).map(c => c === ' ' ? '  ' : c + RAINBOW_HEART[i++ % 6]).join('');
      m.reply(`${bar}\n\n${letters}\n\n${bar}`);
    }
  },

  {
    command: ['ascii'],
    aliases: ['asciiart', 'blocktext', 'bigtext'],
    description: 'Big block letters (.ascii hi, or .ascii dots hi)',
    category: 'fun',
    handler: async (client, m, { text }) => {
      let t = String(text || '').trim(), fill = '█';
      const st = t.match(/^(block|dots|hash|stars|hearts)\s+([\s\S]+)$/i);
      if (st) { fill = { block: '█', dots: '●', hash: '#', stars: '★', hearts: '♥' }[st[1].toLowerCase()]; t = st[2].trim(); }
      if (!t) t = quotedText(m).trim();
      if (!t) return m.reply(`🔠 *${BM} ASCII*\n\n*.ascii HELLO*\n*.ascii dots KENYA*\nStyles: block, dots, hash, stars, hearts\nLetters, numbers and ! ? - . only. 15 characters max.`);
      const clean = Array.from(t.toUpperCase()).filter(c => GLYPHS[c]).join('').slice(0, 15);
      if (!clean.trim()) return m.reply('⚠️ Use letters, numbers and ! ? - . only.');
      m.reply('```\n' + asciiArt(clean, fill) + '\n```');
    }
  },

  {
    command: ['polaroid'],
    aliases: ['instantphoto', 'polaroidframe'],
    description: 'Put a photo in a polaroid frame with a caption (.polaroid <caption>)',
    category: 'media',
    handler: async (client, m, { text }) => {
      const cap = String(text || '').trim().slice(0, 60);
      const dir = makeDir('pol');
      try {
        const x = await needMedia(client, m, /image/, `📸 *${BM} Polaroid*\n\nReply to a picture:\n*.polaroid Summer 2026*\n*.polaroid*  (no caption)`);
        if (!x) return;
        await m.reply('📸 _Developing..._');
        const inFile = path.join(dir, `in.${extFor(x.mime)}`); fs.writeFileSync(inFile, x.buf);
        const P = 760, side = 36, top = 36, bottom = 170, W = P + side * 2, H = P + top + bottom;
        const inputs = ['-i', inFile];
        let capFile = null;
        if (cap) { const L = await textLayer(cap, W - 60, [64, 32], bottom - 30); capFile = path.join(dir, 'cap.png'); fs.writeFileSync(capFile, L.png); inputs.push('-i', capFile); }
        let fc = `[0:v]scale=${P}:${P}:force_original_aspect_ratio=increase,crop=${P}:${P},eq=contrast=1.06:saturation=1.12:gamma=1.03[ph];` +
          `color=c=0xf6f3ea:s=${W}x${H}[card];[card][ph]overlay=${side}:${top}[c1]`;
        let last = 'c1';
        if (capFile) { fc += `;[1:v]format=rgba,colorchannelmixer=rr=0.12:gg=0.12:bb=0.16[ct];[c1][ct]overlay=x=(W-w)/2:y=${top + P + 20}[c2]`; last = 'c2'; }
        const BW = 1080, BH = 1350;
        fc += `;[${last}]format=rgba,rotate=-4*PI/180:c=none:ow=rotw(-4*PI/180):oh=roth(-4*PI/180)[rot];[rot]split=2[r1][r2];` +
          `[r2]colorchannelmixer=rr=0:gg=0:bb=0:aa=0.55,gblur=sigma=18[sh];` +
          `color=c=0x2a2f3a:s=${BW}x${BH}[bg];[bg][sh]overlay=x=(W-w)/2+14:y=(H-h)/2+22[b1];[b1][r1]overlay=x=(W-w)/2:y=(H-h)/2,format=rgb24[v]`;
        const out = path.join(dir, 'out.png');
        await ff(['-y', ...inputs, '-filter_complex', fc, '-map', '[v]', '-frames:v', '1', out], 90000);
        await client.sendMessage(m.chat, { image: fs.readFileSync(out), mimetype: 'image/png', caption: `📸 ${cap ? cap + ' • ' : ''}${TAG}` }, { quoted: m });
      } catch (e) { m.reply('❌ Failed: ' + e.message); }
      finally { rmDir(dir); }
    }
  },

  {
    command: ['quotecard'],
    aliases: ['quoteimage', 'quotepic', 'qcard'],
    description: 'Stylish quote picture (.quotecard <text> | author | colour)',
    category: 'media',
    handler: async (client, m, { text }) => {
      let parts = String(text || '').split('|').map(s => s.trim()).filter(Boolean);
      if (!parts.length && quotedText(m)) parts = [quotedText(m).trim()];
      if (!parts.length) return m.reply(`💬 *${BM} Quote card*\n\n*.quotecard Stay hungry, stay humble | Steve*\n*.quotecard Small steps count | Me | gold*\nColours: ${Object.keys(THEMES).join(', ')}\n\nOr reply to a message with *.quotecard*`);
      let theme = 'cyan';
      parts = parts.filter(p => { if (THEMES[p.toLowerCase()]) { theme = p.toLowerCase(); return false; } return true; });
      const quote = (parts[0] || '').slice(0, 260), author = (parts[1] || '').slice(0, 40);
      if (!quote) return m.reply('Give me the quote text first.');
      const dir = makeDir('qc');
      try {
        await m.reply('💬 _Designing..._');
        const items = [{ text: '"', sizes: [128], glow: true, gap: 6, width: 0.3 }, { text: quote, sizes: [64, 32], maxH: 620, glow: false, gap: 30, width: 0.82 }];
        if (author) items.push({ text: '- ' + author.toUpperCase(), sizes: [32], glow: true, gap: 0, width: 0.6 });
        const img = await cardImage(dir, { w: 1080, h: 1080, rgb: THEMES[theme].c, items });
        await client.sendMessage(m.chat, { image: img, mimetype: 'image/png', caption: TAG }, { quoted: m });
      } catch (e) { m.reply('❌ Could not make the card: ' + String(e.message).slice(0, 150)); }
      finally { rmDir(dir); }
    }
  },

  {
    command: ['duotone'],
    aliases: ['twotone', 'colorsplit'],
    description: 'Two-colour photo or video effect (.duotone magenta cyan)',
    category: 'media',
    handler: async (client, m, { text }) => {
      const w = String(text || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
      let c1 = parseHex(w[0] || 'purple'), c2 = parseHex(w[1] || 'orange');
      if (!c1 || !c2) return m.reply(`🎨 *${BM} Duotone*\n\nReply to a picture or video:\n*.duotone purple orange*\n*.duotone #0b1f5c #ff6fb5*\n*.duotone red*  (red with a dark base)\n\nColours: ${Object.keys(COLOR_WORDS).join(', ')}`);
      if (w.length === 1) { c2 = c1; c1 = c1.map(v => Math.round(v * 0.08)); }
      const dir = makeDir('duo');
      try {
        const x = await needMedia(client, m, /image|video/, '🎨 Reply to a *picture* or *video* with *.duotone purple orange*');
        if (!x) return;
        const isVid = /video/.test(x.mime);
        const inFile = path.join(dir, `in.${extFor(x.mime)}`); fs.writeFileSync(inFile, x.buf);
        if (isVid) { const info = await probe(inFile); if (info.seconds > 60) return m.reply('⚠️ Use a video of 60 seconds or less.'); }
        await m.reply('🎨 _Mixing colours..._');
        const ex = (i) => `${c1[i]}+(${c2[i] - c1[i]})*r(X,Y)/255`;
        const fc = `[0:v]format=gray,format=gbrp,eq=contrast=1.12,geq=r='${ex(0)}':g='${ex(1).replace(/r\(X,Y\)/g, 'r(X,Y)')}':b='${ex(2)}',format=${isVid ? 'yuv420p' : 'yuvj420p'}[v]`;
        if (isVid) {
          const out = path.join(dir, 'out.mp4');
          const base = ['-y', '-i', inFile, '-filter_complex', fc.replace('[v]', '[v0]') + ';[v0]scale=trunc(iw/2)*2:trunc(ih/2)*2[v]', '-map', '[v]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-movflags', 'faststart'];
          try { await ff([...base, '-map', '0:a?', '-c:a', 'copy', out], 240000); } catch (_) { await ff([...base, '-an', out], 240000); }
          await client.sendMessage(m.chat, { video: fs.readFileSync(out), mimetype: 'video/mp4', caption: `🎨 Duotone • ${TAG}` }, { quoted: m });
        } else {
          const out = path.join(dir, 'out.jpg');
          await ff(['-y', '-i', inFile, '-filter_complex', fc, '-map', '[v]', '-frames:v', '1', '-q:v', '2', out]);
          await client.sendMessage(m.chat, { image: fs.readFileSync(out), caption: `🎨 Duotone • ${TAG}` }, { quoted: m });
        }
      } catch (e) { m.reply('❌ Failed: ' + e.message); }
      finally { rmDir(dir); }
    }
  },

  {
    command: ['pixelart'],
    aliases: ['pixel8', 'retropixel', 'pixelise'],
    description: 'Turn a picture into pixel art (.pixelart small|medium|large)',
    category: 'media',
    handler: async (client, m, { text }) => {
      const a = String(text || '').toLowerCase();
      const cells = /small|chunky|big/.test(a) ? 48 : /large|fine|detail/.test(a) ? 128 : 80;
      const colors = /\b(\d{2,3})\b/.test(a) ? Math.max(4, Math.min(64, Number(a.match(/\b(\d{2,3})\b/)[1]))) : 24;
      const dir = makeDir('pix');
      try {
        const x = await needMedia(client, m, /image/, `👾 *${BM} Pixel art*\n\nReply to a picture:\n*.pixelart*  (medium)\n*.pixelart small*  (chunky pixels)\n*.pixelart large*  (more detail)\n*.pixelart 12*  (only 12 colours)`);
        if (!x) return;
        await m.reply('👾 _Pixelating..._');
        const inFile = path.join(dir, `in.${extFor(x.mime)}`); fs.writeFileSync(inFile, x.buf);
        const info = await probe(inFile);
        const up = Math.max(4, Math.round(960 / cells));
        const out = path.join(dir, 'out.png');
        await ff(['-y', '-i', inFile, '-filter_complex',
          `[0:v]scale=${cells}:-2:flags=area,eq=saturation=1.25:contrast=1.08,split[a][b];[b]palettegen=max_colors=${colors}[p];[a][p]paletteuse=dither=none,scale=iw*${up}:ih*${up}:flags=neighbor,format=rgb24[v]`,
          '-map', '[v]', '-frames:v', '1', out]);
        await client.sendMessage(m.chat, { image: fs.readFileSync(out), mimetype: 'image/png', caption: `👾 ${cells} pixels wide, ${colors} colours • ${TAG}` }, { quoted: m });
      } catch (e) { m.reply('❌ Failed: ' + e.message); }
      finally { rmDir(dir); }
    }
  },

  {
    command: ['slowzoom'],
    aliases: ['kenburns', 'zoomvideo', 'cinematiczoom'],
    description: 'Slow cinematic zoom video from a picture (.slowzoom in|out [seconds])',
    category: 'media',
    handler: async (client, m, { text }) => {
      const a = String(text || '').toLowerCase();
      const out_ = /\bout\b/.test(a);
      const secs = Math.max(3, Math.min(15, Number((a.match(/(\d{1,2})\s*s?\b/) || [])[1]) || 7));
      const dir = makeDir('zoom');
      try {
        const x = await needMedia(client, m, /image/, `🎬 *${BM} Slow zoom*\n\nReply to a picture:\n*.slowzoom*  (zoom in)\n*.slowzoom out*  (zoom out)\n*.slowzoom 10*  (10 seconds, from 3 to 15)`);
        if (!x) return;
        await m.reply('🎬 _Rendering..._');
        const inFile = path.join(dir, `in.${extFor(x.mime)}`); fs.writeFileSync(inFile, x.buf);
        const info = await probe(inFile);
        const ratio = info.w && info.h ? info.w / info.h : 1;
        const W = ratio >= 1 ? 960 : even(960 * ratio), H = ratio >= 1 ? even(960 / ratio) : 960;
        const F = secs * 25;
        const z = out_ ? `if(eq(on,0),1.25,max(zoom-${(0.25 / F).toFixed(5)},1.0))` : `min(zoom+${(0.25 / F).toFixed(5)},1.25)`;
        const out = path.join(dir, 'out.mp4');
        await ff(['-y', '-i', inFile, '-vf', `scale=${W * 2}:${H * 2}:force_original_aspect_ratio=increase,crop=${W * 2}:${H * 2},zoompan=z='${z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${F}:s=${W}x${H}:fps=25,format=yuv420p`,
          '-frames:v', String(F), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-movflags', 'faststart', out], 240000);
        await client.sendMessage(m.chat, { video: fs.readFileSync(out), mimetype: 'video/mp4', caption: `🎬 Slow zoom ${out_ ? 'out' : 'in'} • ${TAG}` }, { quoted: m });
      } catch (e) { m.reply('❌ Failed: ' + e.message); }
      finally { rmDir(dir); }
    }
  },

  {
    command: ['echo'],
    aliases: ['echoeffect', 'reverb'],
    description: 'Echo effect on a voice note / song / video (.echo small|big)',
    category: 'audio',
    handler: async (client, m, { text }) => {
      const big = /big|long|cave|hall/i.test(text || '');
      const af = big ? 'aecho=0.8:0.9:500|900|1400:0.45|0.3|0.2' : 'aecho=0.8:0.88:70|140:0.4|0.25';
      try { await audioJob(client, m, af, '🔁', `Echo${big ? ' (big)' : ''} • ${TAG}`); }
      catch (e) { m.reply('❌ Failed: ' + e.message); }
    }
  },

  {
    command: ['robot'],
    aliases: ['robotvoice', 'robovoice'],
    description: 'Robot voice effect on a voice note / video',
    category: 'audio',
    handler: async (client, m) => {
      try { await audioJob(client, m, "afftfilt=real='hypot(re,im)*sin(0)':imag='hypot(re,im)*cos(0)':win_size=512:overlap=0.75,volume=1.4", '🤖', `Robot voice • ${TAG}`); }
      catch (e) { m.reply('❌ Failed: ' + e.message); }
    }
  },

  {
    command: ['intro'],
    aliases: ['nameintro', 'introvideo', 'animatedname'],
    description: 'Animated name intro video (.intro Name | tagline | colour)',
    category: 'media',
    handler: async (client, m, { text }) => {
      let parts = String(text || '').split('|').map(s => s.trim()).filter(Boolean);
      if (!parts.length) return m.reply(`🎬 *${BM} Intro*\n\n*.intro Black Merchant*\n*.intro Nova Tech | Build the future | magenta*\nAdd *wide* at the end for a landscape video.\nColours: ${Object.keys(THEMES).join(', ')}`);
      let theme = 'cyan', wide = false;
      parts = parts.filter(p => { const k = p.toLowerCase(); if (THEMES[k]) { theme = k; return false; } if (k === 'wide') { wide = true; return false; } return true; });
      const name = (parts[0] || '').toUpperCase().slice(0, 30), tag = (parts[1] || '').slice(0, 60);
      if (!name) return m.reply('Give the intro a name: *.intro Black Merchant*');
      const T = THEMES[theme], [W, H] = wide ? [1280, 720] : [720, 1280];
      const dir = makeDir('intro');
      try {
        await m.reply('🎬 _Rendering your intro..._');
        const nl = await textLayer(name, Math.round(W * 0.88), [128, 64, 32], Math.round(H * 0.4));
        const nf = path.join(dir, 'n.png'); fs.writeFileSync(nf, nl.png);
        const inputs = ['-f', 'lavfi', '-i', `color=c=black:s=${W}x${H}:r=25:d=5`, '-loop', '1', '-framerate', '25', '-t', '5', '-i', nf];
        let tl = null;
        if (tag) { tl = await textLayer(tag, Math.round(W * 0.8), [32], 200); const tf = path.join(dir, 't.png'); fs.writeFileSync(tf, tl.png); inputs.push('-loop', '1', '-framerate', '25', '-t', '5', '-i', tf); }
        const [cr, cg, cb] = T.c.map(v => (v / 255).toFixed(3));
        const tint = `colorchannelmixer=rr=${cr}:rg=0:rb=0:gr=0:gg=${cg}:gb=0:br=0:bg=0:bb=${cb}`;
        const ny = Math.round(H / 2 - nl.h / 2 - (tl ? 30 : 0)), ty = ny + nl.h + 10;
        let fc = `[0:v]${bgChain(W, H, T.bg, T.bg2, true, hx(T.c))}[bg];` +
          `[1:v]format=rgba,fade=t=in:st=0.5:d=0.9:alpha=1,split=2[na][nb];[na]gblur=sigma=${Math.round(H / 50)},${tint}[ng];` +
          `[bg][ng]overlay=x=(W-w)/2:y='${ny}+max(0,(1.4-t))*60'[s1];[s1][nb]overlay=x=(W-w)/2:y='${ny}+max(0,(1.4-t))*60'[s2]`;
        let last = 's2';
        if (tl) { fc += `;[2:v]format=rgba,fade=t=in:st=1.6:d=0.8:alpha=1[tg];[${last}][tg]overlay=x=(W-w)/2:y=${ty}[s3]`; last = 's3'; }
        const bar = Math.round(W * 0.5);
        fc += `;[${last}]drawbox=x=(iw-${bar})/2:y=${ny - 18}:w=${bar}:h=4:color=${hx(T.c)}@0.9:t=fill:enable='gte(t,1.2)',fade=t=in:st=0:d=0.5,fade=t=out:st=4.5:d=0.5,format=yuv420p[v]`;
        const out = path.join(dir, 'out.mp4');
        const aud = `aevalsrc='0.6*sin(2*PI*(120*t+260*t*t))*lt(t,1.2)+0.5*sin(2*PI*55*t)*exp(-4*(t-1.2))*gte(t,1.2)':d=5:s=44100,afade=t=out:st=4.2:d=0.8`;
        try {
          await ff(['-y', ...inputs, '-f', 'lavfi', '-i', aud, '-filter_complex', fc, '-map', '[v]', '-map', `${inputs.filter(x => x === '-i').length}:a`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-r', '25', '-c:a', 'aac', '-b:a', '128k', '-t', '5', '-movflags', 'faststart', out], 180000);
        } catch (_) {
          await ff(['-y', ...inputs, '-filter_complex', fc, '-map', '[v]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-r', '25', '-t', '5', '-movflags', 'faststart', out], 180000);
        }
        await client.sendMessage(m.chat, { video: fs.readFileSync(out), mimetype: 'video/mp4', caption: `🎬 ${name} • ${TAG}` }, { quoted: m });
      } catch (e) { m.reply('❌ Could not make the intro: ' + String(e.message).slice(0, 150)); }
      finally { rmDir(dir); }
    }
  },

  {
    command: ['countdown'],
    aliases: ['countdownvideo', 'timervideo'],
    description: 'Animated countdown video (.countdown 10 [colour] [text])',
    category: 'media',
    handler: async (client, m, { text }) => {
      const w = String(text || '').trim().split(/\s+/).filter(Boolean);
      const n = Number(w[0]);
      if (!n || n < 3 || n > 30) return m.reply(`⏳ *${BM} Countdown*\n\n*.countdown 10*\n*.countdown 5 gold*\n*.countdown 10 magenta Happy New Year*\nFrom 3 to 30 seconds. Optional text shows at the end.`);
      let theme = 'cyan'; const rest = [];
      w.slice(1).forEach(x => { if (THEMES[x.toLowerCase()]) theme = x.toLowerCase(); else rest.push(x); });
      const endText = rest.join(' ').slice(0, 40) || 'GO!';
      const T = THEMES[theme], W = 720, H = 1280;
      const dir = makeDir('cd');
      try {
        await m.reply(`⏳ _Rendering ${n} seconds..._`);
        const inputs = ['-f', 'lavfi', '-i', `color=c=black:s=${W}x${H}:r=25:d=${n + 2}`];
        const [cr, cg, cb] = T.c.map(v => (v / 255).toFixed(3));
        const tint = `colorchannelmixer=rr=${cr}:rg=0:rb=0:gr=0:gg=${cg}:gb=0:br=0:bg=0:bb=${cb}`;
        let fc = `[0:v]${bgChain(W, H, T.bg, T.bg2, true, hx(T.c))}[b0]`, last = 'b0';
        for (let i = 0; i <= n; i++) {
          const L = await textLayer(i === 0 ? endText.toUpperCase() : String(n - i + 1), Math.round(W * 0.8), [128, 64, 32], 300);
          const f = path.join(dir, `n${i}.png`); fs.writeFileSync(f, L.png);
          inputs.push('-i', f);
          const start = i === 0 ? n : i - 1, end = i === 0 ? n + 2 : i;
          const idx = i + 1, sc = i === 0 ? 2 : 4;
          fc += `;[${idx}:v]format=rgba,scale=iw*${sc}:ih*${sc}:flags=neighbor,split=2[a${i}][c${i}];[a${i}]gblur=sigma=14,${tint}[g${i}];` +
            `[${last}][g${i}]overlay=x=(W-w)/2:y=(H-h)/2:enable='between(t,${start},${end})'[p${i}];[p${i}][c${i}]overlay=x=(W-w)/2:y=(H-h)/2:enable='between(t,${start},${end})'[q${i}]`;
          last = `q${i}`;
        }
        fc += `;[${last}]format=yuv420p[v]`;
        const aud = `aevalsrc='0.5*sin(2*PI*880*t)*lt(mod(t,1),0.1)*lt(t,${n})+0.6*sin(2*PI*1320*t)*gte(t,${n})*lt(t,${n + 0.8})':d=${n + 2}:s=44100,afade=t=out:st=${n + 1.2}:d=0.8`;
        const out = path.join(dir, 'out.mp4');
        try {
          await ff(['-y', ...inputs, '-f', 'lavfi', '-i', aud, '-filter_complex', fc, '-map', '[v]', '-map', `${n + 2}:a`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '25', '-r', '25', '-c:a', 'aac', '-b:a', '96k', '-t', String(n + 2), '-movflags', 'faststart', out], 240000);
        } catch (_) {
          await ff(['-y', ...inputs, '-filter_complex', fc, '-map', '[v]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '25', '-r', '25', '-t', String(n + 2), '-movflags', 'faststart', out], 240000);
        }
        await client.sendMessage(m.chat, { video: fs.readFileSync(out), mimetype: 'video/mp4', caption: `⏳ ${n} • ${TAG}` }, { quoted: m });
      } catch (e) { m.reply('❌ Could not make the countdown: ' + String(e.message).slice(0, 150)); }
      finally { rmDir(dir); }
    }
  },

  {
    command: ['loop'],
    aliases: ['boomerang', 'repeatvideo', 'bounce'],
    description: 'Loop a short video: bounce (forward and back) or repeat (.loop, .loop 3)',
    category: 'media',
    handler: async (client, m, { text }) => {
      const a = String(text || '').toLowerCase();
      const times = (a.match(/\b(\d)\b/) || [])[1] ? Math.max(2, Math.min(6, Number(a.match(/\b(\d)\b/)[1]))) : 0;
      const dir = makeDir('loop');
      try {
        const x = await needMedia(client, m, /video|gif/, `🔄 *${BM} Loop*\n\nReply to a short video (up to 15 seconds):\n*.loop*  bounce: plays forward then backward, again and again\n*.loop 3*  repeats the clip 3 times (2 to 6)`);
        if (!x) return;
        const inFile = path.join(dir, `in.${extFor(x.mime)}`); fs.writeFileSync(inFile, x.buf);
        const info = await probe(inFile);
        if (info.seconds > 15) return m.reply('⚠️ Use a clip of 15 seconds or less.');
        await m.reply('🔄 _Looping..._');
        const out = path.join(dir, 'out.mp4');
        if (times) {
          const base = ['-y', '-stream_loop', String(times - 1), '-i', inFile, '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-movflags', 'faststart'];
          try { await ff([...base, '-c:a', 'aac', '-b:a', '128k', out], 240000); } catch (_) { await ff([...base, '-an', out], 240000); }
        } else {
          await ff(['-y', '-i', inFile, '-filter_complex', '[0:v]scale=trunc(iw/2)*2:trunc(ih/2)*2,split=2[f][b];[b]reverse[r];[f][r]concat=n=2:v=1:a=0,format=yuv420p[v]', '-map', '[v]', '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-movflags', 'faststart', out], 240000);
        }
        await client.sendMessage(m.chat, { video: fs.readFileSync(out), mimetype: 'video/mp4', gifPlayback: !times && info.seconds <= 8, caption: `🔄 ${times ? 'Repeated ' + times + '×' : 'Bounce loop'} • ${TAG}` }, { quoted: m });
      } catch (e) { m.reply('❌ Failed: ' + e.message); }
      finally { rmDir(dir); }
    }
  },

  {
    command: ['aura'],
    aliases: ['auraread', 'myaura', 'auracheck'],
    description: 'Your aura colour and strength today (.aura, or tag someone)',
    category: 'fun',
    handler: async (client, m, { pushname }) => {
      const jid = (m.mentionedJid && m.mentionedJid[0]) || (m.quoted && m.quoted.sender) || m.sender;
      const rnd = seedFrom(num(jid) + dayKey() + 'aura');
      const a = AURAS[Math.floor(rnd() * AURAS.length)];
      const pct = 35 + Math.floor(rnd() * 65);
      const traits = [];
      while (traits.length < 3) { const t = AURA_TRAITS[Math.floor(rnd() * AURA_TRAITS.length)]; if (!traits.includes(t)) traits.push(t); }
      const dir = makeDir('aura');
      try {
        const pic = await profilePic(client, jid);
        const who = (jid === m.sender ? pushname || m.pushName : '') || '';
        const items = [
          { text: 'AURA READING', sizes: [32], gap: 18, width: 0.6 },
          { text: a.name.toUpperCase(), sizes: [64, 32], gap: 14, width: 0.9 },
          { text: pct + '%', sizes: [128], gap: 20, width: 0.5 },
          { text: traits.join('  /  ').toUpperCase(), sizes: [32], glow: false, gap: 0, width: 0.9 }
        ];
        const img = await cardImage(dir, { w: 1080, h: 1350, rgb: a.rgb, items, pic });
        const bar = '█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10));
        await client.sendMessage(m.chat, { image: img, mimetype: 'image/png', caption: `🔮 *${BM} AURA*\n\n@${num(jid)}\n🎨 *${a.name}*\n⚡ Strength: *${pct}%*\n${bar}\n\n✨ ${traits.join(', ')}\n💬 ${a.mean}\n\n_Resets every day. For fun only._`, mentions: [jid] }, { quoted: m });
      } catch (e) { m.reply('❌ Could not read the aura: ' + String(e.message).slice(0, 120)); }
      finally { rmDir(dir); }
    }
  },

  {
    command: ['szodiac'],
    aliases: ['horoscope2', 'starsign', 'zodiacread'],
    description: 'Daily zodiac reading card (.szodiac leo or .szodiac 14 may)',
    category: 'fun',
    handler: async (client, m, { text }) => {
      const sign = signFromText(text);
      if (!sign) return m.reply(`🔮 *${BM} Zodiac*\n\n*.szodiac leo*\n*.szodiac 14 may*  (your birthday)\n\nSigns: ${SIGNS.map(s => s[0]).join(', ')}`);
      const rnd = seedFrom(sign[0] + dayKey() + 'zod');
      const line = ZODIAC_LINES[Math.floor(rnd() * ZODIAC_LINES.length)];
      const mood = pickOne(MOODS, rnd), lucky = 1 + Math.floor(rnd() * 99), colour = pickOne(LUCKY_COLOURS, rnd);
      const match = pickOne(SIGNS.filter(s => s[0] !== sign[0]), rnd);
      const stars = () => '⭐'.repeat(2 + Math.floor(rnd() * 4));
      const love = stars(), career = stars(), money = stars();
      const dir = makeDir('zod');
      try {
        const rgb = (THEMES[['purple', 'cyan', 'gold', 'magenta', 'green', 'blue'][Math.floor(rnd() * 6)]] || THEMES.purple).c;
        const items = [
          { text: 'DAILY STARS', sizes: [32], gap: 18, width: 0.6 },
          { text: sign[0].toUpperCase(), sizes: [128, 64], gap: 22, width: 0.9 },
          { text: `MOOD ${mood.toUpperCase()}   LUCKY ${lucky}   COLOUR ${colour.toUpperCase()}`, sizes: [32], gap: 20, width: 0.9 },
          { text: line, sizes: [32], glow: false, gap: 0, width: 0.8, maxH: 400 }
        ];
        const img = await cardImage(dir, { w: 1080, h: 1350, rgb, items });
        await client.sendMessage(m.chat, { image: img, mimetype: 'image/png', caption: `${sign[1]} *${sign[0]}* • ${BM}\n\n💬 ${line}\n\n💖 Love: ${love}\n💼 Career: ${career}\n💰 Money: ${money}\n\n🎭 Mood: ${mood}\n🍀 Lucky number: ${lucky}\n🎨 Lucky colour: ${colour}\n🤝 Best match today: ${match[1]} ${match[0]}\n\n_New reading every day. For fun only._` }, { quoted: m });
      } catch (e) { m.reply('❌ Could not make the card: ' + String(e.message).slice(0, 120)); }
      finally { rmDir(dir); }
    }
  },

  {
    command: ['vibe'],
    aliases: ['vibecheck', 'moodread', 'mood'],
    description: 'Reads the vibe of a message (.vibe <text>, or reply to a message)',
    category: 'fun',
    handler: async (client, m, { text }) => {
      const t = String(text || quotedText(m) || '').trim();
      if (!t) return m.reply(`🌀 *${BM} Vibe check*\n\n*.vibe I just got the job, let's go!*\nOr reply to any message with *.vibe*`);
      const r = readVibe(t), V = VIBES[r.mood];
      const dir = makeDir('vibe');
      try {
        const items = [
          { text: 'VIBE CHECK', sizes: [32], gap: 20, width: 0.6 },
          { text: r.mood.toUpperCase(), sizes: [128, 64], gap: 20, width: 0.9 },
          { text: r.pct + '% VIBE', sizes: [64, 32], gap: 24, width: 0.7 },
          { text: V.line, sizes: [32], glow: false, gap: 0, width: 0.8, maxH: 300 }
        ];
        const img = await cardImage(dir, { w: 1080, h: 1080, rgb: V.rgb, items });
        await client.sendMessage(m.chat, { image: img, mimetype: 'image/png', caption: `🌀 *${BM} VIBE*\n\nMood: *${r.mood}*${r.second ? ' with a touch of ' + r.second.toLowerCase() : ''}\nStrength: *${r.pct}%*\n💬 ${V.line}\n\n_Based on the words and emojis. For fun._` }, { quoted: m });
      } catch (e) { m.reply('❌ Could not make the card: ' + String(e.message).slice(0, 120)); }
      finally { rmDir(dir); }
    }
  },

  {
    command: ['cinema'],
    aliases: ['movielook', 'filmlook', 'cinematic'],
    description: 'Movie look: black bars, film colours and grain (.cinema or .cinema warm|cool|noir)',
    category: 'media',
    handler: async (client, m, { text }) => {
      const a = String(text || '').toLowerCase();
      const grade = /warm|gold|sunset/.test(a) ? 'colorbalance=rs=0.12:gs=0.02:bs=-0.12:rm=0.08:bm=-0.06:rh=0.1:bh=-0.08,eq=saturation=1.1'
        : /noir|bw|mono|black/.test(a) ? 'format=gray,format=gbrp,eq=contrast=1.35:brightness=-0.04'
          : 'colorbalance=rs=-0.1:gs=-0.02:bs=0.14:rm=-0.04:bm=0.06:rh=0.14:gh=0.03:bh=-0.1,eq=saturation=1.12';
      const dir = makeDir('cin');
      try {
        const x = await needMedia(client, m, /image|video/, `🎞️ *${BM} Cinema*\n\nReply to a picture or video:\n*.cinema*  (teal and orange)\n*.cinema warm*  •  *.cinema cool*  •  *.cinema noir*`);
        if (!x) return;
        const isVid = /video/.test(x.mime);
        const inFile = path.join(dir, `in.${extFor(x.mime)}`); fs.writeFileSync(inFile, x.buf);
        const info = await probe(inFile);
        if (isVid && info.seconds > 90) return m.reply('⚠️ Use a video of 90 seconds or less.');
        await m.reply('🎞️ _Grading..._');
        const bars = `(ih-iw/2.39)/2`;
        const vf = `${grade},noise=alls=7:allf=t,vignette=PI/5,drawbox=x=0:y=0:w=iw:h=${bars}:color=black:t=fill,drawbox=x=0:y=ih-${bars}:w=iw:h=${bars}:color=black:t=fill,format=${isVid ? 'yuv420p' : 'yuvj420p'}`;
        if (isVid) {
          const out = path.join(dir, 'out.mp4');
          const base = ['-y', '-i', inFile, '-vf', `scale=trunc(iw/2)*2:trunc(ih/2)*2,${vf}`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-movflags', 'faststart'];
          try { await ff([...base, '-c:a', 'copy', out], 240000); } catch (_) { await ff([...base, '-an', out], 240000); }
          await client.sendMessage(m.chat, { video: fs.readFileSync(out), mimetype: 'video/mp4', caption: `🎞️ Cinema • ${TAG}` }, { quoted: m });
        } else {
          const out = path.join(dir, 'out.jpg');
          await ff(['-y', '-i', inFile, '-vf', vf, '-frames:v', '1', '-q:v', '2', out]);
          await client.sendMessage(m.chat, { image: fs.readFileSync(out), caption: `🎞️ Cinema • ${TAG}` }, { quoted: m });
        }
      } catch (e) { m.reply('❌ Failed: ' + e.message); }
      finally { rmDir(dir); }
    }
  },

  {
    command: ['mirror'],
    aliases: ['symmetry', 'mirrorfx', 'kaleido'],
    description: 'Mirror effect (.mirror left|right|top|bottom|quad)',
    category: 'media',
    handler: async (client, m, { text }) => {
      const a = String(text || '').toLowerCase();
      const mode = (a.match(/\b(left|right|top|bottom|quad|kaleido)\b/) || [])[1] || 'left';
      const dir = makeDir('mir');
      try {
        const x = await needMedia(client, m, /image|video/, `🪞 *${BM} Mirror*\n\nReply to a picture or video:\n*.mirror left*  (left half copied to the right)\n*.mirror right*  •  *.mirror top*  •  *.mirror bottom*\n*.mirror quad*  (four-way kaleidoscope)`);
        if (!x) return;
        const isVid = /video/.test(x.mime);
        const inFile = path.join(dir, `in.${extFor(x.mime)}`); fs.writeFileSync(inFile, x.buf);
        const info = await probe(inFile);
        if (isVid && info.seconds > 60) return m.reply('⚠️ Use a video of 60 seconds or less.');
        await m.reply('🪞 _Mirroring..._');
        const pre = 'scale=trunc(iw/4)*4:trunc(ih/4)*4';
        const core = {
          left: `${pre},split=2[a][b];[a]crop=iw/2:ih:0:0[l];[b]crop=iw/2:ih:0:0,hflip[r];[l][r]hstack`,
          right: `${pre},split=2[a][b];[a]crop=iw/2:ih:iw/2:0[r];[b]crop=iw/2:ih:iw/2:0,hflip[l];[l][r]hstack`,
          top: `${pre},split=2[a][b];[a]crop=iw:ih/2:0:0[t];[b]crop=iw:ih/2:0:0,vflip[u];[t][u]vstack`,
          bottom: `${pre},split=2[a][b];[a]crop=iw:ih/2:0:ih/2[d];[b]crop=iw:ih/2:0:ih/2,vflip[u];[u][d]vstack`,
          quad: `${pre},crop=iw/2:ih/2:0:0,split=2[a][b];[b]hflip[c];[a][c]hstack,split=2[d][e];[e]vflip[f];[d][f]vstack`
        }[mode === 'kaleido' ? 'quad' : mode];
        const fc = `[0:v]${core},format=${isVid ? 'yuv420p' : 'yuvj420p'}[v]`;
        if (isVid) {
          const out = path.join(dir, 'out.mp4');
          const base = ['-y', '-i', inFile, '-filter_complex', fc, '-map', '[v]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-movflags', 'faststart'];
          try { await ff([...base, '-map', '0:a?', '-c:a', 'copy', out], 240000); } catch (_) { await ff([...base, '-an', out], 240000); }
          await client.sendMessage(m.chat, { video: fs.readFileSync(out), mimetype: 'video/mp4', caption: `🪞 Mirror ${mode} • ${TAG}` }, { quoted: m });
        } else {
          const out = path.join(dir, 'out.jpg');
          await ff(['-y', '-i', inFile, '-filter_complex', fc, '-map', '[v]', '-frames:v', '1', '-q:v', '2', out]);
          await client.sendMessage(m.chat, { image: fs.readFileSync(out), caption: `🪞 Mirror ${mode} • ${TAG}` }, { quoted: m });
        }
      } catch (e) { m.reply('❌ Failed: ' + e.message); }
      finally { rmDir(dir); }
    }
  }
];
