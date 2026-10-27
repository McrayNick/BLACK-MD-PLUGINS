'use strict';

/**
 * funtools.js  —  new BLACK-MD commands
 *   .poster [theme |] title [| subtitle]   styled poster picture
 *   .summarize                              short summary of a text / article link
 *   .proofread                              fixes spelling & grammar
 *   .blur [1-10]   .greyscale   .invert     picture / video filters
 *   .trivia  .ans <a-d>  .daily  .balance  .leaderboard      quiz + coins game
 *   .coverart <song>                        music cover card
 *   .ppcouple                               matching profile pictures
 *
 * Uses what the bot already has: ffmpeg (found like stickerlite does), jimp, axios, yt-search.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const axios = global.axios || require('axios');

const UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36';
const KEITH_API = process.env.KEITH_API || 'https://apis.keithsite.lol';

// ── shared helpers ───────────────────────────────────────────────────────
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
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const rand = (n) => Math.floor(Math.random() * n);

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
const quotedText = (m) => (m.quoted ? [m.quoted.text, m.quoted.body, m.quoted.caption, m.quoted.msg?.text].find(Boolean) || '' : '');

// ── 1. POSTER ────────────────────────────────────────────────────────────
const THEMES = {
  sunset: [[255, 94, 98], [255, 195, 113]],
  ocean:  [[0, 119, 190], [0, 210, 190]],
  neon:   [[138, 43, 226], [255, 0, 128]],
  forest: [[19, 78, 94], [113, 178, 128]],
  royal:  [[25, 25, 112], [148, 0, 211]],
  fire:   [[200, 30, 20], [255, 160, 0]],
  gold:   [[70, 50, 10], [230, 180, 60]],
  mono:   [[15, 15, 15], [90, 90, 90]]
};

async function makePoster(title, subtitle, themeName) {
  const Jimp = require('jimp');
  const W = 1080, H = 1350;
  const [c1, c2] = THEMES[themeName] || THEMES.neon;
  const img = new Jimp(W, H, 0x000000ff);
  // diagonal gradient
  img.scan(0, 0, W, H, function (x, y, idx) {
    const t = Math.min(1, Math.max(0, (x / W) * 0.35 + (y / H) * 0.65));
    this.bitmap.data[idx] = Math.round(c1[0] + (c2[0] - c1[0]) * t);
    this.bitmap.data[idx + 1] = Math.round(c1[1] + (c2[1] - c1[1]) * t);
    this.bitmap.data[idx + 2] = Math.round(c1[2] + (c2[2] - c1[2]) * t);
    this.bitmap.data[idx + 3] = 255;
  });
  // thin white frame
  const frame = 36, thick = 5;
  img.scan(0, 0, W, H, function (x, y, idx) {
    const inOuter = x >= frame && x < W - frame && y >= frame && y < H - frame;
    const inInner = x >= frame + thick && x < W - frame - thick && y >= frame + thick && y < H - frame - thick;
    if (inOuter && !inInner) { this.bitmap.data[idx] = 255; this.bitmap.data[idx + 1] = 255; this.bitmap.data[idx + 2] = 255; }
  });

  const maxW = W - 220;
  const white = { 128: await Jimp.loadFont(Jimp.FONT_SANS_128_WHITE), 64: await Jimp.loadFont(Jimp.FONT_SANS_64_WHITE), 32: await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE) };
  const black = { 128: await Jimp.loadFont(Jimp.FONT_SANS_128_BLACK), 64: await Jimp.loadFont(Jimp.FONT_SANS_64_BLACK), 32: await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK) };

  // biggest title size that fits in the middle of the poster
  let size = 128;
  for (const s of [128, 64, 32]) { size = s; if (Jimp.measureTextHeight(white[s], title, maxW) <= 620) break; }
  const th = Jimp.measureTextHeight(white[size], title, maxW);
  const subH = subtitle ? Jimp.measureTextHeight(white[32], subtitle, maxW) + 50 : 0;
  const y = Math.round((H - th - subH) / 2);
  const opts = (t) => ({ text: t, alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER });
  img.print(black[size], 110 + 5, y + 5, opts(title), maxW);   // soft shadow
  img.print(white[size], 110, y, opts(title), maxW);
  if (subtitle) {
    img.print(black[32], 110 + 2, y + th + 50 + 2, opts(subtitle), maxW);
    img.print(white[32], 110, y + th + 50, opts(subtitle), maxW);
  }
  img.print(white[32], 0, H - 120, { text: 'BLACK-MD', alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER }, W);
  return img.getBufferAsync(Jimp.MIME_PNG);
}

// ── 2. AI text (summarize / proofread) ───────────────────────────────────
function pullText(d) {
  if (d == null) return '';
  if (typeof d === 'string') return d.trim();
  for (const k of ['result', 'response', 'message', 'answer', 'data', 'text', 'output', 'content', 'reply']) {
    const v = d[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (v && typeof v === 'object') { const inner = pullText(v); if (inner) return inner; }
  }
  return '';
}

async function askAI(prompt, api) {
  const errors = [];
  const bases = [...new Set([api, KEITH_API].filter(Boolean))];
  const sources = [];
  for (const b of bases) {
    sources.push([`${b}/ai/gpt`, (p) => `${b}/ai/gpt?q=${encodeURIComponent(p)}`]);
    sources.push([`${b}/ai/gemini`, (p) => `${b}/ai/gemini?q=${encodeURIComponent(p)}`]);
  }
  sources.push(['pollinations', (p) => `https://text.pollinations.ai/${encodeURIComponent(p)}`]);
  for (const [name, mk] of sources) {
    try {
      const r = await axios.get(mk(prompt.slice(0, 6000)), { timeout: 60000, headers: { 'User-Agent': UA }, responseType: 'text', transformResponse: [(x) => x] });
      let body = r.data;
      try { body = JSON.parse(body); } catch (_) {}
      const out = pullText(body);
      if (out && out.length > 1 && !/^<!doctype|^<html/i.test(out)) return out;
      errors.push(`${name}: empty reply`);
    } catch (e) {
      errors.push(`${name}: ${String(e.response?.status ? 'HTTP ' + e.response.status : e.message).slice(0, 40)}`);
    }
  }
  const err = new Error('no AI source answered'); err.sources = errors; throw err;
}

// plain-text version of a web page (for "summarize <link>")
async function pageText(url) {
  const r = await axios.get(url, { timeout: 25000, headers: { 'User-Agent': UA }, maxContentLength: 3 * 1024 * 1024 });
  let html = String(r.data || '');
  html = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, ' ');
  const paras = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map(x => x[1].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#?\w+;/g, ' ').replace(/\s+/g, ' ').trim()).filter(t => t.length > 40);
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '';
  return (title.trim() + '\n' + paras.join('\n')).slice(0, 8000);
}

// ── 3. FILTERS (ffmpeg) ──────────────────────────────────────────────────
async function applyFilter(client, m, vf, label) {
  const t = mediaTarget(m);
  const mime = mimeOf(t);
  if (!t || !/image|video|webp/.test(mime)) return m.reply(`🎨 Reply to a picture or video with *${label}*`);
  const dir = makeDir('flt');
  try {
    await m.reply('🎨 _Applying filter..._');
    const buf = await downloadTarget(client, t);
    if (/webp/.test(mime) && buf.includes('ANIM')) return m.reply('⚠️ Animated stickers aren\'t supported. Use a picture or video.');
    const ext = /video/.test(mime) ? 'mp4' : /webp/.test(mime) ? 'webp' : /png/.test(mime) ? 'png' : 'jpg';
    const inFile = path.join(dir, `in.${ext}`);
    fs.writeFileSync(inFile, buf);
    if (/video/.test(mime)) {
      const out = path.join(dir, 'out.mp4');
      const enc = ['-vf', `${vf},scale=trunc(iw/2)*2:trunc(ih/2)*2`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26', '-pix_fmt', 'yuv420p', '-movflags', 'faststart'];
      try { await ff(['-y', '-i', inFile, ...enc, '-c:a', 'copy', out], 180000); }
      catch (_) { await ff(['-y', '-i', inFile, ...enc, '-an', out], 180000); }
      await client.sendMessage(m.chat, { video: fs.readFileSync(out), mimetype: 'video/mp4', caption: `🎨 ${label.replace('.', '')}` }, { quoted: m });
    } else {
      const out = path.join(dir, 'out.jpg');
      await ff(['-y', '-i', inFile, '-frames:v', '1', '-vf', vf, '-q:v', '2', out]);
      await client.sendMessage(m.chat, { image: fs.readFileSync(out), caption: `🎨 ${label.replace('.', '')}` }, { quoted: m });
    }
  } catch (e) { m.reply('❌ Failed: ' + e.message); }
  finally { rmDir(dir); }
}

// ── 4. GAMES: coins, daily, trivia ───────────────────────────────────────
const DATA_FILE = path.join(process.cwd(), 'games_data.json');
let DB = null;
function loadDB() {
  if (DB) return DB;
  try { DB = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch (_) { DB = { users: {} }; }
  if (!DB.users) DB.users = {};
  return DB;
}
function saveDB() { try { fs.writeFileSync(DATA_FILE, JSON.stringify(DB)); } catch (_) {} }
function userOf(jid, name) {
  const db = loadDB();
  const u = db.users[jid] || (db.users[jid] = { coins: 0, streak: 0, lastDaily: 0, wins: 0, name: '' });
  if (name) u.name = name;
  return u;
}
const num = (jid) => String(jid || '').split('@')[0].split(':')[0];
const fmt = (n) => Number(n).toLocaleString('en-US');
const left = (ms) => { const tot = Math.ceil(ms / 60000), h = Math.floor(tot / 60), mi = tot % 60; return h ? `${h}h ${mi}m` : `${mi}m`; };

// offline question bank (used when the online quiz source is not reachable)
const BANK = [
  ['What is the capital city of Kenya?', 'Nairobi', ['Mombasa', 'Kisumu', 'Nakuru'], 'easy'],
  ['Which is the highest mountain in Kenya?', 'Mount Kenya', ['Mount Elgon', 'Mount Longonot', 'Kilimanjaro'], 'easy'],
  ['Which lake is the largest in Africa?', 'Lake Victoria', ['Lake Turkana', 'Lake Tanganyika', 'Lake Nakuru'], 'easy'],
  ['In which year did Kenya gain independence?', '1963', ['1960', '1957', '1969'], 'easy'],
  ['Who was the first President of Kenya?', 'Jomo Kenyatta', ['Daniel arap Moi', 'Mwai Kibaki', 'Tom Mboya'], 'easy'],
  ['Which Kenyan won the 2004 Nobel Peace Prize?', 'Wangari Maathai', ['Lupita Nyong\'o', 'Eliud Kipchoge', 'Grace Ogot'], 'medium'],
  ['What is the currency of Kenya?', 'Kenyan Shilling', ['Rand', 'Birr', 'Naira'], 'easy'],
  ['Which animal is NOT one of the "Big Five"?', 'Giraffe', ['Lion', 'Leopard', 'Rhinoceros'], 'medium'],
  ['Which Kenyan marathoner ran a marathon in under 2 hours (INEOS 1:59 Challenge)?', 'Eliud Kipchoge', ['David Rudisha', 'Kipchoge Keino', 'Paul Tergat'], 'medium'],
  ['Which ocean borders Kenya?', 'Indian Ocean', ['Atlantic Ocean', 'Pacific Ocean', 'Arctic Ocean'], 'easy'],
  ['What is the largest planet in our solar system?', 'Jupiter', ['Saturn', 'Earth', 'Neptune'], 'easy'],
  ['How many continents are there?', '7', ['5', '6', '8'], 'easy'],
  ['What is H2O commonly known as?', 'Water', ['Salt', 'Oxygen', 'Hydrogen'], 'easy'],
  ['Which planet is known as the Red Planet?', 'Mars', ['Venus', 'Mercury', 'Jupiter'], 'easy'],
  ['Who wrote "Weep Not, Child"?', 'Ngũgĩ wa Thiong\'o', ['Chinua Achebe', 'Wole Soyinka', 'Meja Mwangi'], 'medium'],
  ['What is the longest river in Africa?', 'Nile', ['Congo', 'Niger', 'Zambezi'], 'easy'],
  ['Which country won the 2022 FIFA World Cup?', 'Argentina', ['France', 'Brazil', 'Croatia'], 'easy'],
  ['What is the chemical symbol for gold?', 'Au', ['Ag', 'Gd', 'Go'], 'medium'],
  ['How many players are on a football (soccer) team on the pitch?', '11', ['9', '10', '12'], 'easy'],
  ['What does "HTTP" stand for?', 'HyperText Transfer Protocol', ['High Transfer Text Process', 'Host Terminal Transfer Page', 'HyperText Terminal Protocol'], 'medium'],
  ['Which is the smallest prime number?', '2', ['0', '1', '3'], 'medium'],
  ['Which Kenyan city is known as the "Gateway to Western Kenya"?', 'Kisumu', ['Eldoret', 'Kakamega', 'Nakuru'], 'hard'],
  ['The Great Rift Valley passes through which country?', 'Kenya', ['Nigeria', 'Ghana', 'Egypt'], 'easy'],
  ['What is the national language of Kenya, with English as official?', 'Kiswahili', ['Kikuyu', 'Luo', 'Somali'], 'easy'],
  ['Which Kenyan athlete holds a world record in the 800 m (1:40.91)?', 'David Rudisha', ['Asbel Kiprop', 'Conseslus Kipruto', 'Julius Yego'], 'hard'],
  ['What is the speed of light (approx.)?', '300,000 km/s', ['150,000 km/s', '30,000 km/s', '3,000 km/s'], 'hard'],
  ['Which mobile money service was launched in Kenya in 2007?', 'M-Pesa', ['Airtel Money', 'T-Kash', 'PayPal'], 'easy'],
  ['What is the capital of Tanzania (official)?', 'Dodoma', ['Dar es Salaam', 'Arusha', 'Zanzibar'], 'hard'],
  ['Which gas do plants absorb from the air?', 'Carbon dioxide', ['Oxygen', 'Nitrogen', 'Helium'], 'easy'],
  ['How many days are in a leap year?', '366', ['365', '364', '367'], 'easy']
];
const REWARD = { easy: 50, medium: 75, hard: 100 };
const LETTERS = ['A', 'B', 'C', 'D'];
const active = {}; // chat -> { q, options, answerIdx, reward, tried:Set, timer }

const shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };

async function nextQuestion() {
  try { // online quiz source (free, no key)
    const r = await axios.get('https://opentdb.com/api.php?amount=1&type=multiple&encode=url3986', { timeout: 12000 });
    const x = r.data?.results?.[0];
    if (x) {
      const d = (s) => decodeURIComponent(s);
      return { q: d(x.question), correct: d(x.correct_answer), wrong: x.incorrect_answers.map(d), diff: x.difficulty || 'medium', cat: d(x.category) };
    }
  } catch (_) {}
  const [q, correct, wrong, diff] = BANK[rand(BANK.length)];
  return { q, correct, wrong, diff, cat: 'General' };
}

// ── 5. COVER ART ─────────────────────────────────────────────────────────
async function makeCoverArt(thumbBuf, title, artist) {
  const Jimp = require('jimp');
  const S = 1080;
  const src = await Jimp.read(thumbBuf);
  const bg = src.clone().cover(S, S).blur(35).brightness(-0.35);
  const artSize = 700;
  const art = src.clone().cover(artSize, artSize);
  const frame = new Jimp(artSize + 16, artSize + 16, 0xffffffff);
  const x = Math.round((S - artSize) / 2), y = 90;
  bg.composite(frame, x - 8, y - 8);
  bg.composite(art, x, y);
  const f64 = await Jimp.loadFont(Jimp.FONT_SANS_64_WHITE);
  const f32 = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
  const t = title.slice(0, 90);
  const big = Jimp.measureTextHeight(f64, t, S - 120) <= 80; // one line at the big size?
  const tFont = big ? f64 : f32;
  const tH = Jimp.measureTextHeight(tFont, t, S - 120);
  bg.print(tFont, 60, y + artSize + 45, { text: t, alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER }, S - 120);
  bg.print(f32, 60, y + artSize + 45 + tH + 25, { text: artist.slice(0, 60), alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER }, S - 120);
  bg.print(f32, 0, S - 70, { text: 'BLACK-MD', alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER }, S);
  return bg.getBufferAsync(Jimp.MIME_PNG);
}

// ── 6. COUPLE PROFILE PICTURES ───────────────────────────────────────────
function findPair(d) {
  // accepts {male, female}, {data:{male,female}}, [{male,female}, ...], [url, url]
  if (!d) return null;
  if (Array.isArray(d)) {
    if (d.length === 2 && typeof d[0] === 'string' && typeof d[1] === 'string') return { male: d[0], female: d[1] };
    if (d.length) return findPair(d[rand(d.length)]);
    return null;
  }
  if (typeof d === 'object') {
    const keys = Object.keys(d);
    const mk = keys.find(k => /^(male|cowo|boy|him|man)$/i.test(k)), fk = keys.find(k => /^(female|cewe|girl|her|woman)$/i.test(k));
    if (mk && fk && typeof d[mk] === 'string' && typeof d[fk] === 'string') return { male: d[mk], female: d[fk] };
    for (const k of ['result', 'data', 'results', 'response']) { const p = findPair(d[k]); if (p) return p; }
  }
  return null;
}

async function couplePair(api) {
  const errors = [];
  const sources = [
    ['api', () => axios.get(`${api || KEITH_API}/random/ppcouple`, { timeout: 15000 }).then(r => r.data)],
    ['keith', () => axios.get(`${KEITH_API}/random/ppcouple`, { timeout: 15000 }).then(r => r.data)],
    ['siputzx', () => axios.get('https://api.siputzx.my.id/api/r/ppcouple', { timeout: 15000 }).then(r => r.data)],
    ['github list', () => axios.get('https://raw.githubusercontent.com/KazukoGans/database/main/anime/ppcouple.json', { timeout: 15000 }).then(r => r.data)],
    ['local file', async () => JSON.parse(fs.readFileSync(path.join(process.cwd(), 'media', 'ppcouple.json'), 'utf8'))]
  ];
  for (const [name, get] of sources) {
    try {
      const pair = findPair(await get());
      if (pair) return pair;
      errors.push(`${name}: no pair in reply`);
    } catch (e) { errors.push(`${name}: ${String(e.response?.status ? 'HTTP ' + e.response.status : e.message).slice(0, 30)}`); }
  }
  const err = new Error('no couple picture source worked'); err.sources = errors; throw err;
}

// ── commands ─────────────────────────────────────────────────────────────
module.exports = [
  {
    command: ['poster'],
    aliases: ['makeposter'],
    description: 'Make a styled poster from text (.poster title | subtitle, or .poster sunset | title | subtitle)',
    category: 'media',
    handler: async (client, m, { text }) => {
      let raw = (text || quotedText(m) || '').trim();
      if (!raw) return m.reply('🖼️ *Poster maker*\n\n.poster Grand Opening | Saturday 10am\n.poster sunset | Happy Birthday | Wishing you the best!\n\nThemes: ' + Object.keys(THEMES).join(', '));
      let parts = raw.split('|').map(s => s.trim()).filter(Boolean);
      let theme = Object.keys(THEMES)[rand(Object.keys(THEMES).length)];
      if (parts.length > 1 && THEMES[parts[0].toLowerCase()]) theme = parts.shift().toLowerCase();
      const title = (parts[0] || '').slice(0, 160), subtitle = (parts[1] || '').slice(0, 200);
      if (!title) return m.reply('❌ Give me a title: .poster Your title | subtitle');
      try {
        await m.reply('🖼️ _Designing your poster..._');
        const png = await makePoster(title, subtitle, theme);
        await client.sendMessage(m.chat, { image: png, caption: `🖼️ Poster • theme *${theme}*` }, { quoted: m });
      } catch (e) { m.reply('❌ Could not make the poster: ' + e.message); }
    }
  },

  {
    command: ['summarize'],
    aliases: ['summarise', 'summary', 'tldr'],
    description: 'Summarize a text or an article link (reply to it or add it after the command)',
    category: 'ai',
    handler: async (client, m, { text, api }) => {
      let input = (text || '').trim() || quotedText(m).trim();
      if (!input) return m.reply('📝 Reply to a long message (or send *.summarize <text or link>*) and I\'ll give you the short version.');
      try {
        await m.reply('📝 _Summarizing..._');
        const link = (input.match(/https?:\/\/\S+/) || [])[0];
        let body = input;
        if (link && input.replace(link, '').trim().length < 200) {
          try { body = await pageText(link); } catch (e) { return m.reply('❌ Could not open that link: ' + String(e.message).slice(0, 60)); }
          if (body.length < 120) return m.reply('❌ I could not find readable text on that page.');
        }
        const out = await askAI('Summarize the following in the same language it is written in. Use at most 6 short bullet points starting with "•". Reply with the summary only.\n\n' + body, api);
        await client.sendMessage(m.chat, { text: `📝 *Summary*\n\n${out}` }, { quoted: m });
      } catch (e) { m.reply('❌ Could not summarize.' + (e.sources ? '\n\n🔎 Sources tried:\n' + e.sources.join('\n') : ' ' + e.message)); }
    }
  },

  {
    command: ['proofread'],
    aliases: ['fixgrammar', 'grammar', 'correct'],
    description: 'Fix spelling and grammar of a text',
    category: 'ai',
    handler: async (client, m, { text, api }) => {
      const input = (text || '').trim() || quotedText(m).trim();
      if (!input) return m.reply('✍️ Reply to a message (or send *.proofread <text>*) and I\'ll fix the spelling and grammar.');
      try {
        await m.reply('✍️ _Proofreading..._');
        const out = await askAI('Correct the spelling, grammar and punctuation of the following text. Keep the same language, meaning and tone. Reply with ONLY the corrected text, nothing else.\n\n' + input, api);
        await client.sendMessage(m.chat, { text: `✍️ *Proofread*\n\n${out}` }, { quoted: m });
      } catch (e) { m.reply('❌ Could not proofread.' + (e.sources ? '\n\n🔎 Sources tried:\n' + e.sources.join('\n') : ' ' + e.message)); }
    }
  },

  {
    command: ['blur'],
    aliases: ['blurry'],
    description: 'Blur a picture or video (.blur 1-10)',
    category: 'media',
    handler: async (client, m, { text }) => {
      let lvl = parseInt(text, 10);
      if (!lvl || isNaN(lvl)) lvl = 5;
      lvl = Math.min(10, Math.max(1, lvl));
      return applyFilter(client, m, `boxblur=luma_radius=min(w\\,h)/60*${lvl}:luma_power=2`, '.blur');
    }
  },

  {
    command: ['greyscale'],
    aliases: ['grayscale', 'bw', 'blackwhite'],
    description: 'Make a picture or video black & white',
    category: 'media',
    handler: async (client, m) => applyFilter(client, m, 'hue=s=0', '.greyscale')
  },

  {
    command: ['invert'],
    aliases: ['negative'],
    description: 'Invert the colours of a picture or video',
    category: 'media',
    handler: async (client, m) => applyFilter(client, m, 'negate', '.invert')
  },

  {
    command: ['daily'],
    aliases: ['claim', 'dailyreward'],
    description: 'Claim your daily coins (streak bonus)',
    category: 'games',
    handler: async (client, m, { pushname }) => {
      const u = userOf(m.sender, pushname);
      const now = Date.now(), DAY = 24 * 3600 * 1000;
      if (now - u.lastDaily < DAY) return m.reply(`⏳ Already claimed. Come back in *${left(DAY - (now - u.lastDaily))}*.\n💰 Balance: ${fmt(u.coins)}`);
      u.streak = (u.lastDaily && now - u.lastDaily < 2 * DAY) ? u.streak + 1 : 1;
      const reward = 100 + Math.min(u.streak - 1, 7) * 25 + rand(51);
      u.coins += reward; u.lastDaily = now; saveDB();
      m.reply(`🎁 *Daily reward*\n\n+${fmt(reward)} coins\n🔥 Streak: ${u.streak} day${u.streak === 1 ? '' : 's'}\n💰 Balance: ${fmt(u.coins)}\n\n_Claim every day for a bigger bonus (up to day 8)._`);
    }
  },

  {
    command: ['balance'],
    aliases: ['bal', 'coins', 'wallet'],
    description: 'Show your coins',
    category: 'games',
    handler: async (client, m, { pushname }) => {
      const u = userOf(m.sender, pushname); saveDB();
      m.reply(`💰 *${pushname || num(m.sender)}*\n\nCoins: ${fmt(u.coins)}\nTrivia wins: ${u.wins}\nDaily streak: ${u.streak}`);
    }
  },

  {
    command: ['leaderboard'],
    aliases: ['lb', 'top', 'richest'],
    description: 'Top coin holders',
    category: 'games',
    handler: async (client, m) => {
      const db = loadDB();
      let ids = Object.keys(db.users);
      if (m.isGroup) {
        try { const meta = await client.groupMetadata(m.chat); const inGroup = new Set(meta.participants.flatMap(p => [p.id, p.pn].filter(Boolean))); ids = ids.filter(i => inGroup.has(i)); } catch (_) {}
      }
      const top = ids.map(i => [i, db.users[i]]).filter(([, u]) => u.coins > 0).sort((a, b) => b[1].coins - a[1].coins).slice(0, 10);
      if (!top.length) return m.reply('🏆 Nobody has coins yet. Use *.daily* or win a *.trivia* round!');
      const medals = ['🥇', '🥈', '🥉'];
      const lines = top.map(([id, u], i) => `${medals[i] || '🔹'} ${i + 1}. @${num(id)} — *${fmt(u.coins)}* 💰`);
      await client.sendMessage(m.chat, { text: `🏆 *LEADERBOARD*\n\n${lines.join('\n')}`, mentions: top.map(([id]) => id) }, { quoted: m });
    }
  },

  {
    command: ['trivia'],
    aliases: ['quiz'],
    description: 'Start a trivia question (answer with .ans a/b/c/d)',
    category: 'games',
    handler: async (client, m) => {
      const chat = m.chat;
      if (active[chat]) {
        const a = active[chat];
        return m.reply(`❓ A question is already running:\n\n${a.text}\n\nAnswer with *.ans a/b/c/d*`);
      }
      try {
        const x = await nextQuestion();
        const opts = shuffle([x.correct, ...x.wrong]).slice(0, 4);
        const answerIdx = opts.indexOf(x.correct);
        const reward = REWARD[x.diff] || 60;
        const text = `🧠 *TRIVIA* (${x.diff}, +${reward} 💰)\n_${x.cat}_\n\n*${x.q}*\n\n` + opts.map((o, i) => `${LETTERS[i]}) ${o}`).join('\n');
        const state = { text, opts, answerIdx, reward, tried: new Set(), timer: null };
        active[chat] = state;
        state.timer = setTimeout(() => {
          if (active[chat] !== state) return;
          delete active[chat];
          client.sendMessage(chat, { text: `⌛ *Time's up!* Nobody got it.\nAnswer: *${LETTERS[answerIdx]}) ${opts[answerIdx]}*` }).catch(() => {});
        }, 45000);
        await client.sendMessage(chat, { text: text + '\n\n⏱️ 45 seconds • reply with *.ans a* (one try each)' }, { quoted: m });
      } catch (e) { m.reply('❌ Could not start trivia: ' + e.message); }
    }
  },

  {
    command: ['ans'],
    aliases: ['answer'],
    description: 'Answer the running trivia question',
    category: 'games',
    handler: async (client, m, { text, pushname }) => {
      const a = active[m.chat];
      if (!a) return m.reply('No question running. Start one with *.trivia*');
      const pick = LETTERS.indexOf(String(text || '').trim().toUpperCase().charAt(0));
      if (pick < 0 || pick >= a.opts.length) return m.reply('Answer with a letter: *.ans a*, *b*, *c* or *d*');
      if (a.tried.has(m.sender)) return m.reply('You already used your try on this question 😅');
      a.tried.add(m.sender);
      if (pick !== a.answerIdx) return m.reply('❌ Wrong! (that was your one try)');
      clearTimeout(a.timer); delete active[m.chat];
      const u = userOf(m.sender, pushname); u.coins += a.reward; u.wins += 1; saveDB();
      await client.sendMessage(m.chat, {
        text: `✅ *Correct!* @${num(m.sender)} wins *+${a.reward}* 💰\nAnswer: *${LETTERS[a.answerIdx]}) ${a.opts[a.answerIdx]}*\n💰 Balance: ${fmt(u.coins)}`,
        mentions: [m.sender]
      }, { quoted: m });
    }
  },

  {
    command: ['coverart'],
    aliases: ['musiccard', 'songcard'],
    description: 'Make a music cover card for a song (.coverart <song name>)',
    category: 'media',
    handler: async (client, m, ctx) => {
      let query = (ctx.text || quotedText(m) || '').trim();
      // ".coverart -c <song>" = card only, without the song
      const cardOnly = /^-c\b/i.test(query);
      if (cardOnly) query = query.replace(/^-c\b\s*/i, '');
      if (!query) return m.reply('🎵 Send a song name: *.coverart Hold my hand Bridget Blue*\n_(add -c for the card only: .coverart -c <song>)_');
      try {
        await m.reply('🎵 _Creating cover art..._');
        const yts = require('yt-search');
        const res = await yts(query);
        const v = (res.videos || [])[0];
        if (!v) return m.reply('❌ Could not find that song.');
        const thumbUrl = v.image || v.thumbnail;
        const r = await axios.get(thumbUrl, { responseType: 'arraybuffer', timeout: 20000, headers: { 'User-Agent': UA } });
        const title = String(v.title).replace(/\s*[\(\[].*?(official|video|audio|lyrics|mv|hd).*?[\)\]]/gi, '').trim() || v.title;
        const png = await makeCoverArt(Buffer.from(r.data), title, v.author?.name || 'Unknown artist');
        await client.sendMessage(m.chat, { image: png, caption: `🎵 *${title}*\n👤 ${v.author?.name || ''}\n⏱️ ${v.timestamp || ''}` }, { quoted: m });
      } catch (e) { return m.reply('❌ Could not make the cover art: ' + e.message); }

      // then send the song itself, using the bot's own .play (the same verified download as always)
      if (!cardOnly) {
        try {
          const play = require('./downloads').find(c => (c.command || []).includes('play'));
          if (!play) throw new Error('.play not found');
          await play.handler(client, m, { ...ctx, text: query });
        } catch (e) { m.reply('⚠️ Cover card sent, but I could not fetch the song: ' + String(e.message).slice(0, 80) + '\nTry *.play ' + query + '*'); }
      }
    }
  },

  {
    command: ['ppcouple'],
    aliases: ['couplepp', 'ppcp', 'couple'],
    description: 'Get matching profile pictures for two people',
    category: 'media',
    handler: async (client, m, { api }) => {
      try {
        await m.reply('💞 _Finding a matching pair..._');
        const pair = await couplePair(api);
        await client.sendMessage(m.chat, { image: { url: pair.male }, caption: '👦 For him' }, { quoted: m });
        await sleep(600);
        await client.sendMessage(m.chat, { image: { url: pair.female }, caption: '👧 For her' }, { quoted: m });
      } catch (e) { m.reply('❌ Could not get a couple picture.' + (e.sources ? '\n\n🔎 Sources tried:\n' + e.sources.join('\n') : ' ' + e.message)); }
    }
  }
];
