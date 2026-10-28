'use strict';

/**
 * toolkit2.js  —  BLACK-MD plugin, batch 2
 *   .stitch  .compress  .crop  .sketch                      pictures / video
 *   .pitch  .volume  .denoise                               audio (video in -> video out)
 *   .logo  .banner                                          futuristic images
 *   .remind  .reminders  .unremind                          reminders with a tagged pop-up
 *   .roast  .caption  .hashtags  .mockup  .cv               writing helpers
 *   .linkcheck  .exif  .base64  .encrypt  .decrypt          safety / tools
 *   .fuel  .fuelset  .time                                  info
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const axios = global.axios || require('axios');

const BM = '𝐁𝐋𝐀𝐂𝐊-𝐌𝐃';                       // bold serif brand mark for text replies
const UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36';
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
const pickOne = (a) => a[Math.floor(Math.random() * a.length)];
const kb = (n) => n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.round(n / 1024) + ' KB';

let LAST = null;                                   // last client we saw (reminders need it)
const grab = (client) => { if (client) LAST = client; };

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
  const buf = await downloadTarget(client, t);
  return { t, mime, buf };
}

// short plain-text AI call (best effort; returns null when unavailable)
async function askAI(prompt) {
  try {
    const r = await axios.get('https://text.pollinations.ai/' + encodeURIComponent(prompt), {
      timeout: 18000, headers: { 'User-Agent': UA }, responseType: 'text', transformResponse: [x => x]
    });
    const s = String(r.data || '').trim();
    if (s.length < 15 || s.length > 4000 || /^<|^\{/.test(s) || /rate limit|error/i.test(s.slice(0, 60))) return null;
    return s;
  } catch (_) { return null; }
}

// ═════════════════════════ text → transparent PNG (Jimp) ═════════════════
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

// ═════════════════════════ futuristic image (logo / banner) ══════════════
const THEMES = {
  cyan:    { c: [0, 229, 255],   bg: [6, 10, 28],  bg2: [20, 8, 60] },
  magenta: { c: [255, 46, 200],  bg: [18, 4, 28],  bg2: [50, 6, 70] },
  green:   { c: [57, 255, 120],  bg: [2, 14, 10],  bg2: [4, 40, 30] },
  gold:    { c: [255, 196, 46],  bg: [14, 10, 4],  bg2: [50, 30, 6] },
  red:     { c: [255, 60, 70],   bg: [16, 4, 6],   bg2: [60, 8, 14] },
  blue:    { c: [70, 140, 255],  bg: [4, 8, 24],   bg2: [10, 30, 90] }
};
const hexOf = (c) => '0x' + c.map(v => v.toString(16).padStart(2, '0')).join('');

async function futuristicImage(dir, { w, h, name, tagline, theme, nameSizes }) {
  const T = THEMES[theme] || THEMES.cyan;
  const nameL = await textLayer(name, Math.round(w * 0.86), nameSizes, Math.round(h * 0.6));
  const tagL = tagline ? await textLayer(tagline, Math.round(w * 0.8), [32], Math.round(h * 0.25)) : null;
  const nameF = path.join(dir, 'name.png'); fs.writeFileSync(nameF, nameL.png);
  const inputs = ['-f', 'lavfi', '-i', `color=c=black:s=${w}x${h}:d=1`, '-i', nameF];
  let tagF = null;
  if (tagL) { tagF = path.join(dir, 'tag.png'); fs.writeFileSync(tagF, tagL.png); inputs.push('-i', tagF); }
  const gap = tagL ? 14 : 0;
  const blockH = nameL.h + gap + (tagL ? tagL.h : 0);
  const ny = Math.round((h - blockH) / 2), ty = ny + nameL.h + gap;
  const col = hexOf(T.c);
  const [cr, cg, cb] = T.c.map(v => (v / 255).toFixed(3));
  const tint = `colorchannelmixer=rr=${cr}:rg=0:rb=0:gr=0:gg=${cg}:gb=0:br=0:bg=0:bb=${cb}`;
  const bw = Math.round(Math.min(w, h) * 0.07), th = Math.max(3, Math.round(h * 0.008));
  const m = Math.round(Math.min(w, h) * 0.07);
  let fc =
    `[0:v]format=gbrp,geq=r='${T.bg[0]}+(${T.bg2[0] - T.bg[0]})*X/W':g='${T.bg[1]}+(${T.bg2[1] - T.bg[1]})*X/W':b='${T.bg[2]}+(${T.bg2[2] - T.bg[2]})*(1-Y/H)',` +
    `drawgrid=w=${Math.round(h / 8)}:h=${Math.round(h / 8)}:t=1:c=${col}@0.07,vignette=PI/4,format=rgba[bg];` +
    `[1:v]format=rgba,split=3[n1][n2][n3];[n1]gblur=sigma=${Math.round(h / 28)},${tint}[g1];[n2]gblur=sigma=${Math.round(h / 90)},${tint}[g2];` +
    `[bg][g1]overlay=x=(W-w)/2:y=${ny}[a1];[a1][g2]overlay=x=(W-w)/2:y=${ny}[a2];[a2][n3]overlay=x=(W-w)/2:y=${ny}[a3]`;
  let last = 'a3';
  if (tagL) { fc += `;[${last}][2:v]overlay=x=(W-w)/2:y=${ty}[a4]`; last = 'a4'; }
  // corner brackets + a glowing rule
  const boxes = [
    [m, m, bw, th], [m, m, th, bw], [w - m - bw, m, bw, th], [w - m - th, m, th, bw],
    [m, h - m - th, bw, th], [m, h - m - bw, th, bw], [w - m - bw, h - m - th, bw, th], [w - m - th, h - m - bw, th, bw]
  ].map(([x, y, bwid, bh]) => `drawbox=x=${x}:y=${y}:w=${bwid}:h=${bh}:color=${col}@0.95:t=fill`).join(',');
  fc += `;[${last}]${boxes},format=yuv420p[v]`;
  const out = path.join(dir, 'img.png');
  await ff(['-y', ...inputs, '-filter_complex', fc, '-map', '[v]', '-frames:v', '1', out], 60000);
  return fs.readFileSync(out);
}
function parseThemeWord(parts) {
  let theme = 'cyan';
  const keep = parts.filter(p => { const k = p.trim().toLowerCase(); if (THEMES[k]) { theme = k; return false; } return true; });
  return { theme, rest: keep };
}

// ═════════════════════════ reminders ═════════════════════════════════════
const REM_FILE = path.join(process.cwd(), 'reminders_data.json');
let REM = null;
function loadRem() {
  if (REM) return REM;
  try { REM = JSON.parse(fs.readFileSync(REM_FILE, 'utf8')); } catch (_) { REM = { id: 0, list: [] }; }
  REM.list = REM.list || [];
  return REM;
}
const saveRem = () => { try { fs.writeFileSync(REM_FILE, JSON.stringify(REM)); } catch (_) {} };
const NAIROBI = 3 * 3600 * 1000;

function parseWhen(s) {
  s = String(s || '').trim();
  let m = s.match(/^((?:\d+\s*[dhms]\s*)+)([\s\S]*)$/i);
  if (m) {
    let ms = 0;
    for (const p of m[1].matchAll(/(\d+)\s*([dhms])/gi)) ms += Number(p[1]) * ({ d: 86400, h: 3600, m: 60, s: 1 }[p[2].toLowerCase()]) * 1000;
    return { at: Date.now() + ms, text: m[2].trim(), ms };
  }
  m = s.match(/^(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s+([\s\S]*)$/i);
  if (m && (/^at\s/i.test(s) || m[2] || m[3])) {
    let hh = Number(m[1]); const mm = Number(m[2] || 0);
    if (m[3]) { const pm = m[3].toLowerCase() === 'pm'; if (hh === 12) hh = pm ? 12 : 0; else if (pm) hh += 12; }
    if (hh > 23 || mm > 59) return null;
    const n = new Date(Date.now() + NAIROBI);
    let t = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate(), hh, mm) - NAIROBI;
    if (t <= Date.now() + 5000) t += 86400000;
    return { at: t, text: m[4].trim(), ms: t - Date.now() };
  }
  return null;
}

// full reminder input: "<when> <text> [| song name | alarm | silent]"  (the time can also be at the END)
function parseReminder(raw) {
  raw = String(raw || '').trim();
  let body = raw, tone = null;
  const bar = raw.indexOf('|');
  if (bar >= 0) {
    body = raw.slice(0, bar).trim();
    const opt = raw.slice(bar + 1).trim();
    if (/^(silent|none|off|quiet|mute)$/i.test(opt)) tone = { type: 'none' };
    else if (/^(alarm|alert|beep|default)$/i.test(opt)) tone = { type: 'alarm' };
    else if (opt) { const sm = opt.match(/^(?:song|play|music|tone)\b\s*:?\s*([\s\S]+)$/i); tone = { type: 'song', query: (sm ? sm[1] : opt).trim().slice(0, 100) }; }
  }
  let w = parseWhen(body);
  if (!w) {
    let t = body.match(/^([\s\S]+?)\s+(?:at\s+|@\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
    if (t) w = parseWhen(`at ${t[2]}${t[3] ? ':' + t[3] : ''}${t[4]} ${t[1]}`);
    if (!w) { t = body.match(/^([\s\S]+?)\s+in\s+((?:\d+\s*[dhms]\s*)+)$/i); if (t) w = parseWhen(`${t[2]} ${t[1]}`); }
    if (!w) { t = body.match(/^([\s\S]+?)\s+at\s+(\d{1,2}):(\d{2})$/i); if (t) w = parseWhen(`at ${t[2]}:${t[3]} ${t[1]}`); }
  }
  return w ? { ...w, tone } : null;
}
const nairobiStamp = (t) => new Date(t).toLocaleString('en-GB', { timeZone: 'Africa/Nairobi', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
function human(ms) {
  const s = Math.round(ms / 1000); if (s < 90) return s + ' seconds';
  const m = Math.round(s / 60); if (m < 90) return m + ' minutes';
  const h = Math.floor(m / 60), r = m % 60; if (h < 48) return h + 'h' + (r ? ' ' + r + 'm' : '');
  return Math.round(h / 24) + ' days';
}

// ── alert sound ──────────────────────────────────────────────────────────
let LASTCTX = null;
async function alarmFile() {
  const f = path.join(os.tmpdir(), 'blackmd_alert.mp3');
  if (fs.existsSync(f) && fs.statSync(f).size > 2000) return f;
  const e = 'mod(t,1.2)';
  await ff(['-y', '-f', 'lavfi', '-i',
    `aevalsrc='0.5*sin(2*PI*t*if(lt(${e},0.15),880,if(lt(${e},0.3),1175,if(lt(${e},0.45),1568,0))))*lt(${e},0.45)':d=7.2:s=44100`,
    '-af', 'afade=t=out:st=6.4:d=0.8', '-c:a', 'libmp3lame', '-b:a', '96k', '-ac', '1', f], 60000);
  return f;
}
async function songViaPlay(client, to, sender, query) {
  const play = require('./downloads').find(c => (c.command || []).includes('play'));
  if (!play) throw new Error('.play not found');
  let got = null;
  const spy = new Proxy(client, {
    get(t, prop) {
      if (prop === 'sendMessage') return async (_jid, content) => {
        if (!got && content && content.audio) got = content.audio;
        else if (!got && content && content.document && /audio/.test(content.mimetype || '')) got = content.document;
        return {};
      };
      const v = t[prop];
      return typeof v === 'function' ? v.bind(t) : v;
    }
  });
  const fakeM = { chat: to, sender, isGroup: false, key: {}, quoted: null, mentionedJid: [], pushName: '', reply: async () => {} };
  const ctx = { ...(loadRem().ctx || {}), ...(LASTCTX || {}), text: query, q: query, args: query.split(' '), reply: async () => {} };
  await Promise.race([play.handler(spy, fakeM, ctx), new Promise((_, rej) => setTimeout(() => rej(new Error('song timed out')), 120000))]);
  if (!got) throw new Error('song not found');
  return got;
}
async function playTone(client, r) {
  const c = loadRem();
  const tone = r.tone || (c.tones && c.tones[r.sender]) || { type: 'alarm' };
  if (tone.type === 'none') return;
  if (tone.type === 'song') {
    try {
      const audio = await songViaPlay(client, r.sender, r.sender, tone.query);
      await client.sendMessage(r.sender, { audio, mimetype: 'audio/mpeg', ptt: false, fileName: `${tone.query.slice(0, 40)}.mp3` });
      return;
    } catch (_) { /* fall back to the alert tone */ }
  }
  try {
    await client.sendMessage(r.sender, { audio: fs.readFileSync(await alarmFile()), mimetype: 'audio/mpeg', ptt: false, fileName: 'BLACK-MD alert.mp3' });
  } catch (_) {}
}

