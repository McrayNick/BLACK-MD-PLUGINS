'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync, execFile } = require('child_process');

const BM = '𝐁𝐋𝐀𝐂𝐊-𝐌𝐃';
const TAG = `_${BM}_`;
const bar = (t) => `*${BM} · ${t}*`;
const sans = (s) => String(s).replace(/[A-Za-z0-9]/g, (c) => {
  const k = c.charCodeAt(0);
  if (k >= 97) return String.fromCodePoint(0x1D5EE + k - 97);
  if (k >= 65) return String.fromCodePoint(0x1D5D4 + k - 65);
  return String.fromCodePoint(0x1D7EC + k - 48);
});
const axios = () => global.axios || require('axios');
const quotedText = (m) => (m.quoted ? [m.quoted.text, m.quoted.body, m.quoted.caption, m.quoted.msg?.text].find(Boolean) || '' : '');

function ffmpegBin() { try { return require('../lib/stickerlite').ffmpegBin(); } catch (_) { return 'ffmpeg'; } }
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const tmpDir = () => { const d = path.join(os.tmpdir(), `vid_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`); fs.mkdirSync(d, { recursive: true }); return d; };
const rmDir = (d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} };
const hms = (s) => { s = Math.round(s || 0); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
const compact = (n) => (n == null ? '—' : Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n));
const toSec = (s) => { const p = String(s).split(':').map(Number); if (p.some(isNaN)) return null; return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p.length === 2 ? p[0] * 60 + p[1] : p[0]; };

const URL_RE = /https?:\/\/[^\s<>"']+/i;
const pickUrl = (t) => { const m = String(t || '').match(URL_RE); return m ? m[0].replace(/[),.]+$/, '') : null; };

const YTDLP_URLS = { 'linux-x64': 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux', 'linux-arm64': 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux_aarch64' };
let ytdlpBin = null, ytdlpFailedAt = 0, ytdlpInstalling = null;
const works = (bin) => { try { execFileSync(bin, ['--version'], { timeout: 20000, stdio: 'pipe' }); return true; } catch (_) { return false; } };
async function ensureYtDlp() {
  if (ytdlpBin) return ytdlpBin;
  if (Date.now() - ytdlpFailedAt < 30 * 60 * 1000) throw new Error('yt-dlp unavailable (tried recently)');
  if (!ytdlpInstalling) {
    ytdlpInstalling = (async () => {
      for (const c of [process.env.YTDLP_PATH, 'yt-dlp', path.join(os.tmpdir(), 'yt-dlp_bin')].filter(Boolean)) if (works(c)) return c;
      const url = YTDLP_URLS[`${process.platform}-${process.arch}`];
      if (!url) throw new Error(`yt-dlp not available on ${process.platform}-${process.arch}`);
      const dest = path.join(os.tmpdir(), 'yt-dlp_bin');
      const res = await axios().get(url, { responseType: 'arraybuffer', timeout: 180000, maxContentLength: 120 * 1024 * 1024 });
      fs.writeFileSync(dest, Buffer.from(res.data), { mode: 0o755 });
      if (!works(dest)) throw new Error('downloaded yt-dlp will not run here');
      return dest;
    })().finally(() => { ytdlpInstalling = null; });
  }
  try { ytdlpBin = await ytdlpInstalling; return ytdlpBin; } catch (e) { ytdlpFailedAt = Date.now(); throw e; }
}

function cookieArgs() {
  try {
    if (process.env.YTDLP_COOKIES && fs.existsSync(process.env.YTDLP_COOKIES)) {
      const tmp = path.join(os.tmpdir(), 'yt-cookies.txt');
      fs.copyFileSync(process.env.YTDLP_COOKIES, tmp);
      return ['--cookies', tmp];
    }
  } catch (_) {}
  return [];
}

