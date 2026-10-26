'use strict';

// .ttsticker <TikTok link>  ->  animated WhatsApp sticker made from the TikTok video
// Needs: axios, ffmpeg-static (both already in your package.json). node-webpmux is used
// (if present) to stamp the sticker pack name/author; without it the sticker still works.

const axios = global.axios || require('axios');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

// find ffmpeg the same way your stickerlite does (installer package, ffmpeg-static, system ffmpeg)
let FFMPEG = null;
function ffmpegBin() {
  if (FFMPEG) return FFMPEG;
  const { execSync } = require('child_process');
  const tries = [
    () => { try { return require('@ffmpeg-installer/ffmpeg').path; } catch (_) { return null; } },
    () => { try { return require('ffmpeg-static'); } catch (_) { return null; } },
    () => { try { return execSync('which ffmpeg', { encoding: 'utf8' }).trim() || null; } catch (_) { return null; } },
    () => '/usr/bin/ffmpeg',
    () => '/usr/local/bin/ffmpeg'
  ];
  for (const t of tries) { const b = t(); if (b && fs.existsSync(b)) return (FFMPEG = b); }
  return (FFMPEG = 'ffmpeg');
}

// how many comment stickers to send when no number is given, and the most allowed
const DEFAULT_STICKERS = 20;
const MAX_STICKERS = 100;

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
    execFile(ffmpegBin(), args, { timeout: 120000, maxBuffer: 10 * 1024 * 1024 }, (err, _out, stderr) => {
      if (err) return reject(new Error(String(stderr || err.message).trim().split('\n').pop().slice(0, 120)));
      resolve();
    });
  });
}

// How the picture fills the 512x512 sticker:
//   'blur'    whole picture visible, empty space filled with a blurred copy of itself (default)
//   'stretch' whole picture visible, squeezed to a square (can look distorted)
//   'crop'    fills the square but cuts off the edges
const FIT_MODE = 'stretch';
const SQUARE = {
  blur: 'split[a][b];[a]scale=512:512:force_original_aspect_ratio=increase,crop=512:512,boxblur=18:2[bg];[b]scale=512:512:force_original_aspect_ratio=decrease:flags=lanczos[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,format=rgba',
  stretch: 'scale=512:512:flags=lanczos,format=rgba',
  crop: 'scale=512:512:force_original_aspect_ratio=increase:flags=lanczos,crop=512:512,format=rgba'
}[FIT_MODE];

// WhatsApp wants animated stickers around 500 KB: try lighter settings until it fits
const ATTEMPTS = [
  { fps: 20, q: 80, t: 6 },
  { fps: 15, q: 65, t: 6 },
  { fps: 15, q: 50, t: 5 },
  { fps: 12, q: 35, t: 5 },
  { fps: 10, q: 22, t: 4 },
  { fps: 8,  q: 15, t: 3 }
];
// still pictures: best quality first, only lower it if the file gets too big
const STILL_ATTEMPTS = [{ q: 97 }, { q: 90 }, { q: 80 }, { q: 65 }];

