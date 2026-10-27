'use strict';

/**
 * mediatools.js  —  new BLACK-MD commands
 *   .circle                 round sticker from an image / short video / GIF
 *   .speed <0.25-4>         change the speed of a video or audio   (.speed 2, .speed 0.5)
 *   .reverse                play a video or audio backwards
 *   .bass [1-30]            heavier bass on audio / voice note / video sound
 *   .nightcore              faster + higher pitch
 *   .slow                   slowed + reverb
 *   .qr <text>              make a QR code
 *   .readqr                 read a QR code from a picture
 *   .statusall              send you the statuses the bot has seen from a contact (owner)
 *
 * Needs only what your bot already has: ffmpeg (found the same way stickerlite finds it),
 * ../lib/stickerlite, axios, form-data.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const axios = global.axios || require('axios');

// ── helpers ──────────────────────────────────────────────────────────────
function ffmpegBin() {
  try { return require('../lib/stickerlite').ffmpegBin(); } catch (_) { return 'ffmpeg'; }
}

function ff(args, timeout = 120000) {
  return new Promise((resolve, reject) => {
    execFile(ffmpegBin(), args, { timeout, maxBuffer: 20 * 1024 * 1024 }, (err, _o, stderr) => {
      if (err) return reject(new Error(String(stderr || err.message).trim().split('\n').slice(-2).join(' ').slice(0, 220)));
      resolve();
    });
  });
}

function makeDir(tag) {
  const d = path.join(os.tmpdir(), `${tag}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
  fs.mkdirSync(d, { recursive: true });
  return d;
}
const rmDir = (d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} };

// the message that carries the media: the one you replied to, or the command message itself
function mediaTarget(m) {
  const pick = (t) => (t && ((t.msg || t).mimetype || '')) ? t : null;
  return pick(m.quoted) || pick(m);
}
const mimeOf = (t) => ((t && (t.msg || t).mimetype) || '').toLowerCase();
const secondsOf = (t) => Number((t && (t.msg || t).seconds) || 0);

async function downloadTarget(client, t) {
  if (typeof t.download === 'function') {
    const b = await t.download();
    if (b && b.length) return b;
  }
  if (typeof client.downloadMediaMessage === 'function') {
    const b = await client.downloadMediaMessage(t);
    if (b && b.length) return b;
  }
  throw new Error('could not download the media');
}

const extFor = (mime) => (/webp/.test(mime) ? 'webp' : /png/.test(mime) ? 'png' : /gif/.test(mime) ? 'gif'
  : /mp4|video/.test(mime) ? 'mp4' : /ogg|opus/.test(mime) ? 'ogg' : /mpeg|mp3/.test(mime) ? 'mp3'
  : /audio/.test(mime) ? 'm4a' : 'jpg');

// ffmpeg's atempo only accepts 0.5 – 2 per step, so chain several for bigger changes
function atempoChain(x) {
  const parts = [];
  while (x > 2) { parts.push('atempo=2'); x /= 2; }
  while (x < 0.5) { parts.push('atempo=0.5'); x /= 0.5; }
  parts.push(`atempo=${x.toFixed(4)}`);
  return parts.join(',');
}

// ── .circle ──────────────────────────────────────────────────────────────
const CIRCLE = "crop=min(iw\\,ih):min(iw\\,ih),scale=512:512:flags=lanczos,format=rgba," +
  "geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(lte(hypot(X-W/2+0.5,Y-H/2+0.5),W/2),255,0)'";

async function circleSticker(buf, mime, packName, authorName) {
  const { Sticker, StickerTypes } = require('../lib/stickerlite');
  const dir = makeDir('circle');
  try {
    const inFile = path.join(dir, `in.${extFor(mime)}`);
    fs.writeFileSync(inFile, buf);
    const isMotion = /video|gif/.test(mime);
    let webp;
    if (isMotion) {
      const tries = [{ fps: 15, q: 45, t: 6 }, { fps: 10, q: 30, t: 5 }, { fps: 8, q: 20, t: 4 }];
      for (const a of tries) {
        const out = path.join(dir, 'out.webp');
        await ff(['-y', '-i', inFile, '-t', String(a.t), '-vf', `fps=${a.fps},${CIRCLE}`, '-an',
          '-c:v', 'libwebp', '-lossless', '0', '-q:v', String(a.q), '-loop', '0', '-compression_level', '4', out], 120000);
        webp = fs.readFileSync(out);
        if (webp.length <= 900 * 1024) break;
      }
    } else {
      const out = path.join(dir, 'out.png');
      await ff(['-y', '-i', inFile, '-frames:v', '1', '-vf', CIRCLE, out]);
      webp = fs.readFileSync(out);
    }
    // stickerlite adds the pack name / author (for the animated webp it only swaps the metadata)
    return await new Sticker(webp, { pack: packName, author: authorName, type: StickerTypes.FULL, quality: 90 }).toBuffer();
  } finally { rmDir(dir); }
}

// ── speed / reverse / audio effects ──────────────────────────────────────
async function runVideoFx(buf, mime, { vf, af }) {
  const dir = makeDir('fx');
  try {
    const inFile = path.join(dir, `in.${extFor(mime)}`);
    fs.writeFileSync(inFile, buf);
    const out = path.join(dir, 'out.mp4');
    const base = ['-y', '-i', inFile];
    const enc = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26', '-pix_fmt', 'yuv420p',
      '-vf', `${vf},scale=trunc(iw/2)*2:trunc(ih/2)*2`, '-movflags', 'faststart'];
    try { // with sound
      await ff([...base, ...enc, '-af', af, '-c:a', 'aac', '-b:a', '128k', out], 180000);
    } catch (e) { // clip without sound
      await ff([...base, ...enc, '-an', out], 180000);
    }
    return fs.readFileSync(out);
  } finally { rmDir(dir); }
}

async function runAudioFx(buf, mime, af) {
  const dir = makeDir('afx');
  try {
    const inFile = path.join(dir, `in.${extFor(mime)}`);
    fs.writeFileSync(inFile, buf);
    const out = path.join(dir, 'out.mp3');
    await ff(['-y', '-i', inFile, '-vn', '-af', af, '-c:a', 'libmp3lame', '-b:a', '160k', out], 180000);
    return fs.readFileSync(out);
  } finally { rmDir(dir); }
}

// shared body for commands that take audio or a video's sound
async function audioEffect(client, m, af, label) {
  const t = mediaTarget(m);
  const mime = mimeOf(t);
  if (!t || !/audio|video/.test(mime)) return m.reply(`🎧 Reply to an *audio*, *voice note* or *video* with *${label}*`);
  try {
    await m.reply('🎛️ _Applying effect..._');
    const buf = await downloadTarget(client, t);
    const out = await runAudioFx(buf, mime, af);
    await client.sendMessage(m.chat, { audio: out, mimetype: 'audio/mpeg', ptt: false, fileName: 'audio.mp3' }, { quoted: m });
  } catch (e) { m.reply('❌ Failed: ' + e.message); }
}

// ── status recorder (for .statusall) ─────────────────────────────────────
const STATUS_TTL = 24 * 3600 * 1000;
const seenStatuses = []; // { id, from, name, time, message, key }
function recordStatus(msg) {
  try {
    if (!msg || msg.key?.remoteJid !== 'status@broadcast' || msg.key.fromMe || !msg.message) return;
    const from = msg.key.participant || msg.participant;
    if (!from) return;
    if (seenStatuses.some(s => s.id === msg.key.id)) return;
    seenStatuses.push({ id: msg.key.id, from, name: msg.pushName || '', time: Number(msg.messageTimestamp) * 1000 || Date.now(), message: msg.message, key: msg.key });
    while (seenStatuses.length > 500) seenStatuses.shift();
  } catch (_) {}
}
function ensureRecorder(client) {
  if (!client || client.__statusRecorder || !client.ev?.on) return;
  client.__statusRecorder = true;
  client.ev.on('messages.upsert', ({ messages }) => { for (const x of messages || []) recordStatus(x); });
}
// statuses from the bot's own message store too, when it keeps one
function storeStatuses(store) {
  try {
    const box = store?.messages?.['status@broadcast'];
    const arr = box?.array || (Array.isArray(box) ? box : box ? Object.values(box) : []);
    arr.forEach(recordStatus);
  } catch (_) {}
}
const statusKind = (msg) => msg.imageMessage ? 'image' : msg.videoMessage ? 'video' : msg.audioMessage ? 'audio'
  : (msg.extendedTextMessage || msg.conversation) ? 'text' : 'other';

// ── commands ─────────────────────────────────────────────────────────────
module.exports = [
  {
    command: ['circle'],
    aliases: ['roundsticker', 'round'],
    description: 'Make a round sticker from an image, GIF or short video',
    category: 'media',
    handler: async (client, m, { pushname }) => {
      ensureRecorder(client);
      const t = mediaTarget(m);
      const mime = mimeOf(t);
      if (!t || !/image|video|gif|webp/.test(mime)) return m.reply('⭕ Reply to an image / short video / GIF with *.circle* (or send one with .circle as the caption).');
      if (secondsOf(t) > 30) return m.reply('⚠️ Video too long. Use a clip of 30 seconds or less.');
      try {
        await m.reply('⭕ _Making your round sticker..._');
        const buf = await downloadTarget(client, t);
        if (/webp/.test(mime) && buf.includes('ANIM')) return m.reply('⚠️ Animated stickers can\'t be rounded. Send the original video/GIF instead.');
        const sticker = await circleSticker(buf, mime, pushname || 'Sticker', 'BLACK-MD');
        await client.sendMessage(m.chat, { sticker }, { quoted: m });
      } catch (e) { m.reply('❌ Failed: ' + e.message); }
    }
  },

  {
    command: ['speed'],
    aliases: ['changespeed', 'fast'],
    description: 'Change the speed of a video or audio (e.g. .speed 2 or .speed 0.5)',
    category: 'media',
    handler: async (client, m, { text }) => {
      ensureRecorder(client);
      const t = mediaTarget(m);
      const mime = mimeOf(t);
      if (!t || !/video|audio/.test(mime)) return m.reply('⏩ Reply to a video or audio with *.speed 2* (faster) or *.speed 0.5* (slower).\nRange: 0.25 – 4');
      let x = parseFloat(String(text || '').replace(',', '.'));
      if (!x || isNaN(x)) x = 2;
      x = Math.min(4, Math.max(0.25, x));
      if (secondsOf(t) > 180) return m.reply('⚠️ Too long. Use a clip of 3 minutes or less.');
      try {
        await m.reply(`⏩ _Changing speed to ${x}x..._`);
        const buf = await downloadTarget(client, t);
        if (/audio/.test(mime)) {
          const out = await runAudioFx(buf, mime, atempoChain(x));
          await client.sendMessage(m.chat, { audio: out, mimetype: 'audio/mpeg', ptt: false, fileName: `audio_${x}x.mp3` }, { quoted: m });
        } else {
          const out = await runVideoFx(buf, mime, { vf: `setpts=PTS/${x}`, af: atempoChain(x) });
          await client.sendMessage(m.chat, { video: out, mimetype: 'video/mp4', caption: `⏩ Speed ${x}x` }, { quoted: m });
        }
      } catch (e) { m.reply('❌ Failed: ' + e.message); }
    }
  },

  {
    command: ['reverse'],
    aliases: ['rewind', 'backwards'],
    description: 'Play a video or audio backwards',
    category: 'media',
    handler: async (client, m) => {
      ensureRecorder(client);
      const t = mediaTarget(m);
      const mime = mimeOf(t);
      if (!t || !/video|audio/.test(mime)) return m.reply('⏪ Reply to a video or audio with *.reverse*');
      if (secondsOf(t) > 60) return m.reply('⚠️ Too long for reversing. Use a clip of 60 seconds or less.');
      try {
        await m.reply('⏪ _Reversing..._');
        const buf = await downloadTarget(client, t);
        if (/audio/.test(mime)) {
          const out = await runAudioFx(buf, mime, 'areverse');
          await client.sendMessage(m.chat, { audio: out, mimetype: 'audio/mpeg', ptt: false, fileName: 'reversed.mp3' }, { quoted: m });
        } else {
          const out = await runVideoFx(buf, mime, { vf: 'reverse', af: 'areverse' });
          await client.sendMessage(m.chat, { video: out, mimetype: 'video/mp4', caption: '⏪ Reversed' }, { quoted: m });
        }
      } catch (e) { m.reply('❌ Failed: ' + e.message); }
    }
  },

  {
    command: ['bass'],
    aliases: ['bassboost'],
    description: 'Boost the bass of an audio / voice note / video (.bass 1-30)',
    category: 'media',
    handler: async (client, m, { text }) => {
      ensureRecorder(client);
      let g = parseInt(text, 10);
      if (!g || isNaN(g)) g = 15;
      g = Math.min(30, Math.max(1, g));
      return audioEffect(client, m, `equalizer=f=60:t=q:w=1:g=${g},bass=g=${Math.round(g * 0.7)},alimiter=limit=0.95`, '.bass');
    }
  },

  {
    command: ['nightcore'],
    aliases: ['nc'],
    description: 'Faster, higher-pitched version of an audio / voice note / video',
    category: 'media',
    handler: async (client, m) => {
      ensureRecorder(client);
      return audioEffect(client, m, 'aresample=44100,asetrate=55125,aresample=44100', '.nightcore');
    }
  },

  {
    command: ['slow'],
    aliases: ['slowed', 'slowreverb'],
    description: 'Slowed + reverb version of an audio / voice note / video',
    category: 'media',
    handler: async (client, m) => {
      ensureRecorder(client);
      return audioEffect(client, m, 'aresample=44100,asetrate=35280,aresample=44100,aecho=0.8:0.88:60:0.35', '.slow');
    }
  },

  {
    command: ['qr'],
    aliases: ['qrcode', 'makeqr'],
    description: 'Make a QR code from text or a link',
    category: 'tools',
    handler: async (client, m, { text }) => {
      ensureRecorder(client);
      const data = (text || (m.quoted && (m.quoted.text || m.quoted.body)) || '').trim();
      if (!data) return m.reply('🔳 Send text or a link: *.qr https://example.com*  (or reply to a message with *.qr*)');
      if (data.length > 1000) return m.reply('⚠️ Text is too long for a QR code (max 1000 characters).');
      try {
        let img;
        try { // offline, if the "qrcode" package is installed
          img = await require('qrcode').toBuffer(data, { width: 600, margin: 2 });
        } catch (_) {
          const r = await axios.get(`https://api.qrserver.com/v1/create-qr-code/?size=600x600&margin=10&data=${encodeURIComponent(data)}`, { responseType: 'arraybuffer', timeout: 20000 });
          img = Buffer.from(r.data);
        }
        if (!img || img.length < 200) throw new Error('empty QR image');
        await client.sendMessage(m.chat, { image: img, caption: '🔳 *QR code*\n_Powered by BLACK-MD_' }, { quoted: m });
      } catch (e) { m.reply('❌ Could not make the QR code: ' + e.message); }
    }
  },

  {
    command: ['readqr'],
    aliases: ['scanqr', 'qrread'],
    description: 'Read a QR code from a picture',
    category: 'tools',
    handler: async (client, m) => {
      ensureRecorder(client);
      const t = mediaTarget(m);
      if (!t || !/image/.test(mimeOf(t))) return m.reply('🔍 Reply to a picture that has a QR code with *.readqr*');
      try {
        await m.reply('🔍 _Reading the QR code..._');
        const buf = await downloadTarget(client, t);
        const FormData = require('form-data');
        const form = new FormData();
        form.append('file', buf, { filename: 'qr.jpg', contentType: 'image/jpeg' });
        const r = await axios.post('https://api.qrserver.com/v1/read-qr-code/', form, { headers: form.getHeaders(), timeout: 30000 });
        const sym = r.data?.[0]?.symbol?.[0];
        if (!sym || !sym.data) return m.reply('🤷 No QR code found. Try a clearer, closer picture.');
        await client.sendMessage(m.chat, { text: `🔳 *QR content:*\n\n${sym.data}` }, { quoted: m });
      } catch (e) { m.reply('❌ Could not read it: ' + e.message); }
    }
  },

  {
    command: ['statusall'],
    aliases: ['allstatus', 'savestatuses'],
    description: 'Send you every status the bot has seen from a contact (Owner only)',
    category: 'media',
    handler: async (client, m, { Owner, NotOwner, text, store }) => {
      if (!Owner) return m.reply(NotOwner);
      ensureRecorder(client);
      storeStatuses(store);
      const now = Date.now();
      for (let i = seenStatuses.length - 1; i >= 0; i--) if (now - seenStatuses[i].time > STATUS_TTL) seenStatuses.splice(i, 1);

      // group by person
      const people = {};
      for (const s of seenStatuses) (people[s.from] = people[s.from] || { jid: s.from, name: s.name, items: [] }).items.push(s);
      const list = Object.values(people).sort((a, b) => b.items.length - a.items.length);

      if (!list.length) {
        return m.reply('📭 No statuses recorded yet.\nThe bot can only save statuses it has seen *since it started* (they last 24 h). Wait for contacts to post, then try again.');
      }

      const arg = (text || '').trim();
      if (!arg) {
        return m.reply('📲 *Statuses I have seen (last 24h)*\n\n' +
          list.map((p, i) => `${i + 1}. ${p.name || '+' + p.jid.split('@')[0].split(':')[0]} — ${p.items.length}`).join('\n') +
          '\n\nSend *.statusall <number>* (or a name / phone number) to get all of that person\'s statuses.');
      }

      let person = null;
      const n = parseInt(arg, 10);
      if (n && list[n - 1]) person = list[n - 1];
      else {
        const digits = arg.replace(/[^0-9]/g, '');
        person = list.find(p => (digits.length > 5 && p.jid.includes(digits)) || (p.name && p.name.toLowerCase().includes(arg.toLowerCase())));
      }
      if (!person) return m.reply('❌ Person not found. Send *.statusall* to see the list.');

      const { downloadMediaMessage } = require('@whiskeysockets/baileys');
      const dest = m.sender || client.user.id;
      let sent = 0;
      await m.reply(`⏳ Sending ${Math.min(person.items.length, 40)} status${person.items.length === 1 ? '' : 'es'} from *${person.name || person.jid.split('@')[0]}* to your DM...`);
      for (const s of person.items.sort((a, b) => a.time - b.time).slice(0, 40)) {
        const kind = statusKind(s.message);
        const when = new Date(s.time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi' });
        try {
          if (kind === 'text') {
            const txt = s.message.conversation || s.message.extendedTextMessage?.text || '';
            await client.sendMessage(dest, { text: `📝 *Status (${when})*\n\n${txt}` });
          } else if (kind === 'image' || kind === 'video' || kind === 'audio') {
            const buf = await downloadMediaMessage({ key: s.key, message: s.message }, 'buffer', {}, { reuploadRequest: client.updateMediaMessage, logger: console });
            const cap = (s.message[kind + 'Message'].caption || '') + `\n_${when}_`;
            if (kind === 'audio') await client.sendMessage(dest, { audio: buf, mimetype: 'audio/mpeg', ptt: !!s.message.audioMessage.ptt });
            else await client.sendMessage(dest, { [kind]: buf, caption: cap.trim() });
          } else continue;
          sent++;
          await new Promise(r => setTimeout(r, 900));
        } catch (e) { console.error('[statusall]', e.message); }
      }
      m.reply(sent ? `✅ Sent ${sent} status${sent === 1 ? '' : 'es'} to your DM.` : '❌ Could not download them (they may have expired).');
    }
  }
];