function ydl(args, timeout = 180000) {
  return ensureYtDlp().then(bin => new Promise((resolve, reject) => {
    const child = spawn(bin, ['--no-warnings', '--no-progress', '--socket-timeout', '25', '--retries', '2', '--ffmpeg-location', ffmpegBin(), ...cookieArgs(), ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('timed out')); }, timeout);
    child.stdout.on('data', d => { if (out.length < 8e6) out += d; });
    child.stderr.on('data', d => { err = (err + d).slice(-600); });
    child.on('error', e => { clearTimeout(timer); reject(e); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code === 0) return resolve(out);
      const line = err.split('\n').map(x => x.trim()).filter(Boolean).pop() || `exit ${code}`;
      reject(new Error(line.replace(/^ERROR:\s*(\[[^\]]+\]\s*)?/i, '').slice(0, 120)));
    });
  }));
}

function ffrun(args, timeout = 240000) {
  return new Promise((resolve, reject) => {
    execFile(ffmpegBin(), args, { timeout, maxBuffer: 20 * 1024 * 1024 }, (e, _o, se) => {
      if (e) return reject(new Error(String(se || e.message).trim().split('\n').slice(-2).join(' ').slice(0, 180)));
      resolve(String(se || ''));
    });
  });
}
const probe = (file) => new Promise(resolve => { execFile(ffmpegBin(), ['-hide_banner', '-i', file], (_e, _o, se) => resolve(String(se || ''))); });

let running = 0;
const waiting = [];
async function slot(fn) {
  if (running >= 2) await new Promise(r => waiting.push(r));
  running++;
  try { return await fn(); } finally { running--; const n = waiting.shift(); if (n) n(); }
}
const cooldown = new Map();
function cool(jid, ms = 15000) {
  const last = cooldown.get(jid) || 0;
  if (Date.now() - last < ms) return Math.ceil((ms - (Date.now() - last)) / 1000);
  cooldown.set(jid, Date.now());
  return 0;
}

async function resolveTarget(raw) {
  const url = pickUrl(raw);
  if (url) return { url };
  const q = String(raw || '').trim();
  if (!q) return null;
  const yts = require('yt-search');
  const r = await yts(q);
  const v = r.videos && r.videos[0];
  if (!v) throw new Error(`No results for "${q}"`);
  return { url: v.url, title: v.title, seconds: v.seconds };
}

async function metaOf(url) {
  const j = JSON.parse(await ydl(['--dump-single-json', '--no-playlist', '--skip-download', url], 90000));
  return j;
}

