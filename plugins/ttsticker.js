'use strict';

// .ttsticker <TikTok link>  ->  animated WhatsApp sticker made from the TikTok video
// Needs: axios, ffmpeg-static (both already in your package.json). node-webpmux is used
// (if present) to stamp the sticker pack name/author; without it the sticker still works.

const axios = global.axios || require('axios');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

let FFMPEG = 'ffmpeg';
try { FFMPEG = require('ffmpeg-static') || 'ffmpeg'; } catch (_) {}

// how many comment stickers to send when no number is given, and the most allowed
const DEFAULT_STICKERS = 20;
const MAX_STICKERS = 30;

const UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36';

// ── 1. get the video from the TikTok link (same sources as .tiktok) ───────
function urlsIn(node, out = []) {
  if (!node) return out;
  if (typeof node === 'string') { if (/^https?:\/\//i.test(node)) out.push(node); return out; }
  if (Array.isArray(node)) { node.forEach(n => urlsIn(n, out)); return out; }
  if (typeof node === 'object') Object.keys(node).forEach(k => { if (!/thumb|cover|avatar|music/i.test(k)) urlsIn(node[k], out); });
  return out;
}

async function tiktokMedia(link) {
  const enc = encodeURIComponent(link);
  const get = async (u) => (await axios.get(u, { timeout: 30000, headers: { 'User-Agent': UA } })).data;

  try { // tikwm
    const d = await get(`https://www.tikwm.com/api/?url=${enc}&hd=0`);
    if (d?.code === 0 && d.data) {
      const abs = (u) => (u ? (u.startsWith('http') ? u : `https://www.tikwm.com${u}`) : null);
      const videoUrl = abs(d.data.play || d.data.hdplay);
      const images = Array.isArray(d.data.images) ? d.data.images : [];
      if (videoUrl || images.length) return { videoUrl, images };
    }
  } catch (_) {}

  try { // bk9
    const d = await get(`https://api.bk9.dev/download/tiktok?url=${enc}`);
    if (d?.status && d.BK9) {
      const urls = urlsIn(d.BK9);
      const v = urls.find(u => /\.mp4|video|tiktokcdn|tikcdn|play/i.test(u)) || urls[0];
      if (v) return { videoUrl: v, images: [] };
    }
  } catch (_) {}

  try { // ruhend-scraper
    const { ttdl } = require('ruhend-scraper');
    const d = await ttdl(link);
    if (d?.video) return { videoUrl: d.video, images: [] };
  } catch (_) {}

  return null;
}

async function downloadBuffer(url) {
  const res = await axios.get(url, {
    responseType: 'arraybuffer', timeout: 60000, maxContentLength: 60 * 1024 * 1024,
    headers: { 'User-Agent': UA, Referer: 'https://www.tiktok.com/' }
  });
  const buf = Buffer.from(res.data);
  if (buf.length < 2000) throw new Error('downloaded file is empty');
  if (buf.slice(0, 1).toString() === '<') throw new Error('got a web page instead of the video');
  return buf;
}

// ── 2. turn it into a WhatsApp-sized webp (512x512, small enough to send) ─
function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    execFile(FFMPEG, args, { timeout: 120000, maxBuffer: 10 * 1024 * 1024 }, (err, _out, stderr) => {
      if (err) return reject(new Error(String(stderr || err.message).trim().split('\n').pop().slice(0, 120)));
      resolve();
    });
  });
}

const SQUARE = 'scale=512:512:force_original_aspect_ratio=decrease:flags=lanczos,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000';

// WhatsApp wants animated stickers around 500 KB: try lighter settings until it fits
const ATTEMPTS = [
  { fps: 15, q: 45, t: 6 },
  { fps: 12, q: 32, t: 5 },
  { fps: 10, q: 22, t: 4 },
  { fps: 8,  q: 15, t: 3 }
];

