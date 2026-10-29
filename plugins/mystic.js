'use strict';

const fs = require('fs');
const path = require('path');
const dns = require('dns').promises;
const net = require('net');
const crypto = require('crypto');

const BM = '𝐁𝐋𝐀𝐂𝐊-𝐌𝐃';
const TAG = `_${BM}_`;
const bar = (t) => `*${BM} · ${t}*`;
const sans = (s) => String(s).replace(/[A-Za-z0-9]/g, (c) => {
  const k = c.charCodeAt(0);
  if (k >= 97) return String.fromCodePoint(0x1D5EE + k - 97);
  if (k >= 65) return String.fromCodePoint(0x1D5D4 + k - 65);
  return String.fromCodePoint(0x1D7EC + k - 48);
});
const numOf = (j) => String(j || '').split('@')[0].split(':')[0];
const quotedText = (m) => (m.quoted ? [m.quoted.text, m.quoted.body, m.quoted.caption, m.quoted.msg?.text].find(Boolean) || '' : '');
const nairobi = (ms, o) => new Date(ms).toLocaleString('en-GB', { timeZone: 'Africa/Nairobi', hour12: false, ...o });
const EAT = 3 * 3600 * 1000;

const FILE = path.join(process.cwd(), 'mystic_data.json');
let data = null;
const store = () => {
  if (!data) {
    try { data = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (_) { data = {}; }
    data.caps = data.caps || [];
    data.notes = data.notes || {};
  }
  return data;
};
const save = () => { try { fs.writeFileSync(FILE, JSON.stringify(data)); } catch (_) {} };

const looksLikeSock = (v) => v && typeof v === 'object' && v.ev && typeof v.sendMessage === 'function';
function findSocket() {
  for (const k of ['conn', 'client', 'sock', 'Matrix', 'bot', 'socket']) { if (looksLikeSock(global[k])) return global[k]; }
  for (const k of Object.keys(global)) { try { if (looksLikeSock(global[k])) return global[k]; } catch (_) {} }
  return null;
}
let lastClient = null;

const UNIT = { s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 };
function parseWhen(input) {
  const t = String(input || '').trim().toLowerCase();
  let m = t.match(/^(\d+)\s*(s|m|h|d|w)$/);
  if (m) return Date.now() + Number(m[1]) * UNIT[m[2]];
  m = t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/);
  if (m) {
    const ms = Date.UTC(+m[3], +m[2] - 1, +m[1], m[4] ? +m[4] : 8, m[5] ? +m[5] : 0) - EAT;
    return new Date(ms).getUTCMonth() === +m[2] - 1 ? ms : null;
  }
  return null;
}
async function deliverCaps() {
  const client = lastClient || findSocket();
  if (!client) return;
  const s = store();
  const due = s.caps.filter(c => c.at <= Date.now());
  if (!due.length) return;
  s.caps = s.caps.filter(c => c.at > Date.now());
  save();
  for (const c of due) {
    const ago = Math.max(1, Math.round((Date.now() - c.made) / 86400000));
    try { await client.sendMessage(c.jid, { text: [bar('Time Capsule'), '', `📜 Sealed ${nairobi(c.made, { day: '2-digit', month: 'short', year: 'numeric' })} (${ago} day${ago === 1 ? '' : 's'} ago). It was written by you:`, '', `❝ ${c.text} ❞`, '', TAG].join('\n') }); } catch (_) {}
  }
}
const timer = setInterval(() => { deliverCaps().catch(() => {}); }, 30000);
if (timer.unref) timer.unref();