async function normalizeMp4(file) {
  const info = await probe(file);
  const okV = /Video: (h264|avc)/i.test(info), okA = !/Audio:/i.test(info) || /Audio: aac/i.test(info);
  if (okV && okA && /\.mp4$/i.test(file)) return file;
  const out = file.replace(/\.[^.]+$/, '') + '_n.mp4';
  const args = ['-y', '-i', file, '-c:v', okV ? 'copy' : 'libx264', ...(okV ? [] : ['-preset', 'veryfast', '-crf', '26', '-pix_fmt', 'yuv420p']), '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out];
  await ffrun(args, 420000);
  return out;
}

async function downloadVideo(url, dir, height) {
  const ladder = [height, 480, 360].filter((h, i, a) => a.indexOf(h) === i && h <= height);
  let lastErr = null;
  for (const h of ladder) {
    const fmt = `bv*[vcodec^=avc1][height<=${h}]+ba[acodec^=mp4a]/bv*[height<=${h}]+ba/b[height<=${h}]/b`;
    try {
      await ydl(['-f', fmt, '--merge-output-format', 'mp4', '--no-playlist', '--max-filesize', '95M', '-o', path.join(dir, 'v.%(ext)s'), url], 420000);
    } catch (e) { lastErr = e; continue; }
    const f = fs.readdirSync(dir).find(x => /^v\.(mp4|mkv|webm|mov)$/i.test(x));
    if (f) return path.join(dir, f);
    lastErr = new Error('file larger than the size limit');
  }
  throw lastErr || new Error('no video produced');
}

async function fallbackDownload(url, dir) {
  const enc = encodeURIComponent(url);
  const urls = [];
  if (/tiktok\.com/i.test(url)) {
    try {
      const r = await axios().get(`https://www.tikwm.com/api/?url=${enc}&hd=1`, { timeout: 25000 });
      const d = r.data && r.data.data;
      if (d) urls.push(d.hdplay || d.play);
    } catch (_) {}
  }
  if (/youtu\.?be/i.test(url)) {
    const base = (process.env.KEITH_API || 'https://apis.keithsite.lol').replace(/\/+$/, '');
    for (const u of [`${base}/download/mp4?url=${enc}`, `https://apis.xcasper.space/api/downloader/ytmp4?url=${enc}`]) {
      try {
        const r = await axios().get(u, { timeout: 60000 });
        const found = JSON.stringify(r.data).match(/https?:\/\/[^"\\]+/g) || [];
        const pick = found.find(x => !/youtu|ytimg|\.(jpg|png|webp)/i.test(x));
        if (pick) { urls.push(pick); break; }
      } catch (_) {}
    }
  }
  for (const u of urls.filter(Boolean)) {
    try {
      const r = await axios().get(u.startsWith('http') ? u : 'https://www.tikwm.com' + u, { responseType: 'arraybuffer', timeout: 180000, maxContentLength: 95 * 1024 * 1024, headers: { 'User-Agent': 'Mozilla/5.0' } });
      const buf = Buffer.from(r.data);
      if (buf.length > 100 * 1024 && buf.slice(4, 8).toString('latin1') === 'ftyp') {
        const f = path.join(dir, 'v.mp4');
        fs.writeFileSync(f, buf);
        return f;
      }
    } catch (_) {}
  }
  throw new Error('fallback sources failed');
}

function parseVtt(vtt) {
  const out = [];
  let prev = '';
  for (const raw of String(vtt).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || /^WEBVTT|^Kind:|^Language:|^NOTE|-->|^\d+$/.test(line)) continue;
    const clean = line.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&gt;/g, '>').replace(/&lt;/g, '<').trim();
    if (!clean || clean === prev) continue;
    out.push(clean); prev = clean;
  }
  const dedup = [];
  for (const l of out) { if (dedup.length && dedup[dedup.length - 1].endsWith(l)) continue; if (dedup.length && l.startsWith(dedup[dedup.length - 1])) dedup.pop(); dedup.push(l); }
  return dedup.join(' ').replace(/\s+/g, ' ').trim();
}
async function getTranscript(url, dir) {
  try {
    await ydl(['--skip-download', '--write-subs', '--write-auto-subs', '--sub-langs', 'en.*,en,sw.*,sw', '--sub-format', 'vtt', '--no-playlist', '-o', path.join(dir, 's.%(ext)s'), url], 120000);
  } catch (e) { if (!/subtitle|caption/i.test(e.message)) throw e; }
  const f = fs.readdirSync(dir).find(x => x.endsWith('.vtt'));
  if (!f) throw new Error('This video has no captions to read');
  const text = parseVtt(fs.readFileSync(path.join(dir, f), 'utf8'));
  if (text.length < 80) throw new Error('The captions are too short to use');
  return text;
}
const sample = (text, max = 9000) => {
  if (text.length <= max) return text;
  const part = Math.floor(max / 3);
  const mid = Math.floor(text.length / 2 - part / 2);
  return text.slice(0, part) + ' [...] ' + text.slice(mid, mid + part) + ' [...] ' + text.slice(-part);
};

async function askAI(system, user) {
  const r = await axios().post('https://text.pollinations.ai/openai', { model: 'openai', messages: [{ role: 'system', content: system }, { role: 'user', content: user }], temperature: 0.4 }, { timeout: 60000, headers: { 'Content-Type': 'application/json' } });
  const out = r.data && r.data.choices && r.data.choices[0] && r.data.choices[0].message && r.data.choices[0].message.content;
  if (!out || String(out).trim().length < 20) throw new Error('empty AI reply');
  return String(out).trim();
}
const STOP = new Set('the a an and or but if of to in on at for with is are was were be been it this that these those you your i we they he she as by from not so do does did have has had will would can could just about what when how why which who into than then there their them our us me my'.split(' '));
function sentences(text) { return (text.match(/[^.!?]+[.!?]*/g) || [text]).map(s => s.trim()).filter(s => s.length > 25); }
function extractiveSummary(text, n = 6) {
  const sents = sentences(text);
  if (sents.length <= n) return sents.join(' ');
  const freq = {};
  for (const w of text.toLowerCase().match(/[a-z']{3,}/g) || []) if (!STOP.has(w)) freq[w] = (freq[w] || 0) + 1;
  const scored = sents.map((s, i) => ({ s, i, v: (s.toLowerCase().match(/[a-z']{3,}/g) || []).reduce((a, w) => a + (freq[w] || 0), 0) / Math.sqrt(s.split(' ').length) }));
  return scored.sort((a, b) => b.v - a.v).slice(0, n).sort((a, b) => a.i - b.i).map(x => '• ' + x.s).join('\n');
}
function extractiveAnswer(text, question) {
  const q = new Set((question.toLowerCase().match(/[a-z']{3,}/g) || []).filter(w => !STOP.has(w)));
  const sents = sentences(text);
  const scored = sents.map((s, i) => ({ s, i, v: (s.toLowerCase().match(/[a-z']{3,}/g) || []).filter(w => q.has(w)).length }));
  const top = scored.filter(x => x.v > 0).sort((a, b) => b.v - a.v).slice(0, 3).sort((a, b) => a.i - b.i);
  return top.length ? top.map(x => '• ' + x.s).join('\n') : null;
}

const GUIDE = (p) => `${bar('Vid')}\n\n*${p}vid* name or link\n*${p}vid 480* link  (360, 480, 720, 1080)\n\nWorks with YouTube, TikTok, Instagram, Facebook, X, Pinterest, Reddit and many more.\n${TAG}`;

const edit = (client, m, key, text) => client.sendMessage(m.chat, { text, edit: key }).catch(() => {});

async function guarded(client, m, ctx, label, job) {
  const p = typeof ctx.prefix === 'string' && ctx.prefix ? ctx.prefix : '.';
  const wait_ = cool(m.sender || m.chat);
  if (wait_) return m.reply(`⏳ One moment, try again in ${wait_}s.`);
  const dir = tmpDir();
  let msg = null;
  try {
    msg = await client.sendMessage(m.chat, { text: `${label}\n⏳ Working on it...` }, { quoted: m });
    await slot(() => job({ dir, p, upd: (t) => edit(client, m, msg.key, t) }));
  } catch (e) {
    const text = `❌ ${String((e && e.message) || e).slice(0, 170)}\n${TAG}`;
    if (msg) await edit(client, m, msg.key, text); else m.reply(text);
  } finally { rmDir(dir); }
}

const getInput = (ctx, m) => String((ctx && ctx.text) || quotedText(m) || '').trim();

const commands = [
  {
    command: ['vid'],
    aliases: ['getvid', 'anyvideo'],
    description: 'Download a video from any link or by name (YouTube, TikTok, Instagram, Facebook, X and more)',
    category: 'downloads',
    handler: async (client, m, ctx) => {
      let raw = getInput(ctx, m);
      const hm = raw.match(/^(360|480|720|1080|hd)\s+/i);
      const height = hm ? (hm[1].toLowerCase() === 'hd' ? 1080 : Number(hm[1])) : 720;
      if (hm) raw = raw.slice(hm[0].length);
      if (!raw) return m.reply(GUIDE(ctx.prefix || '.'));
      return guarded(client, m, ctx, '🎬 *Vid*', async ({ dir, upd }) => {
        const t = await resolveTarget(raw);
        await upd(`🎬 *${t.title || t.url}*\n⏳ Downloading...`);
        let file;
        try { file = await downloadVideo(t.url, dir, height); }
        catch (e) {
          try { file = await fallbackDownload(t.url, dir); } catch (_) { throw e; }
        }
        file = await normalizeMp4(file);
        const buf = fs.readFileSync(file);
        let title = t.title;
        if (!title) { try { title = (await metaOf(t.url)).title; } catch (_) {} }
        await client.sendMessage(m.chat, { video: buf, mimetype: 'video/mp4', caption: `🎬 *${title || 'Video'}*\n${TAG}` }, { quoted: m });
        await upd(`✅ Done · ${(buf.length / 1048576).toFixed(1)} MB\n${TAG}`);
      });
    }
  },
  {
    command: ['vidinfo'],
    aliases: ['videoinfo', 'vidscan'],
    description: 'Details of any video link: title, channel, length, views, upload date',
    category: 'downloads',
    handler: async (client, m, ctx) => {
      const raw = getInput(ctx, m);
      if (!raw) return m.reply(`${bar('Vid Info')}\n\nUsage: *${ctx.prefix || '.'}vidinfo link or name*\n${TAG}`);
      return guarded(client, m, ctx, '🔎 *Vid Info*', async ({ upd }) => {
        const t = await resolveTarget(raw);
        const j = await metaOf(t.url);
        const date = j.upload_date ? `${j.upload_date.slice(6, 8)}/${j.upload_date.slice(4, 6)}/${j.upload_date.slice(0, 4)}` : '—';
        const heights = [...new Set((j.formats || []).map(f => f.height).filter(Boolean))].sort((a, b) => b - a).slice(0, 5);
        const text = [bar('Vid Info'), '', `🎞️ *${j.title}*`, `Channel: ${j.uploader || j.channel || '—'}`, `Length: ${hms(j.duration)}`, `Views: ${compact(j.view_count)} · Likes: ${compact(j.like_count)}`, `Uploaded: ${date}`, heights.length ? `Qualities: ${heights.map(h => h + 'p').join(', ')}` : '', j.subtitles && Object.keys(j.subtitles).length || j.automatic_captions && Object.keys(j.automatic_captions).length ? 'Captions: available (try .vidsum)' : 'Captions: none', '', j.webpage_url || t.url, TAG].filter(x => x !== '').join('\n');
        if (j.thumbnail) {
          await client.sendMessage(m.chat, { image: { url: j.thumbnail }, caption: text }, { quoted: m }).catch(() => client.sendMessage(m.chat, { text }, { quoted: m }));
          await upd(`✅ Done\n${TAG}`);
        } else await upd(text);
      });
    }
  },
  {
    command: ['vidsum'],
    aliases: ['videosummary', 'tldrvid'],
    description: 'AI summary of a video, read from its captions',
    category: 'ai',
    handler: async (client, m, ctx) => {
      const raw = getInput(ctx, m);
      if (!raw) return m.reply(`${bar('Vid Sum')}\n\nUsage: *${ctx.prefix || '.'}vidsum link or name*\n${TAG}`);
      return guarded(client, m, ctx, '🧠 *Vid Sum*', async ({ dir, upd }) => {
        const t = await resolveTarget(raw);
        await upd('🧠 Reading the captions...');
        const text = await getTranscript(t.url, dir);
        await upd('🧠 Writing the summary...');
        let body, mode = 'AI';
        try {
          body = await askAI('You summarise video transcripts. Write: one sentence on what the video is about, then 5 to 7 short bullet points with the key points, then one line starting "Takeaway:". Plain text, no markdown headers, no preamble.', sample(text));
        } catch (_) { body = extractiveSummary(text); mode = 'offline'; }
        await upd([bar('Vid Sum'), t.title ? `🎞️ ${t.title}` : '', '', body.slice(0, 3200), '', mode === 'offline' ? '_AI was busy, so this is a quick extract of the key lines._' : '', TAG].filter((x, i) => x !== '' || i === 2).join('\n'));
      });
    }
  },
  {
    command: ['vidask'],
    aliases: ['askvideo', 'vidq'],
    description: 'Ask a question about a video, answered from its captions',
    category: 'ai',
    handler: async (client, m, ctx) => {
      const raw = getInput(ctx, m);
      const i = raw.indexOf('|');
      if (i < 1 || !raw.slice(i + 1).trim()) return m.reply(`${bar('Vid Ask')}\n\nUsage: *${ctx.prefix || '.'}vidask link | your question*\n${TAG}`);
      const target = raw.slice(0, i).trim(), question = raw.slice(i + 1).trim().slice(0, 300);
      return guarded(client, m, ctx, '🧠 *Vid Ask*', async ({ dir, upd }) => {
        const t = await resolveTarget(target);
        const text = await getTranscript(t.url, dir);
        let ans, mode = 'AI';
        try {
          ans = await askAI('You answer questions about a video using only its transcript. If the transcript does not contain the answer, say so plainly. Be concise, under 120 words, plain text.', `Transcript:\n${sample(text, 10000)}\n\nQuestion: ${question}`);
        } catch (_) {
          ans = extractiveAnswer(text, question) || 'I could not find that in the captions.';
          mode = 'offline';
        }
        await upd([bar('Vid Ask'), t.title ? `🎞️ ${t.title}` : '', `❓ ${question}`, '', ans.slice(0, 2500), '', mode === 'offline' ? '_AI was busy, so these are the closest lines from the captions._' : '', TAG].filter((x, i) => x !== '' || i === 3).join('\n'));
      });
    }
  },
  {
    command: ['vidsubs'],
    aliases: ['transcript', 'vidtext'],
    description: 'Get the full transcript of a video as a text file',
    category: 'ai',
    handler: async (client, m, ctx) => {
      const raw = getInput(ctx, m);
      if (!raw) return m.reply(`${bar('Vid Subs')}\n\nUsage: *${ctx.prefix || '.'}vidsubs link or name*\n${TAG}`);
      return guarded(client, m, ctx, '📝 *Vid Subs*', async ({ dir, upd }) => {
        const t = await resolveTarget(raw);
        const text = await getTranscript(t.url, dir);
        const name = (t.title || 'transcript').replace(/[^\w\- ]+/g, '').trim().slice(0, 40).replace(/\s+/g, '_') || 'transcript';
        await client.sendMessage(m.chat, { document: Buffer.from((t.title ? t.title + '\n\n' : '') + text, 'utf8'), mimetype: 'text/plain', fileName: name + '.txt', caption: `📝 Transcript · ${text.split(' ').length} words\n${TAG}` }, { quoted: m });
        await upd(`✅ Done\n${TAG}`);
      });
    }
  },
  {
    command: ['vidclip'],
    aliases: ['clipvid', 'cutvideo'],
    description: 'Cut a part of any video link: start time and seconds',
    category: 'downloads',
    handler: async (client, m, ctx) => {
      const raw = getInput(ctx, m);
      const mt = raw.match(/^(.*?)\s+(\d{1,2}(?::\d{2}){0,2})\s+(\d{1,3})\s*$/);
      if (!mt) return m.reply(`${bar('Vid Clip')}\n\nUsage: *${ctx.prefix || '.'}vidclip link 01:30 20*\n(start time, then seconds, up to 60)\n${TAG}`);
      const start = toSec(mt[2]), len = Math.max(1, Math.min(60, Number(mt[3])));
      return guarded(client, m, ctx, '✂️ *Vid Clip*', async ({ dir, upd }) => {
        const t = await resolveTarget(mt[1]);
        await upd('✂️ Fetching the video...');
        let file;
        try { file = await downloadVideo(t.url, dir, 720); } catch (e) { try { file = await fallbackDownload(t.url, dir); } catch (_) { throw e; } }
        const out = path.join(dir, 'clip.mp4');
        await ffrun(['-y', '-ss', String(start), '-i', file, '-t', String(len), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '25', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out], 300000);
        if (!fs.existsSync(out) || fs.statSync(out).size < 2000) throw new Error('That start time is past the end of the video');
        await client.sendMessage(m.chat, { video: fs.readFileSync(out), mimetype: 'video/mp4', caption: `✂️ ${mt[2]} · ${len}s\n${TAG}` }, { quoted: m });
        await upd(`✅ Done\n${TAG}`);
      });
    }
  },
  {
    command: ['vidgif'],
    aliases: ['gifvid', 'vid2gif'],
    description: 'Turn part of any video link into a looping GIF',
    category: 'downloads',
    handler: async (client, m, ctx) => {
      const raw = getInput(ctx, m);
      const mt = raw.match(/^(.*?)(?:\s+(\d{1,2}(?::\d{2}){0,2})(?:\s+(\d{1,2}))?)?\s*$/);
      if (!raw || !mt || !mt[1]) return m.reply(`${bar('Vid Gif')}\n\nUsage: *${ctx.prefix || '.'}vidgif link 00:10 6*\n(start time and seconds, up to 10)\n${TAG}`);
      const start = mt[2] ? toSec(mt[2]) : 0, len = Math.max(1, Math.min(10, Number(mt[3] || 6)));
      return guarded(client, m, ctx, '🌀 *Vid Gif*', async ({ dir, upd }) => {
        const t = await resolveTarget(mt[1]);
        let file;
        try { file = await downloadVideo(t.url, dir, 480); } catch (e) { try { file = await fallbackDownload(t.url, dir); } catch (_) { throw e; } }
        const out = path.join(dir, 'gif.mp4');
        await ffrun(['-y', '-ss', String(start), '-i', file, '-t', String(len), '-vf', 'scale=480:-2:flags=lanczos,fps=15', '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], 240000);
        if (!fs.existsSync(out) || fs.statSync(out).size < 2000) throw new Error('That start time is past the end of the video');
        await client.sendMessage(m.chat, { video: fs.readFileSync(out), mimetype: 'video/mp4', gifPlayback: true, caption: TAG }, { quoted: m });
        await upd(`✅ Done\n${TAG}`);
      });
    }
  },
  {
    command: ['vidmp3'],
    aliases: ['vid2mp3', 'sound'],
    description: 'Get the audio of any video link as an MP3',
    category: 'downloads',
    handler: async (client, m, ctx) => {
      const raw = getInput(ctx, m);
      if (!raw) return m.reply(`${bar('Vid MP3')}\n\nUsage: *${ctx.prefix || '.'}vidmp3 link or name*\n${TAG}`);
      return guarded(client, m, ctx, '🎧 *Vid MP3*', async ({ dir, upd }) => {
        const t = await resolveTarget(raw);
        await ydl(['-f', 'bestaudio/best', '--no-playlist', '--max-filesize', '80M', '-o', path.join(dir, 'a.%(ext)s'), t.url], 300000);
        const f = fs.readdirSync(dir).find(x => x.startsWith('a.'));
        if (!f) throw new Error('no audio produced');
        const out = path.join(dir, 'a_out.mp3');
        try { await ffrun(['-y', '-i', path.join(dir, f), '-vn', '-c:a', 'libmp3lame', '-b:a', '128k', out]); }
        catch (_) {
          const m4 = path.join(dir, 'a_out.m4a');
          await ffrun(['-y', '-i', path.join(dir, f), '-vn', '-c:a', 'aac', '-b:a', '128k', m4]);
          await client.sendMessage(m.chat, { audio: fs.readFileSync(m4), mimetype: 'audio/mp4' }, { quoted: m });
          return upd(`✅ Done\n${TAG}`);
        }
        let title = t.title;
        if (!title) { try { title = (await metaOf(t.url)).title; } catch (_) {} }
        await client.sendMessage(m.chat, { audio: fs.readFileSync(out), mimetype: 'audio/mpeg', fileName: (title || 'audio').replace(/[^\w\- ]+/g, '').slice(0, 50) + '.mp3' }, { quoted: m });
        await upd(`✅ Done${title ? ' · ' + title : ''}\n${TAG}`);
      });
    }
  },
  {
    command: ['vidmenu'],
    aliases: ['vidhelp'],
    description: 'List the video commands',
    category: 'downloads',
    handler: async (client, m, ctx) => {
      const p = typeof ctx.prefix === 'string' && ctx.prefix ? ctx.prefix : '.';
      const block = (title, names) => `┌──┤ ${sans(title)} ├\n` + names.map(n => `│ ${sans(n)}`).join('\n') + '\n└──────────';
      m.reply(`${block('VIDEO', ['vid', 'vidinfo', 'vidclip', 'vidgif', 'vidmp3'])}\n\n${block('VIDEO AI', ['vidsum', 'vidask', 'vidsubs'])}\n\nUse: ${p}${sans('vid')} name or link\nExample: ${p}${sans('vid')} https://vm.tiktok.com/xyz\n${TAG}`);
    }
  }
];

module.exports = commands;