async function toWebp(input, isVideo) {
  const id = `ttst-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const inFile = path.join(os.tmpdir(), `${id}.in`);
  const outFile = path.join(os.tmpdir(), `${id}.webp`);
  fs.writeFileSync(inFile, input);
  try {
    let best = null;
    for (const a of (isVideo ? ATTEMPTS : [{ fps: 1, q: 80, t: 0 }])) {
      const args = ['-y', '-i', inFile];
      if (isVideo) args.push('-t', String(a.t), '-vf', `fps=${a.fps},${SQUARE}`, '-an', '-vsync', '0', '-loop', '0');
      else args.push('-vframes', '1', '-vf', SQUARE);
      args.push('-c:v', 'libwebp', '-lossless', '0', '-quality', String(a.q), '-compression_level', '6', outFile);
      await runFfmpeg(args);
      const buf = fs.readFileSync(outFile);
      if (!best || buf.length < best.length) best = buf;
      if (buf.length <= 500 * 1024) return buf;
    }
    if (best && best.length <= 1000 * 1024) return best; // still accepted by WhatsApp
    throw new Error(`sticker is too big (${Math.round(best.length / 1024)} KB) even after shrinking`);
  } finally {
    for (const f of [inFile, outFile]) { try { fs.unlinkSync(f); } catch (_) {} }
  }
}

// ── 3. stamp the pack name / author onto the sticker (optional) ───────────
async function addExif(webpBuf, pack, author) {
  try {
    const webp = require('node-webpmux');
    const img = new webp.Image();
    await img.load(webpBuf);
    const json = {
      'sticker-pack-id': `blackmd-${Date.now()}`,
      'sticker-pack-name': pack,
      'sticker-pack-publisher': author,
      emojis: ['🎵']
    };
    const head = Buffer.from([0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00]);
    const body = Buffer.from(JSON.stringify(json), 'utf-8');
    const exif = Buffer.concat([head, body]);
    exif.writeUIntLE(body.length, 14, 4);
    img.exif = exif;
    return await img.save(null);
  } catch (_) {
    return webpBuf;
  }
}

// ── comment stickers / pictures that viewers post under a TikTok video ────
function pickImages(node, out = [], depth = 0) {
  if (!node || depth > 8) return out;
  if (typeof node === 'string') { if (/^https?:\/\//i.test(node) && !/\.(mp3|mp4)(\?|$)/i.test(node)) out.push({ url: node, anim: /anim|gif/i.test(node) }); return out; }
  if (Array.isArray(node)) { node.forEach(n => pickImages(n, out, depth + 1)); return out; }
  if (typeof node === 'object') {
    for (const k of Object.keys(node)) {
      if (/user|avatar|author|thumb|cover|label|emoji|text_extra|music/i.test(k)) continue;
      const v = node[k];
      if (typeof v === 'string' && /^https?:\/\//i.test(v) && /sticker|image|img|animate|static|webp|gif|png|jpe?g|obj\//i.test(k + v)) out.push({ url: v, anim: /anim|gif/i.test(k + v) });
      else pickImages(v, out, depth + 1);
    }
  }
  return out;
}

async function commentStickers(link, want) {
  const found = [];
  for (let cursor = 0; cursor <= 500 && found.length < want; cursor += 50) {
    let d;
    try {
      d = (await axios.get(`https://www.tikwm.com/api/comment/list/?url=${encodeURIComponent(link)}&count=50&cursor=${cursor}`, { timeout: 30000, headers: { 'User-Agent': UA } })).data;
    } catch (_) { break; }
    const list = d?.data?.comments || [];
    if (!list.length) break;
    for (const c of list) {
      // only the sticker fields of a comment (not photos, avatars or emojis)
      const imgs = pickImages(Object.keys(c).filter(k => /sticker/i.test(k)).map(k => c[k]).filter(Boolean));
      if (!imgs.length) continue;
      const best = imgs.find(i => i.anim) || imgs[0];
      if (!found.some(f => f.url === best.url)) found.push({ ...best, alt: imgs.filter(i => i.url !== best.url).map(i => i.url) });
      if (found.length >= want) break;
    }
  }
  return found;
}

async function anyToSticker(buf) {
  const isWebp = buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP';
  const isGif = buf.slice(0, 4).toString('latin1') === 'GIF8';
  const animWebp = isWebp && buf.includes('ANIM');

  if (isWebp) {
    // ffmpeg cannot read animated webp, so use sharp if the bot has it
    try {
      const sharp = require('sharp');
      const out = await sharp(buf, { animated: true }).resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).webp({ quality: 60 }).toBuffer();
      if (out.length <= 1000 * 1024) return out;
    } catch (_) {}
    // otherwise a webp from TikTok is already sticker-ready: send it as it is
    if (buf.length <= 1000 * 1024) return buf;
    if (animWebp) throw new Error('animated webp too big to convert (install "sharp" to fix)');
  }
  const animated = isGif || buf.slice(0, 64).includes('ftyp');
  try { return await toWebp(buf, animated); }
  catch (e) {
    if (FFMPEG !== 'ffmpeg') { FFMPEG = 'ffmpeg'; return toWebp(buf, animated); } // try the system ffmpeg
    throw e;
  }
}