async function toWebp(input, isVideo) {
  const id = `ttst-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const inFile = path.join(os.tmpdir(), `${id}.in`);
  const outFile = path.join(os.tmpdir(), `${id}.webp`);
  fs.writeFileSync(inFile, input);
  try {
    let best = null;
    for (const a of (isVideo ? ATTEMPTS : STILL_ATTEMPTS)) {
      const args = ['-y', '-i', inFile];
      if (isVideo) args.push('-t', String(a.t), '-vf', `fps=${a.fps},${SQUARE}`, '-an', '-vsync', '0', '-loop', '0');
      else args.push('-vframes', '1', '-vf', SQUARE);
      args.push('-c:v', 'libwebp', '-lossless', '0', '-quality', String(a.q), '-compression_level', '6', '-preset', 'picture', outFile);
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
  if (typeof node === 'string') { if (/^https?:\/\//i.test(node) && !/\.(mp3|m4a|aac)(\?|$)/i.test(node)) out.push({ url: node, anim: /anim|gif|mp4|video|webm/i.test(node), video: /\.mp4|\.webm|video/i.test(node) }); return out; }
  if (Array.isArray(node)) { node.forEach(n => pickImages(n, out, depth + 1)); return out; }
  if (typeof node === 'object') {
    for (const k of Object.keys(node)) {
      if (/user|avatar|author|thumb|cover|label|emoji|text_extra|music|audio/i.test(k)) continue;
      const v = node[k];
      if (typeof v === 'string' && /^https?:\/\//i.test(v) && /sticker|image|img|animate|static|webp|gif|png|jpe?g|obj\//i.test(k + v)) out.push({ url: v, anim: /anim|gif|mp4|video|webm/i.test(k + v), video: /video|\.mp4|\.webm/i.test(k + v) });
      else pickImages(v, out, depth + 1);
    }
  }
  return out;
}

const seenKeys = new Set();
// reads the comments page by page and hands over each picture as soon as it is found
async function* commentImages(link) {
  const seenIds = new Set(), seenUrls = new Set();
  seenKeys.clear();
  let cursor = 0, total = 0, stop = 'reached the limit', apiTotal = 0, emptyPages = 0;
  commentImages.scanned = 0; commentImages.info = '';
  try {
    for (let page = 0; page < 120; page++) {
      let d;
      // tikwm's free API allows 1 request per second: wait and retry when it says so
      for (let tryNo = 0; tryNo < 6; tryNo++) {
        try {
          d = (await axios.get(`https://www.tikwm.com/api/comment/list/?url=${encodeURIComponent(link)}&count=50&cursor=${cursor}`, { timeout: 30000, headers: { 'User-Agent': UA } })).data;
        } catch (e) { d = { code: -1, msg: 'request failed: ' + String(e.response?.status || e.message).slice(0, 40) }; }
        if (d?.code !== 0 && /limit|too many|second/i.test(String(d?.msg))) { await new Promise(r => setTimeout(r, 1500)); continue; }
        break;
      }
      const list = d?.data?.comments || [];
      apiTotal = Number(d?.data?.total) || apiTotal;
      if (!list.length) { stop = d?.msg && d.code !== 0 ? String(d.msg).slice(0, 50) : 'no more comments'; break; }
      let fresh = 0;
      for (const c of list) {
        const id = c.id || c.cid || JSON.stringify(c).slice(0, 80);
        if (seenIds.has(id)) continue;
        seenIds.add(id); fresh++; total++; commentImages.scanned = total;
        Object.keys(c).forEach(k => seenKeys.add(k));
        const imgs = pickImages(Object.keys(c).filter(k => !/^(user|text|text_extra|reply_.*|id|cid|status|create_time|digg_count|video_id)$/i.test(k)).map(k => c[k]).filter(Boolean));
        if (!imgs.length) continue;
        const best = imgs.find(i => i.video) || imgs.find(i => i.anim) || imgs[0];
        const key = best.url.split('?')[0];
        if (seenUrls.has(key)) continue;
        seenUrls.add(key);
        yield { ...best, alt: imgs.filter(i => i.url !== best.url).map(i => i.url), likes: Number(c.digg_count) || 0 };
      }
      const next = Number(d?.data?.cursor);
      const hasMore = d?.data?.hasMore ?? d?.data?.has_more;
      if (fresh === 0) { if (++emptyPages >= 2) { stop = 'no new comments'; break; } } else emptyPages = 0;
      if (hasMore === false || hasMore === 0) { stop = 'end of comments'; break; }
      cursor = next && next !== cursor ? next : cursor + list.length;
      await new Promise(r => setTimeout(r, 1200));
    }
  } finally {
    commentImages.info = `${stop}${apiTotal ? `, video has ~${apiTotal} comments` : ''}`;
  }
}

