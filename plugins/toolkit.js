'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const axios = global.axios || require('axios');

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
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const rand = (n) => Math.floor(Math.random() * n);
const num = (jid) => String(jid || '').split('@')[0].split(':')[0];

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

function parseTime(s) {
  s = String(s || '').trim().toLowerCase();
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  let m = s.match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2}(?:\.\d+)?)$/);
  if (m) return (Number(m[1] || 0) * 3600) + Number(m[2]) * 60 + Number(m[3]);
  m = s.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s?)?$/);
  if (m && (m[1] || m[2] || m[3])) return Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0);
  return null;
}
const stamp = (sec) => { sec = Math.round(sec); const mm = Math.floor(sec / 60), ss = sec % 60; return `${mm}:${String(ss).padStart(2, '0')}`; };
function parseRange(text) {
  const t = String(text || '').trim();
  const m = t.match(/^(\S+?)\s*(?:-|–|—|to|\s)\s*(\S+)$/i);
  if (!m) return null;
  const a = parseTime(m[1]), b = parseTime(m[2]);
  if (a == null || b == null) return null;
  return [a, b];
}

async function needMedia(client, m, kinds, usage) {
  const t = mediaTarget(m);
  const mime = mimeOf(t);
  if (!t || !kinds.test(mime)) { await m.reply(usage); return null; }
  const buf = await downloadTarget(client, t);
  return { t, mime, buf };
}

async function convertAudio(buf, mime, outExt, codecArgs) {
  const dir = makeDir('aud');
  try {
    const inFile = path.join(dir, `in.${extFor(mime)}`);
    fs.writeFileSync(inFile, buf);
    const out = path.join(dir, `out.${outExt}`);
    await ff(['-y', '-i', inFile, '-vn', ...codecArgs, out]);
    return fs.readFileSync(out);
  } finally { rmDir(dir); }
}

let ENCODERS = null;
function hasEncoder(name) {
  return new Promise((resolve) => {
    if (ENCODERS) return resolve(ENCODERS.includes(name));
    execFile(ffmpegBin(), ['-hide_banner', '-encoders'], { timeout: 20000, maxBuffer: 5 * 1024 * 1024 }, (_e, out) => {
      ENCODERS = String(out || ''); resolve(ENCODERS.includes(name));
    });
  });
}
async function makeVoiceNote(buf, mime) {
  const dir = makeDir('vn');
  try {
    const inFile = path.join(dir, `in.${extFor(mime)}`);
    fs.writeFileSync(inFile, buf);
    const out = path.join(dir, 'out.ogg');
    const base = ['-y', '-i', inFile, '-vn', '-map_metadata', '-1', '-ar', '48000', '-ac', '1'];
    const tries = [];
    if (await hasEncoder('libopus')) tries.push(['-c:a', 'libopus', '-b:a', '32k', '-vbr', 'on', '-application', 'voip', '-f', 'ogg']);
    tries.push(['-c:a', 'opus', '-strict', '-2', '-b:a', '32k', '-f', 'ogg']);
    let lastErr = null;
    for (const t of tries) {
      try {
        try { fs.rmSync(out, { force: true }); } catch (_) {}
        await ff([...base, ...t, out]);
        const info = await probe(out);
        const head = fs.readFileSync(out).subarray(0, 4).toString('latin1');
        const raw = fs.readFileSync(out);
        if (head === 'OggS' && raw.length > 800 && info.seconds > 0.2) return { buf: raw, seconds: Math.max(1, Math.round(info.seconds)) };
        lastErr = new Error('the converted file was empty');
      } catch (e) { lastErr = e; }
    }
    throw new Error('this server\'s ffmpeg cannot make voice notes (' + String(lastErr && lastErr.message).slice(0, 120) + ')');
  } finally { rmDir(dir); }
}

const mergeQueues = new Map();
function dropQueue(sender) {
  const q = mergeQueues.get(sender);
  if (q) { clearTimeout(q.timer); rmDir(q.dir); mergeQueues.delete(sender); }
}

async function textStrip(text, width, { maxHeight = 400, sizes = [64, 32] } = {}) {
  const Jimp = require('jimp');
  const fontsW = { 64: await Jimp.loadFont(Jimp.FONT_SANS_64_WHITE), 32: await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE) };
  const fontsB = { 64: await Jimp.loadFont(Jimp.FONT_SANS_64_BLACK), 32: await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK) };
  const pad = 20, maxW = width - pad * 2;
  let size = sizes[sizes.length - 1];
  for (const s of sizes) { size = s; if (Jimp.measureTextHeight(fontsW[s], text, maxW) <= maxHeight - pad * 2) break; }
  const th = Jimp.measureTextHeight(fontsW[size], text, maxW);
  const img = new Jimp(width, th + pad * 2, 0x00000000);
  const opts = { text, alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER };
  for (const [dx, dy] of [[-3, -3], [-3, 0], [-3, 3], [0, -3], [0, 3], [3, -3], [3, 0], [3, 3]]) img.print(fontsB[size], pad + dx, pad + dy, opts, maxW);
  img.print(fontsW[size], pad, pad, opts, maxW);
  return { png: await img.getBufferAsync(Jimp.MIME_PNG), h: th + pad * 2 };
}

function parseLRC(lrc) {
  const lines = [];
  for (const raw of String(lrc || '').split('\n')) {
    const m = raw.match(/^\[(\d+):(\d+(?:\.\d+)?)\]\s*(.*)$/);
    if (m && m[3].trim()) lines.push({ t: Number(m[1]) * 60 + Number(m[2]), text: m[3].trim() });
  }
  return lines;
}
async function findLyrics(query, wantSeconds) {
  const r = await axios.get(`https://lrclib.net/api/search?q=${encodeURIComponent(query)}`, { timeout: 20000, headers: { 'User-Agent': UA } });
  const list = (Array.isArray(r.data) ? r.data : []).filter(x => x.syncedLyrics);
  if (!list.length) return null;
  const best = wantSeconds ? list.slice().sort((a, b) => Math.abs((a.duration || 0) - wantSeconds) - Math.abs((b.duration || 0) - wantSeconds))[0] : list[0];
  return { lines: parseLRC(best.syncedLyrics), title: best.trackName, artist: best.artistName, duration: best.duration };
}