async function fireDue() {
  const c = loadRem();
  if (!LAST || !c.list.length) return;
  const due = c.list.filter(r => r.at <= Date.now());
  if (!due.length) return;
  c.list = c.list.filter(r => r.at > Date.now()); saveRem();
  for (const r of due) {
    const tn = r.tone || (c.tones && c.tones[r.sender]) || { type: 'alarm' };
    const body = `⏰ *${BM} ALERT* ⏰\n\n@${num(r.sender)}\n\n📌 *${r.text}*\n\n` +
      (tn.type === 'song' ? `🎵 _${tn.query}_ is coming. Tap the audio to play.\n` : tn.type === 'alarm' ? '🔔 _Tap the audio to play your alert._\n' : '') + `_set ${human(Date.now() - r.set)} ago_`;
    try { await LAST.sendMessage(r.sender, { text: body, mentions: [r.sender] }); } catch (_) {}
    if (r.chat && r.chat !== r.sender && String(r.chat).endsWith('@g.us')) {
      try { await LAST.sendMessage(r.chat, { text: body, mentions: [r.sender] }); } catch (_) {}
    }
    await playTone(LAST, r);
  }
}
const remTimer = setInterval(() => { fireDue().catch(() => {}); }, 15000);
if (remTimer.unref) remTimer.unref();
// make a client available to the timer even before any toolkit2 command is used
setTimeout(() => { if (!LAST) LAST = global.conn || global.client || global.sock || global.Matrix || null; }, 8000).unref?.();

// ═════════════════════════ writing banks ═════════════════════════════════
const ROASTS = [
  '{n}, your WiFi is faster at disconnecting than you are at replying.',
  '{n} still says "I\'m on my way" while looking for socks.',
  '{n}\'s phone has 3% battery and 400 unread messages, and somehow the battery is the one that\'s doing better.',
  '{n} is the reason the group chat has a mute button.',
  '{n} types "lol" with a straight face. Every time.',
  '{n} plans like a CEO and executes like a Monday morning.',
  '{n}\'s alarm has been snoozed more times than the group admin has been tagged.',
  '{n} says "I\'ll pay you back" with the confidence of a person who has never paid anyone back.',
  '{n} has a 1000-day streak of not seeing the message "Where are you?" in time.',
  '{n} gets lost between the fridge and the kitchen and calls it "exploring".',
  '{n} sends voice notes long enough to qualify as a podcast.',
  '{n}\'s fashion sense? Bold. Of course "bold" is just a polite word.',
  '{n} said "five minutes" and meant "see you next week".',
  '{n} treats the group chat like a library: reads everything and never says a word.',
  '{n}\'s cooking is proof that the smoke alarm works.',
  '{n} has so many tabs open that the browser is asking for help.',
  '{n} would lose an argument against a calculator.',
  '{n}\'s selfies need an editor, a filter and a prayer.',
  '{n} treats "reply all" like a personality.',
  '{n} calls it "a short nap" and wakes up the next day.'
];
const CAPTIONS = {
  funny: ['Me, pretending I have it all together. {t}', 'No thoughts, just {t}.', 'Plot twist: {t} was the plan all along.', '{t}: 10/10, would do again.', 'Professional overthinker, amateur at {t}.'],
  deep: ['Some days teach you more than years do. {t}', 'Quiet minds build loud futures. {t}', 'Not lost, just writing the next chapter. {t}', 'Grow through what you go through. {t}', 'Silence is also an answer. {t}'],
  savage: ['Not everyone deserves the sequel. {t}', 'I don\'t chase. I attract. {t}', 'Still winning, even when you\'re not watching. {t}', 'Be yourself. Everyone else is taken, and badly copied. {t}'],
  love: ['You are my favourite notification. {t}', 'Home is wherever you are. {t}', 'Two hearts, one plan. {t}', 'Found my person. {t}'],
  hustle: ['Dreams don\'t work unless you do. {t}', 'Built in silence, shown in results. {t}', 'Small steps, big receipts. {t}', 'Hustle now, shine later. {t}', 'Today\'s sweat is tomorrow\'s story. {t}'],
  vibes: ['Good vibes only. {t}', 'Living in the moment. {t}', 'Golden hour, golden mood. {t}', 'Peace looks good on me. {t}', 'Making memories, not excuses. {t}']
};
const TAGBANK = {
  kenya: ['#Kenya', '#Nairobi', '#KenyaTwitter', '#254', '#Mombasa', '#MadeInKenya', '#KenyanCreators', '#VisitKenya'],
  music: ['#Music', '#NewMusic', '#Afrobeats', '#Gengetone', '#Bongo', '#MusicVideo', '#Artist', '#Studio'],
  food: ['#Foodie', '#Foodstagram', '#Yummy', '#Chefs', '#HomeCooking', '#KenyanFood', '#NyamaChoma', '#Chapati'],
  fitness: ['#Fitness', '#Gym', '#Workout', '#FitLife', '#Health', '#Motivation', '#Gains', '#Training'],
  business: ['#Business', '#Entrepreneur', '#Hustle', '#SmallBusiness', '#SupportLocal', '#Branding', '#Startup', '#Marketing'],
  fashion: ['#Fashion', '#Style', '#OOTD', '#Outfit', '#Streetwear', '#Trendy', '#Thrift', '#Mtumba'],
  travel: ['#Travel', '#Wanderlust', '#Explore', '#Safari', '#Adventure', '#Vacation', '#TravelGram', '#Nature'],
  tech: ['#Tech', '#Coding', '#Developer', '#AI', '#Software', '#Innovation', '#Programming', '#Gadgets'],
  football: ['#Football', '#Soccer', '#Goal', '#MatchDay', '#PremierLeague', '#Harambee', '#Sports', '#FootballLife'],
  love: ['#Love', '#Couple', '#Relationship', '#Together', '#CoupleGoals', '#Romance', '#Forever', '#Soulmate'],
  beauty: ['#Beauty', '#Makeup', '#Skincare', '#Hair', '#Glow', '#SelfCare', '#NaturalHair', '#Nails'],
  car: ['#Cars', '#CarLife', '#Auto', '#Drive', '#CarsOfKenya', '#Mechanic', '#Wheels', '#Garage'],
  art: ['#Art', '#Design', '#Creative', '#Photography', '#Artist', '#Illustration', '#Drawing', '#Photo']
};
const TAGKEYS = {
  kenya: /kenya|nairobi|mombasa|kisumu|nakuru|254|swahili|harambee/, music: /music|song|beat|dj|album|rapper|singer|studio|gengetone/,
  food: /food|eat|cook|chef|restaurant|pizza|chapati|nyama|cake|bake|recipe|lunch|dinner/, fitness: /gym|fit|workout|run|health|muscle|training|yoga/,
  business: /business|shop|sale|sell|brand|market|startup|product|order|delivery|client|store/, fashion: /fashion|outfit|dress|shoes|style|clothes|wear|thrift|sneaker/,
  travel: /travel|trip|safari|beach|hotel|vacation|holiday|flight|tour|hike/, tech: /tech|code|coding|app|software|ai|developer|phone|laptop|website|bot/,
  football: /football|soccer|goal|match|league|arsenal|chelsea|united|city|liverpool|gor|afc|harambee/, love: /love|couple|wedding|date|boyfriend|girlfriend|anniversary|bae/,
  beauty: /beauty|makeup|skin|hair|nails|salon|barber|braids|glow/, car: /car|auto|drive|engine|toyota|garage|motor|bike/, art: /art|design|draw|photo|paint|logo|graphic|creative/
};
const STOP = new Set('the a an and or for to of in on at is are was were be been it this that with my your our i you we they he she as by from but not so if me us them his her its just very really about have has had will can could would should do does did get got into out up down over'.split(' '));

