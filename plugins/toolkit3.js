'use strict';

/**
 * toolkit3.js  —  BLACK-MD plugin, batch 3
 *   .fancy  .emojify  .binary                         text
 *   .waveform  .spectrum  .slideshow  .blurface       audio / picture / video
 *   .rules  .setrules  .snapshot                      group tools
 *   .afk  .smute  .sunmute                            group presence / moderation
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const BM = '𝐁𝐋𝐀𝐂𝐊-𝐌𝐃';
const TAG = `_${BM}_`;

// ── helpers ──────────────────────────────────────────────────────────────
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
function human(ms) {
  const s = Math.round(ms / 1000); if (s < 90) return s + ' seconds';
  const mi = Math.round(s / 60); if (mi < 90) return mi + ' minutes';
  const h = Math.floor(mi / 60), r = mi % 60; if (h < 48) return h + 'h' + (r ? ' ' + r + 'm' : '');
  return Math.round(h / 24) + ' days';
}
function parseTime(s) {
  s = String(s || '').trim().toLowerCase();
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  const m = s.match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2}(?:\.\d+)?)$/);
  return m ? Number(m[1] || 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null;
}
const COLORS = { cyan: '#00e5ff', magenta: '#ff2ec8', green: '#39ff78', gold: '#ffc42e', red: '#ff3c46', blue: '#468cff', white: '#ffffff', purple: '#b266ff', orange: '#ff8a1f' };

// ═════════════════════════ persistent data ═══════════════════════════════
function jsonStore(name, init) {
  const file = path.join(process.cwd(), name);
  let data = null;
  return {
    get() { if (!data) { try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { data = init(); } } return data; },
    save() { try { fs.writeFileSync(file, JSON.stringify(data)); } catch (_) {} }
  };
}
const RULES = jsonStore('rules_data.json', () => ({}));
const AFK = jsonStore('afk_data.json', () => ({}));       // key: primary number -> { nums, reason, at, name, last:{} }
const SMUTE = jsonStore('smute_data.json', () => ({}));   // key: chat -> [ { nums, name } ]

// every number a person can show up as in a group (phone number and lid forms)
async function aliasesFor(client, chat, jid) {
  const set = new Set([num(jid)]);
  if (chat && String(chat).endsWith('@g.us')) {
    try {
      const meta = await client.groupMetadata(chat);
      const p = (meta.participants || []).find(x => [x.id, x.pn, x.phoneNumber, x.lid, x.jid].some(v => v && num(v) === num(jid)));
      if (p) [p.id, p.pn, p.phoneNumber, p.lid, p.jid].forEach(v => v && set.add(num(v)));
    } catch (_) {}
  }
  return [...set].filter(Boolean);
}

// ═════════════════════════ message listener (afk + smute) ════════════════
function rawText(msg) {
  const x = msg.message || {};
  const inner = x.ephemeralMessage?.message || x.viewOnceMessage?.message || x;
  return inner.conversation || inner.extendedTextMessage?.text || inner.imageMessage?.caption || inner.videoMessage?.caption || '';
}
function rawContext(msg) {
  const x = msg.message || {};
  const inner = x.ephemeralMessage?.message || x;
  for (const k of Object.keys(inner)) { const c = inner[k] && inner[k].contextInfo; if (c) return c; }
  return {};
}
const lastNotice = {};
async function onMessage(client, msg) {
  if (!msg || !msg.message || !msg.key) return;
  const chat = msg.key.remoteJid || '';
  if (!chat || chat === 'status@broadcast' || msg.key.fromMe) return;
  const isGroup = chat.endsWith('@g.us');
  const sender = msg.key.participant || msg.key.participantAlt || chat;
  const senderNums = [sender, msg.key.participantAlt, msg.key.participantPn].filter(Boolean).map(num);

  // smute: delete the muted person's messages
  if (isGroup) {
    const list = SMUTE.get()[chat] || [];
    if (list.some(e => e.nums.some(n => senderNums.includes(n)))) {
      try { await client.sendMessage(chat, { delete: msg.key }); } catch (_) {}
      return;
    }
  }

  const body = rawText(msg);
  const afk = AFK.get();
  const entries = Object.entries(afk);
  if (!entries.length) return;

  // the afk person is back
  for (const [key, e] of entries) {
    if (e.nums.some(n => senderNums.includes(n)) && Date.now() - e.at > 4000 && !/^\W?(afk|back)\b/i.test(body.trim())) {
      delete afk[key]; AFK.save();
      try { await client.sendMessage(chat, { text: `👋 *${BM}*\n@${num(sender)} is back after ${human(Date.now() - e.at)}.`, mentions: [sender] }, { quoted: msg }); } catch (_) {}
    }
  }
  // someone tagged / replied to an afk person
  if (isGroup) {
    const c = rawContext(msg);
    const hit = [...(c.mentionedJid || []), c.participant].filter(Boolean).map(num);
    for (const e of Object.values(afk)) {
      if (!e.nums.some(n => hit.includes(n))) continue;
      const k = chat + '|' + e.nums[0];
      if (lastNotice[k] && Date.now() - lastNotice[k] < 60000) continue;
      lastNotice[k] = Date.now();
      const who = e.jid || (e.nums[0] + '@s.whatsapp.net');
      try { await client.sendMessage(chat, { text: `😴 *${BM}*\n@${num(who)} is AFK${e.reason ? ': ' + e.reason : ''}\n_away for ${human(Date.now() - e.at)}_`, mentions: [who] }, { quoted: msg }); } catch (_) {}
    }
  }
}
function ensureHooks(client) {
  if (!client || client.__bmT3 || !client.ev || typeof client.ev.on !== 'function') return;
  client.__bmT3 = true;
  client.ev.on('messages.upsert', async (u) => { for (const msg of (u && u.messages) || []) { try { await onMessage(client, msg); } catch (_) {} } });
}
setTimeout(() => ensureHooks(global.conn || global.client || global.sock || null), 8000).unref?.();
// handy for the bot's own command handler: if (global.BM_SMUTED?.(chat, sender)) return;
global.BM_SMUTED = (chat, jid) => ((SMUTE.get()[chat] || []).some(e => e.nums.includes(num(jid))));

// ═════════════════════════ fancy text ════════════════════════════════════
function mathMap(up, lo, dig, exc = {}) {
  return (ch) => {
    if (exc[ch]) return exc[ch];
    const c = ch.charCodeAt(0);
    if (c >= 65 && c <= 90 && up != null) return String.fromCodePoint(up + c - 65);
    if (c >= 97 && c <= 122 && lo != null) return String.fromCodePoint(lo + c - 97);
    if (c >= 48 && c <= 57 && dig != null) return String.fromCodePoint(dig + c - 48);
    return ch;
  };
}
const SMALLCAPS = { a: 'ᴀ', b: 'ʙ', c: 'ᴄ', d: 'ᴅ', e: 'ᴇ', f: 'ꜰ', g: 'ɢ', h: 'ʜ', i: 'ɪ', j: 'ᴊ', k: 'ᴋ', l: 'ʟ', m: 'ᴍ', n: 'ɴ', o: 'ᴏ', p: 'ᴘ', q: 'ǫ', r: 'ʀ', s: 'ꜱ', t: 'ᴛ', u: 'ᴜ', v: 'ᴠ', w: 'ᴡ', x: 'x', y: 'ʏ', z: 'ᴢ' };
const FLIP = { a: 'ɐ', b: 'q', c: 'ɔ', d: 'p', e: 'ǝ', f: 'ɟ', g: 'ƃ', h: 'ɥ', i: 'ᴉ', j: 'ɾ', k: 'ʞ', l: 'l', m: 'ɯ', n: 'u', o: 'o', p: 'd', q: 'b', r: 'ɹ', s: 's', t: 'ʇ', u: 'n', v: 'ʌ', w: 'ʍ', x: 'x', y: 'ʎ', z: 'z',
  A: '∀', B: 'ᗺ', C: 'Ɔ', D: 'ᗡ', E: 'Ǝ', F: 'Ⅎ', G: '⅁', H: 'H', I: 'I', J: 'ſ', K: 'ʞ', L: '⅂', M: 'W', N: 'N', O: 'O', P: 'Ԁ', Q: 'Q', R: 'ᴚ', S: 'S', T: '⊥', U: '∩', V: 'Λ', W: 'M', X: 'X', Y: '⅄', Z: 'Z',
  1: 'Ɩ', 2: 'ᄅ', 3: 'Ɛ', 4: 'ㄣ', 5: 'ϛ', 6: '9', 7: 'ㄥ', 8: '8', 9: '6', 0: '0', '.': '˙', ',': "'", '?': '¿', '!': '¡', '(': ')', ')': '(', '[': ']', ']': '[', '&': '⅋', '_': '‾' };
const CIRCLED_DIGITS = ['⓪', '①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨'];
const bySeg = (s, fn) => Array.from(s).map(fn).join('');
const STYLES = [
  ['Bold serif', mathMap(0x1D400, 0x1D41A, 0x1D7CE)],
  ['Italic serif', mathMap(0x1D434, 0x1D44E, null, { h: 'ℎ' })],
  ['Bold italic serif', mathMap(0x1D468, 0x1D482, 0x1D7CE)],
  ['Script', mathMap(0x1D49C, 0x1D4B6, null, { B: 'ℬ', E: 'ℰ', F: 'ℱ', H: 'ℋ', I: 'ℐ', L: 'ℒ', M: 'ℳ', R: 'ℛ', e: 'ℯ', g: 'ℊ', o: 'ℴ' })],
  ['Bold script', mathMap(0x1D4D0, 0x1D4EA, 0x1D7CE)],
  ['Fraktur', mathMap(0x1D504, 0x1D51E, null, { C: 'ℭ', H: 'ℌ', I: 'ℑ', R: 'ℜ', Z: 'ℨ' })],
  ['Bold fraktur', mathMap(0x1D56C, 0x1D586, 0x1D7CE)],
  ['Double-struck', mathMap(0x1D538, 0x1D552, 0x1D7D8, { C: 'ℂ', H: 'ℍ', N: 'ℕ', P: 'ℙ', Q: 'ℚ', R: 'ℝ', Z: 'ℤ' })],
  ['Sans', mathMap(0x1D5A0, 0x1D5BA, 0x1D7E2)],
  ['Sans bold', mathMap(0x1D5D4, 0x1D5EE, 0x1D7EC)],
  ['Sans italic', mathMap(0x1D608, 0x1D622, 0x1D7E2)],
  ['Sans bold italic', mathMap(0x1D63C, 0x1D656, 0x1D7EC)],
  ['Monospace', mathMap(0x1D670, 0x1D68A, 0x1D7F6)],
  ['Circled', (c) => /\d/.test(c) ? CIRCLED_DIGITS[Number(c)] : mathMap(0x24B6, 0x24D0, null)(c)],
  ['Black circled', (c) => /[a-z]/i.test(c) ? String.fromCodePoint(0x1F150 + c.toUpperCase().charCodeAt(0) - 65) : c],
  ['Squared', (c) => /[a-z]/i.test(c) ? String.fromCodePoint(0x1F130 + c.toUpperCase().charCodeAt(0) - 65) : c],
  ['Full width', (c) => c === ' ' ? '\u3000' : (c.charCodeAt(0) >= 33 && c.charCodeAt(0) <= 126 ? String.fromCodePoint(c.charCodeAt(0) + 0xFEE0) : c)],
  ['Small caps', (c) => SMALLCAPS[c.toLowerCase()] || c],
  ['Strikethrough', (c) => c === ' ' ? c : c + '\u0336'],
  ['Underline', (c) => c === ' ' ? c : c + '\u0332']
];
function fancy(style, text) { return bySeg(text, STYLES[style][1]); }
const flipText = (t) => Array.from(t).reverse().map(c => FLIP[c] || FLIP[c.toLowerCase()] || c).join('');

// ═════════════════════════ emojify ═══════════════════════════════════════
const EMOJI = {
  love: '❤️', heart: '❤️', mapenzi: '❤️', kiss: '😘', happy: '😊', sad: '😢', cry: '😭', laugh: '😂', funny: '🤣', smile: '😄', angry: '😡', cool: '😎', sleep: '😴', tired: '🥱', sick: '🤒', hot: '🔥', fire: '🔥', moto: '🔥',
  cold: '🥶', ice: '🧊', sun: '☀️', jua: '☀️', moon: '🌙', star: '⭐', stars: '✨', rain: '🌧️', mvua: '🌧️', storm: '⛈️', snow: '❄️', wind: '💨', water: '💧', maji: '💧', sea: '🌊', beach: '🏖️', tree: '🌳', flower: '🌸', rose: '🌹',
  food: '🍲', chakula: '🍲', eat: '🍽️', hungry: '😋', pizza: '🍕', burger: '🍔', chips: '🍟', chicken: '🍗', meat: '🥩', nyama: '🥩', fish: '🐟', samaki: '🐟', egg: '🥚', bread: '🍞', mkate: '🍞', cake: '🎂', coffee: '☕', tea: '🍵', chai: '🍵',
  milk: '🥛', beer: '🍺', wine: '🍷', drink: '🥤', fruit: '🍎', apple: '🍎', banana: '🍌', mango: '🥭', money: '💰', pesa: '💰', cash: '💵', rich: '🤑', gold: '🏅', car: '🚗', gari: '🚗', bus: '🚌', matatu: '🚐', bike: '🚲',
  plane: '✈️', train: '🚆', road: '🛣️', home: '🏠', house: '🏠', nyumba: '🏠', school: '🏫', shule: '🏫', hospital: '🏥', church: '⛪', phone: '📱', simu: '📱', laptop: '💻', computer: '💻', tv: '📺', camera: '📷', music: '🎵', song: '🎶',
  dance: '💃', party: '🎉', birthday: '🎂', gift: '🎁', win: '🏆', winner: '🏆', football: '⚽', ball: '⚽', goal: '🥅', game: '🎮', book: '📚', read: '📖', write: '✍️', study: '📚', work: '💼', job: '💼', kazi: '💼', time: '⏰',
  night: '🌃', morning: '🌅', day: '🌞', friend: '🤝', rafiki: '🤝', mama: '👩', baba: '👨', baby: '👶', boy: '👦', girl: '👧', king: '👑', queen: '👸', god: '🙏', pray: '🙏', thanks: '🙏', please: '🙏', peace: '☮️', amani: '☮️',
  good: '👍', nice: '👌', great: '🔥', bad: '👎', ok: '👌', yes: '✅', no: '❌', wow: '😮', omg: '😱', hello: '👋', hi: '👋', bye: '👋', welcome: '🤗', karibu: '🤗', sorry: '🙇', think: '🤔', idea: '💡', secret: '🤫', ghost: '👻',
  dog: '🐶', cat: '🐱', lion: '🦁', simba: '🦁', elephant: '🐘', tembo: '🐘', bird: '🐦', cow: '🐄', goat: '🐐', monkey: '🐵', snake: '🐍', kenya: '🇰🇪', africa: '🌍', world: '🌍', earth: '🌍', fast: '⚡', power: '⚡', strong: '💪', gym: '🏋️',
  bot: '🤖', robot: '🤖', hack: '👨‍💻', code: '💻', rocket: '🚀', bomb: '💣', gun: '🔫', sword: '⚔️', shoe: '👟', shoes: '👟', shirt: '👕', dress: '👗', hat: '🧢', glasses: '🕶️', key: '🔑', lock: '🔒', light: '💡', eye: '👀', eyes: '👀', see: '👀'
};
// ═════════════════════════ blur zones ════════════════════════════════════
const ZONES = {
  face: [0.22, 0.08, 0.56, 0.5], center: [0.2, 0.2, 0.6, 0.6], middle: [0, 0.33, 1, 0.34], top: [0, 0, 1, 0.34], bottom: [0, 0.66, 1, 0.34],
  left: [0, 0, 0.5, 1], right: [0.5, 0, 0.5, 1], topleft: [0, 0, 0.5, 0.5], topright: [0.5, 0, 0.5, 0.5], bottomleft: [0, 0.5, 0.5, 0.5], bottomright: [0.5, 0.5, 0.5, 0.5]
};

// ═════════════════════════ slideshow queue ═══════════════════════════════
const slideQueues = new Map();
function dropSlides(s) { const q = slideQueues.get(s); if (q) { clearTimeout(q.timer); rmDir(q.dir); slideQueues.delete(s); } }

// ═════════════════════════ COMMANDS ══════════════════════════════════════
module.exports = [

  // ───────────────────────── .fancy ──────────────────────────
  {
    command: ['fancy'],
    aliases: ['font', 'fonts', 'stylish', 'style'],
    description: 'Turn text into stylish fonts (.fancy Your text, or .fancy 4 Your text)',
    category: 'fun',
    handler: async (client, m, { text }) => {
      let t = String(text || '').trim();
      let pick = null;
      const mm = t.match(/^(\d{1,2})\s+([\s\S]+)$/);
      if (mm) { pick = Number(mm[1]); t = mm[2].trim(); }
      else {
        const named = t.match(/^([a-z-]+)\s+([\s\S]+)$/i);
        if (named) { const idx = STYLES.findIndex(s => s[0].toLowerCase().replace(/[^a-z]/g, '') === named[1].toLowerCase().replace(/[^a-z]/g, '')); if (idx >= 0) { pick = idx + 1; t = named[2].trim(); } }
      }
      if (!t) t = quotedText(m).trim();
      if (!t) return m.reply(`🔤 *${BM} Fancy text*\n\n*.fancy Black Merchant*  (all styles)\n*.fancy 4 Black Merchant*  (just style 4)\n*.fancy script Black Merchant*\n\nOr reply to a message with *.fancy*`);
      if (t.length > 200) return m.reply('⚠️ Keep it under 200 characters.');
      const total = STYLES.length + 1;
      if (pick) {
        if (pick < 1 || pick > total) return m.reply(`Pick a style from 1 to ${total}.`);
        return m.reply(pick === total ? flipText(t) : fancy(pick - 1, t));
      }
      const lines = STYLES.map((s, i) => `${String(i + 1).padStart(2, ' ')}. ${fancy(i, t)}`);
      lines.push(`${total}. ${flipText(t)}`);
      m.reply(`🔤 *${BM} Fancy text*\n\n${lines.join('\n')}\n\n_Get just one to copy easily:_ *.fancy 4 ${t.slice(0, 20)}*`);
    }
  },

  // ───────────────────────── .emojify ────────────────────────
  {
    command: ['emojify'],
    aliases: ['emojis', 'addemoji', 'emojitext'],
    description: 'Add emojis to your sentence (.emojify I love football)',
    category: 'fun',
    handler: async (client, m, { text }) => {
      const t = String(text || quotedText(m) || '').trim();
      if (!t) return m.reply(`😎 *${BM} Emojify*\n\n*.emojify I love football and nyama choma*\n*.emojify good morning my friend*\n\nOr reply to a message with *.emojify*`);
      if (t.length > 800) return m.reply('⚠️ Keep it under 800 characters.');
      let hits = 0;
      const out = t.replace(/[A-Za-z']+/g, (w) => {
        const base = w.toLowerCase().replace(/'s$/, '');
        const e = EMOJI[base] || EMOJI[base.replace(/s$/, '')] || EMOJI[base.replace(/ing$/, '')];
        if (e) { hits++; return `${w} ${e}`; }
        return w;
      });
      m.reply(hits ? out : `${out} 😊\n\n_No matching words found. Try words like love, food, money, home, football._`);
    }
  },

  // ───────────────────────── .binary ─────────────────────────
  {
    command: ['binary'],
    aliases: ['bin', 'tobinary', 'frombinary'],
    description: 'Text to binary and back (.binary hello / .binary decode 01101000...)',
    category: 'tools',
    handler: async (client, m, { text }) => {
      let t = String(text || '').trim();
      let mode = null;
      const mm = t.match(/^(encode|enc|e|decode|dec|d)\b\s*([\s\S]*)$/i);
      if (mm) { mode = /^e/i.test(mm[1]) ? 'enc' : 'dec'; t = mm[2].trim(); }
      if (!t) t = quotedText(m).trim();
      if (!t) return m.reply(`💾 *${BM} Binary*\n\n*.binary Hello*  →  01001000 01100101...\n*.binary decode 01001000 01101001*  →  Hi\n\nOr reply to a message with *.binary*. I can tell binary apart from text by myself.`);
      const compact = t.replace(/\s+/g, '');
      if (!mode) mode = /^[01]+$/.test(compact) && compact.length >= 8 && compact.length % 8 === 0 ? 'dec' : 'enc';
      if (mode === 'enc') {
        if (t.length > 300) return m.reply('⚠️ Keep it under 300 characters.');
        return m.reply(`💾 *${BM} Binary · encoded*\n\n${[...Buffer.from(t, 'utf8')].map(b => b.toString(2).padStart(8, '0')).join(' ')}`);
      }
      if (!/^[01]+$/.test(compact) || compact.length % 8 !== 0) return m.reply('⚠️ Binary must be only 0s and 1s, in groups of 8.');
      const bytes = compact.match(/.{8}/g).map(b => parseInt(b, 2));
      const out = Buffer.from(bytes).toString('utf8');
      if (!out || /\uFFFD/.test(out)) return m.reply('⚠️ That binary does not decode to text.');
      m.reply(`💾 *${BM} Binary · decoded*\n\n${out}`);
    }
  },

  // ───────────────────────── .waveform ───────────────────────
  {
    command: ['waveform'],
    aliases: ['wavepic', 'soundwave', 'audiopic'],
    description: 'Picture of the sound wave of a song / voice note / video (.waveform [colour])',
    category: 'media',
    handler: async (client, m, { text }) => {
      const word = String(text || '').trim().toLowerCase();
      const col = COLORS[word] || COLORS.cyan;
      const dir = makeDir('wave');
      try {
        const x = await needMedia(client, m, /audio|video/, `🌊 *${BM} Waveform*\n\nReply to a song, voice note or video with *.waveform*\nColours: ${Object.keys(COLORS).join(', ')}`);
        if (!x) return;
        await m.reply('🌊 _Drawing the wave..._');
        const inFile = path.join(dir, `in.${extFor(x.mime)}`); fs.writeFileSync(inFile, x.buf);
        const info = await probe(inFile);
        if (!info.hasAudio) return m.reply('⚠️ There is no sound in that file.');
        const out = path.join(dir, 'wave.png');
        await ff(['-y', '-i', inFile, '-filter_complex',
          `[0:a]aformat=channel_layouts=mono,showwavespic=s=1280x360:colors=${col}:scale=sqrt[w];` +
          `color=c=0x0a0a14:s=1280x520[bg];[bg][w]overlay=0:80,drawbox=x=0:y=0:w=1280:h=6:color=${col}@0.9:t=fill,drawbox=x=0:y=514:w=1280:h=6:color=${col}@0.9:t=fill,format=rgb24[v]`,
          '-map', '[v]', '-frames:v', '1', out], 120000);
        await client.sendMessage(m.chat, { image: fs.readFileSync(out), mimetype: 'image/png', caption: `🌊 ${info.seconds ? Math.round(info.seconds) + ' seconds of sound' : 'Waveform'} • ${TAG}` }, { quoted: m });
      } catch (e) { m.reply('❌ Failed: ' + e.message); }
      finally { rmDir(dir); }
    }
  },

  // ───────────────────────── .spectrum ───────────────────────
  {
    command: ['spectrum'],
    aliases: ['visualizer', 'musicvideo', 'soundbars'],
    description: 'Animated sound visual video of a song (.spectrum [bars|wave|circle|cqt] [colour] [@0:30])',
    category: 'media',
    handler: async (client, m, { text }) => {
      let t = String(text || '').toLowerCase();
      let start = 0;
      const at = t.match(/@\s*([\d:.]+)/); if (at) { const v = parseTime(at[1]); if (v != null) start = v; t = t.replace(at[0], ''); }
      const style = (t.match(/\b(bars|wave|circle|cqt)\b/) || [])[1] || 'bars';
      const colName = Object.keys(COLORS).find(c => new RegExp('\\b' + c + '\\b').test(t)) || 'cyan';
      const col = COLORS[colName];
      const dir = makeDir('spec');
      try {
        const x = await needMedia(client, m, /audio|video/, `🎛️ *${BM} Spectrum*\n\nReply to a song or voice note:\n*.spectrum*  (bars)\n*.spectrum wave*  •  *.spectrum circle*  •  *.spectrum cqt*\n*.spectrum bars magenta*\n*.spectrum wave gold @1:10*  (start at 1:10)\n\nMakes a 30-second square video.`);
        if (!x) return;
        await m.reply('🎛️ _Making your visual... about a minute._');
        const inFile = path.join(dir, `in.${extFor(x.mime)}`); fs.writeFileSync(inFile, x.buf);
        const info = await probe(inFile);
        if (!info.hasAudio) return m.reply('⚠️ There is no sound in that file.');
        const D = Math.min(30, Math.max(3, (info.seconds || 30) - start));
        const rgb = [1, 3, 5].map(i => parseInt(col.slice(i, i + 2), 16));
        const viz = {
          bars: `aformat=channel_layouts=stereo,showfreqs=s=720x720:mode=bar:ascale=sqrt:fscale=log:win_size=2048:colors=${col}|${col}`,
          wave: `aformat=channel_layouts=mono,showwaves=s=720x720:mode=cline:rate=25:colors=${col}:scale=sqrt`,
          circle: `aformat=channel_layouts=stereo,avectorscope=s=720x720:rate=25:zoom=1.6:rc=${rgb[0]}:gc=${rgb[1]}:bc=${rgb[2]}:rf=${Math.round(rgb[0] / 4)}:gf=${Math.round(rgb[1] / 4)}:bf=${Math.round(rgb[2] / 4)}`,
          cqt: `aformat=channel_layouts=stereo,showcqt=s=1280x720:fps=25:axis=0:sono_h=0:bar_g=2,scale=720:720,setsar=1`
        }[style];
        const out = path.join(dir, 'out.mp4');
        await ff(['-y', '-ss', String(start), '-t', String(D), '-i', inFile, '-filter_complex', `[0:a]asplit=2[a1][a2];[a1]${viz},format=yuv420p[v]`,
          '-map', '[v]', '-map', '[a2]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26', '-r', '25', '-c:a', 'aac', '-b:a', '128k', '-t', String(D), '-movflags', 'faststart', out], 240000);
        await client.sendMessage(m.chat, { video: fs.readFileSync(out), mimetype: 'video/mp4', caption: `🎛️ ${style} • ${colName} • ${TAG}` }, { quoted: m });
      } catch (e) { m.reply('❌ Failed: ' + e.message); }
      finally { rmDir(dir); }
    }
  },

  // ───────────────────────── .blurface ───────────────────────
  {
    command: ['blurface'],
    aliases: ['hidearea', 'censor', 'blurarea', 'pixelate'],
    description: 'Blur or hide an area of a picture / video (.blurface face | center | top | 30,10,40,40 ...)',
    category: 'media',
    handler: async (client, m, { text }) => {
      const t = String(text || '').toLowerCase().trim();
      const keep = /\b(keep|inverse|except|outside)\b/.test(t);
      const fx = /\b(pixel|pixelate|mosaic)\b/.test(t) ? 'pixel' : /\b(black|box|solid)\b/.test(t) ? 'black' : 'blur';
      let zone = null;
      const custom = t.match(/(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})/);
      if (custom) { const v = custom.slice(1).map(Number); if (v[0] + v[2] <= 100 && v[1] + v[3] <= 100 && v[2] > 0 && v[3] > 0) zone = v.map(n => n / 100); }
      if (!zone) { const z = Object.keys(ZONES).sort((a, b) => b.length - a.length).find(k => new RegExp('\\b' + k + '\\b').test(t)); if (z) zone = ZONES[z]; }
      if (!zone) {
        return m.reply(`🫥 *${BM} Blur an area*\n\nReply to a picture or video and choose where:\n*.blurface face*  (upper middle, where faces usually are)\n*.blurface center*  •  *top*  •  *middle*  •  *bottom*  •  *left*  •  *right*\n*.blurface topleft*  (or topright, bottomleft, bottomright)\n*.blurface 30,10,40,40*  (x, y, width, height in %)\n\nStyle: add *pixel* or *black*\nBlur everything *except* the zone: add *keep*\nExample: *.blurface keep face*\n\n⚠️ I do not detect faces automatically. You choose the zone.`);
      }
      const dir = makeDir('blf');
      try {
        const x = await needMedia(client, m, /image|video/, '🫥 Reply to a *picture* or *video* with *.blurface center*');
        if (!x) return;
        await m.reply('🫥 _Working..._');
        const isVid = /video/.test(x.mime);
        const inFile = path.join(dir, `in.${extFor(x.mime)}`); fs.writeFileSync(inFile, x.buf);
        const info = await probe(inFile);
        if (!info.w) throw new Error('could not read the size');
        const W = info.w, H = info.h;
        const rw = even(zone[2] * W), rh = even(zone[3] * H), rx = Math.min(W - rw, Math.round(zone[0] * W)), ry = Math.min(H - rh, Math.round(zone[1] * H));
        const sigma = Math.max(10, Math.round(Math.min(W, H) / 16));
        const effect = fx === 'pixel' ? `scale=max(2\\,trunc(iw/16)):max(2\\,trunc(ih/16)),scale=${rw}:${rh}:flags=neighbor` : fx === 'black' ? `drawbox=x=0:y=0:w=iw:h=ih:color=black:t=fill` : `gblur=sigma=${sigma}`;
        const fc = keep
          ? `[0:v]split=2[a][b];[a]${fx === 'blur' ? `gblur=sigma=${sigma}` : fx === 'pixel' ? `scale=max(2\\,trunc(iw/16)):max(2\\,trunc(ih/16)),scale=${W}:${H}:flags=neighbor` : 'drawbox=x=0:y=0:w=iw:h=ih:color=black:t=fill'}[bl];[b]crop=${rw}:${rh}:${rx}:${ry}[c];[bl][c]overlay=${rx}:${ry},format=${isVid ? 'yuv420p' : 'yuvj420p'}[v]`
          : `[0:v]split=2[a][b];[b]crop=${rw}:${rh}:${rx}:${ry},${effect}[c];[a][c]overlay=${rx}:${ry},format=${isVid ? 'yuv420p' : 'yuvj420p'}[v]`;
        if (isVid) {
          if (info.seconds > 90) return m.reply('⚠️ Use a video of 90 seconds or less.');
          const out = path.join(dir, 'out.mp4');
          const base = ['-y', '-i', inFile, '-filter_complex', fc, '-map', '[v]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-movflags', 'faststart'];
          try { await ff([...base, '-map', '0:a?', '-c:a', 'copy', out], 240000); } catch (_) { await ff([...base, '-an', out], 240000); }
          await client.sendMessage(m.chat, { video: fs.readFileSync(out), mimetype: 'video/mp4', caption: `🫥 Area hidden • ${TAG}` }, { quoted: m });
        } else {
          const out = path.join(dir, 'out.jpg');
          await ff(['-y', '-i', inFile, '-filter_complex', fc, '-map', '[v]', '-frames:v', '1', '-q:v', '2', out]);
          await client.sendMessage(m.chat, { image: fs.readFileSync(out), caption: `🫥 Area hidden • ${TAG}` }, { quoted: m });
        }
      } catch (e) { m.reply('❌ Failed: ' + e.message); }
      finally { rmDir(dir); }
    }
  },

  // ───────────────────────── .slideshow ──────────────────────
  {
    command: ['slideshow'],
    aliases: ['slides', 'photovideo', 'picvideo'],
    description: 'Make a video from pictures + a song (reply to each with .slideshow, then .slideshow done)',
    category: 'media',
    handler: async (client, m, { text }) => {
      const arg = String(text || '').trim().toLowerCase();
      const q = slideQueues.get(m.sender);
      if (arg === 'clear') { dropSlides(m.sender); return m.reply('🗑️ Slideshow list cleared.'); }
      if (arg === 'list') return m.reply(q ? `🎞️ ${q.images.length} picture(s)${q.audio ? ' + 1 song' : ''} in your slideshow.` : 'Your slideshow is empty.');
      if (/^(done|go|make|start)/.test(arg)) {
        if (!q || q.images.length < 2) return m.reply('⚠️ Add at least 2 pictures first: reply to each with *.slideshow*');
        const per = /fast|quick/.test(arg) ? 1.6 : /slow/.test(arg) ? 5 : 3;
        const [W, H] = /square/.test(arg) ? [720, 720] : /wide|land/.test(arg) ? [1280, 720] : [720, 1280];
        try {
          await m.reply(`🎞️ _Building ${q.images.length} slides... this can take a minute._`);
          const clips = [], F = Math.round(per * 25);
          for (let i = 0; i < q.images.length; i++) {
            const out = path.join(q.dir, `clip${i}.mp4`);
            const fc = `[0:v]split=2[a][b];[a]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},gblur=sigma=30[bg];[b]scale=${W}:${H}:force_original_aspect_ratio=decrease[fg];` +
              `[bg][fg]overlay=(W-w)/2:(H-h)/2,zoompan=z='min(zoom+0.0007,1.12)':d=${F}:s=${W}x${H}:fps=25,fade=t=in:st=0:d=0.4,fade=t=out:st=${(per - 0.4).toFixed(2)}:d=0.4,setsar=1,format=yuv420p[v]`;
            await ff(['-y', '-i', q.images[i], '-filter_complex', fc, '-map', '[v]', '-frames:v', String(F), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '25', '-r', '25', out], 120000);
            clips.push(out);
          }
          const list = path.join(q.dir, 'list.txt');
          fs.writeFileSync(list, clips.map(c => `file '${c.replace(/'/g, "'\\''")}'`).join('\n'));
          const joined = path.join(q.dir, 'joined.mp4');
          await ff(['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', joined]);
          const total = per * clips.length;
          let final = joined;
          if (q.audio) {
            final = path.join(q.dir, 'final.mp4');
            await ff(['-y', '-i', joined, '-stream_loop', '-1', '-i', q.audio, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k',
              '-af', `afade=t=in:d=0.6,afade=t=out:st=${Math.max(0, total - 1.5).toFixed(2)}:d=1.5`, '-t', String(total), '-movflags', 'faststart', final]);
          }
          await client.sendMessage(m.chat, { video: fs.readFileSync(final), mimetype: 'video/mp4', caption: `🎞️ ${clips.length} slides${q.audio ? ' with music' : ''} • ${TAG}` }, { quoted: m });
        } catch (e) { m.reply('❌ Failed: ' + e.message); }
        finally { dropSlides(m.sender); }
        return;
      }
      const t = mediaTarget(m), mime = mimeOf(t);
      if (!t || !/image|audio/.test(mime)) {
        return m.reply(`🎞️ *${BM} Slideshow*\n\n1) Reply to a picture with *.slideshow* (repeat for each, up to 12)\n2) Reply to a song or voice note with *.slideshow* to add music (optional)\n3) Send *.slideshow done*\n\nOptions: *done fast* • *done slow* • *done square* • *done wide*\n(default is a tall status video)\n*.slideshow list* • *.slideshow clear*`);
      }
      try {
        let cur = slideQueues.get(m.sender);
        if (!cur) { cur = { dir: makeDir('slides'), images: [], audio: null, timer: null }; slideQueues.set(m.sender, cur); }
        const buf = await downloadTarget(client, t);
        if (/audio/.test(mime)) {
          const f = path.join(cur.dir, `song.${extFor(mime)}`); fs.writeFileSync(f, buf); cur.audio = f;
        } else {
          if (cur.images.length >= 12) return m.reply('⚠️ Max 12 pictures. Send *.slideshow done* now.');
          const f = path.join(cur.dir, `img${cur.images.length}.${extFor(mime)}`); fs.writeFileSync(f, buf); cur.images.push(f);
        }
        clearTimeout(cur.timer); cur.timer = setTimeout(() => dropSlides(m.sender), 20 * 60 * 1000);
        m.reply(`✅ ${/audio/.test(mime) ? 'Song added' : `Picture ${cur.images.length} added`}. ${cur.images.length} picture(s)${cur.audio ? ' + song' : ''} so far.\nReply to more, or send *.slideshow done*`);
      } catch (e) { m.reply('❌ Failed: ' + e.message); }
    }
  },

  // ───────────────────────── .rules / .setrules ──────────────
  {
    command: ['rules'],
    aliases: ['grouprules'],
    description: 'Show the group rules (admins: .rules set <text>, .rules clear)',
    category: 'group',
    handler: async (client, m, { text, isAdmin, Owner, admin }) => {
      if (!m.isGroup) return m.reply('Use this in a group.');
      const a = String(text || '').trim();
      const sm = a.match(/^(set|add|edit|update)\b\s*([\s\S]*)$/i);
      if (sm || /^clear|remove|delete$/i.test(a)) {
        if (!isAdmin && !Owner) return m.reply(admin || 'Only admins can change the rules.');
        if (!sm) { delete RULES.get()[m.chat]; RULES.save(); return m.reply('🗑️ Group rules removed.'); }
        const body = (sm[2] || quotedText(m)).trim();
        if (!body) return m.reply('Write the rules after the command, or reply to a message that has them:\n*.rules set 1. Respect everyone\n2. No spam\n3. No adult content*');
        if (body.length > 2500) return m.reply('⚠️ Too long (max 2500 characters).');
        RULES.get()[m.chat] = { text: body, by: m.sender, at: Date.now() }; RULES.save();
        return m.reply('✅ Group rules saved. Members can see them with *.rules*');
      }
      const r = RULES.get()[m.chat];
      if (!r) return m.reply(`📜 *${BM}*\nThis group has no rules set yet.\n\nAdmins: *.rules set <your rules>*`);
      let name = '';
      try { name = (await client.groupMetadata(m.chat)).subject; } catch (_) {}
      await client.sendMessage(m.chat, { text: `📜 *${name ? name + ' · ' : ''}GROUP RULES*\n\n${r.text}\n\n_Set by @${num(r.by)} • ${new Date(r.at).toLocaleDateString('en-GB')}_\n${TAG}`, mentions: [r.by] }, { quoted: m });
    }
  },
  {
    command: ['setrules'],
    aliases: ['addrules', 'editrules'],
    description: 'Admins: set the group rules (.setrules <text>)',
    category: 'group',
    handler: async (client, m, { text, isAdmin, Owner, admin }) => {
      if (!m.isGroup) return m.reply('Use this in a group.');
      if (!isAdmin && !Owner) return m.reply(admin || 'Only admins can change the rules.');
      const body = String(text || quotedText(m) || '').trim();
      if (!body) return m.reply('Write the rules after the command, or reply to a message that has them.');
      if (body.length > 2500) return m.reply('⚠️ Too long (max 2500 characters).');
      RULES.get()[m.chat] = { text: body, by: m.sender, at: Date.now() }; RULES.save();
      m.reply('✅ Group rules saved. Members can see them with *.rules*');
    }
  },

  // ───────────────────────── .snapshot ───────────────────────
  {
    command: ['snapshot'],
    aliases: ['groupsnapshot', 'memberlist', 'exportmembers'],
    description: 'Admins: export the group members, admins and details as a file',
    category: 'group',
    handler: async (client, m, { isAdmin, Owner, admin }) => {
      if (!m.isGroup) return m.reply('Use this in a group.');
      if (!isAdmin && !Owner) return m.reply(admin || 'Only admins can use this.');
      try {
        const meta = await client.groupMetadata(m.chat);
        const parts = meta.participants || [];
        const row = (p) => {
          const phone = [p.pn, p.phoneNumber, p.jid, p.id].filter(v => v && String(v).endsWith('@s.whatsapp.net')).map(num)[0] || '';
          return { phone, id: num(p.id), role: p.admin === 'superadmin' ? 'owner' : p.admin ? 'admin' : 'member' };
        };
        const rows = parts.map(row);
        const owners = rows.filter(r => r.role === 'owner').length, admins = rows.filter(r => r.role === 'admin').length;
        const esc = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
        const created = meta.creation ? new Date(meta.creation * 1000).toISOString().slice(0, 10) : '';
        const csv = ['number,role,whatsapp_id'].concat(rows.map(r => [r.phone ? '+' + r.phone : '', r.role, r.id].map(esc).join(','))).join('\n');
        const info = [
          `Group: ${meta.subject}`, `Created: ${created || 'unknown'}`, `Members: ${rows.length} (owner ${owners}, admins ${admins})`,
          meta.desc ? `Description: ${String(meta.desc).slice(0, 300)}` : null, `Exported: ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`
        ].filter(Boolean).join('\n');
        await client.sendMessage(m.chat, { document: Buffer.from('\ufeff' + csv, 'utf8'), mimetype: 'text/csv', fileName: `${meta.subject.replace(/[^\w]+/g, '_').slice(0, 30) || 'group'}_members.csv`, caption: `📸 *${BM} Snapshot*\n\n${info}\n\n_Open the file in Excel or Google Sheets._` }, { quoted: m });
        if (rows.some(r => !r.phone)) await m.reply('ℹ️ Some members hide their phone number behind a WhatsApp ID, so their number column is empty.');
      } catch (e) { m.reply('❌ Failed: ' + e.message); }
    }
  },

  // ───────────────────────── .afk ────────────────────────────
  {
    command: ['afk'],
    aliases: ['away', 'back'],
    description: 'Set yourself away (.afk gym) — people who tag you are told. .afk off to return',
    category: 'group',
    handler: async (client, m, { text, command }) => {
      ensureHooks(client);
      const afk = AFK.get();
      const nums = await aliasesFor(client, m.chat, m.sender);
      const existing = Object.keys(afk).find(k => afk[k].nums.some(n => nums.includes(n)));
      const a = String(text || '').trim();
      if (/^(off|back|stop|end|cancel|remove)$/i.test(a) || String(command || '').toLowerCase() === 'back') {
        if (!existing) return m.reply('You were not AFK.');
        const e = afk[existing]; delete afk[existing]; AFK.save();
        return client.sendMessage(m.chat, { text: `👋 *${BM}*\nWelcome back @${num(m.sender)}! You were away for ${human(Date.now() - e.at)}.`, mentions: [m.sender] }, { quoted: m });
      }
      if (existing) delete afk[existing];
      const reason = a.slice(0, 150);
      afk[nums[0]] = { nums, jid: m.sender, reason, at: Date.now() }; AFK.save();
      await client.sendMessage(m.chat, { text: `😴 *${BM}*\n@${num(m.sender)} is now AFK${reason ? ': ' + reason : ''}\n\n_When someone tags or replies to you, I will tell them. Send any message to come back, or *.afk off*._`, mentions: [m.sender] }, { quoted: m });
    }
  },

  // ───────────────────────── .smute ──────────────────────────
  {
    command: ['smute'],
    aliases: ['softmute', 'silence'],
    description: 'Admins: silently remove a member\'s messages (.smute @user, .smute list)',
    category: 'group',
    handler: async (client, m, { text, isAdmin, isBotAdmin, Owner, admin, botAdmin }) => {
      ensureHooks(client);
      if (!m.isGroup) return m.reply('Use this in a group.');
      if (!isAdmin && !Owner) return m.reply(admin || 'Only admins can use this.');
      const store = SMUTE.get(), list = store[m.chat] || [];
      if (/^list$/i.test(String(text || '').trim())) {
        return client.sendMessage(m.chat, { text: list.length ? `🤐 *${BM} · soft-muted here*\n\n` + list.map((e, i) => `${i + 1}. @${e.nums[0]}`).join('\n') + '\n\n*.sunmute @user* to free someone' : 'Nobody is soft-muted in this group.', mentions: list.map(e => (e.jid || e.nums[0] + '@s.whatsapp.net')) }, { quoted: m });
      }
      const jid = (m.mentionedJid && m.mentionedJid[0]) || (m.quoted && m.quoted.sender) || null;
      if (!jid) return m.reply(`🤐 *${BM} Soft mute*\n\nTag or reply to the person:\n*.smute @user*\n\nTheir new messages are deleted automatically (the bot must be an admin). They are not told, and they stay in the group.\n*.smute list* • *.sunmute @user* • *.sunmute all*`);
      let meta; try { meta = await client.groupMetadata(m.chat); } catch (_) { meta = { participants: [] }; }
      const nums = await aliasesFor(client, m.chat, jid);
      const p = (meta.participants || []).find(x => [x.id, x.pn, x.phoneNumber, x.lid, x.jid].some(v => v && nums.includes(num(v))));
      if (p && p.admin) return m.reply('⚠️ I will not soft-mute an admin.');
      if (client.user && nums.includes(num(client.user.id))) return m.reply('⚠️ I cannot mute myself.');
      if (list.some(e => e.nums.some(n => nums.includes(n)))) return m.reply('That person is already soft-muted.');
      list.push({ nums, jid }); store[m.chat] = list; SMUTE.save();
      await client.sendMessage(m.chat, { text: `🤐 @${num(jid)} is now soft-muted.`, mentions: [jid] }, { quoted: m });
      if (!isBotAdmin) await m.reply(`⚠️ ${botAdmin || 'Make me an admin'}, otherwise I cannot delete their messages.`);
    }
  },
  {
    command: ['sunmute'],
    aliases: ['softunmute', 'unsilence'],
    description: 'Admins: free a soft-muted member (.sunmute @user / .sunmute all)',
    category: 'group',
    handler: async (client, m, { text, isAdmin, Owner, admin }) => {
      if (!m.isGroup) return m.reply('Use this in a group.');
      if (!isAdmin && !Owner) return m.reply(admin || 'Only admins can use this.');
      const store = SMUTE.get(), list = store[m.chat] || [];
      if (!list.length) return m.reply('Nobody is soft-muted in this group.');
      if (/^all$/i.test(String(text || '').trim())) { delete store[m.chat]; SMUTE.save(); return m.reply('✅ Everyone is free to talk again.'); }
      const jid = (m.mentionedJid && m.mentionedJid[0]) || (m.quoted && m.quoted.sender) || null;
      if (!jid) return m.reply('Tag or reply to the person: *.sunmute @user*  (or *.sunmute all*)');
      const nums = await aliasesFor(client, m.chat, jid);
      const keep = list.filter(e => !e.nums.some(n => nums.includes(n)));
      if (keep.length === list.length) return m.reply('That person is not soft-muted.');
      if (keep.length) store[m.chat] = keep; else delete store[m.chat];
      SMUTE.save();
      await client.sendMessage(m.chat, { text: `✅ @${num(jid)} can talk again.`, mentions: [jid] }, { quoted: m });
    }
  }
];