async function songAudioViaPlay(client, m, ctx, query) {
  const play = require('./downloads').find(c => (c.command || []).includes('play'));
  if (!play) throw new Error('.play not found');
  let got = null;
  const spy = new Proxy(client, {
    get(t, p) {
      if (p === 'sendMessage') return async (_jid, content) => {
        if (!got && content && content.audio) got = content.audio;
        else if (!got && content && content.document && /audio/.test(content.mimetype || '')) got = content.document;
        return {};
      };
      const v = t[p];
      return typeof v === 'function' ? v.bind(t) : v;
    }
  });
  const quiet = Object.create(m);
  quiet.reply = async () => {};
  await play.handler(spy, quiet, { ...ctx, text: query, reply: async () => {} });
  if (!got) throw new Error('the song could not be downloaded');
  if (Buffer.isBuffer(got)) return got;
  if (got.url) { const r = await axios.get(got.url, { responseType: 'arraybuffer', timeout: 90000 }); return Buffer.from(r.data); }
  throw new Error('unexpected audio format');
}

const CONF_FILE = path.join(process.cwd(), 'confess_data.json');
let CONF = null;
function loadConf() {
  if (CONF) return CONF;
  try { CONF = JSON.parse(fs.readFileSync(CONF_FILE, 'utf8')); } catch (_) { CONF = {}; }
  CONF.enabled = CONF.enabled || {}; CONF.log = CONF.log || []; CONF.last = CONF.last || {}; CONF.counter = CONF.counter || 0;
  return CONF;
}
const saveConf = () => { try { fs.writeFileSync(CONF_FILE, JSON.stringify(CONF)); } catch (_) {} };
async function groupsFor(client, sender) {
  const all = await client.groupFetchAllParticipating();
  const me = num(sender);
  return Object.values(all || {})
    .filter(g => loadConf().enabled[g.id] && (g.participants || []).some(p => [p.id, p.pn, p.phoneNumber, p.lid].some(x => x && num(x) === me)))
    .map(g => ({ id: g.id, subject: g.subject || g.id }))
    .sort((a, b) => a.subject.localeCompare(b.subject));
}

const COUNTRIES = {
  '254': 'Kenya 🇰🇪', '255': 'Tanzania 🇹🇿', '256': 'Uganda 🇺🇬', '250': 'Rwanda 🇷🇼', '257': 'Burundi 🇧🇮', '251': 'Ethiopia 🇪🇹',
  '252': 'Somalia 🇸🇴', '211': 'South Sudan 🇸🇸', '234': 'Nigeria 🇳🇬', '233': 'Ghana 🇬🇭', '27': 'South Africa 🇿🇦', '20': 'Egypt 🇪🇬',
  '212': 'Morocco 🇲🇦', '260': 'Zambia 🇿🇲', '263': 'Zimbabwe 🇿🇼', '265': 'Malawi 🇲🇼', '258': 'Mozambique 🇲🇿', '243': 'DR Congo 🇨🇩',
  '237': 'Cameroon 🇨🇲', '221': 'Senegal 🇸🇳', '225': 'Ivory Coast 🇨🇮', '1': 'USA / Canada 🇺🇸', '44': 'United Kingdom 🇬🇧', '49': 'Germany 🇩🇪',
  '33': 'France 🇫🇷', '39': 'Italy 🇮🇹', '34': 'Spain 🇪🇸', '31': 'Netherlands 🇳🇱', '91': 'India 🇮🇳', '92': 'Pakistan 🇵🇰',
  '86': 'China 🇨🇳', '81': 'Japan 🇯🇵', '82': 'South Korea 🇰🇷', '971': 'UAE 🇦🇪', '966': 'Saudi Arabia 🇸🇦', '974': 'Qatar 🇶🇦',
  '61': 'Australia 🇦🇺', '55': 'Brazil 🇧🇷', '52': 'Mexico 🇲🇽', '7': 'Russia 🇷🇺', '90': 'Turkey 🇹🇷', '62': 'Indonesia 🇮🇩', '63': 'Philippines 🇵🇭'
};
function countryOf(digits) {
  for (let n = 3; n >= 1; n--) { const c = COUNTRIES[digits.slice(0, n)]; if (c) return c; }
  return 'Unknown';
}

const votes = {};
function tally(v) {
  const counts = v.opts.map(() => 0);
  for (const idx of v.ballots.values()) counts[idx]++;
  const total = counts.reduce((a, b) => a + b, 0);
  return v.opts.map((o, i) => {
    const pct = total ? Math.round((counts[i] / total) * 100) : 0;
    return `${i + 1}. ${o}\n   ${'█'.repeat(Math.round(pct / 10))}${'░'.repeat(10 - Math.round(pct / 10))} ${counts[i]} (${pct}%)`;
  }).join('\n') + `\n\n🗳️ Total votes: ${total}`;
}