// ═════════════════════════ link check data ═══════════════════════════════
const SHORTENERS = new Set(['bit.ly', 'tinyurl.com', 't.co', 'is.gd', 'v.gd', 'cutt.ly', 'rb.gy', 'goo.gl', 'ow.ly', 'shorturl.at', 'tiny.cc', 'rebrand.ly', 'buff.ly', 'lnkd.in']);
const RISKY_TLD = /\.(zip|mov|xyz|top|click|work|loan|gq|tk|ml|cf|ga|icu|cyou|rest|sbs|monster|buzz|vip|cam|bid|win|country|stream|download|racing|review|science|party)$/;
const BAIT = /(login|log-in|signin|verify|verification|secure|security|update|account|wallet|bonus|prize|winner|claim|giveaway|free-?(data|airtime|money|cash|gift)|airtime|reward|refund|suspend|unlock|confirm|banking|password|pin-?reset|promo)/;
const BRANDS = {
  safaricom: ['safaricom.co.ke', 'safaricom.com'], mpesa: ['safaricom.co.ke', 'safaricom.com', 'm-pesa.com'], whatsapp: ['whatsapp.com', 'wa.me', 'whatsapp.net', 'wa.link'],
  facebook: ['facebook.com', 'fb.com', 'fb.me'], instagram: ['instagram.com'], google: ['google.com', 'google.co.ke', 'goo.gl'], paypal: ['paypal.com'],
  binance: ['binance.com'], netflix: ['netflix.com'], tiktok: ['tiktok.com'], telegram: ['telegram.org', 't.me'], youtube: ['youtube.com', 'youtu.be'],
  equity: ['equitygroupholdings.com', 'equitybank.co.ke'], kcb: ['kcbgroup.com', 'ke.kcbgroup.com'], kra: ['kra.go.ke'], ecitizen: ['ecitizen.go.ke'], airtel: ['airtel.co.ke', 'airtel.com'],
  amazon: ['amazon.com'], apple: ['apple.com'], microsoft: ['microsoft.com', 'live.com'], twitter: ['twitter.com', 'x.com']
};
function regDomain(host) {
  const p = host.split('.');
  if (p.length <= 2) return host;
  const last2 = p.slice(-2).join('.');
  if (/^(co|com|or|go|ac|ne|org|net|gov|edu)\.[a-z]{2}$/.test(last2)) return p.slice(-3).join('.');
  return last2;
}
function analyseUrl(raw) {
  const flags = []; let score = 0;
  let u; try { u = new URL(raw); } catch (_) { return { score: 0, flags: ['Not a valid link'], host: '' }; }
  const host = u.hostname.toLowerCase(), full = (host + u.pathname + u.search).toLowerCase();
  const reg = regDomain(host);
  if (u.protocol !== 'https:') { score += 1; flags.push('Not using https (no encryption)'); }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) { score += 4; flags.push('Address is a raw IP number, not a real website name'); }
  if (host.includes('xn--')) { score += 4; flags.push('Uses look-alike (punycode) characters in the name'); }
  if (u.username || raw.includes('@') && /^https?:\/\/[^/]*@/.test(raw)) { score += 4; flags.push('Contains "@", a trick to hide the real destination'); }
  if (SHORTENERS.has(reg)) { score += 2; flags.push('Short link: the real destination is hidden'); }
  if (RISKY_TLD.test(host)) { score += 2; flags.push('Ends with a domain type often used for scams'); }
  if (host.split('.').length > 4) { score += 2; flags.push('Many sub-domains stacked together'); }
  if ((host.match(/-/g) || []).length >= 3) { score += 1; flags.push('Lots of hyphens in the name'); }
  if (BAIT.test(full)) { score += 2; flags.push('Contains bait words (login / verify / prize / claim...)'); }
  if (/\.(apk|exe|scr|bat|msi|jar)(\?|$)/.test(u.pathname.toLowerCase())) { score += 3; flags.push('Downloads an installable file'); }
  for (const [brand, ok] of Object.entries(BRANDS)) {
    if (host.includes(brand) && !ok.includes(reg) && !ok.some(d => host.endsWith('.' + d))) {
      score += 5; flags.push(`Pretends to be *${brand}* but the real domain is ${reg}`); break;
    }
  }
  return { score, flags, host: reg };
}

// ═════════════════════════ EXIF reader (JPEG) ════════════════════════════
function readExif(buf) {
  if (buf.length < 4 || buf[0] !== 0xFF || buf[1] !== 0xD8) return null;
  let p = 2, tiff = -1;
  while (p + 4 < buf.length) {
    if (buf[p] !== 0xFF) break;
    const mk = buf[p + 1], len = buf.readUInt16BE(p + 2);
    if (mk === 0xE1 && buf.toString('latin1', p + 4, p + 8) === 'Exif') { tiff = p + 10; break; }
    if (mk === 0xDA) break;
    p += 2 + len;
  }
  if (tiff < 0) return {};
  const le = buf.toString('latin1', tiff, tiff + 2) === 'II';
  const r16 = (o) => le ? buf.readUInt16LE(o) : buf.readUInt16BE(o);
  const r32 = (o) => le ? buf.readUInt32LE(o) : buf.readUInt32BE(o);
  const SZ = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
  function ifd(off) {
    const out = {};
    if (off + 2 > buf.length) return out;
    const n = r16(tiff + off);
    for (let i = 0; i < n; i++) {
      const e = tiff + off + 2 + i * 12;
      if (e + 12 > buf.length) break;
      const tag = r16(e), type = r16(e + 2), cnt = r32(e + 4), size = (SZ[type] || 1) * cnt;
      const vo = size <= 4 ? e + 8 : tiff + r32(e + 8);
      if (vo + size > buf.length) continue;
      let v;
      if (type === 2) v = buf.toString('latin1', vo, vo + Math.max(0, cnt - 1)).replace(/\0.*$/, '').trim();
      else if (type === 3) v = cnt === 1 ? r16(vo) : Array.from({ length: cnt }, (_, k) => r16(vo + k * 2));
      else if (type === 4) v = cnt === 1 ? r32(vo) : Array.from({ length: cnt }, (_, k) => r32(vo + k * 4));
      else if (type === 5) v = Array.from({ length: cnt }, (_, k) => { const d = r32(vo + k * 8 + 4); return d ? r32(vo + k * 8) / d : 0; });
      else continue;
      out[tag] = v;
    }
    return out;
  }
  const i0 = ifd(r32(tiff + 4));
  const ex = i0[0x8769] ? ifd(i0[0x8769]) : {};
  const gp = i0[0x8825] ? ifd(i0[0x8825]) : {};
  const one = (v) => Array.isArray(v) ? v[0] : v;
  const res = {
    make: i0[0x010F], model: i0[0x0110], software: i0[0x0131], taken: ex[0x9003] || i0[0x0132],
    width: ex[0xA002], height: ex[0xA003], iso: one(ex[0x8827]), fnum: one(ex[0x829D]), exposure: one(ex[0x829A]), focal: one(ex[0x920A])
  };
  if (gp[2] && gp[4]) {
    const dms = (a) => a[0] + a[1] / 60 + a[2] / 3600;
    let lat = dms(gp[2]), lon = dms(gp[4]);
    if (String(gp[1]).toUpperCase() === 'S') lat = -lat;
    if (String(gp[3]).toUpperCase() === 'W') lon = -lon;
    res.gps = { lat, lon };
  }
  return res;
}

// ═════════════════════════ PDF (tiny writer, Helvetica) ══════════════════
function pdfClean(s) {
  return String(s).replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/…/g, '...').replace(/•/g, '-')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '?').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}