function caesar(text, k) {
  return text.replace(/[a-z]/gi, (c) => { const b = c <= 'Z' ? 65 : 97; return String.fromCharCode(((c.charCodeAt(0) - b + k) % 26 + 26) % 26 + b); });
}
function vigenere(text, key, dir) {
  const ks = key.toLowerCase().replace(/[^a-z]/g, '');
  if (!ks) throw new Error('The key must contain letters');
  let i = 0;
  return text.replace(/[a-z]/gi, (c) => { const b = c <= 'Z' ? 65 : 97; const k = ks.charCodeAt(i++ % ks.length) - 97; return String.fromCharCode(((c.charCodeAt(0) - b + dir * k) % 26 + 26) % 26 + b); });
}
function atbash(text) { return text.replace(/[a-z]/gi, (c) => { const b = c <= 'Z' ? 65 : 97; return String.fromCharCode(b + 25 - (c.charCodeAt(0) - b)); }); }
function railPattern(len, rails) {
  const p = []; let r = 0, d = 1;
  for (let i = 0; i < len; i++) { p.push(r); if (rails > 1) { if (r === 0) d = 1; else if (r === rails - 1) d = -1; r += d; } }
  return p;
}
function railEncode(text, rails) {
  const p = railPattern(text.length, rails);
  const rows = Array.from({ length: rails }, () => []);
  [...text].forEach((c, i) => rows[p[i]].push(c));
  return rows.flat().join('');
}
function railDecode(text, rails) {
  const p = railPattern(text.length, rails);
  const order = p.map((r, i) => [r, i]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out = [];
  order.forEach(([, pos], idx) => { out[pos] = text[idx]; });
  return out.join('');
}
function runCipher(args, decode) {
  const kind = (args[0] || '').toLowerCase();
  if (kind === 'rot13') return caesar(args.slice(1).join(' '), 13);
  if (kind === 'atbash') return atbash(args.slice(1).join(' '));
  if (kind === 'caesar') { const k = parseInt(args[1], 10); if (isNaN(k)) throw new Error('Give a shift: caesar 3 text'); return caesar(args.slice(2).join(' '), decode ? -k : k); }
  if (kind === 'vigenere') return vigenere(args.slice(2).join(' '), args[1] || '', decode ? -1 : 1);
  if (kind === 'rail') { const r = parseInt(args[1], 10); if (!(r >= 2 && r <= 10)) throw new Error('Rails must be 2 to 10'); const t = args.slice(2).join(' '); return decode ? railDecode(t, r) : railEncode(t, r); }
  throw new Error('Ciphers: caesar, vigenere, atbash, rot13, rail');
}

const OMEN = ['A door you ignored will open itself.', 'Someone is quietly rooting for you.', 'Say the thing you keep rehearsing.', 'Money moves toward the one who finishes things.', 'An old message deserves a reply today.', 'Rest is part of the plan, not a detour.', 'The quiet option is the strong one.', 'You will be asked for help, and it will be worth giving.', 'A small habit started today pays out all year.', 'Watch what is repeated, it is telling you something.', 'Good news travels slowly, be patient.', 'Trust the plan more than the mood.'];
const COLOURS = ['Obsidian', 'Midnight blue', 'Crimson', 'Emerald', 'Gold', 'Violet', 'Silver', 'Amber', 'Teal', 'Ivory'];
const AVOID = ['arguing online', 'impulse purchases', 'late-night overthinking', 'skipping breakfast', 'unread-message guilt', 'borrowed advice', 'scrolling before sleep', 'rushing the last step'];

const RIDDLES = [
  ['I speak without a mouth and hear without ears. I have no body, but I come alive with wind. What am I?', 'An echo'],
  ['The more of me you take, the more you leave behind. What am I?', 'Footsteps'],
  ['I have cities but no houses, mountains but no trees, water but no fish. What am I?', 'A map'],
  ['What has keys but opens no locks, space but no room, and you can enter but not go inside?', 'A keyboard'],
  ['I am always in front of you but cannot be seen. What am I?', 'The future'],
  ['What gets wetter the more it dries?', 'A towel'],
  ['I have hands but cannot clap. What am I?', 'A clock'],
  ['What can travel around the world while staying in a corner?', 'A stamp'],
  ['The one who makes me does not need me, the one who buys me does not use me, the one who uses me does not know it. What am I?', 'A coffin'],
  ['What breaks when you say its name?', 'Silence'],
  ['I shrink every time I am used, yet I never complain. What am I?', 'A bar of soap'],
  ['What has a neck but no head, and wears a cap?', 'A bottle'],
  ['What goes up and never comes down?', 'Your age'],
  ['Forward I am heavy, backward I am not. What am I?', 'The word "ton"'],
  ['I am taken from a mine and shut in a wooden case, from which I am never released, and yet I am used by almost everyone. What am I?', 'A pencil lead']
];
const RIDDLE_STATE = new Map();

const ZW0 = '​', ZW1 = '‌', ZWM = '⁠';
function ghostEncode(cover, secret) {
  const bits = [...Buffer.from(secret, 'utf8')].map(b => b.toString(2).padStart(8, '0')).join('');
  const payload = ZWM + [...bits].map(b => (b === '0' ? ZW0 : ZW1)).join('') + ZWM;
  const chars = [...cover];
  return chars[0] + payload + chars.slice(1).join('');
}
function ghostDecode(text) {
  const mt = text.match(new RegExp(ZWM + '([' + ZW0 + ZW1 + ']+)' + ZWM));
  if (!mt) return null;
  const bits = [...mt[1]].map(c => (c === ZW0 ? '0' : '1')).join('');
  const bytes = bits.match(/.{8}/g) || [];
  return Buffer.from(bytes.map(b => parseInt(b, 2))).toString('utf8');
}

const DIAL = { 1: 'USA / Canada', 7: 'Russia / Kazakhstan', 20: 'Egypt', 27: 'South Africa', 30: 'Greece', 31: 'Netherlands', 32: 'Belgium', 33: 'France', 34: 'Spain', 36: 'Hungary', 39: 'Italy', 40: 'Romania', 41: 'Switzerland', 43: 'Austria', 44: 'United Kingdom', 45: 'Denmark', 46: 'Sweden', 47: 'Norway', 48: 'Poland', 49: 'Germany', 51: 'Peru', 52: 'Mexico', 54: 'Argentina', 55: 'Brazil', 56: 'Chile', 57: 'Colombia', 60: 'Malaysia', 61: 'Australia', 62: 'Indonesia', 63: 'Philippines', 64: 'New Zealand', 65: 'Singapore', 66: 'Thailand', 81: 'Japan', 82: 'South Korea', 84: 'Vietnam', 86: 'China', 90: 'Türkiye', 91: 'India', 92: 'Pakistan', 93: 'Afghanistan', 94: 'Sri Lanka', 98: 'Iran', 211: 'South Sudan', 212: 'Morocco', 213: 'Algeria', 216: 'Tunisia', 218: 'Libya', 220: 'Gambia', 221: 'Senegal', 233: 'Ghana', 234: 'Nigeria', 237: 'Cameroon', 243: 'DR Congo', 249: 'Sudan', 250: 'Rwanda', 251: 'Ethiopia', 252: 'Somalia', 253: 'Djibouti', 254: 'Kenya', 255: 'Tanzania', 256: 'Uganda', 257: 'Burundi', 258: 'Mozambique', 260: 'Zambia', 261: 'Madagascar', 263: 'Zimbabwe', 264: 'Namibia', 265: 'Malawi', 267: 'Botswana', 971: 'United Arab Emirates', 966: 'Saudi Arabia', 972: 'Israel', 974: 'Qatar', 962: 'Jordan', 961: 'Lebanon' };

function privateAddr(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const l = ip.toLowerCase();
  return l === '::1' || l.startsWith('fc') || l.startsWith('fd') || l.startsWith('fe80') || l.startsWith('::ffff:127.') || l.startsWith('::ffff:10.') || l.startsWith('::ffff:192.168.');
}

const decodeEntities = (s) => String(s || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/\s+/g, ' ').trim();
const metaOf = (html, key) => {
  const a = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']*)["']`, 'i'));
  const b = html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${key}["']`, 'i'));
  return decodeEntities((a && a[1]) || (b && b[1]) || '');
};