module.exports = [
  {
    command: ['ttsticker'],
    aliases: ['ttstk', 'tiktoksticker', 'ttcomstickers'],
    description: 'Download the stickers/pictures viewers post in TikTok comments as WhatsApp stickers',
    category: 'downloads',
    handler: async (client, m, { text, pushname }) => {
      const quoted = m.quoted ? [m.quoted.text, m.quoted.body, m.quoted.caption, m.quoted.msg?.text].filter(Boolean).join(' ') : '';
      const link = ((`${text || ''} ${quoted}`).match(/https?:\/\/[^\s]*tiktok\.com[^\s]*/i) || [])[0];
      if (!link) return m.reply(`📌 Send a TikTok video link to get the stickers from its comments.\nExample: .ttsticker https://vt.tiktok.com/xxxxxxx 10\n(the number is how many, default ${DEFAULT_STICKERS}, max ${MAX_STICKERS})`);
      const n = Math.min(MAX_STICKERS, Math.max(1, parseInt((text || '').replace(link, '').match(/\d+/)?.[0] || String(DEFAULT_STICKERS), 10)));
      try {
        await client.sendMessage(m.chat, { react: { text: '⏳', key: m.key } });
        const items = await commentStickers(link, n);
        if (!items.length) return m.reply('❌ No sticker/picture comments found on that video (or comments could not be loaded).');
        let sent = 0, lastErr = '';
        for (const it of items) {
          try {
            let raw;
            for (const u of [it.url, ...(it.alt || [])]) { try { raw = await downloadBuffer(u); break; } catch (_) {} }
            if (!raw) throw new Error('image download failed');
            let st = await anyToSticker(raw);
            st = await addExif(st, global.botname || 'BLACK-MD', pushname || 'BLACK-MD');
            await client.sendMessage(m.chat, { sticker: st }, { quoted: m });
            sent++;
            await new Promise(r => setTimeout(r, 600));
          } catch (e) { lastErr = e.message; console.error('[ttsticker item]', e.message); }
        }
        if (!sent) return m.reply(`❌ Found the comment stickers but could not convert them.\nReason: ${String(lastErr).slice(0, 150)}`);
        await client.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
      } catch (e) {
        console.error('[ttsticker]', e.message);
        m.reply(`❌ Could not get the stickers: ${String(e.message).slice(0, 120)}`);
      }
    }
  },
  {
    command: ['ttvsticker'],
    aliases: ['ttvstk'],
    description: 'Turn a TikTok video into a WhatsApp sticker',
    category: 'downloads',
    handler: async (client, m, { text, pushname }) => {
      // link from the message, or from the message you replied to
      const quoted = m.quoted ? [m.quoted.text, m.quoted.body, m.quoted.caption, m.quoted.msg?.text].filter(Boolean).join(' ') : '';
      const link = ((`${text || ''} ${quoted}`).match(/https?:\/\/[^\s]*tiktok\.com[^\s]*/i) || [])[0];
      if (!link) return m.reply('📌 Send a TikTok link to turn into a sticker.\nExample: .ttsticker https://vt.tiktok.com/xxxxxxx');

      try {
        await client.sendMessage(m.chat, { react: { text: '⏳', key: m.key } });

        const media = await tiktokMedia(link);
        if (!media) return m.reply('❌ Could not get that TikTok. It may be private or removed, or the servers are busy. Try again shortly.');

        const isVideo = !!media.videoUrl;
        const source = await downloadBuffer(isVideo ? media.videoUrl : media.images[0]);
        let sticker = await toWebp(source, isVideo);
        sticker = await addExif(sticker, global.botname || 'BLACK-MD', pushname || 'BLACK-MD');

        await client.sendMessage(m.chat, { sticker }, { quoted: m });
        await client.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
      } catch (e) {
        console.error('[ttsticker]', e.message);
        m.reply(`❌ Could not make the sticker: ${String(e.response?.status ? 'HTTP ' + e.response.status : e.message).slice(0, 120)}`);
      }
    }
  }
];