// width/height straight from the file header (jpeg, png, gif, webp)
function imageSize(b) {
  try {
    if (b[0] === 0x89 && b.toString('latin1', 1, 4) === 'PNG') return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
    if (b.toString('latin1', 0, 3) === 'GIF') return { w: b.readUInt16LE(6), h: b.readUInt16LE(8) };
    if (b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') {
      const t = b.toString('latin1', 12, 16);
      if (t === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
      if (t === 'VP8L') { const v = b.readUInt32LE(21); return { w: (v & 0x3fff) + 1, h: ((v >> 14) & 0x3fff) + 1 }; }
      if (t === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
    }
    if (b[0] === 0xff && b[1] === 0xd8) {
      let i = 2;
      while (i < b.length - 9) {
        if (b[i] !== 0xff) { i++; continue; }
        const mk = b[i + 1];
        if (mk >= 0xc0 && mk <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(mk)) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
        i += 2 + b.readUInt16BE(i + 2);
      }
    }
  } catch (_) {}
  return null;
}

// sticker-like pictures are roughly square; tall phone screenshots and wide posters are not
const MIN_RATIO = 0.75, MAX_RATIO = 1.45;

// sharp (pulled in by wa-sticker-formatter) needs no ffmpeg: resize to 512x512 and shrink until it fits
async function sharpSticker(buf) {
  const sharp = require('sharp');
  let best = null;
  for (const q of [60, 40, 25, 15]) {
    const out = await sharp(buf, { animated: true, pages: -1, limit: 300 })
      .resize(512, 512, { fit: 'cover', position: 'centre' })
      .webp({ quality: q, effort: 4 }).toBuffer();
    if (!best || out.length < best.length) best = out;
    if (out.length <= 500 * 1024) return out;
  }
  if (best.length <= 1000 * 1024) return best;
  throw new Error('sticker too big after shrinking');
}

async function anyToSticker(buf) {
  const isWebp = buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP';
  const isGif = buf.slice(0, 4).toString('latin1') === 'GIF8';
  const errs = [];

  // animated webp: ffmpeg cannot read it, so keep it as it is (like stickerlite does)
  if (isWebp && buf.includes('ANIM') && buf.length <= 1000 * 1024) return buf;


  const animated = isGif || buf.slice(0, 64).includes('ftyp');
  try { return await toWebp(buf, animated); } catch (e) { errs.push('ffmpeg(' + ffmpegBin() + '): ' + e.message); }
  if (isWebp && buf.length <= 1000 * 1024) return buf;
  throw new Error(errs.join(' | '));
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
      if (!link) return m.reply(`📌 Send a TikTok video link to get the stickers from its comments.\nExample: .ttsticker https://vt.tiktok.com/xxxxxxx 10\n(the number is how many, default ${DEFAULT_STICKERS}, max ${MAX_STICKERS}; add the word all to also include screenshots)`);
      const arg = (text || '').replace(link, '');
      const n = Math.min(MAX_STICKERS, Math.max(1, parseInt(arg.match(/\d+/)?.[0] || String(DEFAULT_STICKERS), 10)));
      const all = /\ball\b/i.test(arg); // ".ttsticker <link> 20 all" also sends screenshots / tall or wide pictures
      try {
        await client.sendMessage(m.chat, { react: { text: '⏳', key: m.key } });
        let sent = 0, skipped = 0, found = 0, lastErr = '';
        for await (const it of commentImages(link)) {
          if (sent >= n) break;
          found++;
          try {
            let raw;
            for (const u of [it.url, ...(it.alt || [])]) { try { raw = await downloadBuffer(u); break; } catch (_) {} }
            if (!raw) throw new Error('image download failed');
            if (!all) {
              const sz = imageSize(raw);
              if (sz && sz.w && sz.h && (sz.w / sz.h < MIN_RATIO || sz.w / sz.h > MAX_RATIO)) { skipped++; continue; }
            }
            let st;
            try { st = await anyToSticker(raw); }
            catch (e) {
              lastErr = e.message;
              await client.sendMessage(m.chat, { image: raw }, { quoted: m });
              sent++;
              await new Promise(r => setTimeout(r, 600));
              continue;
            }
            st = await addExif(st, global.botname || 'BLACK-MD', pushname || 'BLACK-MD');
            await client.sendMessage(m.chat, { sticker: st }, { quoted: m });
            sent++;
            await new Promise(r => setTimeout(r, 600));
          } catch (e) { lastErr = e.message; console.error('[ttsticker item]', e.message); }
        }
        await client.sendMessage(m.chat, { react: { text: sent ? '✅' : '❌', key: m.key } });
        if (!found) return m.reply(`❌ No picture comments found in ${commentImages.scanned || 0} comments checked.\nFields seen: ${[...seenKeys].join(', ').slice(0, 300) || 'none'}`);
        await m.reply(`${sent ? '✅' : '❌'} Sent ${sent} sticker${sent === 1 ? '' : 's'} (checked ${commentImages.scanned || 0} comments; skipped ${skipped} screenshots/odd-shaped pictures${lastErr ? '; last error: ' + lastErr.slice(0, 80) : ''}) • ttsticker v16`);
      } catch (e) {
        console.error('[ttsticker]', e.message);
        m.reply(`❌ Could not get the stickers: ${String(e.message).slice(0, 120)}`);
      }
    }
  },
  {
    command: ['ttdebug'],
    aliases: ['ttstickerdebug'],
    description: 'Debug: dump the picture/sticker data of TikTok comments to a file',
    category: 'downloads',
    handler: async (client, m, { text }) => {
      const link = ((text || '').match(/https?:\/\/[^\s]*tiktok\.com[^\s]*/i) || [])[0];
      if (!link) return m.reply('Send: .ttdebug <TikTok video link>');
      try {
        const out = []; let cursor = 0;
        for (let page = 0; page < 25 && out.length < 60; page++) {
          let d;
          for (let t = 0; t < 5; t++) {
            try { d = (await axios.get(`https://www.tikwm.com/api/comment/list/?url=${encodeURIComponent(link)}&count=50&cursor=${cursor}`, { timeout: 30000, headers: { 'User-Agent': UA } })).data; }
            catch (e) { d = { code: -1, msg: String(e.message) }; }
            if (d?.code !== 0 && /limit|second/i.test(String(d?.msg))) { await new Promise(r => setTimeout(r, 1500)); continue; }
            break;
          }
          const list = d?.data?.comments || [];
          if (!list.length) break;
          for (const c of list) {
            const has = JSON.stringify(c, (k, v) => (/^user$/i.test(k) ? undefined : v));
            if (/https?:\/\//.test(has) && out.length < 60) {
              const copy = JSON.parse(has);
              out.push(copy);
            }
          }
          cursor = Number(d?.data?.cursor) || cursor + list.length;
          await new Promise(r => setTimeout(r, 1200));
        }
        const body = Buffer.from(JSON.stringify({ note: 'comments that contain any link (user info removed)', comments: out }, null, 1));
        // as plain text messages (easy to screenshot/copy) – the data is trimmed to the useful parts
        if (!out.length) return m.reply('No comments with pictures found in the first pages.');
        const std = /^(id|video_id|text|images|create_time|digg_count|reply_total|status|user)$/i;
        const odd = out.filter(c => Object.keys(c).some(k => !std.test(k)) || JSON.stringify(c.images || []).match(/\.(mp4|webm|gif)|video/i));
        const keys = {}; out.forEach(c => Object.keys(c).forEach(k => { keys[k] = (keys[k] || 0) + 1; }));
        const pick = (odd.length ? odd : out).slice(0, 5);
        const txt = 'KEYS ' + JSON.stringify(keys) + '\nODD ' + odd.length + '/' + out.length + '\n' + JSON.stringify(pick, (k, v) => (typeof v === 'string' && v.length > 140 ? v.slice(0, 140) + '…' : v));
        for (let i = 0; i < txt.length && i < 9000; i += 3000) await client.sendMessage(m.chat, { text: txt.slice(i, i + 3000) }, { quoted: m });
      } catch (e) { m.reply('debug failed: ' + e.message); }
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
