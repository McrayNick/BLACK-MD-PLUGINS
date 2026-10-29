'use strict';

const fs = require('fs');
const path = require('path');
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
const money = (n, d = 0) => Number(n).toLocaleString('en-KE', { minimumFractionDigits: d, maximumFractionDigits: d });
const nums = (s) => (String(s).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
const today = () => new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10);

const FILE = path.join(process.cwd(), 'extras_data.json');
let data = null;
const store = () => {
  if (!data) {
    try { data = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (_) { data = {}; }
    data.todo = data.todo || {};
    data.spend = data.spend || {};
    data.habit = data.habit || {};
  }
  return data;
};
const save = () => { try { fs.writeFileSync(FILE, JSON.stringify(data)); } catch (_) {} };

function calc(expr) {
  const src = String(expr).toLowerCase().replace(/×/g, '*').replace(/÷/g, '/').replace(/\s+/g, '').replace(/,/g, '');
  let i = 0;
  const FN = { sqrt: Math.sqrt, sin: (x) => Math.sin(x * Math.PI / 180), cos: (x) => Math.cos(x * Math.PI / 180), tan: (x) => Math.tan(x * Math.PI / 180), log: Math.log10, ln: Math.log, abs: Math.abs, round: Math.round, floor: Math.floor, ceil: Math.ceil, exp: Math.exp };
  const peek = () => src[i];
  function num() {
    const m = src.slice(i).match(/^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/);
    if (m) { i += m[0].length; return parseFloat(m[0]); }
    const w = src.slice(i).match(/^[a-z]+/);
    if (!w) throw new Error('Unexpected "' + (src[i] || 'end') + '"');
    i += w[0].length;
    if (w[0] === 'pi') return Math.PI;
    if (w[0] === 'e') return Math.E;
    if (!FN[w[0]]) throw new Error('Unknown word "' + w[0] + '"');
    if (peek() !== '(') throw new Error(w[0] + ' needs brackets');
    i++;
    const v = add();
    if (peek() !== ')') throw new Error('Missing )');
    i++;
    return FN[w[0]](v);
  }
  function atom() {
    if (peek() === '-') { i++; return -pow(); }
    if (peek() === '+') { i++; return pow(); }
    if (peek() === '(') { i++; const v = add(); if (peek() !== ')') throw new Error('Missing )'); i++; return v; }
    return num();
  }
  function pow() { let b = atom(); while (peek() === '^') { i++; const e = pow(); b = Math.pow(b, e); } while (peek() === '!') { i++; let f = 1; for (let k = 2; k <= Math.min(170, b); k++) f *= k; b = f; } return b; }
  function mul() {
    let v = pow();
    for (;;) {
      const c = peek();
      if (c === '*') { i++; v *= pow(); } else if (c === '/') { i++; const d = pow(); if (d === 0) throw new Error('Cannot divide by zero'); v /= d; }
      else if (c === '%') { i++; const d = pow(); v %= d; }
      else if (c === '(' || /[a-z]/.test(c || '')) { v *= pow(); } else break;
    }
    return v;
  }
  function add() { let v = mul(); while (peek() === '+' || peek() === '-') { const c = src[i++]; const r = mul(); v = c === '+' ? v + r : v - r; } return v; }
  if (!src) throw new Error('Nothing to calculate');
  const out = add();
  if (i < src.length) throw new Error('Unexpected "' + src[i] + '"');
  if (!isFinite(out)) throw new Error('That result is not a number');
  return out;
}

const askAI = async (system, user) => {
  const axios = global.axios || require('axios');
  const r = await axios.post('https://text.pollinations.ai/openai', { model: 'openai', messages: [{ role: 'system', content: system }, { role: 'user', content: user }], temperature: 0.5 }, { timeout: 60000, headers: { 'Content-Type': 'application/json' } });
  const out = r.data && r.data.choices && r.data.choices[0] && r.data.choices[0].message && r.data.choices[0].message.content;
  if (!out || String(out).trim().length < 2) throw new Error('The AI gave no reply, try again');
  return String(out).trim();
};

const defs = [];
const add = (command, aliases, description, usage, fn, opts = {}) => defs.push({ command, aliases, description, usage, fn, opts });

add(['mathx'], ['calc2', 'solve'], 'Calculator with brackets, powers, sqrt, sin, log and more', 'mathx (12+8)*3^2 / sqrt(16)', async ({ t }) => {
  const v = calc(t);
  return [bar('Math'), '', `${t.trim()}`, `= *${Number(v.toPrecision(12)).toLocaleString('en-US', { maximumFractionDigits: 10 })}*`, '', TAG].join('\n');
});

add(['percent'], ['pct', 'percentage'], 'Percentage helper: "15% of 2400" or change "300 to 450"', 'percent 15% of 2400  |  percent 300 to 450', async ({ t }) => {
  const a = t.toLowerCase().replace(/,/g, '');
  let mt = a.match(/^(-?[\d.]+)\s*%\s*of\s*(-?[\d.]+)$/);
  if (mt) return [bar('Percent'), '', `${mt[1]}% of ${money(mt[2], 2)} = *${money(mt[1] / 100 * mt[2], 2)}*`, '', TAG].join('\n');
  mt = a.match(/^(-?[\d.]+)\s*(?:to|->|>)\s*(-?[\d.]+)$/);
  if (mt) { const ch = (mt[2] - mt[1]) / Math.abs(mt[1]) * 100; return [bar('Percent'), '', `${money(mt[1], 2)} → ${money(mt[2], 2)}`, `${ch >= 0 ? '📈 up' : '📉 down'} *${Math.abs(ch).toFixed(2)}%*`, '', TAG].join('\n'); }
  mt = a.match(/^(-?[\d.]+)\s*(?:is what (?:percent|%) of|\/)\s*(-?[\d.]+)$/);
  if (mt) return [bar('Percent'), '', `${mt[1]} is *${(mt[1] / mt[2] * 100).toFixed(2)}%* of ${mt[2]}`, '', TAG].join('\n');
  throw new Error('Try: percent 15% of 2400  |  percent 300 to 450  |  percent 30/120');
});

add(['vat'], ['vatcalc', 'taxcalc'], 'Add or remove VAT (16% by default)', 'vat 11600 remove  |  vat 10000 add 16', async ({ t }) => {
  const mt = t.toLowerCase().replace(/,/g, '').match(/^([\d.]+)\s*(add|remove|incl|excl)?\s*([\d.]+)?%?$/);
  if (!mt) throw new Error('Format: vat 11600 remove  or  vat 10000 add 16');
  const amt = Number(mt[1]), rate = mt[3] ? Number(mt[3]) : 16, mode = mt[2] || 'add';
  if (mode === 'remove' || mode === 'incl') { const net = amt / (1 + rate / 100); return [bar('VAT'), '', `Price with VAT   KES ${money(amt, 2)}`, `VAT (${rate}%)       KES ${money(amt - net, 2)}`, `*Price before VAT KES ${money(net, 2)}*`, '', TAG].join('\n'); }
  const vatAmt = amt * rate / 100;
  return [bar('VAT'), '', `Price before VAT KES ${money(amt, 2)}`, `VAT (${rate}%)        KES ${money(vatAmt, 2)}`, `*Price with VAT   KES ${money(amt + vatAmt, 2)}*`, '', TAG].join('\n');
});

add(['savings'], ['saveplan', 'growmoney'], 'See how monthly savings grow with interest', 'savings 5000 12 10  (monthly amount, months, yearly %)', async ({ t }) => {
  const [pm, months, rate = 0] = nums(t);
  if (!pm || !months || months < 1 || months > 600) throw new Error('Format: savings 5000 12 10 (monthly amount, months, yearly %)');
  const r = rate / 100 / 12;
  let bal = 0;
  for (let i = 0; i < months; i++) bal = (bal + pm) * (1 + r);
  const put = pm * months;
  return [bar('Savings'), '', `Saving KES ${money(pm)} a month for ${months} months at ${rate}% a year`, '', `You put in  KES ${money(put)}`, `Interest    KES ${money(bal - put)}`, `*You end with KES ${money(bal)}*`, '', TAG].join('\n');
});

add(['teams'], ['splitteams', 'groupup'], 'Split names into random teams', 'teams 3 | Amina, Brian, Cate, Dan, Eli, Faith', async ({ t }) => {
  const i = t.indexOf('|');
  const n = i > 0 ? parseInt(t.slice(0, i), 10) : NaN;
  const names = (i > 0 ? t.slice(i + 1) : '').split(/[,\n]+/).map(x => x.trim()).filter(Boolean);
  if (!(n >= 2) || names.length < n) throw new Error('Format: teams 3 | name1, name2, name3, ...');
  for (let k = names.length - 1; k > 0; k--) { const j = crypto.randomInt(k + 1); [names[k], names[j]] = [names[j], names[k]]; }
  const out = Array.from({ length: n }, () => []);
  names.forEach((x, k) => out[k % n].push(x));
  return [bar('Teams'), '', ...out.map((g, k) => `*Team ${k + 1}*\n${g.map(x => '• ' + x).join('\n')}`), '', TAG].join('\n\n').replace(/\n\n\n/g, '\n\n');
});

add(['shuffle'], ['mixup', 'randomorder'], 'Shuffle a list into random order', 'shuffle a, b, c, d', async ({ t }) => {
  const list = t.split(/[,\n]+/).map(x => x.trim()).filter(Boolean);
  if (list.length < 2) throw new Error('Give at least two items separated by commas');
  for (let k = list.length - 1; k > 0; k--) { const j = crypto.randomInt(k + 1); [list[k], list[j]] = [list[j], list[k]]; }
  return [bar('Shuffle'), '', ...list.map((x, i) => `${i + 1}. ${x}`), '', TAG].join('\n');
});

add(['randnum'], ['randomnumber', 'drawnumber'], 'Random number in a range', 'randnum 1 100', async ({ t }) => {
  const [a = 1, b = 100] = nums(t);
  const lo = Math.min(a, b), hi = Math.max(a, b);
  if (hi - lo > 1e9) throw new Error('Range too big');
  return [bar('Random'), '', `🎲 ${lo} – ${hi}`, `*${crypto.randomInt(Math.floor(lo), Math.floor(hi) + 1)}*`, '', TAG].join('\n');
}, { optional: true });

add(['poll'], ['quickpoll', 'vote2'], 'Create a real WhatsApp poll', 'poll Best lunch? | Pilau | Ugali | Chapo', async ({ t, client, m }) => {
  const parts = t.split('|').map(x => x.trim()).filter(Boolean);
  if (parts.length < 3 || parts.length > 13) throw new Error('Format: poll Question? | option 1 | option 2 (up to 12 options)');
  await client.sendMessage(m.chat, { poll: { name: parts[0].slice(0, 250), values: parts.slice(1).map(x => x.slice(0, 100)), selectableCount: 1 } });
  return null;
});

const todoOf = (jid) => (store().todo[jid] = store().todo[jid] || []);
add(['todo'], ['tasks', 'mylist'], 'Personal to-do list: add, done, remove, clear', 'todo add buy airtime  |  todo done 2  |  todo', async ({ t, m }) => {
  const jid = numOf(m.sender);
  const list = todoOf(jid);
  const [cmd, ...rest] = t.trim().split(/\s+/);
  const arg = rest.join(' ').trim();
  const c = (cmd || '').toLowerCase();
  if (c === 'add' && arg) { list.push({ t: arg.slice(0, 200), d: false }); save(); }
  else if ((c === 'done' || c === 'undo') && list[parseInt(arg, 10) - 1]) { list[parseInt(arg, 10) - 1].d = c === 'done'; save(); }
  else if ((c === 'remove' || c === 'rm') && list[parseInt(arg, 10) - 1]) { list.splice(parseInt(arg, 10) - 1, 1); save(); }
  else if (c === 'clear') { store().todo[jid] = []; save(); }
  else if (c && !['list', ''].includes(c)) throw new Error('Use: todo add text | todo done 2 | todo remove 2 | todo clear');
  const cur = todoOf(jid);
  const open = cur.filter(x => !x.d).length;
  return [bar('To-do'), '', cur.length ? cur.map((x, i) => `${i + 1}. ${x.d ? '✅ ~' + x.t + '~' : '⬜ ' + x.t}`).join('\n') : '_Nothing yet. Add one with todo add buy airtime_', '', cur.length ? `${open} open · ${cur.length - open} done` : '', TAG].filter((x, i) => x !== '' || i < 2).join('\n');
}, { optional: true });

add(['spend'], ['expense', 'logspend'], 'Log what you spend, see totals: spend 350 lunch', 'spend 350 lunch  |  spend report  |  spend undo', async ({ t, m }) => {
  const jid = numOf(m.sender);
  const rows = (store().spend[jid] = store().spend[jid] || []);
  const a = t.trim().toLowerCase();
  if (a === 'undo') { rows.pop(); save(); return [bar('Spend'), '', 'Last entry removed.', TAG].join('\n'); }
  if (a === 'clear') { store().spend[jid] = []; save(); return [bar('Spend'), '', 'All entries cleared.', TAG].join('\n'); }
  const mt = t.trim().match(/^([\d,]+(?:\.\d+)?)\s+(.+)$/);
  if (mt) { rows.push({ a: Number(mt[1].replace(/,/g, '')), n: mt[2].slice(0, 60), d: today() }); save(); }
  else if (a && a !== 'report') throw new Error('Format: spend 350 lunch');
  const month = today().slice(0, 7);
  const mine = rows.filter(r => r.d.startsWith(month));
  const total = mine.reduce((s, r) => s + r.a, 0);
  const byName = {};
  mine.forEach(r => { const k = r.n.toLowerCase().split(' ')[0]; byName[k] = (byName[k] || 0) + r.a; });
  const top = Object.entries(byName).sort((x, y) => y[1] - x[1]).slice(0, 5);
  const todayTotal = rows.filter(r => r.d === today()).reduce((s, r) => s + r.a, 0);
  return [bar('Spend'), '', mt ? `✅ Logged KES ${money(mt[1].replace(/,/g, ''))} · ${mt[2]}` : '', `Today        KES ${money(todayTotal)}`, `This month   *KES ${money(total)}* (${mine.length} entries)`, top.length ? '\n*Top spending*' : '', ...top.map(([k, v]) => `• ${k}  KES ${money(v)}`), '', TAG].filter((x, i) => x !== '' || i < 2).join('\n');
}, { optional: true });

add(['habit'], ['streak', 'checkin'], 'Daily habit streaks: habit gym', 'habit gym  |  habit', async ({ t, m }) => {
  const jid = numOf(m.sender);
  const hs = (store().habit[jid] = store().habit[jid] || {});
  const name = t.trim().toLowerCase().slice(0, 30);
  const day = (iso) => Math.round(Date.parse(iso + 'T00:00:00Z') / 86400000);
  let msg = '';
  if (name === 'clear') { store().habit[jid] = {}; save(); return [bar('Habits'), '', 'All habits cleared.', TAG].join('\n'); }
  if (name) {
    const h = hs[name] || { streak: 0, best: 0, last: null, total: 0 };
    if (h.last === today()) msg = `Already checked in today: *${name}*`;
    else { h.streak = h.last && day(today()) - day(h.last) === 1 ? h.streak + 1 : 1; h.best = Math.max(h.best, h.streak); h.last = today(); h.total++; hs[name] = h; save(); msg = `✅ *${name}* checked in. Streak: ${h.streak} 🔥`; }
  }
  const rows = Object.entries(hs).map(([k, h]) => { const alive = h.last && day(today()) - day(h.last) <= 1; return `• ${k}: ${alive ? h.streak : 0} day streak · best ${h.best} · ${h.total} total${h.last === today() ? ' ✅' : ''}`; });
  return [bar('Habits'), '', msg, msg ? '' : '', rows.length ? rows.join('\n') : '_No habits yet. Start one: habit gym_', '', TAG].filter((x, i) => x !== '' || i < 2).join('\n');
}, { optional: true });

add(['daysbetween'], ['datediff', 'howlong'], 'Days between two dates, or from today', 'daysbetween 25/12/2026  |  daysbetween 01/01/2026 25/12/2026', async ({ t }) => {
  const ds = [...t.matchAll(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/g)].map(x => Date.UTC(+x[3], +x[2] - 1, +x[1]));
  if (!ds.length || ds.length > 2) throw new Error('Format: daysbetween 25/12/2026  or  daysbetween 01/01/2026 25/12/2026');
  const now = new Date(Date.now() + 3 * 3600 * 1000);
  const a = ds.length === 2 ? ds[0] : Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const b = ds.length === 2 ? ds[1] : ds[0];
  const days = Math.round((b - a) / 86400000);
  const wk = Math.floor(Math.abs(days) / 7);
  const fmt = (x) => new Date(x).toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  return [bar('Date Gap'), '', `${fmt(a)} → ${fmt(b)}`, '', `*${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'}* ${days < 0 ? 'ago' : days === 0 ? '(same day)' : 'to go'}`, `${wk} weeks and ${Math.abs(days) % 7} days`, '', TAG].join('\n');
});

add(['cleanlink'], ['untrack', 'stripurl'], 'Remove tracking junk from a link', 'cleanlink https://site.com/p?id=5&utm_source=x', async ({ t }) => {
  const raw = (t.match(/https?:\/\/\S+/) || [])[0];
  if (!raw) throw new Error('Paste a link');
  const u = new URL(raw);
  const junk = /^(utm_|fbclid|gclid|igshid|igsh|mc_|ref$|ref_|si$|feature$|spm$|_hsenc|_hsmi|yclid|msclkid|share_id|trk)/i;
  let removed = 0;
  for (const k of [...u.searchParams.keys()]) if (junk.test(k)) { u.searchParams.delete(k); removed++; }
  u.hash = u.hash && /^#(?:[\w-]+)$/.test(u.hash) ? u.hash : '';
  return [bar('Clean Link'), '', removed ? `🧹 Removed ${removed} tracker${removed === 1 ? '' : 's'}` : '✨ Already clean', '', u.href, '', TAG].join('\n');
});

add(['rewrite'], ['restyle', 'reword'], 'AI rewrites your text: formal, friendly, short, funny, polite, bold', 'rewrite formal send me the money today', async ({ t, m }) => {
  const mt = t.match(/^(formal|friendly|short|funny|polite|bold|simple|persuasive)\s+([\s\S]+)$/i);
  if (!mt) throw new Error('Format: rewrite formal your text  (styles: formal, friendly, short, funny, polite, bold, simple, persuasive)');
  const out = await askAI(`Rewrite the user's text in a ${mt[1].toLowerCase()} style. Keep the meaning and language. Reply with the rewritten text only.`, mt[2].slice(0, 1500));
  return [bar('Rewrite · ' + mt[1].toLowerCase()), '', out.slice(0, 2500), '', TAG].join('\n');
});

add(['tldr'], ['shorten2', 'brief'], 'AI short summary of long text (or reply to a message)', 'tldr your long text...  (or reply to a message)', async ({ t }) => {
  if (t.length < 200) throw new Error('Give me a longer text to summarise (or reply to one)');
  let out;
  try { out = await askAI('Summarise the text in 2 to 4 short bullet points. Keep the language of the text. No preamble.', t.slice(0, 6000)); }
  catch (_) {
    const sents = (t.match(/[^.!?]+[.!?]*/g) || []).map(s => s.trim()).filter(s => s.length > 20);
    out = sents.slice(0, 3).map(s => '• ' + s).join('\n') || '• ' + t.slice(0, 200);
  }
  return [bar('TL;DR'), '', out.slice(0, 2000), '', TAG].join('\n');
});

const commands = defs.map(d => ({
  command: d.command,
  aliases: d.aliases,
  description: d.description,
  category: 'tools',
  handler: async (client, m, ctx) => {
    const p = typeof ctx.prefix === 'string' && ctx.prefix ? ctx.prefix : '.';
    const t = String((ctx && ctx.text) || quotedText(m) || '').trim();
    if (!t && !d.opts.optional) return m.reply(`${bar(d.command[0])}\n\nUsage: *${p}${d.usage.split('  |  ')[0]}*\n${TAG}`);
    try {
      const out = await d.fn({ t, client, m });
      if (out) await client.sendMessage(m.chat, { text: out }, { quoted: m });
    } catch (e) { m.reply('❌ ' + String((e && e.message) || e).slice(0, 180)); }
  }
}));

const GROUPS = [
  ['MONEY', ['mathx', 'percent', 'vat', 'savings', 'spend']],
  ['PEOPLE', ['teams', 'poll', 'shuffle', 'randnum']],
  ['PLANNER', ['todo', 'habit', 'daysbetween']],
  ['SMART', ['rewrite', 'tldr', 'cleanlink']]
];
commands.push({
  command: ['extrasmenu'],
  aliases: ['toolsmenu2'],
  description: 'List the extra tools',
  category: 'tools',
  handler: async (client, m, ctx) => {
    const p = typeof ctx.prefix === 'string' && ctx.prefix ? ctx.prefix : '.';
    const block = (title, names) => `┌──┤ ${sans(title)} ├\n` + names.map(n => `│ ${sans(n)}`).join('\n') + '\n└──────────';
    m.reply(`${GROUPS.map(g => block(g[0], g[1])).join('\n\n')}\n\nUse: ${p}${sans('command')} your input\nExample: ${p}${sans('mathx')} (12+8)*3\n${TAG}`);
  }
});

module.exports = commands;