function buildPdf(title, text) {
  const W = 595, H = 842, M = 56, FS = 11, LH = 15, maxChars = 88;
  const clean = (s) => String(s).replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/…/g, '...').replace(/[^\x20-\x7e]/g, '?');
  const esc = (s) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const lines = [];
  for (const para of String(text).split(/\r?\n/).map(clean)) {
    if (!para.trim()) { lines.push(''); continue; }
    let cur = '';
    for (const w of para.split(/\s+/)) {
      let word = w;
      while (word.length > maxChars) { if (cur) { lines.push(cur); cur = ''; } lines.push(word.slice(0, maxChars)); word = word.slice(maxChars); }
      if ((cur + ' ' + word).trim().length > maxChars) { lines.push(cur); cur = word; } else cur = (cur + ' ' + word).trim();
    }
    lines.push(cur);
  }
  const perPage = Math.floor((H - M * 2 - 30) / LH);
  const pages = [];
  for (let i = 0; i < lines.length; i += perPage) pages.push(lines.slice(i, i + perPage));
  if (!pages.length) pages.push(['']);
  const objs = [];
  const add = (s) => { objs.push(s); return objs.length; };
  add('<< /Type /Catalog /Pages 2 0 R >>');
  add('');
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const bold = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
  const kids = [];
  pages.forEach((pl, pi) => {
    let c = '';
    if (pi === 0 && title) c += `BT /F2 16 Tf ${M} ${H - M} Td (${esc(clean(title))}) Tj ET\n`;
    const top = H - M - (pi === 0 && title ? 30 : 0);
    c += `BT /F1 ${FS} Tf ${LH} TL ${M} ${top} Td\n`;
    pl.forEach(l => { c += `(${esc(l)}) Tj T*\n`; });
    c += 'ET\n';
    c += `BT /F1 8 Tf ${W / 2 - 20} 28 Td (Page ${pi + 1} of ${pages.length}) Tj ET\n`;
    const cid = add(`<< /Length ${Buffer.byteLength(c)} >>\nstream\n${c}endstream`);
    kids.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${font} 0 R /F2 ${bold} 0 R >> >> /Contents ${cid} 0 R >>`));
  });
  objs[1] = `<< /Type /Pages /Kids [${kids.map(k => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`;
  let out = '%PDF-1.4\n';
  const off = [];
  objs.forEach((o, i) => { off.push(Buffer.byteLength(out)); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + off.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF`;
  return Buffer.from(out, 'latin1');
}

const defs = [];
const add = (command, aliases, description, usage, fn, opts = {}) => defs.push({ command, aliases, description, usage, fn, opts });

add(['timecap'], ['timecapsule', 'futuremsg'], 'Seal a message that is delivered to you in the future', 'timecap 30d Remember why you started  |  timecap 25/12/2026 08:00 Merry Christmas', async ({ t, m }) => {
  const mt = t.match(/^(\S+)(?:\s+(\d{1,2}:\d{2}))?\s+([\s\S]+)$/);
  let at = null, text = '';
  if (mt) {
    at = parseWhen(mt[2] ? `${mt[1]} ${mt[2]}` : mt[1]);
    text = mt[3];
    if (at == null && mt[2]) { at = parseWhen(mt[1]); text = `${mt[2]} ${mt[3]}`; }
  }
  if (at == null || !text.trim()) throw new Error('Format: timecap 30d your message  or  timecap 25/12/2026 08:00 your message');
  if (at < Date.now() + 60000) throw new Error('Pick a time at least a minute from now');
  if (at > Date.now() + 5 * 365 * 86400000) throw new Error('Five years is the limit');
  const jid = numOf(m.sender) + '@s.whatsapp.net';
  const s = store();
  if (s.caps.filter(c => c.jid === jid).length >= 5) throw new Error('You already have 5 sealed capsules');
  s.caps.push({ jid, at, made: Date.now(), text: text.trim().slice(0, 1500) });
  save();
  return [bar('Time Capsule'), '', '🔒 Sealed.', `It will reach you privately on *${nairobi(at, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}* (EAT).`, '', TAG].join('\n');
});

add(['burnnote'], ['secretnote', 'selfdestruct'], 'Create a note that can be opened only once', 'burnnote the vault code is 4821', async ({ t }) => {
  const s = store();
  const now = Date.now();
  for (const [k, n] of Object.entries(s.notes)) if (n.exp < now) delete s.notes[k];
  const code = crypto.randomBytes(4).toString('hex').toUpperCase();
  s.notes[code] = { text: t.slice(0, 1500), exp: now + 48 * 3600000 };
  save();
  return [bar('Burn Note'), '', `🔥 Code: *${code}*`, 'Opens once with *.opennote ' + code + '*, then it is gone. Expires in 48 hours.', '', '_Share the code in a private chat._', TAG].join('\n');
});
add(['opennote'], ['readnote', 'unseal'], 'Open and destroy a burn note', 'opennote 9F2A1C3B', async ({ t }) => {
  const s = store();
  const code = t.trim().toUpperCase();
  const n = s.notes[code];
  if (!n || n.exp < Date.now()) { delete s.notes[code]; save(); throw new Error('That note is gone or never existed'); }
  delete s.notes[code];
  save();
  return [bar('Burn Note'), '', `🔥 ${n.text}`, '', '_This note has now been destroyed._', TAG].join('\n');
});

add(['cipher'], ['encipher', 'encodecipher'], 'Encrypt text with caesar, vigenere, atbash, rot13 or rail fence', 'cipher caesar 3 meet at dawn  |  cipher vigenere KEY text  |  cipher rail 3 text', async ({ t }) => {
  const out = runCipher(t.split(/\s+/), false);
  return [bar('Cipher'), '', `🔐 *${out}*`, '', `_Reverse it with .decipher and the same settings_`, TAG].join('\n');
});
add(['decipher'], ['decodecipher', 'crack'], 'Decrypt text made with .cipher', 'decipher caesar 3 phhw dw gdzq', async ({ t }) => {
  const out = runCipher(t.split(/\s+/), true);
  return [bar('Decipher'), '', `🔓 *${out}*`, '', TAG].join('\n');
});

add(['hashit'], ['digest', 'checksum'], 'Hash text with md5, sha1, sha256 or sha512', 'hashit sha256 hello', async ({ t }) => {
  const mt = t.match(/^(md5|sha1|sha256|sha512)\s+([\s\S]+)$/i);
  if (!mt) throw new Error('Format: hashit sha256 hello');
  return [bar('Hash'), '', `${mt[1].toUpperCase()} of ${mt[2].length} characters`, '', '`' + crypto.createHash(mt[1].toLowerCase()).update(mt[2]).digest('hex') + '`', '', TAG].join('\n');
});

add(['jwtpeek'], ['jwtdecode', 'tokenpeek'], 'Read what is inside a JWT token (signature is not checked)', 'jwtpeek eyJhbGciOi...', async ({ t }) => {
  const parts = t.trim().split('.');
  if (parts.length < 2) throw new Error('That does not look like a JWT');
  const dec = (s) => JSON.parse(Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  let h, p;
  try { h = dec(parts[0]); p = dec(parts[1]); } catch (_) { throw new Error('Could not decode that token'); }
  const when = (v) => (v ? nairobi(v * 1000, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : null);
  const rows = [`Algorithm: ${h.alg || '?'}`, p.iss ? `Issuer: ${p.iss}` : '', p.sub ? `Subject: ${p.sub}` : '', p.iat ? `Issued: ${when(p.iat)}` : '', p.exp ? `Expires: ${when(p.exp)} ${p.exp * 1000 < Date.now() ? '🔴 expired' : '🟢 valid time'}` : 'Expires: never'].filter(Boolean);
  const claims = Object.keys(p).filter(k => !['iss', 'sub', 'iat', 'exp', 'nbf'].includes(k)).slice(0, 8).map(k => `• ${k}: ${String(typeof p[k] === 'object' ? JSON.stringify(p[k]) : p[k]).slice(0, 60)}`);
  return [bar('JWT Peek'), '', ...rows, claims.length ? '\n*Claims*' : '', ...claims, '', '_Decoded only. The signature was not verified. Never paste live tokens in groups._', TAG].filter(x => x !== '').join('\n');
});

add(['omen'], ['dailyomen', 'fortune'], 'Your personal omen for today', 'omen', async ({ m }) => {
  const day = new Date(Date.now() + EAT).toISOString().slice(0, 10);
  const h = crypto.createHash('sha256').update(numOf(m.sender) + day).digest();
  const hour = h[3] % 24;
  return [bar('Omen'), `_${new Date(Date.now() + EAT).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })}_`, '', `🌘 ${OMEN[h[0] % OMEN.length]}`, '', `Lucky number  *${h[1] % 99 + 1}*`, `Lucky colour  *${COLOURS[h[2] % COLOURS.length]}*`, `Power hour    *${String(hour).padStart(2, '0')}:00*`, `Avoid         ${AVOID[h[4] % AVOID.length]}`, '', '_The same omen all day. Tomorrow brings a new one._', TAG].join('\n');
}, { optional: true });

add(['riddle'], ['puzzleme', 'brainteaser'], 'A riddle for the chat, answer with .reveal', 'riddle', async ({ m }) => {
  const [q, a] = RIDDLES[crypto.randomInt(RIDDLES.length)];
  RIDDLE_STATE.set(m.chat, { a, at: Date.now() });
  return [bar('Riddle'), '', `🕯️ ${q}`, '', '_Answer in the chat. Type *.reveal* to see it._', TAG].join('\n');
}, { optional: true });
add(['reveal'], ['riddleanswer'], 'Show the answer to the last riddle', 'reveal', async ({ m }) => {
  const r = RIDDLE_STATE.get(m.chat);
  if (!r || Date.now() - r.at > 3600000) throw new Error('No open riddle here. Start one with .riddle');
  RIDDLE_STATE.delete(m.chat);
  return [bar('Riddle'), '', `💡 *${r.a}*`, '', TAG].join('\n');
}, { optional: true });

add(['ghostwrite'], ['hidetext', 'invisink'], 'Hide a secret message inside normal-looking text', 'ghostwrite Good morning everyone | the meeting moved to 3pm', async ({ t, client, m }) => {
  const i = t.indexOf('|');
  if (i < 1 || !t.slice(i + 1).trim()) throw new Error('Format: ghostwrite cover text | secret message');
  const out = ghostEncode(t.slice(0, i).trim(), t.slice(i + 1).trim().slice(0, 300));
  await client.sendMessage(m.chat, { text: out }, { quoted: m });
  return [bar('Ghost Write'), '', '👻 The message above carries a hidden secret.', 'Anyone can reveal it by replying to it with *.ghostread*', TAG].join('\n');
});
add(['ghostread'], ['revealtext', 'invisread'], 'Reveal a secret hidden by .ghostwrite (reply to the message)', 'ghostread  (reply to a ghostwritten message)', async ({ t }) => {
  const s = ghostDecode(t);
  if (s == null) throw new Error('No hidden message found in that text');
  return [bar('Ghost Read'), '', `👻 *${s}*`, '', TAG].join('\n');
});

add(['linkpeek'], ['previewlink', 'sitepeek'], 'See what is behind a link before you open it', 'linkpeek https://example.com', async ({ t }) => {
  let u;
  try { u = new URL(/^https?:\/\//i.test(t.trim()) ? t.trim() : 'https://' + t.trim()); } catch (_) { throw new Error('That is not a valid link'); }
  if (!/^https?:$/.test(u.protocol)) throw new Error('Only http and https links');
  const addrs = await dns.lookup(u.hostname, { all: true }).catch(() => { throw new Error('That site could not be found'); });
  if (addrs.some(a => privateAddr(a.address))) throw new Error('That address is private, not allowed');
  const axios = global.axios || require('axios');
  const t0 = Date.now();
  const r = await axios.get(u.href, { timeout: 15000, maxContentLength: 2 * 1024 * 1024, maxRedirects: 3, responseType: 'text', validateStatus: () => true, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BLACK-MD-LinkPeek/1.0)' } });
  const html = String(r.data || '');
  const title = metaOf(html, 'og:title') || decodeEntities((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]);
  const desc = metaOf(html, 'og:description') || metaOf(html, 'description');
  const site = metaOf(html, 'og:site_name');
  const final = (r.request && r.request.res && r.request.res.responseUrl) || u.href;
  let fh = u.hostname; try { fh = new URL(final).hostname; } catch (_) {}
  return [bar('Link Peek'), '', `🔗 ${u.hostname}${fh !== u.hostname ? ' → *' + fh + '*' : ''}`, `Status: ${r.status} · ${Date.now() - t0} ms · ${u.protocol === 'https:' ? 'encrypted' : '⚠️ not encrypted'}`, title ? `Title: *${title.slice(0, 120)}*` : '', site ? `Site: ${site}` : '', desc ? `\n${desc.slice(0, 280)}` : '', '', TAG].filter(x => x !== '').join('\n');
});

add(['phoneinfo'], ['numberinfo', 'dialcode'], 'Country and format check for a phone number', 'phoneinfo +254712345678', async ({ t }) => {
  let d = t.replace(/[^\d+]/g, '');
  if (d.startsWith('00')) d = '+' + d.slice(2);
  if (!d.startsWith('+')) { if (/^0\d{9}$/.test(d)) d = '+254' + d.slice(1); else d = '+' + d; }
  const digits = d.slice(1);
  if (!/^\d{7,15}$/.test(digits)) throw new Error('Use international format like +254712345678');
  let code = null;
  for (const len of [3, 2, 1]) { if (DIAL[digits.slice(0, len)]) { code = digits.slice(0, len); break; } }
  const national = code ? digits.slice(code.length) : digits;
  return [bar('Phone Info'), '', `📞 +${digits}`, `Country: *${code ? DIAL[code] : 'Unknown'}*${code ? ` (+${code})` : ''}`, `Number length: ${national.length} digits after the country code`, `Chat link: https://wa.me/${digits}`, '', '_Country comes from the dialling code only. Numbers can move between networks, so no operator is claimed._', TAG].join('\n');
});

add(['txt2pdf'], ['makepdf', 'textpdf'], 'Turn text into a PDF document', 'txt2pdf My Notes | first line...  (or reply to a message)', async ({ t, client, m }) => {
  let title = 'Document', body = t;
  const i = t.indexOf('|');
  if (i > 0 && i < 80) { title = t.slice(0, i).trim() || title; body = t.slice(i + 1).trim(); }
  if (!body.trim()) throw new Error('Nothing to put in the PDF');
  const pdf = buildPdf(title, body.slice(0, 20000));
  await client.sendMessage(m.chat, { document: pdf, mimetype: 'application/pdf', fileName: title.replace(/[^\w\- ]+/g, '').trim().slice(0, 40).replace(/\s+/g, '_') + '.pdf', caption: `📄 ${title}\n${TAG}` }, { quoted: m });
  return null;
});

const wrap = (d) => async (client, m, ctx) => {
  lastClient = client;
  const p = typeof ctx.prefix === 'string' && ctx.prefix ? ctx.prefix : '.';
  const t = String((ctx && ctx.text) || quotedText(m) || '').trim();
  if (!t && !d.opts.optional) return m.reply(`${bar(d.command[0])}\n\nUsage: *${p}${d.usage}*\n${TAG}`);
  try {
    const out = await d.fn({ t, client, m, p });
    if (out) await client.sendMessage(m.chat, { text: out }, { quoted: m });
  } catch (e) { m.reply('❌ ' + String((e && e.message) || e).slice(0, 180)); }
};

const commands = defs.map(d => ({ command: d.command, aliases: d.aliases, description: d.description, category: 'mystic', handler: wrap(d) }));

const GROUPS = [
  ['SECRETS', ['burnnote', 'opennote', 'ghostwrite', 'ghostread', 'timecap']],
  ['CODES', ['cipher', 'decipher', 'hashit', 'jwtpeek']],
  ['SIGNS', ['omen', 'riddle', 'reveal']],
  ['SCOUT', ['linkpeek', 'phoneinfo', 'txt2pdf']]
];
commands.push({
  command: ['mystmenu'],
  aliases: ['mysticmenu', 'shadowmenu'],
  description: 'List the mystic commands',
  category: 'mystic',
  handler: async (client, m, ctx) => {
    lastClient = client;
    const p = typeof ctx.prefix === 'string' && ctx.prefix ? ctx.prefix : '.';
    const block = (title, names) => `┌──┤ ${sans(title)} ├\n` + names.map(n => `│ ${sans(n)}`).join('\n') + '\n└──────────';
    m.reply(`${GROUPS.map(g => block(g[0], g[1])).join('\n\n')}\n\nUse: ${p}${sans('command')} your input\nExample: ${p}${sans('burnnote')} the vault code is 4821\n${TAG}`);
  }
});

module.exports = commands;