const NAMED = {
  red: '#ff0000', green: '#008000', blue: '#0000ff', yellow: '#ffff00', orange: '#ffa500', purple: '#800080', pink: '#ffc0cb', black: '#000000',
  white: '#ffffff', gray: '#808080', grey: '#808080', brown: '#a52a2a', cyan: '#00ffff', magenta: '#ff00ff', gold: '#ffd700', silver: '#c0c0c0',
  navy: '#000080', teal: '#008080', maroon: '#800000', lime: '#00ff00', olive: '#808000', coral: '#ff7f50', salmon: '#fa8072', violet: '#ee82ee',
  indigo: '#4b0082', turquoise: '#40e0d0', beige: '#f5f5dc', crimson: '#dc143c', khaki: '#f0e68c', lavender: '#e6e6fa'
};
function parseColor(input) {
  let s = String(input || '').trim().toLowerCase();
  if (NAMED[s]) s = NAMED[s];
  let m = s.match(/^#?([0-9a-f]{6})$/); if (m) return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)];
  m = s.match(/^#?([0-9a-f]{3})$/); if (m) return [...m[1]].map(c => parseInt(c + c, 16));
  m = s.match(/(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})/); if (m) { const v = [m[1], m[2], m[3]].map(Number); if (v.every(x => x <= 255)) return v; }
  return null;
}
const hex2 = (n) => n.toString(16).padStart(2, '0');
function toHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0; const l = (mx + mn) / 2;
  if (mx !== mn) {
    const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60;
  }
  return [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
}
function nearestName(rgb) {
  let best = null, bd = 1e9;
  for (const [name, hx] of Object.entries(NAMED)) {
    const c = parseColor(hx); const d = (c[0] - rgb[0]) ** 2 + (c[1] - rgb[1]) ** 2 + (c[2] - rgb[2]) ** 2;
    if (d < bd) { bd = d; best = name; }
  }
  return best;
}

module.exports = [

  {
    command: ['tomp3'],
    aliases: ['toaudio2', 'extractaudio', 'mp3'],
    description: 'Convert a video / voice note / audio to MP3',
    category: 'converter',
    handler: async (client, m) => {
      try {
        const x = await needMedia(client, m, /audio|video/, '🎧 Reply to a *video*, *voice note* or *audio* with *.tomp3*');
        if (!x) return;
        await m.reply('🎧 _Converting to MP3..._');
        const out = await convertAudio(x.buf, x.mime, 'mp3', ['-c:a', 'libmp3lame', '-b:a', '192k']);
        await client.sendMessage(m.chat, { audio: out, mimetype: 'audio/mpeg', ptt: false, fileName: 'audio.mp3' }, { quoted: m });
      } catch (e) { m.reply('❌ Failed: ' + e.message); }
    }
  },

  {
    command: ['tovn'],
    aliases: ['tovoice', 'toptt', 'voicenote'],
    description: 'Convert audio / video / a song into a voice note',
    category: 'converter',
    handler: async (client, m) => {
      try {
        const x = await needMedia(client, m, /audio|video/, '🎙️ Reply to an *audio*, *song* or *video* with *.tovn* to send it as a voice note.');
        if (!x) return;
        await m.reply('🎙️ _Making a voice note..._');
        const vn = await makeVoiceNote(x.buf, x.mime);
        await client.sendMessage(m.chat, { audio: vn.buf, mimetype: 'audio/ogg; codecs=opus', ptt: true, seconds: vn.seconds }, { quoted: m });
      } catch (e) { m.reply('❌ Failed: ' + e.message); }
    }
  },

  {
    command: ['cutaudio'],
    aliases: ['trimaudio', 'ringtone', 'cut'],
    description: 'Cut part of a song / audio / video (.cutaudio 0:10-0:40)',
    category: 'converter',
    handler: async (client, m, { text }) => {
      const range = parseRange(text);
      if (!range) return m.reply('✂️ Reply to a song, audio or video with the part you want:\n\n*.cutaudio 0:10-0:40*\n*.cutaudio 1:05 1:35*\n*.cutaudio 30-60*  (seconds)\n\nMax 5 minutes.');
      let [a, b] = range;
      if (b <= a) return m.reply('⚠️ The end time must be after the start time.');
      if (b - a > 300) return m.reply('⚠️ That is too long. Use a part of 5 minutes or less.');
      try {
        const x = await needMedia(client, m, /audio|video/, '✂️ Reply to a song, audio or video with *.cutaudio 0:10-0:40*');
        if (!x) return;
        await m.reply(`✂️ _Cutting ${stamp(a)} → ${stamp(b)}..._`);
        const dur = b - a;
        const out = await convertAudio(x.buf, x.mime, 'mp3', [
          '-ss', String(a), '-t', String(dur),
          '-af', `afade=t=in:d=0.3,afade=t=out:st=${Math.max(0, dur - 0.6).toFixed(2)}:d=0.6`,
          '-c:a', 'libmp3lame', '-b:a', '192k'
        ]);
        if (!out || out.length < 1000) return m.reply('❌ Nothing there. That time is probably after the end of the audio.');
        await client.sendMessage(m.chat, { audio: out, mimetype: 'audio/mpeg', ptt: false, fileName: `cut_${stamp(a).replace(':', '-')}_${stamp(b).replace(':', '-')}.mp3` }, { quoted: m });
      } catch (e) { m.reply('❌ Failed: ' + e.message); }
    }
  },

  {
    command: ['mergeaudio'],
    aliases: ['joinaudio', 'mixaudio'],
    description: 'Join or mix audio files (reply with .mergeaudio to add each, then .mergeaudio done)',
    category: 'converter',
    handler: async (client, m, { text }) => {
      const arg = String(text || '').trim().toLowerCase();
      const q = mergeQueues.get(m.sender);

      if (arg === 'clear' || arg === 'reset') { dropQueue(m.sender); return m.reply('🗑️ Merge list cleared.'); }
      if (arg === 'list') return m.reply(q ? `🎼 In your list (${q.items.length}):\n` + q.items.map((it, i) => `${i + 1}. ${it.kind}`).join('\n') : 'Your merge list is empty.');

      if (arg.startsWith('done') || arg === 'mix' || arg === 'video') {
        if (!q || q.items.length < 2) return m.reply('⚠️ Add at least 2 files first: reply to each with *.mergeaudio*');
        const mode = arg.includes('mix') ? 'mix' : arg.includes('video') ? 'video' : 'join';
        const dir = q.dir;
        try {
          await m.reply('🎼 _Merging..._');
          const files = q.items.map(i => i.file);
          let out, sendAs;
          if (mode === 'video') {
            const v = q.items.find(i => i.kind === 'video'), a = q.items.find(i => i.kind === 'audio');
            if (!v || !a) throw new Error('For *video* mode add one video and one audio.');
            out = path.join(dir, 'merged.mp4');
            await ff(['-y', '-i', v.file, '-i', a.file, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', 'faststart', out]);
            sendAs = 'video';
          } else {
            out = path.join(dir, 'merged.mp3');
            const n = files.length;
            const inputs = files.flatMap(f => ['-i', f]);
            const norm = files.map((_, i) => `[${i}:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo[a${i}]`).join(';');
            const tags = files.map((_, i) => `[a${i}]`).join('');
            const tail = mode === 'mix' ? `${tags}amix=inputs=${n}:duration=longest,volume=${n}[out]` : `${tags}concat=n=${n}:v=0:a=1[out]`;
            await ff(['-y', ...inputs, '-filter_complex', `${norm};${tail}`, '-map', '[out]', '-c:a', 'libmp3lame', '-b:a', '192k', out]);
            sendAs = 'audio';
          }
          const buf = fs.readFileSync(out);
          if (sendAs === 'video') await client.sendMessage(m.chat, { video: buf, mimetype: 'video/mp4', caption: '🎼 Merged' }, { quoted: m });
          else await client.sendMessage(m.chat, { audio: buf, mimetype: 'audio/mpeg', ptt: false, fileName: 'merged.mp3' }, { quoted: m });
        } catch (e) { m.reply('❌ Failed: ' + e.message); }
        finally { dropQueue(m.sender); }
        return;
      }

      const t = mediaTarget(m);
      const mime = mimeOf(t);
      if (!t || !/audio|video/.test(mime)) {
        return m.reply('🎼 *Merge audio*\n\n1) Reply to an audio/video with *.mergeaudio*  (repeat for each file)\n2) Send *.mergeaudio done*  → joins them one after another\n    *.mergeaudio mix*  → plays them together\n    *.mergeaudio video*  → puts the audio under the video\n\n*.mergeaudio list* / *.mergeaudio clear*');
      }
      try {
        let cur = mergeQueues.get(m.sender);
        if (!cur) {
          cur = { dir: makeDir('merge'), items: [], timer: null };
          mergeQueues.set(m.sender, cur);
        }
        if (cur.items.length >= 6) return m.reply('⚠️ Max 6 files. Send *.mergeaudio done* now.');
        const buf = await downloadTarget(client, t);
        const file = path.join(cur.dir, `${cur.items.length}.${extFor(mime)}`);
        fs.writeFileSync(file, buf);
        cur.items.push({ file, kind: /video/.test(mime) ? 'video' : 'audio' });
        clearTimeout(cur.timer);
        cur.timer = setTimeout(() => dropQueue(m.sender), 15 * 60 * 1000);
        m.reply(`✅ Added (${cur.items.length}). Reply to another with *.mergeaudio*, or send *.mergeaudio done* (join) / *.mergeaudio mix*.`);
      } catch (e) { m.reply('❌ Failed: ' + e.message); }
    }
  },

  {
    command: ['subtitle'],
    aliases: ['caption', 'addsub', 'subs'],
    description: 'Burn text onto a video (.subtitle <text> or .subtitle 2-6 <text>)',
    category: 'media',
    handler: async (client, m, { text }) => {
      let words = String(text || '').trim();
      if (!words) return m.reply('💬 Reply to a video with *.subtitle Your text here*\n\nOnly for part of the video: *.subtitle 2-6 Your text* (seconds 2 to 6)');
      let from = null, to = null;
      const tm = words.match(/^(\S+)\s*(?:-|–|—)\s*(\S+)\s+([\s\S]+)$/);
      if (tm && parseTime(tm[1]) != null && parseTime(tm[2]) != null) { from = parseTime(tm[1]); to = parseTime(tm[2]); words = tm[3].trim(); }
      if (words.length > 200) return m.reply('⚠️ Text is too long (max 200 characters).');
      const dir = makeDir('sub');
      try {
        const x = await needMedia(client, m, /video|gif/, '💬 Reply to a *video* with *.subtitle <text>*');
        if (!x) return;
        await m.reply('💬 _Adding subtitles..._');
        const inFile = path.join(dir, 'in.mp4');
        fs.writeFileSync(inFile, x.buf);
        const info = await probe(inFile);
        if (!info.w || !info.h) throw new Error('could not read the video size');
        if (info.seconds > 180) return m.reply('⚠️ Video too long. Use one of 3 minutes or less.');
        const strip = await textStrip(words, info.w, { maxHeight: Math.round(info.h / 3) });
        const pngFile = path.join(dir, 'sub.png');
        fs.writeFileSync(pngFile, strip.png);
        const y = Math.max(0, info.h - strip.h - Math.round(info.h * 0.07));
        const en = from != null ? `:enable='between(t,${from},${to})'` : '';
        const out = path.join(dir, 'out.mp4');
        const fc = `[0:v][1:v]overlay=0:${y}${en},scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p[v]`;
        const enc = ['-filter_complex', fc, '-map', '[v]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-movflags', 'faststart'];
        try { await ff(['-y', '-i', inFile, '-i', pngFile, ...enc, '-map', '0:a?', '-c:a', 'copy', out]); }
        catch (_) { await ff(['-y', '-i', inFile, '-i', pngFile, ...enc, '-an', out]); }
        await client.sendMessage(m.chat, { video: fs.readFileSync(out), mimetype: 'video/mp4', caption: '💬 Subtitled' }, { quoted: m });
      } catch (e) { m.reply('❌ Failed: ' + e.message); }
      finally { rmDir(dir); }
    }
  },

  {
    command: ['screenshot'],
    aliases: ['vidframe', 'frame', 'grabframe'],
    description: 'Get a still picture from a video at a time (.screenshot 0:12)',
    category: 'media',
    handler: async (client, m, { text }) => {
      const arg = String(text || '').trim().toLowerCase();
      const dir = makeDir('shot');
      try {
        const x = await needMedia(client, m, /video|gif/, '🖼️ Reply to a video with *.screenshot 0:12*  (or *.screenshot mid* for the middle)');
        if (!x) return;
        const inFile = path.join(dir, 'in.mp4');
        fs.writeFileSync(inFile, x.buf);
        const info = await probe(inFile);
        let at = arg === 'mid' || arg === 'middle' ? info.seconds / 2 : arg ? parseTime(arg) : 1;
        if (at == null) return m.reply('⚠️ I did not understand that time. Try *.screenshot 0:12* or *.screenshot 12*');
        if (info.seconds && at > info.seconds) at = Math.max(0, info.seconds - 0.1);
        const out = path.join(dir, 'frame.jpg');
        await ff(['-y', '-ss', String(at), '-i', inFile, '-frames:v', '1', '-q:v', '2', out]);
        if (!fs.existsSync(out)) throw new Error('no picture at that time');
        await client.sendMessage(m.chat, { image: fs.readFileSync(out), caption: `🖼️ Frame at ${stamp(at)}` }, { quoted: m });
      } catch (e) { m.reply('❌ Failed: ' + e.message); }
      finally { rmDir(dir); }
    }
  },

  {
    command: ['lyricsvideo'],
    aliases: ['lyricvideo', 'lyricstatus', 'lvideo'],
    description: 'Make a short lyrics video of a song (.lyricsvideo <song> @0:45)',
    category: 'media',
    handler: async (client, m, ctx) => {
      let query = String(ctx.text || quotedText(m) || '').trim();
      if (!query) return m.reply('🎤 *Lyrics video*\n\n.lyricsvideo Hold my hand Bridget Blue\n.lyricsvideo Hold my hand Bridget Blue @0:45  (start at 0:45)\n\nI make a 25-second vertical video with the cover, the song and the lyrics in time.');
      let startAt = null;
      const am = query.match(/@\s*([\d:.hms]+)\s*$/i);
      if (am) { startAt = parseTime(am[1]); query = query.replace(am[0], '').trim(); }
      const dir = makeDir('lyr');
      try {
        await m.reply('🎤 _Finding the song, lyrics and cover... this takes a minute._');
        const yts = require('yt-search');
        const v = ((await yts(query)).videos || [])[0];
        if (!v) return m.reply('❌ Could not find that song.');
        const lyr = await findLyrics(query, v.seconds);
        if (!lyr || lyr.lines.length < 3) return m.reply('❌ I could not find *timed* lyrics for that song. Try the artist and song name spelled exactly, or another song.');

        const D = 25;
        const first = lyr.lines[0].t;
        const start = Math.max(0, startAt != null ? startAt : Math.max(0, first - 0.5));
        const lines = lyr.lines.filter(l => l.t >= start - 0.2 && l.t < start + D).map((l, i, arr) => ({ ...l, end: Math.min(start + D, arr[i + 1] ? arr[i + 1].t : l.t + 4) }));
        if (!lines.length) return m.reply('❌ There are no lyrics at that start time. Try another one, e.g. *@0:30*');

        let audio;
        const qt = m.quoted && mimeOf(m.quoted).startsWith('audio') ? m.quoted : null;
        audio = qt ? await downloadTarget(client, qt) : await songAudioViaPlay(client, m, ctx, query);
        const audioFile = path.join(dir, 'song.mp3');
        fs.writeFileSync(audioFile, audio);

        const th = await axios.get(v.image || v.thumbnail, { responseType: 'arraybuffer', timeout: 20000, headers: { 'User-Agent': UA } });
        const coverFile = path.join(dir, 'cover.jpg');
        fs.writeFileSync(coverFile, Buffer.from(th.data));

        const W = 720, H = 1280;
        const title = String(lyr.title || v.title).slice(0, 60), artist = String(lyr.artist || v.author?.name || '').slice(0, 50);
        const head = await textStrip(`${title}\n${artist}`, W, { maxHeight: 220, sizes: [64, 32] });
        const headFile = path.join(dir, 'head.png'); fs.writeFileSync(headFile, head.png);
        const lineFiles = [];
        for (let i = 0; i < lines.length; i++) {
          const s = await textStrip(lines[i].text, W, { maxHeight: 360, sizes: [64, 32] });
          const f = path.join(dir, `line${i}.png`); fs.writeFileSync(f, s.png);
          lineFiles.push({ f, h: s.h });
        }

        const inputs = ['-loop', '1', '-framerate', '24', '-t', String(D), '-i', coverFile, '-ss', String(start), '-t', String(D), '-i', audioFile, '-loop', '1', '-framerate', '24', '-t', String(D), '-i', headFile];
        lineFiles.forEach(l => inputs.push('-loop', '1', '-framerate', '24', '-t', String(D), '-i', l.f));
        let fc = `[0:v]scale=-2:${H},crop=${W}:${H},boxblur=25:3,eq=brightness=-0.2[bg];` +
          `[0:v]scale=460:460:force_original_aspect_ratio=increase,crop=460:460[art];` +
          `[bg][art]overlay=130:150[b1];[b1][2:v]overlay=0:660[b2]`;
        let last = 'b2';
        lines.forEach((l, i) => {
          const a = Math.max(0, l.t - start), b = Math.max(a + 0.3, l.end - start);
          const y = Math.round(900 + (260 - lineFiles[i].h) / 2);
          fc += `;[${last}][${3 + i}:v]overlay=0:${y}:enable='between(t,${a.toFixed(2)},${b.toFixed(2)})'[b${i + 2}]`;
          last = `b${i + 2}`;
        });
        fc += `;[${last}]format=yuv420p[v]`;
        const out = path.join(dir, 'out.mp4');
        await ff(['-y', ...inputs, '-filter_complex', fc, '-map', '[v]', '-map', '1:a', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-r', '24',
          '-c:a', 'aac', '-b:a', '128k', '-af', 'afade=t=in:d=0.5,afade=t=out:st=' + (D - 1.5) + ':d=1.5', '-shortest', '-movflags', 'faststart', out], 240000);
        await client.sendMessage(m.chat, { video: fs.readFileSync(out), mimetype: 'video/mp4', caption: `🎤 *${title}* — ${artist}\n⏱️ from ${stamp(start)}` }, { quoted: m });
      } catch (e) { m.reply('❌ Could not make the lyrics video: ' + String(e.message).slice(0, 160)); }
      finally { rmDir(dir); }
    }
  },

  {
    command: ['confessions'],
    aliases: ['confessmode'],
    description: 'Turn anonymous confessions on/off for this group (admins)',
    category: 'group',
    handler: async (client, m, { text, isAdmin, Owner, admin }) => {
      if (!m.isGroup) return m.reply('Use this inside the group you want to switch on.');
      if (!isAdmin && !Owner) return m.reply(admin || 'Only admins can do this.');
      const c = loadConf();
      const a = String(text || '').trim().toLowerCase();
      if (a === 'on') { c.enabled[m.chat] = true; saveConf(); return m.reply('🤫 Confessions are *ON* for this group.\nMembers can DM me *.confess* to send one anonymously.'); }
      if (a === 'off') { delete c.enabled[m.chat]; saveConf(); return m.reply('🤫 Confessions are *OFF* for this group.'); }
      m.reply(`🤫 Confessions are currently *${c.enabled[m.chat] ? 'ON' : 'OFF'}* here.\nUse *.confessions on* or *.confessions off*.`);
    }
  },

  {
    command: ['confess'],
    aliases: ['confession', 'anon'],
    description: 'Send an anonymous confession to a group (use in a private chat with the bot)',
    category: 'group',
    handler: async (client, m, { text, pushname }) => {
      if (m.isGroup) return m.reply('🤫 Send this to me in a *private chat*, so nobody sees who you are.');
      const c = loadConf();
      const list = await groupsFor(client, m.sender);
      if (!list.length) return m.reply('🤫 No groups with confessions turned on that you are in.\nAn admin can switch it on with *.confessions on* in the group.');
      const pick = String(text || '').match(/^\s*#?(\d+)\s+([\s\S]+)$/);
      if (!pick) {
        return m.reply('🤫 *Anonymous confession*\n\n' + list.map((g, i) => `${i + 1}. ${g.subject}`).join('\n') +
          '\n\nSend: *.confess <number> <your confession>*\nExample: *.confess 1 I still love jollof more than ugali*');
      }
      const g = list[Number(pick[1]) - 1];
      const body = pick[2].trim();
      if (!g) return m.reply('❌ Wrong number. Send *.confess* to see the list.');
      if (body.length < 5) return m.reply('⚠️ Write a bit more.');
      if (body.length > 1000) return m.reply('⚠️ Too long (max 1000 characters).');
      const now = Date.now();
      if (c.last[m.sender] && now - c.last[m.sender] < 60000) return m.reply('⏳ Slow down. Wait a minute between confessions.');
      c.last[m.sender] = now; c.counter += 1;
      c.log.push({ id: c.counter, sender: m.sender, name: pushname || '', group: g.id, time: now, text: body.slice(0, 300) });
      if (c.log.length > 200) c.log.shift();
      saveConf();
      try {
        await client.sendMessage(g.id, { text: `🤫 *Anonymous confession #${c.counter}*\n\n“${body}”\n\n_Want to confess? DM me *.confess*_` });
        await m.reply(`✅ Sent to *${g.subject}* as confession #${c.counter}. Nobody in the group can see who you are.`);
      } catch (e) { m.reply('❌ Could not post it: ' + e.message); }
    }
  },

  {
    command: ['confesslog'],
    description: 'Owner only: see who sent the latest confessions (for moderation)',
    category: 'group',
    handler: async (client, m, { Owner, NotOwner }) => {
      if (!Owner) return m.reply(NotOwner);
      const log = loadConf().log.slice(-10).reverse();
      if (!log.length) return m.reply('No confessions yet.');
      m.reply('🗂️ *Latest confessions*\n\n' + log.map(l => `#${l.id} • +${num(l.sender)} ${l.name ? '(' + l.name + ')' : ''}\n${l.text.slice(0, 80)}`).join('\n\n'));
    }
  },

  {
    command: ['whois'],
    aliases: ['userinfo', 'whoisthis', 'profile'],
    description: 'Info about a person (tag them, reply to them, or give a number)',
    category: 'group',
    handler: async (client, m, { text, store }) => {
      let jid = (m.mentionedJid && m.mentionedJid[0]) || (m.quoted && m.quoted.sender) || null;
      const digits = String(text || '').replace(/[^0-9]/g, '');
      if (!jid && digits.length >= 8) jid = digits + '@s.whatsapp.net';
      if (!jid) jid = m.sender;
      try {
        let phone = num(jid), role = '', pn = null;
        if (m.isGroup) {
          try {
            const meta = await client.groupMetadata(m.chat);
            const p = meta.participants.find(x => [x.id, x.pn, x.phoneNumber, x.lid].some(v => v && num(v) === num(jid)));
            if (p) { role = p.admin === 'superadmin' ? '👑 Group owner' : p.admin ? '🛡️ Admin' : '👤 Member'; pn = p.pn || p.phoneNumber || null; }
          } catch (_) {}
        }
        if (String(jid).endsWith('@lid') && pn) phone = num(pn);
        const name = store?.contacts?.[jid]?.name || store?.contacts?.[jid]?.notify || (m.quoted && m.quoted.sender === jid ? m.quoted.pushName : '') || (jid === m.sender ? m.pushName : '') || '';

        let about = '', aboutDate = '';
        try {
          const s = await client.fetchStatus(jid);
          const st = Array.isArray(s) ? (s[0]?.status || s[0]) : s;
          about = (st && (st.status || st.text)) || ''; if (typeof about !== 'string') about = '';
          const when = st && (st.setAt || st.set_at); if (when) aboutDate = new Date(when).toLocaleDateString('en-GB');
        } catch (_) {}
        let onWa = '';
        try { const r = await client.onWhatsApp(jid); onWa = r && r[0] ? (r[0].exists ? '✅ Yes' : '❌ No') : ''; } catch (_) {}

        let msgs = '';
        try { const a = global.getActiveUsers ? global.getActiveUsers(m.chat, 200) : []; const f = a.find(x => num(x.jid) === num(jid)); if (f) msgs = f.count; } catch (_) {}
        let coins = null;
        try { const g = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'games_data.json'), 'utf8')); const u = g.users && g.users[jid]; if (u) coins = u; } catch (_) {}

        let pp = null;
        try { pp = await client.profilePictureUrl(jid, 'image'); } catch (_) {}

        const lines = [
          '🔎 *WHO IS THIS?*', '',
          name ? `📛 Name: ${name}` : null,
          `📱 Number: +${phone}`,
          `🌍 Country: ${countryOf(phone)}`,
          onWa ? `💬 On WhatsApp: ${onWa}` : null,
          role ? `🏷️ Role here: ${role}` : null,
          about ? `📝 About: ${about}${aboutDate ? ' (' + aboutDate + ')' : ''}` : null,
          msgs !== '' ? `✉️ Messages here (recent): ${msgs}` : null,
          coins ? `💰 Coins: ${coins.coins} • 🏆 Trivia wins: ${coins.wins}` : null
        ].filter(Boolean).join('\n');
        if (pp) await client.sendMessage(m.chat, { image: { url: pp }, caption: lines, mentions: [jid] }, { quoted: m });
        else await client.sendMessage(m.chat, { text: lines, mentions: [jid] }, { quoted: m });
      } catch (e) { m.reply('❌ Could not look that person up: ' + e.message); }
    }
  },

  {
    command: ['vote'],
    aliases: ['poll2', 'ballot'],
    description: 'Start a vote (.vote Question | Option1 | Option2) and vote with .vote 1',
    category: 'group',
    handler: async (client, m, { text, isAdmin, Owner }) => {
      const chat = m.chat;
      const a = String(text || '').trim();
      const v = votes[chat];

      if (!a) {
        if (v) return m.reply(`🗳️ *${v.q}*\n\n${tally(v)}\n\nVote with *.vote <number>* • end with *.vote end*`);
        return m.reply('🗳️ *Vote*\n\n.vote Who should host? | Amina | Brian | Cara\n.vote Pizza tonight?    (Yes / No)\n\nThen everyone sends *.vote 1* (or 2, 3…).\n*.vote end* closes it. It also closes by itself after 15 minutes.');
      }
      if (/^(end|close|stop|result|results)$/i.test(a)) {
        if (!v) return m.reply('No vote is running.');
        if (/^(result|results)$/i.test(a)) return m.reply(`🗳️ *${v.q}*\n\n${tally(v)}`);
        if (m.sender !== v.starter && !isAdmin && !Owner) return m.reply('Only the person who started it (or an admin) can end the vote.');
        clearTimeout(v.timer); delete votes[chat];
        return client.sendMessage(chat, { text: `🏁 *VOTE CLOSED*\n\n*${v.q}*\n\n${tally(v)}` }, { quoted: m });
      }
      if (v && (/^\d{1,2}$/.test(a) || /^(yes|no)$/i.test(a))) {
        let idx = /^\d+$/.test(a) ? Number(a) - 1 : v.opts.findIndex(o => o.toLowerCase() === a.toLowerCase());
        if (idx < 0 || idx >= v.opts.length) return m.reply(`Pick a number from 1 to ${v.opts.length}.`);
        const changed = v.ballots.has(m.sender);
        v.ballots.set(m.sender, idx);
        return m.reply(`✅ ${changed ? 'Vote changed' : 'Vote counted'}: *${v.opts[idx]}*  (${v.ballots.size} voted)`);
      }
      if (v) return m.reply('A vote is already running here. Finish it first with *.vote end*');
      const parts = a.split('|').map(s => s.trim()).filter(Boolean);
      const q = parts.shift();
      let opts = parts;
      if (!opts.length) opts = ['Yes', 'No'];
      if (opts.length < 2 || opts.length > 8) return m.reply('Give between 2 and 8 options, separated with |');
      const state = { q, opts, ballots: new Map(), starter: m.sender, timer: null };
      votes[chat] = state;
      state.timer = setTimeout(() => {
        if (votes[chat] !== state) return;
        delete votes[chat];
        client.sendMessage(chat, { text: `⌛ *VOTE CLOSED*\n\n*${q}*\n\n${tally(state)}` }).catch(() => {});
      }, 15 * 60 * 1000);
      await client.sendMessage(chat, { text: `🗳️ *NEW VOTE*\n\n*${q}*\n\n${opts.map((o, i) => `${i + 1}. ${o}`).join('\n')}\n\nVote with *.vote 1* (or 2, 3…)\n⏱️ Closes in 15 minutes or with *.vote end*` }, { quoted: m });
    }
  },

  {
    command: ['meme'],
    aliases: ['randommeme', 'funny'],
    description: 'A random meme (.meme, .meme kenya, .meme wholesome, .meme dank, .meme programming)',
    category: 'fun',
    handler: async (client, m, { text }) => {
      const topics = { kenya: 'Kenya', wholesome: 'wholesomememes', dank: 'dankmemes', programming: 'ProgrammerHumor', animals: 'AnimalsBeingDerps', football: 'soccermemes' };
      const t = String(text || '').trim().toLowerCase();
      const subs = t && topics[t] ? [topics[t]] : ['memes', 'wholesomememes', 'me_irl'];
      try {
        let pick = null;
        for (let i = 0; i < 6 && !pick; i++) {
          const sub = subs[i % subs.length];
          try {
            const r = await axios.get(`https://meme-api.com/gimme/${sub}`, { timeout: 15000, headers: { 'User-Agent': UA } });
            const d = r.data;
            if (d && d.url && !d.nsfw && !d.spoiler && /\.(jpe?g|png|webp)(\?|$)/i.test(d.url)) pick = d;
          } catch (_) {}
        }
        if (!pick) return m.reply('😅 Could not fetch a meme right now. Try again in a moment.');
        await client.sendMessage(m.chat, { image: { url: pick.url }, caption: `😂 *${pick.title || 'Meme'}*\n_r/${pick.subreddit || ''}_` }, { quoted: m });
      } catch (e) { m.reply('❌ Failed: ' + e.message); }
    }
  },

  {
    command: ['shorten'],
    aliases: ['short', 'shorturl', 'tinyurl'],
    description: 'Shorten a link (.shorten https://... [custom-name])',
    category: 'tools',
    handler: async (client, m, { text }) => {
      const src = `${text || ''} ${quotedText(m)}`;
      const url = (src.match(/https?:\/\/\S+/i) || [])[0];
      if (!url) return m.reply('🔗 Send a link: *.shorten https://example.com/a/very/long/link*\nCustom name (optional): *.shorten https://example.com myname*');
      const alias = (String(text || '').replace(url, '').trim().split(/\s+/)[0] || '').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 30);
      const tries = [];
      if (alias) tries.push(['is.gd', `https://is.gd/create.php?format=simple&url=${encodeURIComponent(url)}&shorturl=${alias}`]);
      tries.push(['is.gd', `https://is.gd/create.php?format=simple&url=${encodeURIComponent(url)}`]);
      tries.push(['v.gd', `https://v.gd/create.php?format=simple&url=${encodeURIComponent(url)}`]);
      tries.push(['tinyurl', `https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`]);
      const errs = [];
      for (const [name, u] of tries) {
        try {
          const r = await axios.get(u, { timeout: 15000, headers: { 'User-Agent': UA }, responseType: 'text', transformResponse: [x => x] });
          const out = String(r.data || '').trim();
          if (/^https?:\/\//i.test(out)) {
            return client.sendMessage(m.chat, { text: `🔗 *Short link*\n\n${out}\n\n_${url.length} → ${out.length} characters_` }, { quoted: m });
          }
          errs.push(`${name}: ${out.slice(0, 40)}`);
        } catch (e) { errs.push(`${name}: ${String(e.response?.status ? 'HTTP ' + e.response.status : e.message).slice(0, 30)}`); }
      }
      m.reply('❌ Could not shorten that link.\n\n🔎 Sources tried:\n' + errs.join('\n'));
    }
  },

  {
    command: ['color'],
    aliases: ['colour', 'hex', 'colorinfo'],
    description: 'Show a colour and its codes (.color #ff8800 / .color 255,136,0 / .color red)',
    category: 'tools',
    handler: async (client, m, { text }) => {
      const input = String(text || quotedText(m) || '').trim();
      let rgb = input ? parseColor(input) : [rand(256), rand(256), rand(256)];
      if (!rgb) return m.reply('🎨 Send a colour:\n*.color #ff8800*\n*.color 255,136,0*\n*.color red*\n*.color* (a random one)');
      const comp = rgb.map(v => 255 - v);
      const hex = '#' + rgb.map(hex2).join(''), chex = '#' + comp.map(hex2).join('');
      const [h, s, l] = toHsl(rgb);
      const lum = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
      const dir = makeDir('col');
      try {
        const out = path.join(dir, 'c.png');
        await ff(['-y', '-f', 'lavfi', '-i', `color=c=0x${hex.slice(1)}:s=500x400`, '-f', 'lavfi', '-i', `color=c=0x${chex.slice(1)}:s=200x400`,
          '-filter_complex', 'hstack', '-frames:v', '1', out], 30000);
        await client.sendMessage(m.chat, {
          image: fs.readFileSync(out),
          caption: `🎨 *${hex.toUpperCase()}*\n\nRGB: ${rgb.join(', ')}\nHSL: ${h}°, ${s}%, ${l}%\nNearest name: ${nearestName(rgb)}\nBest text on it: ${lum > 0.55 ? 'black ⚫' : 'white ⚪'}\n\n_Right strip = opposite colour ${chex.toUpperCase()}_`
        }, { quoted: m });
      } catch (e) { m.reply('❌ Failed: ' + e.message); }
      finally { rmDir(dir); }
    }
  }
];