function buildPdf(items) {
  const W = 595, H = 842, M = 50;
  const pages = [[]]; let y = H - M;
  const newPage = () => { pages.push([]); y = H - M; };
  for (const it of items) {
    if (it.gap) { y -= it.gap; continue; }
    const size = it.size || 11, lead = Math.round(size * 1.45);
    const maxCh = Math.max(20, Math.floor((W - M * 2 - (it.indent || 0)) / (size * (it.bold ? 0.54 : 0.5))));
    const words = String(it.text).split(/\s+/); const lines = []; let cur = '';
    for (const w of words) { if ((cur + ' ' + w).trim().length > maxCh) { if (cur) lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }
    if (cur) lines.push(cur);
    for (const ln of lines) {
      if (y - lead < M) newPage();
      const pg = pages[pages.length - 1];
      pg.push(`BT /${it.bold ? 'F2' : 'F1'} ${size} Tf ${it.color || '0 0 0'} rg ${M + (it.indent || 0)} ${y - size} Td (${pdfClean(ln)}) Tj ET`);
      y -= lead;
    }
    if (it.rule) { const pg = pages[pages.length - 1]; pg.push(`0.6 w 0.2 0.2 0.2 RG ${M} ${y + 2} m ${W - M} ${y + 2} l S`); y -= 6; }
  }
  const objs = [];
  const add = (s) => { objs.push(s); return objs.length; };
  add('<< /Type /Catalog /Pages 2 0 R >>');
  add(null); // pages placeholder
  const f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const kids = [];
  for (const pg of pages) {
    const body = pg.join('\n');
    const cid = add(`<< /Length ${Buffer.byteLength(body, 'latin1')} >>\nstream\n${body}\nendstream`);
    const pid = add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${cid} 0 R >>`);
    kids.push(pid + ' 0 R');
  }
  objs[1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${kids.length} >>`;
  let out = '%PDF-1.4\n'; const offs = [];
  objs.forEach((o, i) => { offs.push(Buffer.byteLength(out, 'latin1')); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xr = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('') +
    `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xr}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

// ═════════════════════════ audio job (audio->audio, video->video) ════════
async function audioJob(client, m, af, label, extraNote) {
  const x = await needMedia(client, m, /audio|video/, `Reply to a *voice note, song or video* with this command.`);
  if (!x) return;
  await m.reply(`${label} _working..._`);
  const dir = makeDir('afx');
  try {
    const inFile = path.join(dir, `in.${extFor(x.mime)}`); fs.writeFileSync(inFile, x.buf);
    const isVideo = /video/.test(x.mime);
    if (isVideo) {
      const info = await probe(inFile);
      if (!info.hasAudio) return m.reply('⚠️ That video has no sound to change.');
      const out = path.join(dir, 'out.mp4');
      await ff(['-y', '-i', inFile, '-map', '0:v:0', '-map', '0:a:0', '-c:v', 'copy', '-af', af, '-c:a', 'aac', '-b:a', '160k', '-movflags', 'faststart', out]);
      await client.sendMessage(m.chat, { video: fs.readFileSync(out), mimetype: 'video/mp4', caption: `${label} ${extraNote || ''}`.trim() }, { quoted: m });
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

// ═════════════════════════ fuel data ═════════════════════════════════════
const FUEL_FILE = path.join(process.cwd(), 'fuel_data.json');
const loadFuel = () => { try { return JSON.parse(fs.readFileSync(FUEL_FILE, 'utf8')); } catch (_) { return null; } };

// ═════════════════════════ time data ═════════════════════════════════════
const CITY_TZ = {
  nairobi: 'Africa/Nairobi', kenya: 'Africa/Nairobi', mombasa: 'Africa/Nairobi', kisumu: 'Africa/Nairobi', nakuru: 'Africa/Nairobi', eldoret: 'Africa/Nairobi',
  kampala: 'Africa/Kampala', uganda: 'Africa/Kampala', 'dar es salaam': 'Africa/Dar_es_Salaam', dar: 'Africa/Dar_es_Salaam', tanzania: 'Africa/Dar_es_Salaam', dodoma: 'Africa/Dar_es_Salaam',
  kigali: 'Africa/Kigali', rwanda: 'Africa/Kigali', 'addis ababa': 'Africa/Addis_Ababa', ethiopia: 'Africa/Addis_Ababa', mogadishu: 'Africa/Mogadishu', somalia: 'Africa/Mogadishu',
  lagos: 'Africa/Lagos', nigeria: 'Africa/Lagos', abuja: 'Africa/Lagos', accra: 'Africa/Accra', ghana: 'Africa/Accra', johannesburg: 'Africa/Johannesburg', 'south africa': 'Africa/Johannesburg',
  'cape town': 'Africa/Johannesburg', pretoria: 'Africa/Johannesburg', cairo: 'Africa/Cairo', egypt: 'Africa/Cairo', lusaka: 'Africa/Lusaka', zambia: 'Africa/Lusaka', harare: 'Africa/Harare', zimbabwe: 'Africa/Harare',
  kinshasa: 'Africa/Kinshasa', 'dr congo': 'Africa/Kinshasa', dakar: 'Africa/Dakar', senegal: 'Africa/Dakar', casablanca: 'Africa/Casablanca', morocco: 'Africa/Casablanca', juba: 'Africa/Juba',
  london: 'Europe/London', uk: 'Europe/London', england: 'Europe/London', paris: 'Europe/Paris', france: 'Europe/Paris', berlin: 'Europe/Berlin', germany: 'Europe/Berlin', madrid: 'Europe/Madrid', spain: 'Europe/Madrid',
  rome: 'Europe/Rome', italy: 'Europe/Rome', amsterdam: 'Europe/Amsterdam', moscow: 'Europe/Moscow', russia: 'Europe/Moscow', istanbul: 'Europe/Istanbul', turkey: 'Europe/Istanbul',
  'new york': 'America/New_York', usa: 'America/New_York', us: 'America/New_York', chicago: 'America/Chicago', 'los angeles': 'America/Los_Angeles', la: 'America/Los_Angeles', toronto: 'America/Toronto', canada: 'America/Toronto',
  'sao paulo': 'America/Sao_Paulo', brazil: 'America/Sao_Paulo', mexico: 'America/Mexico_City', dubai: 'Asia/Dubai', uae: 'Asia/Dubai', doha: 'Asia/Qatar', qatar: 'Asia/Qatar', riyadh: 'Asia/Riyadh', 'saudi arabia': 'Asia/Riyadh',
  mumbai: 'Asia/Kolkata', delhi: 'Asia/Kolkata', india: 'Asia/Kolkata', karachi: 'Asia/Karachi', pakistan: 'Asia/Karachi', dhaka: 'Asia/Dhaka', bangkok: 'Asia/Bangkok', jakarta: 'Asia/Jakarta', indonesia: 'Asia/Jakarta',
  singapore: 'Asia/Singapore', 'hong kong': 'Asia/Hong_Kong', beijing: 'Asia/Shanghai', shanghai: 'Asia/Shanghai', china: 'Asia/Shanghai', tokyo: 'Asia/Tokyo', japan: 'Asia/Tokyo', seoul: 'Asia/Seoul', korea: 'Asia/Seoul',
  manila: 'Asia/Manila', sydney: 'Australia/Sydney', australia: 'Australia/Sydney', melbourne: 'Australia/Melbourne', auckland: 'Pacific/Auckland', 'new zealand': 'Pacific/Auckland'
};
let TZ_BY_CITY = null;
function resolveTz(q) {
  q = q.trim().toLowerCase().replace(/[_]+/g, ' ');
  if (CITY_TZ[q]) return CITY_TZ[q];
  try {
    if (!TZ_BY_CITY) { TZ_BY_CITY = {}; for (const z of (Intl.supportedValuesOf ? Intl.supportedValuesOf('timeZone') : [])) TZ_BY_CITY[z.split('/').pop().replace(/_/g, ' ').toLowerCase()] = z; }
    if (TZ_BY_CITY[q]) return TZ_BY_CITY[q];
    const direct = q.replace(/\s+/g, '_');
    return new Intl.DateTimeFormat('en', { timeZone: direct }).resolvedOptions().timeZone;     // throws if not a real zone
  } catch (_) { return null; }
}
function offsetMin(tz, d = new Date()) {
  try {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' }).formatToParts(d).find(x => x.type === 'timeZoneName').value;
    const m = p.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
    if (!m) return 0;
    return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0));
  } catch (_) { return 0; }
}
const offLabel = (min) => 'UTC' + (min < 0 ? '-' : '+') + Math.floor(Math.abs(min) / 60) + (Math.abs(min) % 60 ? ':' + String(Math.abs(min) % 60).padStart(2, '0') : '');
function clock(tz) {
  const d = new Date();
  const time = d.toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false });
  const date = d.toLocaleDateString('en-GB', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const hour = Number(time.slice(0, 2));
  return { time, date, hour, off: offsetMin(tz, d), icon: hour >= 6 && hour < 18 ? '☀️' : '🌙' };
}

// ═════════════════════════ COMMANDS ══════════════════════════════════════
const stitchQueues = new Map();
function dropStitch(s) { const q = stitchQueues.get(s); if (q) { clearTimeout(q.timer); rmDir(q.dir); stitchQueues.delete(s); } }

module.exports = [

  // ───────────────────────── .stitch ─────────────────────────
  {
    command: ['stitch'],
    aliases: ['collage', 'joinimages', 'combine'],
    description: 'Join pictures into one (reply to each with .stitch, then .stitch done [h|v|grid])',
    category: 'media',
    handler: async (client, m, { text }) => {
      grab(client);
      const arg = String(text || '').trim().toLowerCase();
      const q = stitchQueues.get(m.sender);
      if (arg === 'clear') { dropStitch(m.sender); return m.reply('🗑️ Stitch list cleared.'); }
      if (/^(done|go|h|v|grid|side|stack)/.test(arg)) {
        if (!q || q.files.length < 2) return m.reply('⚠️ Add at least 2 pictures first: reply to each with *.stitch*');
        let mode = /^(v|stack)/.test(arg) || /\sv$/.test(arg) ? 'v' : /grid/.test(arg) ? 'grid' : /^(h|side)/.test(arg) || /\sh$/.test(arg) ? 'h' : (q.files.length > 3 ? 'grid' : 'h');
        try {
          await m.reply('🧩 _Stitching..._');
          const n = q.files.length, inputs = q.files.flatMap(f => ['-i', f]);
          let fc;
          if (mode === 'h') fc = q.files.map((_, i) => `[${i}:v]scale=-2:900[s${i}]`).join(';') + ';' + q.files.map((_, i) => `[s${i}]`).join('') + `hstack=inputs=${n},scale='min(2400,iw)':-2[v]`;
          else if (mode === 'v') fc = q.files.map((_, i) => `[${i}:v]scale=1000:-2[s${i}]`).join(';') + ';' + q.files.map((_, i) => `[s${i}]`).join('') + `vstack=inputs=${n},scale=-2:'min(2400,ih)'[v]`;
          else {
            const cols = Math.ceil(Math.sqrt(n)), S = 700;
            const lay = q.files.map((_, i) => `${i % cols === 0 ? 0 : Array.from({ length: i % cols }, (_, k) => 'w' + (i - (i % cols) + k)).join('+')}_${Math.floor(i / cols) === 0 ? 0 : Array.from({ length: Math.floor(i / cols) }, (_, k) => 'h' + (i % cols + k * cols)).join('+')}`).join('|');
            fc = q.files.map((_, i) => `[${i}:v]scale=${S}:${S}:force_original_aspect_ratio=increase,crop=${S}:${S}[s${i}]`).join(';') + ';' + q.files.map((_, i) => `[s${i}]`).join('') + `xstack=inputs=${n}:layout=${lay}:fill=black[v]`;
          }
          const out = path.join(q.dir, 'stitched.jpg');
          await ff(['-y', ...inputs, '-filter_complex', fc, '-map', '[v]', '-frames:v', '1', '-q:v', '2', out]);
          await client.sendMessage(m.chat, { image: fs.readFileSync(out), caption: `🧩 ${n} pictures stitched • ${TAG}` }, { quoted: m });
        } catch (e) { m.reply('❌ Failed: ' + e.message); }
        finally { dropStitch(m.sender); }
        return;
      }
      const t = mediaTarget(m), mime = mimeOf(t);
      if (!t || !/image/.test(mime)) {
        return m.reply(`🧩 *${BM} Stitch*\n\n1) Reply to a picture with *.stitch* (do it for each one, up to 9)\n2) Send *.stitch done*\n    *.stitch done h*  side by side\n    *.stitch done v*  stacked\n    *.stitch done grid*  tiles\n\n*.stitch clear* starts over.`);
      }
      try {
        let cur = stitchQueues.get(m.sender);
        if (!cur) { cur = { dir: makeDir('stitch'), files: [], timer: null }; stitchQueues.set(m.sender, cur); }
        if (cur.files.length >= 9) return m.reply('⚠️ Max 9 pictures. Send *.stitch done* now.');
        const buf = await downloadTarget(client, t);
        const f = path.join(cur.dir, `${cur.files.length}.${extFor(mime)}`); fs.writeFileSync(f, buf);
        cur.files.push(f);
        clearTimeout(cur.timer); cur.timer = setTimeout(() => dropStitch(m.sender), 15 * 60 * 1000);
        m.reply(`✅ Added (${cur.files.length}). Reply to the next one, or send *.stitch done*  (h / v / grid)`);
      } catch (e) { m.reply('❌ Failed: ' + e.message); }
    }
  },

  // ───────────────────────── .compress ───────────────────────
  {
    command: ['compress'],
    aliases: ['shrink', 'reducesize'],
    description: 'Make a video / picture / audio smaller (.compress low|medium|high)',
    category: 'media',
    handler: async (client, m, { text }) => {
      grab(client);
      const lvl = /high|max|extreme/i.test(text || '') ? 'high' : /low|light/i.test(text || '') ? 'low' : 'medium';
      const dir = makeDir('cmp');
      try {
        const x = await needMedia(client, m, /video|image|audio/, `🗜️ Reply to a *video*, *picture* or *audio* with *.compress*\n\n*.compress low*  (best quality)\n*.compress medium*\n*.compress high*  (smallest file)`);
        if (!x) return;
        await m.reply('🗜️ _Compressing..._');
        const inFile = path.join(dir, `in.${extFor(x.mime)}`); fs.writeFileSync(inFile, x.buf);
        if (/video/.test(x.mime)) {
          const H = { low: 720, medium: 540, high: 360 }[lvl], crf = { low: 26, medium: 30, high: 35 }[lvl];
          const out = path.join(dir, 'out.mp4');
          const base = ['-y', '-i', inFile, '-vf', `scale=-2:'min(${H},ih)',scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(crf), '-movflags', 'faststart'];
          try { await ff([...base, '-c:a', 'aac', '-b:a', lvl === 'high' ? '48k' : '80k', out], 240000); } catch (_) { await ff([...base, '-an', out], 240000); }
          const buf = fs.readFileSync(out);
          await client.sendMessage(m.chat, { video: buf, mimetype: 'video/mp4', caption: `🗜️ ${kb(x.buf.length)} → *${kb(buf.length)}* (${Math.max(0, Math.round((1 - buf.length / x.buf.length) * 100))}% smaller) • ${TAG}` }, { quoted: m });
        } else if (/image/.test(x.mime)) {
          const W = { low: 2000, medium: 1400, high: 900 }[lvl], q = { low: 4, medium: 8, high: 14 }[lvl];
          const out = path.join(dir, 'out.jpg');
          await ff(['-y', '-i', inFile, '-vf', `scale='min(${W},iw)':-2`, '-q:v', String(q), '-frames:v', '1', out]);
          const buf = fs.readFileSync(out);
          await client.sendMessage(m.chat, { image: buf, caption: `🗜️ ${kb(x.buf.length)} → *${kb(buf.length)}* • ${TAG}` }, { quoted: m });
        } else {
          const out = path.join(dir, 'out.mp3');
          await ff(['-y', '-i', inFile, '-vn', '-c:a', 'libmp3lame', '-b:a', { low: '128k', medium: '96k', high: '64k' }[lvl], '-ac', '1', out]);
          const buf = fs.readFileSync(out);
          await client.sendMessage(m.chat, { audio: buf, mimetype: 'audio/mpeg', ptt: false, fileName: 'compressed.mp3' }, { quoted: m });
          await m.reply(`🗜️ ${kb(x.buf.length)} → *${kb(buf.length)}*`);
        }
      } catch (e) { m.reply('❌ Failed: ' + e.message); }
      finally { rmDir(dir); }
    }
  },

  // ───────────────────────── .crop ───────────────────────────
  {
    command: ['crop'],
    aliases: ['cropto', 'resizeto'],
    description: 'Crop a picture / video to a shape (.crop 1:1, 9:16, 16:9, 4:5)',
    category: 'media',
    handler: async (client, m, { text }) => {
      grab(client);
      const words = String(text || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
      const names = { square: '1:1', story: '9:16', status: '9:16', tall: '9:16', wide: '16:9', landscape: '16:9', portrait: '4:5', insta: '4:5', cinema: '21:9' };
      let ratio = null, pos = 'center';
      for (const w of words) {
        if (/^\d+(\.\d+)?[:x/]\d+(\.\d+)?$/.test(w)) ratio = w.split(/[:x/]/).map(Number);
        else if (names[w]) ratio = names[w].split(':').map(Number);
        else if (/^(top|bottom|left|right|center|centre)$/.test(w)) pos = w;
      }
      if (!ratio || !ratio[0] || !ratio[1]) return m.reply(`✂️ *${BM} Crop*\n\nReply to a picture or video:\n*.crop 1:1*  square\n*.crop 9:16*  story / status\n*.crop 16:9*  wide\n*.crop 4:5*  portrait\n\nChoose which part to keep: *.crop 1:1 top* (top / bottom / left / right / center)`);
      const dir = makeDir('crop');
      try {
        const x = await needMedia(client, m, /image|video/, '✂️ Reply to a *picture* or *video* with *.crop 1:1*');
        if (!x) return;
        const isVid = /video/.test(x.mime);
        const inFile = path.join(dir, `in.${extFor(x.mime)}`); fs.writeFileSync(inFile, x.buf);
        const [A, B] = ratio;
        const fx = pos === 'left' ? 0 : pos === 'right' ? 1 : 0.5, fy = pos === 'top' ? 0 : pos === 'bottom' ? 1 : 0.5;
        const cw = `min(iw\\,ih*${A}/${B})`, ch = `min(ih\\,iw*${B}/${A})`;
        const vf = `crop=w=trunc(${cw}/2)*2:h=trunc(${ch}/2)*2:x=(iw-trunc(${cw}/2)*2)*${fx}:y=(ih-trunc(${ch}/2)*2)*${fy}`;
        if (isVid) {
          const out = path.join(dir, 'out.mp4');
          const base = ['-y', '-i', inFile, '-vf', vf + ',format=yuv420p', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-movflags', 'faststart'];
          try { await ff([...base, '-c:a', 'copy', out]); } catch (_) { await ff([...base, '-an', out]); }
          await client.sendMessage(m.chat, { video: fs.readFileSync(out), mimetype: 'video/mp4', caption: `✂️ Cropped to ${A}:${B} • ${TAG}` }, { quoted: m });
        } else {
          const out = path.join(dir, 'out.jpg');
          await ff(['-y', '-i', inFile, '-vf', vf, '-frames:v', '1', '-q:v', '2', out]);
          await client.sendMessage(m.chat, { image: fs.readFileSync(out), caption: `✂️ Cropped to ${A}:${B} • ${TAG}` }, { quoted: m });
        }
      } catch (e) { m.reply('❌ Failed: ' + e.message); }
      finally { rmDir(dir); }
    }
  },

  // ───────────────────────── .sketch ─────────────────────────
  {
    command: ['sketch'],
    aliases: ['pencil', 'drawing'],
    description: 'Turn a picture / video into a pencil sketch (.sketch or .sketch color)',
    category: 'media',
    handler: async (client, m, { text }) => {
      grab(client);
      const color = /colou?r/i.test(text || '');
      const dir = makeDir('skt');
      try {
        const x = await needMedia(client, m, /image|video/, '✏️ Reply to a *picture* or *video* with *.sketch*  (or *.sketch color*)');
        if (!x) return;
        await m.reply('✏️ _Sketching..._');
        const isVid = /video/.test(x.mime);
        const inFile = path.join(dir, `in.${extFor(x.mime)}`); fs.writeFileSync(inFile, x.buf);
        const fc = color
          ? `[0:v]split=2[a][b];[b]format=gray,negate,gblur=sigma=10[c];[a]format=gbrp[a2];[c]format=gbrp[c2];[a2][c2]blend=all_mode=divide,eq=contrast=1.15:saturation=1.3,format=yuv420p[v]`
          : `[0:v]format=gray,split=2[a][b];[b]negate,gblur=sigma=10[c];[a][c]blend=all_mode=divide,eq=contrast=1.25,format=yuv420p[v]`;
        if (isVid) {
          const info = await probe(inFile);
          if (info.seconds > 60) return m.reply('⚠️ Use a video of 60 seconds or less.');
          const out = path.join(dir, 'out.mp4');
          const base = ['-y', '-i', inFile, '-filter_complex', fc.replace('[v]', '[v0]') + ';[v0]scale=trunc(iw/2)*2:trunc(ih/2)*2[v]', '-map', '[v]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-movflags', 'faststart'];
          try { await ff([...base, '-map', '0:a?', '-c:a', 'copy', out], 240000); } catch (_) { await ff([...base, '-an', out], 240000); }
          await client.sendMessage(m.chat, { video: fs.readFileSync(out), mimetype: 'video/mp4', caption: `✏️ Sketch • ${TAG}` }, { quoted: m });
        } else {
          const out = path.join(dir, 'out.jpg');
          await ff(['-y', '-i', inFile, '-filter_complex', fc, '-map', '[v]', '-frames:v', '1', '-q:v', '2', out]);
          await client.sendMessage(m.chat, { image: fs.readFileSync(out), caption: `✏️ Sketch • ${TAG}` }, { quoted: m });
        }
      } catch (e) { m.reply('❌ Failed: ' + e.message); }
      finally { rmDir(dir); }
    }
  },

  // ───────────────────────── .pitch ──────────────────────────
  {
    command: ['pitch'],
    aliases: ['voicepitch', 'voicechanger'],
    description: 'Change the voice pitch (.pitch deep | chipmunk | up | down | -12..12)',
    category: 'audio',
    handler: async (client, m, { text }) => {
      grab(client);
      const words = { deep: -6, low: -5, monster: -10, down: -4, up: 4, high: 5, chipmunk: 8, baby: 10, girl: 4, boy: -4 };
      const a = String(text || '').trim().toLowerCase();
      let n = words[a] !== undefined ? words[a] : (/^[+-]?\d+(\.\d+)?$/.test(a) ? Number(a) : null);
      if (n === null) return m.reply(`🎚️ *${BM} Pitch*\n\nReply to a voice note, song or video:\n*.pitch deep*  •  *.pitch monster*\n*.pitch chipmunk*  •  *.pitch baby*\n*.pitch up*  •  *.pitch down*\n*.pitch 5*  (steps from -12 to 12)`);
      n = Math.max(-12, Math.min(12, n));
      const f = Math.pow(2, n / 12);
      try { await audioJob(client, m, `aresample=44100,asetrate=${(44100 * f).toFixed(2)},aresample=44100,atempo=${(1 / f).toFixed(5)}`, '🎚️', `Pitch ${n > 0 ? '+' : ''}${n} • ${TAG}`); }
      catch (e) { m.reply('❌ Failed: ' + e.message); }
    }
  },

  // ───────────────────────── .volume ─────────────────────────
  {
    command: ['volume'],
    aliases: ['louder', 'amplify', 'quieter'],
    description: 'Make audio / video louder or quieter (.volume 200, .volume 50)',
    category: 'audio',
    handler: async (client, m, { text }) => {
      grab(client);
      const a = String(text || '').trim().toLowerCase().replace('%', '');
      const words = { loud: 250, max: 400, boost: 180, up: 160, low: 50, quiet: 40, down: 60, half: 50, double: 200 };
      let pct = words[a] !== undefined ? words[a] : (/^\d+(\.\d+)?$/.test(a) ? Number(a) : null);
      if (pct === null) return m.reply(`🔊 *${BM} Volume*\n\nReply to a voice note, song or video:\n*.volume 200*  twice as loud\n*.volume 50*  half as loud\n*.volume loud*  •  *.volume quiet*\n\nRange 10 to 500.`);
      pct = Math.max(10, Math.min(500, pct));
      try { await audioJob(client, m, `volume=${(pct / 100).toFixed(2)},alimiter=limit=0.97`, '🔊', `Volume ${pct}% • ${TAG}`); }
      catch (e) { m.reply('❌ Failed: ' + e.message); }
    }
  },

  // ───────────────────────── .denoise ────────────────────────
  {
    command: ['denoise'],
    aliases: ['denoiseaudio', 'cleanaudio', 'removenoise'],
    description: 'Clean background noise from a voice note / video (.denoise [strong])',
    category: 'audio',
    handler: async (client, m, { text }) => {
      grab(client);
      const strong = /strong|hard|max/i.test(text || '');
      try { await audioJob(client, m, `highpass=f=80,afftdn=nr=${strong ? 35 : 20}:nf=-30,lowpass=f=14000,loudnorm=I=-16:TP=-1.5:LRA=11`, '🧼', `Noise cleaned${strong ? ' (strong)' : ''} • ${TAG}`); }
      catch (e) { m.reply('❌ Failed: ' + e.message); }
    }
  },

  // ───────────────────────── .logo ───────────────────────────
  {
    command: ['logo'],
    aliases: ['futurelogo', 'neonlogo', 'makelogo'],
    description: 'Futuristic neon logo (.logo Name | tagline | cyan/magenta/green/gold/red/blue)',
    category: 'media',
    handler: async (client, m, { text }) => {
      grab(client);
      const parts = String(text || '').split('|').map(s => s.trim()).filter(Boolean);
      if (!parts.length) return m.reply(`🌌 *${BM} Logo*\n\n*.logo Your Name*\n*.logo Nova Tech | Build the future*\n*.logo Nova Tech | Build the future | magenta*\n\nColours: cyan, magenta, green, gold, red, blue`);
      const { theme, rest } = parseThemeWord(parts);
      const name = (rest[0] || '').toUpperCase().slice(0, 40), tagline = (rest[1] || '').slice(0, 70);
      if (!name) return m.reply('Give the logo a name: *.logo Nova Tech*');
      const dir = makeDir('logo');
      try {
        await m.reply('🌌 _Rendering your logo..._');
        const img = await futuristicImage(dir, { w: 1280, h: 720, name, tagline, theme, nameSizes: [128, 64, 32] });
        await client.sendMessage(m.chat, { image: img, mimetype: 'image/png', caption: `🌌 *${name}*\nTheme: ${theme} • ${TAG}` }, { quoted: m });
      } catch (e) { m.reply('❌ Could not make the logo: ' + String(e.message).slice(0, 150)); }
      finally { rmDir(dir); }
    }
  },

  // ───────────────────────── .banner ─────────────────────────
  {
    command: ['banner'],
    aliases: ['cover', 'headerimage', 'makebanner'],
    description: 'Futuristic banner / cover (.banner Name | tagline | theme)',
    category: 'media',
    handler: async (client, m, { text }) => {
      grab(client);
      const parts = String(text || '').split('|').map(s => s.trim()).filter(Boolean);
      if (!parts.length) return m.reply(`🖼️ *${BM} Banner*\n\n*.banner Your Name*\n*.banner Kamau Designs | Branding & web*\n*.banner Kamau Designs | Branding & web | gold*\n\nWide 3:1 image for covers, group banners and posters.\nColours: cyan, magenta, green, gold, red, blue`);
      const { theme, rest } = parseThemeWord(parts);
      const name = (rest[0] || '').toUpperCase().slice(0, 40), tagline = (rest[1] || '').slice(0, 80);
      if (!name) return m.reply('Give the banner a name: *.banner Kamau Designs*');
      const dir = makeDir('ban');
      try {
        await m.reply('🖼️ _Rendering your banner..._');
        const img = await futuristicImage(dir, { w: 1500, h: 500, name, tagline, theme, nameSizes: [128, 64, 32] });
        await client.sendMessage(m.chat, { image: img, mimetype: 'image/png', caption: `🖼️ *${name}*\nTheme: ${theme} • ${TAG}` }, { quoted: m });
      } catch (e) { m.reply('❌ Could not make the banner: ' + String(e.message).slice(0, 150)); }
      finally { rmDir(dir); }
    }
  },

  // ───────────────────────── .remind ─────────────────────────
  {
    command: ['remind'],
    aliases: ['reminder', 'remindme', 'setreminder'],
    description: 'Set a reminder with a tagged pop-up (.remind 30m call mum / .remind at 18:30 gym)',
    category: 'tools',
    handler: async (client, m, ctx) => {
      const { text } = ctx;
      grab(client);
      LASTCTX = ctx;
      const c0 = loadRem(); c0.ctx = { api: typeof ctx.api === 'string' ? ctx.api : undefined, prefix: typeof ctx.prefix === 'string' ? ctx.prefix : undefined };
      const w = parseReminder(text);
      if (!w || !w.text) {
        return m.reply(`⏰ *${BM} Reminders*\n\n*.remind 30m call mum*\n*.remind 2h30m send the invoice*\n*.remind 1d pay rent*\n*.remind at 18:30 gym*   (Nairobi time)\n*.remind at 7am wake up*\n*.remind resume updates 1 am*   (time can be last too)\n\n🔔 When it is time I tag you privately and send the ${BM} alert sound.\n🎵 Want a song instead? Add *| song name*:\n*.remind at 6am wake up | song Burna Boy Last Last*\nNo sound: *| silent*\n\nMake a song your default: *.remindtone Burna Boy Last Last*\n*.reminders* shows your list • *.unremind <number>* cancels one.`);
      }
      if (w.ms < 10000) return m.reply('⚠️ Set it at least 10 seconds ahead.');
      if (w.ms > 30 * 86400000) return m.reply('⚠️ Maximum is 30 days ahead.');
      const c = loadRem();
      if (c.list.filter(r => r.sender === m.sender).length >= 20) return m.reply('⚠️ You already have 20 reminders. Cancel one with *.unremind <number>*');
      c.id += 1;
      c.list.push({ id: c.id, sender: m.sender, chat: m.chat, at: w.at, set: Date.now(), text: w.text.slice(0, 300), tone: w.tone || null });
      saveRem();
      const tn = w.tone || (c.tones && c.tones[m.sender]) || { type: 'alarm' };
      const toneLine = tn.type === 'song' ? `🎵 Song: ${tn.query}` : tn.type === 'none' ? '🔕 No sound' : `🔔 ${BM} alert sound`;
      m.reply(`✅ *Reminder set* ⏰\n\n📌 ${w.text}\n🕒 ${nairobiStamp(w.at)} (in ${human(w.ms)})\n${toneLine}\n\n_I will tag you privately when it is time._`);
    }
  },
  {
    command: ['remindtone'],
    aliases: ['remindsong', 'alerttone', 'remindersound'],
    description: 'Choose the song or sound for your reminders (.remindtone <song> / alarm / off)',
    category: 'tools',
    handler: async (client, m, ctx) => {
      grab(client); LASTCTX = ctx;
      const c = loadRem(); c.tones = c.tones || {};
      c.ctx = { api: typeof ctx.api === 'string' ? ctx.api : undefined, prefix: typeof ctx.prefix === 'string' ? ctx.prefix : undefined };
      const a = String(ctx.text || '').trim();
      const cur = c.tones[m.sender];
      if (!a) return m.reply(`🔔 *${BM} Reminder sound*\n\nNow: ${!cur ? 'the BLACK-MD alert sound' : cur.type === 'song' ? '🎵 ' + cur.query : '🔕 none'}\n\n*.remindtone Burna Boy Last Last*  (play this song)\n*.remindtone alarm*  (BLACK-MD alert sound)\n*.remindtone off*  (no sound)\n\nOne reminder only: *.remind 1h call mum | song Sauti Sol Sura Yako*`);
      if (/^(alarm|alert|default|beep|reset)$/i.test(a)) { delete c.tones[m.sender]; saveRem(); return m.reply(`🔔 Your reminders will play the ${BM} alert sound.`); }
      if (/^(off|none|silent|mute)$/i.test(a)) { c.tones[m.sender] = { type: 'none' }; saveRem(); return m.reply('🔕 Your reminders will be silent (just the tagged message).'); }
      c.tones[m.sender] = { type: 'song', query: a.replace(/^(song|play|music)\b\s*:?\s*/i, '').slice(0, 100) }; saveRem();
      m.reply(`🎵 Your reminders will play: *${c.tones[m.sender].query}*\n_If the song cannot be fetched, I send the ${BM} alert sound instead._`);
    }
  },
  {
    command: ['reminders'],
    aliases: ['myreminders', 'listreminders'],
    description: 'List your reminders',
    category: 'tools',
    handler: async (client, m) => {
      grab(client);
      const mine = loadRem().list.filter(r => r.sender === m.sender).sort((a, b) => a.at - b.at);
      if (!mine.length) return m.reply('You have no reminders. Set one: *.remind 30m call mum*');
      m.reply(`⏰ *Your reminders*\n\n` + mine.map((r, i) => `${i + 1}. ${r.text}\n    🕒 ${nairobiStamp(r.at)} (in ${human(r.at - Date.now())})`).join('\n\n') + '\n\n*.unremind <number>* to cancel');
    }
  },
  {
    command: ['unremind'],
    aliases: ['cancelreminder', 'delreminder'],
    description: 'Cancel a reminder (.unremind 1 / .unremind all)',
    category: 'tools',
    handler: async (client, m, { text }) => {
      grab(client);
      const c = loadRem(), mine = c.list.filter(r => r.sender === m.sender).sort((a, b) => a.at - b.at);
      const a = String(text || '').trim().toLowerCase();
      if (!mine.length) return m.reply('You have no reminders.');
      if (a === 'all') { c.list = c.list.filter(r => r.sender !== m.sender); saveRem(); return m.reply('🗑️ All your reminders were cancelled.'); }
      const r = mine[Number(a) - 1];
      if (!r) return m.reply('Send the number from *.reminders*, e.g. *.unremind 1*');
      c.list = c.list.filter(x => x.id !== r.id); saveRem();
      m.reply(`🗑️ Cancelled: ${r.text}`);
    }
  },

  // ───────────────────────── .roast ──────────────────────────
  {
    command: ['roast'],
    aliases: ['burn', 'roastme'],
    description: 'A playful roast (tag someone, reply to them, or roast yourself)',
    category: 'fun',
    handler: async (client, m, { text }) => {
      grab(client);
      const jid = (m.mentionedJid && m.mentionedJid[0]) || (m.quoted && m.quoted.sender) || m.sender;
      const n = '@' + num(jid);
      const hint = String(text || '').replace(/@\d+/g, '').trim().slice(0, 80);
      let line = await askAI(`Write ONE short, funny, light-hearted roast (max 2 sentences) of a friend named "${num(jid)}"${hint ? ' who is known for: ' + hint : ''}. Keep it playful and clean. No insults about family, race, tribe, religion, body, disability or death. Output only the roast.`);
      if (line) line = line.replace(/^["“]|["”]$/g, '').replace(num(jid), n);
      if (!line) line = pickOne(ROASTS).replace('{n}', n);
      await client.sendMessage(m.chat, { text: `🔥 *${BM} ROAST*\n\n${line}\n\n_all love, no hate_ 😈`, mentions: [jid] }, { quoted: m });
    }
  },

  // ───────────────────────── .caption ────────────────────────
  {
    command: ['caption'],
    aliases: ['captions', 'igcaption', 'captionidea'],
    description: 'Caption ideas for a post (.caption <topic> [funny|deep|savage|love|hustle|vibes])',
    category: 'tools',
    handler: async (client, m, { text }) => {
      grab(client);
      let t = String(text || quotedText(m) || '').trim();
      const vibes = Object.keys(CAPTIONS);
      let vibe = (t.match(new RegExp('\\b(' + vibes.join('|') + ')\\b', 'i')) || [])[1];
      if (vibe) t = t.replace(new RegExp('\\b' + vibe + '\\b', 'i'), '').trim();
      vibe = (vibe || '').toLowerCase();
      if (!t && !vibe) return m.reply(`📝 *${BM} Captions*\n\n*.caption beach day with friends*\n*.caption new shoes savage*\n*.caption gym hustle*\n\nVibes: ${vibes.join(', ')}`);
      let out = await askAI(`Write 5 short, catchy social media captions about: "${t || 'a nice day'}". Vibe: ${vibe || 'mixed'}. One per line, numbered 1-5, each with at most one emoji. Output only the 5 lines.`);
      let src = '';
      if (!out || out.split('\n').filter(l => /^\s*\d/.test(l)).length < 3) {
        const pool = CAPTIONS[vibe] || [].concat(...Object.values(CAPTIONS));
        const picks = []; const copy = pool.slice();
        while (picks.length < 5 && copy.length) picks.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
        out = picks.map((p, i) => `${i + 1}. ${p.replace(' {t}', t ? ' ' + t.charAt(0).toUpperCase() + t.slice(1) + '.' : '').replace('{t}', t || 'this')}`).join('\n');
        src = '';
      }
      m.reply(`📝 *${BM} Caption ideas*\n\n${out}\n\n_Tip: add a vibe word, e.g._ *.caption ${t || 'my new look'} ${vibe || 'savage'}*`);
    }
  },

  // ───────────────────────── .hashtags ───────────────────────
  {
    command: ['hashtags'],
    aliases: ['hashtag', 'tags'],
    description: 'Hashtags for a post (.hashtags <topic or caption>)',
    category: 'tools',
    handler: async (client, m, { text }) => {
      grab(client);
      const t = String(text || quotedText(m) || '').trim();
      if (!t) return m.reply(`#️⃣ *${BM} Hashtags*\n\n*.hashtags nyama choma weekend*\n*.hashtags new sneakers drop in Nairobi*\n\nOr reply to a caption with *.hashtags*`);
      const lower = t.toLowerCase();
      const words = [...new Set(lower.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP.has(w)))].slice(0, 8);
      const own = words.map(w => '#' + w.charAt(0).toUpperCase() + w.slice(1));
      const joined = words.length > 1 ? ['#' + words.slice(0, 2).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')] : [];
      let niche = [];
      for (const [k, re] of Object.entries(TAGKEYS)) if (re.test(lower)) niche = niche.concat(TAGBANK[k]);
      const generic = ['#Trending', '#Viral', '#Explore', '#ForYou', '#Reels', '#InstaGood', '#Fyp', '#Follow'];
      const all = [...new Set([...own, ...joined, ...niche.slice(0, 14), ...generic])].slice(0, 20);
      m.reply(`#️⃣ *${BM} Hashtags*\n\n${all.join(' ')}\n\n_${all.length} tags • copy and paste under your post. Instagram works best with 8 to 15._`);
    }
  },

  // ───────────────────────── .mockup ─────────────────────────
  {
    command: ['mockup'],
    aliases: ['productpost', 'adpost', 'sellpost'],
    description: 'Ready-to-post product ad (.mockup Product | price | details | contact)',
    category: 'tools',
    handler: async (client, m, { text }) => {
      grab(client);
      const p = String(text || '').split('|').map(s => s.trim());
      const [name, price, details, contact] = p;
      if (!name) return m.reply(`🛍️ *${BM} Mockup (product post)*\n\n*.mockup Product name | price | details | contact*\n\nExample:\n*.mockup Leather Sneakers | KSh 3,500 | sizes 38-45, durable, free delivery in Nairobi | 0712 345 678*\n\nDetails and contact are optional.`);
      const feats = (details || '').split(/[,;]+/).map(s => s.trim()).filter(Boolean).slice(0, 8);
      let blurb = await askAI(`Write one punchy 2-sentence sales pitch for "${name}"${details ? ' (' + details + ')' : ''} for a WhatsApp status. Friendly, Kenyan market tone, one emoji at most. Output only the pitch.`);
      if (!blurb) blurb = pickOne([`Meet your new favourite: ${name}. Quality you can feel, at a price that makes sense.`, `${name}: made to impress, priced to move. Grab yours before it is gone!`, `Upgrade your day with ${name}. Limited stock, so do not sleep on it.`]);
      const post = [
        `🔥 *${name.toUpperCase()}* 🔥`, '', blurb.replace(/\s+/g, ' ').trim(), '',
        feats.length ? feats.map(f => `✅ ${f.charAt(0).toUpperCase() + f.slice(1)}`).join('\n') + '\n' : '',
        price ? `💰 *Price:* ${price}` : '', contact ? `📞 *Order:* ${contact}` : '📩 *Order now, send a DM*',
        '', '⚡ Limited stock. Be quick!', '🚚 Delivery available'
      ].filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n');
      m.reply(post + `\n\n_${BM}_`);
    }
  },

  // ───────────────────────── .cv ─────────────────────────────
  {
    command: ['cv'],
    aliases: ['resume', 'makecv'],
    description: 'Make a CV PDF (.cv Name | Title | Phone | Email | Location | Skills | Experience | Education | About)',
    category: 'tools',
    handler: async (client, m, { text }) => {
      grab(client);
      const p = String(text || '').split('|').map(s => s.trim());
      if (p.length < 4 || !p[0]) {
        return m.reply(`📄 *${BM} CV maker*\n\nSend your details in one message, separated with |\n\n*.cv Name | Job title | Phone | Email | Location | Skills | Experience | Education | About me*\n\nExample:\n*.cv Jane Wanjiru | Graphic Designer | 0712 345 678 | jane@mail.com | Nairobi | Photoshop, Illustrator, Branding | Designer at Pixel Co, 2021-2024; Intern at Studio X, 2020 | BSc Design, UoN 2020 | Creative designer who loves clean, bold work*\n\n• Skills: separate with commas\n• Experience and education: separate items with ;\n• About me is optional, I write one if you skip it.\n• You get a ready PDF.`);
      }
      const [name, title, phone, email, loc, skills, exp, edu, about0] = p;
      const sk = (skills || '').split(',').map(s => s.trim()).filter(Boolean);
      const split = (s) => (s || '').split(';').map(x => x.trim()).filter(Boolean);
      await m.reply('📄 _Building your CV..._');
      let about = about0;
      if (!about) {
        about = await askAI(`Write a professional 2-sentence CV summary for ${name}, a ${title || 'professional'}${sk.length ? ' skilled in ' + sk.join(', ') : ''}. First person implied, no "I". Output only the summary.`);
        if (!about) about = `${title || 'Dedicated professional'} with strong skills${sk.length ? ' in ' + sk.slice(0, 3).join(', ') : ''}, a reliable work ethic and a drive to deliver quality results.`;
      }
      about = about.replace(/\s+/g, ' ').trim().slice(0, 600);
      const items = [
        { text: name.toUpperCase(), size: 24, bold: true }, ...(title ? [{ text: title, size: 13, color: '0.25 0.25 0.25' }] : []),
        { text: [phone, email, loc].filter(Boolean).join('   |   '), size: 10, color: '0.3 0.3 0.3' }, { gap: 6, rule: true }, { gap: 6 },
        { text: 'PROFILE', size: 12, bold: true }, { text: about, size: 10.5 }, { gap: 8 }
      ];
      if (sk.length) items.push({ text: 'SKILLS', size: 12, bold: true }, { text: sk.join('  -  '), size: 10.5 }, { gap: 8 });
      if (split(exp).length) { items.push({ text: 'EXPERIENCE', size: 12, bold: true }); split(exp).forEach(e => items.push({ text: '- ' + e, size: 10.5, indent: 6 })); items.push({ gap: 8 }); }
      if (split(edu).length) { items.push({ text: 'EDUCATION', size: 12, bold: true }); split(edu).forEach(e => items.push({ text: '- ' + e, size: 10.5, indent: 6 })); items.push({ gap: 8 }); }
      items.push({ text: 'References available on request.', size: 10, color: '0.35 0.35 0.35' });
      const pdf = buildPdf(items);
      await client.sendMessage(m.chat, { document: pdf, mimetype: 'application/pdf', fileName: `${name.replace(/[^\w]+/g, '_')}_CV.pdf`, caption: `📄 *${name}*, your CV is ready. • ${TAG}` }, { quoted: m });
    }
  },

  // ───────────────────────── .linkcheck ──────────────────────
  {
    command: ['linkcheck'],
    aliases: ['checklink', 'scamcheck', 'isitsafe'],
    description: 'Check whether a link looks like a scam (.linkcheck <url>)',
    category: 'tools',
    handler: async (client, m, { text }) => {
      grab(client);
      const src = `${text || ''} ${quotedText(m)}`;
      let url = (src.match(/https?:\/\/[^\s<>"']+/i) || [])[0];
      if (!url) { const bare = (src.match(/\b[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?/i) || [])[0]; if (bare) url = 'http://' + bare; }
      if (!url) return m.reply(`🛡️ *${BM} Link check*\n\nSend a link or reply to one:\n*.linkcheck https://example.com/win-prize*\n\nI look for scam tricks. I never open anything dangerous.`);
      let a = analyseUrl(url), finalUrl = null, fa = null;
      try {
        const r = await axios.get(url, { maxRedirects: 6, timeout: 9000, validateStatus: () => true, responseType: 'stream', headers: { 'User-Agent': UA } });
        finalUrl = (r.request && r.request.res && r.request.res.responseUrl) || null;
        if (r.data && r.data.destroy) r.data.destroy();
      } catch (_) {}
      if (finalUrl && finalUrl !== url) { fa = analyseUrl(finalUrl); if (fa.host && fa.host !== a.host) { a.score += Math.min(fa.score, 6); a.flags.push(`Redirects to a different site: *${fa.host}*`); fa.flags.forEach(f => a.flags.push('↳ ' + f)); } }
      const verdict = a.score >= 5 ? '🚨 *LOOKS DANGEROUS*' : a.score >= 2 ? '⚠️ *SUSPICIOUS*' : '✅ *Nothing alarming found*';
      m.reply(`🛡️ *${BM} Link check*\n\n🔗 ${url.slice(0, 120)}\n🌐 Site: ${a.host || '?'}\n\n${verdict}\n` +
        (a.flags.length ? '\n' + a.flags.map(f => '• ' + f).join('\n') + '\n' : '') +
        `\n_This is a quick check of the link's shape, not a guarantee. Never enter passwords, PINs or M-Pesa codes on a link someone sent you._`);
    }
  },

  // ───────────────────────── .exif ───────────────────────────
  {
    command: ['exif'],
    aliases: ['photoinfo', 'metadata', 'stripexif'],
    description: 'Show or remove the hidden data in a photo (.exif / .exif strip)',
    category: 'tools',
    handler: async (client, m, { text }) => {
      grab(client);
      const strip = /strip|remove|clean|wipe/i.test(text || '');
      const dir = makeDir('exif');
      try {
        const x = await needMedia(client, m, /image/, `🔎 *${BM} EXIF*\n\nReply to a photo sent as a *Document* (long-press attach → Document) with:\n*.exif*  shows camera, date and GPS\n*.exif strip*  removes all hidden data\n\nWhatsApp deletes this data from normal photos, so only "Document" photos still have it.`);
        if (!x) return;
        if (strip) {
          const inFile = path.join(dir, `in.${extFor(x.mime)}`); fs.writeFileSync(inFile, x.buf);
          const out = path.join(dir, 'clean.jpg');
          await ff(['-y', '-i', inFile, '-map_metadata', '-1', '-frames:v', '1', '-q:v', '2', out]);
          await client.sendMessage(m.chat, { document: fs.readFileSync(out), mimetype: 'image/jpeg', fileName: 'clean_photo.jpg', caption: `🧽 Hidden data removed • ${TAG}` }, { quoted: m });
          return;
        }
        const e = readExif(x.buf);
        if (e === null) return m.reply('⚠️ I can read EXIF only from JPEG photos.');
        const keys = Object.keys(e).filter(k => e[k] !== undefined && e[k] !== '');
        if (!keys.length) return m.reply('🔎 No hidden data found. WhatsApp removes it from normal photos. Send the photo as a *Document* to keep it.');
        const lines = [
          e.make || e.model ? `📷 Camera: ${[e.make, e.model].filter(Boolean).join(' ')}` : null,
          e.taken ? `🕒 Taken: ${e.taken}` : null,
          e.width && e.height ? `📐 Size: ${e.width} × ${e.height}` : null,
          e.iso ? `🎞️ ISO: ${e.iso}` : null, e.fnum ? `🔆 Aperture: f/${Number(e.fnum).toFixed(1)}` : null,
          e.exposure ? `⏱️ Shutter: ${e.exposure < 1 ? '1/' + Math.round(1 / e.exposure) : e.exposure}s` : null,
          e.focal ? `🔭 Focal length: ${Math.round(e.focal)}mm` : null, e.software ? `🧰 Software: ${e.software}` : null,
          e.gps ? `📍 GPS: ${e.gps.lat.toFixed(5)}, ${e.gps.lon.toFixed(5)}\n🗺️ https://maps.google.com/?q=${e.gps.lat.toFixed(6)},${e.gps.lon.toFixed(6)}` : null
        ].filter(Boolean);
        m.reply(`🔎 *${BM} Photo info*\n\n${lines.join('\n')}` + (e.gps ? '\n\n⚠️ This photo shows *where it was taken*. Use *.exif strip* before sharing it publicly.' : ''));
      } catch (er) { m.reply('❌ Failed: ' + er.message); }
      finally { rmDir(dir); }
    }
  },

  // ───────────────────────── .base64 ─────────────────────────
  {
    command: ['base64'],
    aliases: ['b64', 'encode64', 'decode64'],
    description: 'Base64 encode / decode text (.base64 encode hello / .base64 decode aGVsbG8=)',
    category: 'tools',
    handler: async (client, m, { text }) => {
      grab(client);
      let t = String(text || '').trim();
      let mode = null;
      const mm = t.match(/^(encode|enc|e|decode|dec|d)\b\s*([\s\S]*)$/i);
      if (mm) { mode = /^e/i.test(mm[1]) ? 'enc' : 'dec'; t = mm[2].trim(); }
      if (!t) t = quotedText(m).trim();
      if (!t) return m.reply(`🔤 *${BM} Base64*\n\n*.base64 encode Hello Kenya*\n*.base64 decode SGVsbG8gS2VueWE=*\n\nOr reply to a message with *.base64 encode* / *.base64 decode*`);
      if (!mode) mode = /^[A-Za-z0-9+/_-]{8,}={0,2}$/.test(t) && t.length % 4 !== 1 ? 'dec' : 'enc';
      try {
        if (mode === 'enc') return m.reply(`🔤 *${BM} Base64 · encoded*\n\n${Buffer.from(t, 'utf8').toString('base64')}`);
        const clean = t.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
        if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean)) return m.reply('⚠️ That is not valid Base64.');
        const out = Buffer.from(clean, 'base64').toString('utf8');
        if (!out || /�/.test(out)) return m.reply('⚠️ That decodes to something that is not text.');
        m.reply(`🔤 *${BM} Base64 · decoded*\n\n${out}`);
      } catch (e) { m.reply('❌ Failed: ' + e.message); }
    }
  },

  // ───────────────────────── .encrypt / .decrypt ─────────
  {
    command: ['encrypt'],
    aliases: ['lock', 'seal'],
    description: 'Lock a message with a password (.encrypt password | message)',
    category: 'tools',
    handler: async (client, m, { text }) => {
      grab(client);
      const s = String(text || '');
      const i = s.indexOf('|');
      const pass = i > 0 ? s.slice(0, i).trim() : '', msg = i > 0 ? s.slice(i + 1).trim() : '';
      if (!pass || !msg) return m.reply(`🔐 *${BM} Encrypt*\n\n*.encrypt mypassword | the secret message*\n\nYou get a code that only the password can open. Send the code to a friend and tell them the password in a different way.\nBest done in a private chat with me.\n\n*.decrypt mypassword | <code>*`);
      if (pass.length < 4) return m.reply('⚠️ Use a password of at least 4 characters.');
      try {
        const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12);
        const key = crypto.scryptSync(pass, salt, 32);
        const c = crypto.createCipheriv('aes-256-gcm', key, iv);
        const ct = Buffer.concat([c.update(msg, 'utf8'), c.final()]);
        const token = 'BMD1.' + Buffer.concat([salt, iv, c.getAuthTag(), ct]).toString('base64url');
        if (m.isGroup && m.key) { try { await client.sendMessage(m.chat, { delete: m.key }); } catch (_) {} }
        await client.sendMessage(m.chat, { text: `🔐 *${BM} Encrypted*\n\n${token}\n\n_Open it with:_ *.decrypt <password> | code*` + (m.isGroup ? '\n\n⚠️ Your password was visible in the group. Next time do this in a private chat with me.' : '') }, { quoted: m.isGroup ? undefined : m });
      } catch (e) { m.reply('❌ Failed: ' + e.message); }
    }
  },
  {
    command: ['decrypt'],
    aliases: ['unlock', 'unseal'],
    description: 'Open an encrypted message (.decrypt password | code)',
    category: 'tools',
    handler: async (client, m, { text }) => {
      grab(client);
      const s = String(text || '');
      const i = s.indexOf('|');
      let pass, token;
      if (i > 0) { pass = s.slice(0, i).trim(); token = s.slice(i + 1).trim(); }
      else { pass = s.trim(); token = (quotedText(m).match(/BMD1\.[A-Za-z0-9_-]+/) || [])[0] || ''; }
      if (!token) { const f = s.match(/BMD1\.[A-Za-z0-9_-]+/); if (f) { token = f[0]; pass = s.replace(token, '').replace('|', '').trim(); } }
      if (!pass || !token) return m.reply(`🔓 *${BM} Decrypt*\n\n*.decrypt mypassword | BMD1.xxxxx*\n\nOr reply to the code with *.decrypt mypassword*`);
      try {
        const raw = Buffer.from(token.replace(/^BMD1\./, ''), 'base64url');
        if (raw.length < 45) throw new Error('bad');
        const salt = raw.subarray(0, 16), iv = raw.subarray(16, 28), tag = raw.subarray(28, 44), ct = raw.subarray(44);
        const d = crypto.createDecipheriv('aes-256-gcm', crypto.scryptSync(pass, salt, 32), iv);
        d.setAuthTag(tag);
        const out = Buffer.concat([d.update(ct), d.final()]).toString('utf8');
        if (m.isGroup && m.key) { try { await client.sendMessage(m.chat, { delete: m.key }); } catch (_) {} }
        await client.sendMessage(m.chat, { text: `🔓 *${BM} Decrypted*\n\n${out}` }, { quoted: m.isGroup ? undefined : m });
      } catch (_) { m.reply('❌ Wrong password, or the code is damaged.'); }
    }
  },

  // ───────────────────────── .fuel ───────────────────────────
  {
    command: ['fuel'],
    aliases: ['petrol', 'fuelprice', 'epra', 'fuelprices'],
    description: 'Kenya fuel prices (.fuel, .fuel mombasa, .fuel calc 40)',
    category: 'tools',
    handler: async (client, m, { text }) => {
      grab(client);
      const d = loadFuel();
      if (!d || !d.towns || !Object.keys(d.towns).length) return m.reply(`⛽ *${BM} Fuel*\n\nNo prices saved yet. The owner sets them after each EPRA review (the 14th of the month):\n*.fuelset nairobi 226.96 227.76 219.87*\n(super petrol, diesel, kerosene)`);
      const words = String(text || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
      const calc = words[0] === 'calc' || words[0] === 'cost';
      const lit = calc ? Number(words.find(w => /^\d+(\.\d+)?$/.test(w))) : null;
      const kind = words.find(w => /^(diesel|kerosene|petrol|super)$/.test(w));
      const town = words.find(w => d.towns[w]) || (d.towns.nairobi ? 'nairobi' : Object.keys(d.towns)[0]);
      const t = d.towns[town];
      const age = d.updated ? Math.floor((Date.now() - new Date(d.updated).getTime()) / 86400000) : null;
      const stale = age !== null && age > 35 ? `\n\n⚠️ _These prices were saved ${age} days ago, so they may be out of date._` : '';
      const name = town.charAt(0).toUpperCase() + town.slice(1);
      if (calc) {
        if (!lit || lit <= 0 || lit > 5000) return m.reply('⛽ Example: *.fuel calc 40*  or  *.fuel calc 25 diesel mombasa*');
        const k = kind === 'diesel' ? 'diesel' : kind === 'kerosene' ? 'kerosene' : 'super';
        const price = t[k];
        return m.reply(`⛽ *${BM} Fuel cost*\n\n${lit} litres of ${k === 'super' ? 'super petrol' : k} in ${name}\n💰 *KSh ${(lit * price).toLocaleString('en-KE', { maximumFractionDigits: 0 })}*\n_(at KSh ${price} per litre)_${stale}`);
      }
      const others = Object.keys(d.towns).filter(x => x !== town).map(x => x.charAt(0).toUpperCase() + x.slice(1));
      m.reply(`⛽ *${BM} Fuel prices · ${name}*\n${d.cycle ? '🗓️ ' + d.cycle + '\n' : ''}\n🟢 Super petrol: *KSh ${t.super}*\n🟡 Diesel: *KSh ${t.diesel}*\n🔵 Kerosene: *KSh ${t.kerosene}*\n\n_per litre • EPRA maximum pump prices_` +
        (others.length ? `\n\nOther towns: ${others.join(', ')}  (e.g. *.fuel ${others[0].toLowerCase()}*)` : '') + `\nCost for a tank: *.fuel calc 40*` + stale);
    }
  },
  {
    command: ['fuelset'],
    aliases: ['setfuel'],
    description: 'Owner: save new fuel prices (.fuelset nairobi 226.96 227.76 219.87)',
    category: 'tools',
    handler: async (client, m, { text, Owner, NotOwner }) => {
      grab(client);
      if (!Owner) return m.reply(NotOwner || 'Owner only.');
      const s = String(text || '').trim();
      const d = loadFuel() || { towns: {} };
      const cyc = s.match(/^cycle\s+([\s\S]+)$/i);
      if (cyc) { d.cycle = cyc[1].trim().slice(0, 60); d.updated = new Date().toISOString(); fs.writeFileSync(FUEL_FILE, JSON.stringify(d)); return m.reply(`✅ Cycle label saved: ${d.cycle}`); }
      const mm = s.match(/^([a-z ]+?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)$/i);
      if (!mm) return m.reply('⛽ Format: *.fuelset <town> <super> <diesel> <kerosene>*\nExample: *.fuelset nairobi 226.96 227.76 219.87*\nLabel the period: *.fuelset cycle 15 Oct - 14 Nov 2026*');
      d.towns = d.towns || {};
      d.towns[mm[1].trim().toLowerCase()] = { super: Number(mm[2]), diesel: Number(mm[3]), kerosene: Number(mm[4]) };
      d.updated = new Date().toISOString();
      fs.writeFileSync(FUEL_FILE, JSON.stringify(d));
      m.reply(`✅ Saved for *${mm[1].trim()}*: super ${mm[2]}, diesel ${mm[3]}, kerosene ${mm[4]}`);
    }
  },

  // ───────────────────────── .time ───────────────────────────
  {
    command: ['time', 'worldtime'],
    aliases: ['clock', 'timein', 'whattime'],
    description: 'Time in any city or country (.time tokyo)',
    category: 'tools',
    handler: async (client, m, { text }) => {
      grab(client);
      const q = String(text || '').trim().replace(/^in\s+/i, '');
      const home = clock('Africa/Nairobi');
      if (!q) {
        const list = ['Africa/Nairobi', 'Africa/Lagos', 'Africa/Johannesburg', 'Europe/London', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Tokyo', 'Australia/Sydney', 'America/New_York', 'America/Los_Angeles'];
        return m.reply(`🕒 *${BM} World time*\n\n` + list.map(z => { const c = clock(z); return `${c.icon} ${z.split('/').pop().replace(/_/g, ' ').padEnd(14)} *${c.time}*  ${offLabel(c.off)}`; }).join('\n') + `\n\nTry *.time paris* or *.time Asia/Seoul*`);
      }
      const tz = resolveTz(q);
      if (!tz) return m.reply(`⚠️ I do not know "${q}". Try a big city or country, e.g. *.time london*, *.time dubai*, or a zone like *.time America/Chicago*`);
      const c = clock(tz), diff = c.off - home.off;
      const dh = Math.abs(diff) / 60;
      const label = CITY_TZ[q.toLowerCase()] ? q.replace(/\b\w/g, ch => ch.toUpperCase()) : tz.split('/').pop().replace(/_/g, ' ');
      m.reply(`🕒 *${BM} Time · ${label}*\n\n${c.icon} *${c.time}*\n📅 ${c.date}\n🌍 ${tz} (${offLabel(c.off)})\n\n` + (diff === 0 ? '_Same time as Nairobi._' : `_${Number.isInteger(dh) ? dh : dh.toFixed(1)} hour${dh === 1 ? '' : 's'} ${diff > 0 ? 'ahead of' : 'behind'} Nairobi (${home.time} there)._`));
    }
  }
];
