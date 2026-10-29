'use strict';

const fs = require('fs');
const path = require('path');

const BM = '𝐁𝐋𝐀𝐂𝐊-𝐌𝐃';
const TAG = `_${BM}_`;

const CACHE_DIR = path.join(process.cwd(), '.bm_cache');
try { fs.rmSync(CACHE_DIR, { recursive: true, force: true }); } catch (_) {}
try { fs.mkdirSync(CACHE_DIR, { recursive: true }); } catch (_) {}

const SETTINGS_FILE = path.join(process.cwd(), 'antidelete_data.json');
const defaults = () => ({ on: true, dest: 'dm', scope: 'all', vv: true });
let settings = null;
const getSettings = () => {
  if (!settings) { try { settings = { ...defaults(), ...JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) }; } catch (_) { settings = defaults(); } }
  return settings;
};
const saveSettings = () => { try { fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings)); } catch (_) {} };

const numOf = (j) => String(j || '').split('@')[0].split(':')[0];
const selfJid = (client) => numOf(client.user && client.user.id) + '@s.whatsapp.net';

function ownerNumbers() {
  const out = new Set();
  try {
    const set = require('../set');
    for (const k of ['owner', 'owners', 'ownerNumber', 'ownernumber', 'OWNER', 'OWNER_NUMBER', 'sudo', 'dev']) {
      const v = set[k]; if (!v) continue;
      (Array.isArray(v) ? v : String(v).split(/[,\s]+/)).forEach(x => { const d = String(x).replace(/\D/g, ''); if (d.length >= 7) out.add(d); });
    }
  } catch (_) {}
  String(process.env.OWNER_NUMBER || process.env.OWNER || '').split(/[,\s]+/).forEach(x => { const d = x.replace(/\D/g, ''); if (d.length >= 7) out.add(d); });
  return out;
}
function isOwner(client, m, ctx) {
  if (ctx && ctx.Owner === true) return true;
  if (m.fromMe || (m.key && m.key.fromMe)) return true;
  const n = numOf(m.sender);
  return n === numOf(client.user && client.user.id) || ownerNumbers().has(n);
}

let hooked = false;
const STATS = { seen: 0, cached: 0, revokes: 0, missed: 0, sent: 0, error: '' };
const fail = (e) => { STATS.error = String((e && e.message) || e).slice(0, 120); };

const DONE = new Set();
const markDone = (id) => { if (DONE.has(id)) return false; DONE.add(id); if (DONE.size > 1000) DONE.delete(DONE.values().next().value); return true; };

const CACHE = new Map();
const MAX_ENTRIES = 1500;
const evict = () => {
  while (CACHE.size > MAX_ENTRIES) {
    const [id, e] = CACHE.entries().next().value;
    if (e.file) { try { fs.unlinkSync(e.file); } catch (_) {} }
    CACHE.delete(id);
  }
};
setInterval(() => {
  const cutoff = Date.now() - 48 * 3600 * 1000;
  for (const [id, e] of CACHE) {
    if (e.at < cutoff) { if (e.file) { try { fs.unlinkSync(e.file); } catch (_) {} } CACHE.delete(id); }
  }
}, 3600 * 1000).unref?.();

const quietLogger = { level: 'silent', info() {}, warn() {}, error() {}, debug() {}, trace() {}, fatal() {}, child() { return this; } };
async function downloadNode(client, node, type) {
  const { downloadMediaMessage } = require('@whiskeysockets/baileys');
  return downloadMediaMessage({ message: { [type]: node } }, 'buffer', {}, { reuploadRequest: client.updateMediaMessage, logger: quietLogger });
}

function unwrap(content) {
  let c = content, vo = false;
  for (let i = 0; i < 6 && c; i++) {
    if (c.ephemeralMessage) { c = c.ephemeralMessage.message; continue; }
    if (c.documentWithCaptionMessage) { c = c.documentWithCaptionMessage.message; continue; }
    if (c.editedMessage) { c = c.editedMessage.message; continue; }
    const w = c.viewOnceMessageV2Extension || c.viewOnceMessageV2 || c.viewOnceMessage;
    if (w) { vo = true; c = w.message; continue; }
    break;
  }
  return { inner: c, vo };
}

const MEDIA_TYPES = { imageMessage: 'image', videoMessage: 'video', audioMessage: 'audio', stickerMessage: 'sticker', documentMessage: 'document' };

function describe(inner) {
  if (!inner) return null;
  for (const k of Object.keys(MEDIA_TYPES)) {
    if (inner[k]) {
      const n = inner[k];
      return { type: MEDIA_TYPES[k], key: k, node: n, text: n.caption || '', mime: n.mimetype || '', ptt: !!n.ptt, fileName: n.fileName || '', size: Number(n.fileLength) || 0, vo: n.viewOnce === true };
    }
  }
  const text = inner.conversation || (inner.extendedTextMessage && inner.extendedTextMessage.text) || '';
  if (text) return { type: 'text', text };
  if (inner.contactMessage) return { type: 'contact', text: inner.contactMessage.displayName || '', vcard: inner.contactMessage.vcard || '' };
  if (inner.locationMessage) return { type: 'location', text: inner.locationMessage.name || '', lat: inner.locationMessage.degreesLatitude, lng: inner.locationMessage.degreesLongitude };
  return null;
}

const scopeOk = (chat) => {
  const s = getSettings().scope;
  const group = String(chat).endsWith('@g.us');
  return s === 'all' || (s === 'groups' && group) || (s === 'dms' && !group);
};

const queue = { p: Promise.resolve() };
const enqueue = (fn) => { queue.p = queue.p.then(fn, fn).catch(() => {}); return queue.p; };

async function ownerChatName(client, chat) {
  if (!String(chat).endsWith('@g.us')) return 'private chat';
  try { const meta = await client.groupMetadata(chat); return meta.subject || 'group'; } catch (_) { return 'group'; }
}

function when(ts) {
  try { return new Date(ts).toLocaleString('en-GB', { timeZone: 'Africa/Nairobi', hour12: false, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (_) { return new Date(ts).toISOString(); }
}

async function buildHead(client, e, kind, deleter) {
  const where = await ownerChatName(client, e.chat);
  const lines = [`${kind} *${BM}*`, `From: @${numOf(e.mentionJid)}${e.pushName ? ' (' + e.pushName + ')' : ''}`, `Chat: ${where}`, `Sent: ${when(e.ts)}`];
  if (deleter && numOf(deleter) !== numOf(e.sender)) lines.push(`Deleted by: @${numOf(deleter)}`);
  return lines.join('\n');
}

async function deliver(client, jid, e, head, extra = []) {
  const mentions = [e.mentionJid, ...extra].filter(Boolean);
  const buf = e.file && fs.existsSync(e.file) ? fs.readFileSync(e.file) : null;
  const cap = head + (e.text && e.type !== 'text' ? `\n\n${e.text}` : '') + `\n${TAG}`;
  const text = head + (e.type === 'text' ? `\n\n${e.text}` : '') + `\n${TAG}`;
  if (e.type === 'text') return client.sendMessage(jid, { text, mentions });
  if (e.type === 'contact') {
    await client.sendMessage(jid, { text, mentions });
    return client.sendMessage(jid, { contacts: { displayName: e.text || 'Contact', contacts: [{ vcard: e.vcard }] } });
  }
  if (e.type === 'location') {
    return client.sendMessage(jid, { text: `${text}\n\n📍 https://maps.google.com/?q=${e.lat},${e.lng}${e.text ? '\n' + e.text : ''}`, mentions });
  }
  if (!buf) return client.sendMessage(jid, { text: `${head}\n\n_${e.type} could not be saved (too large or expired)_\n${TAG}`, mentions });
  if (e.type === 'image') return client.sendMessage(jid, { image: buf, caption: cap, mentions });
  if (e.type === 'video') return client.sendMessage(jid, { video: buf, caption: cap, mimetype: e.mime || 'video/mp4', mentions });
  if (e.type === 'document') return client.sendMessage(jid, { document: buf, caption: cap, mimetype: e.mime || 'application/octet-stream', fileName: e.fileName || 'file', mentions });
  if (e.type === 'audio') {
    await client.sendMessage(jid, { text, mentions });
    return client.sendMessage(jid, { audio: buf, mimetype: e.mime || 'audio/ogg; codecs=opus', ptt: e.ptt });
  }
  if (e.type === 'sticker') {
    await client.sendMessage(jid, { text, mentions });
    return client.sendMessage(jid, { sticker: buf });
  }
}

async function capture(client, msg) {
  const s = getSettings();
  if (!s.on && !s.vv) return;
  const key = msg && msg.key;
  if (!key || !key.id || key.fromMe || !msg.message) return;
  const chat = key.remoteJid || '';
  if (!chat || chat === 'status@broadcast') return;
  const { inner, vo: wrapped } = unwrap(msg.message);
  if (!inner || inner.protocolMessage || inner.reactionMessage) return;
  const d = describe(inner);
  if (!d) return;
  const vo = wrapped || d.vo;
  if (!vo && !(s.on && scopeOk(chat))) return;

  const sender = key.participant || chat;
  const alt = [key.participantAlt, key.participantPn, key.senderPn].find(x => x && String(x).endsWith('@s.whatsapp.net'));
  const e = {
    id: key.id, chat, sender, mentionJid: alt || sender, pushName: msg.pushName || '',
    type: d.type, text: d.text, mime: d.mime, ptt: d.ptt, fileName: d.fileName, vcard: d.vcard, lat: d.lat, lng: d.lng,
    vo, ts: (Number(msg.messageTimestamp) || Math.floor(Date.now() / 1000)) * 1000, at: Date.now(), file: null, forwarded: false
  };
  CACHE.set(e.id, e);
  STATS.cached++;
  evict();

  const hasMedia = !!d.node;
  const limit = vo ? 60 * 1024 * 1024 : 15 * 1024 * 1024;
  const job = async () => {
    if (hasMedia && (!d.size || d.size <= limit)) {
      try {
        const buf = await downloadNode(client, d.node, d.key);
        if (buf && buf.length) {
          e.file = path.join(CACHE_DIR, e.id.replace(/[^\w-]/g, '_'));
          fs.writeFileSync(e.file, buf);
        }
      } catch (err) { fail(err); }
    }
    if (vo && s.vv && markDone('vv' + e.id)) {
      try {
        const head = await buildHead(client, e, '👁️ View-once saved ·', null);
        await deliver(client, selfJid(client), e, head);
        e.forwarded = true;
        STATS.sent++;
      } catch (err) { fail(err); }
    }
  };
  if (vo) await enqueue(job); else enqueue(job);
}

async function onRevoke(client, id, deleter) {
  const s = getSettings();
  if (!s.on) return;
  STATS.revokes++;
  const e = CACHE.get(id);
  if (!e) { STATS.missed++; return; }
  if (!scopeOk(e.chat)) return;
  if (!markDone('del' + id)) return;
  const dest = s.dest === 'chat' ? e.chat : selfJid(client);
  try {
    if (e.forwarded && dest !== e.chat) {
      const head = await buildHead(client, e, '🗑️ View-once deleted ·', deleter);
      await client.sendMessage(dest, { text: `${head}\n\n_You already have a saved copy of this one._\n${TAG}`, mentions: [e.mentionJid, deleter].filter(Boolean) });
      return;
    }
    const head = await buildHead(client, e, e.vo ? '🗑️ Deleted view-once ·' : '🗑️ Deleted message ·', deleter);
    await deliver(client, dest, e, head, [deleter]);
    STATS.sent++;
  } catch (err) { fail(err); }
}

async function onUpsert(client, msg) {
  if (!msg || !msg.message || !msg.key) return;
  STATS.seen++;
  const { inner } = unwrap(msg.message);
  const pm = (msg.message && msg.message.protocolMessage) || (inner && inner.protocolMessage);
  if (pm) {
    const revoke = pm.type === 0 || pm.type === 'REVOKE';
    if (revoke && pm.key && pm.key.id && !msg.key.fromMe) await onRevoke(client, pm.key.id, msg.key.participant || msg.key.remoteJid);
    return;
  }
  await capture(client, msg);
}

async function onUpdate(client, upd) {
  const u = upd && upd.update;
  if (!upd || !upd.key || !u) return;
  const revoked = u.message === null || u.messageStubType === 1 || u.messageStubType === 'REVOKE';
  if (revoked && !upd.key.fromMe) await onRevoke(client, upd.key.id, upd.key.participant || upd.key.remoteJid);
}

function ensureHooks(client) {
  if (!client || client.__bmAD || !client.ev || typeof client.ev.on !== 'function') return false;
  client.__bmAD = true;
  hooked = true;
  client.ev.on('messages.upsert', async (u) => { for (const msg of (u && u.messages) || []) { try { await onUpsert(client, msg); } catch (_) {} } });
  client.ev.on('messages.update', async (list) => { for (const x of list || []) { try { await onUpdate(client, x); } catch (_) {} } });
  return true;
}
const looksLikeSock = (v) => v && typeof v === 'object' && v.ev && typeof v.ev.on === 'function' && typeof v.sendMessage === 'function';
function findSocket() {
  for (const k of ['conn', 'client', 'sock', 'Matrix', 'bot', 'socket', 'sock2']) { if (looksLikeSock(global[k])) return global[k]; }
  for (const k of Object.keys(global)) { try { if (looksLikeSock(global[k])) return global[k]; } catch (_) {} }
  for (const mod of Object.values(require.cache || {})) {
    const ex = mod && mod.exports;
    if (!ex || (typeof ex !== 'object' && typeof ex !== 'function')) continue;
    try {
      if (looksLikeSock(ex)) return ex;
      for (const k of Object.keys(ex)) { if (looksLikeSock(ex[k])) return ex[k]; }
    } catch (_) {}
  }
  return null;
}
(() => {
  const t = setInterval(() => { try { const c = findSocket(); if (c && ensureHooks(c)) clearInterval(t); } catch (_) {} }, 4000);
  if (t.unref) t.unref();
})();
const onOff = (v) => (v ? 'ON' : 'OFF');
function statusText(p) {
  const s = getSettings();
  return [
    `🛡️ *${BM} · Guard*`,
    '',
    `Deleted messages: *${onOff(s.on)}*`,
    `Send to: *${s.dest === 'chat' ? 'same chat' : 'my DM'}*`,
    `Scope: *${s.scope}*`,
    `Auto-save view-once: *${onOff(s.vv)}*`,
    '',
    `Listener: *${hooked ? 'running' : 'NOT running'}*`,
    `Seen ${STATS.seen} · cached ${STATS.cached} · deletes ${STATS.revokes} (${STATS.missed} not in cache) · sent ${STATS.sent}`,
    STATS.error ? `Last error: ${STATS.error}` : '',
    '',
    `*${p}bmguard on / off*`,
    `*${p}bmguard dm / chat*`,
    `*${p}bmguard all / groups / dms*`,
    `*${p}bmvault on / off*`,
    TAG
  ].join('\n');
}

const commands = [
  {
    command: ['bmguard'],
    aliases: ['bmrecover'],
    description: 'Recover deleted messages and view-once media',
    category: 'owner',
    handler: async (client, m, ctx) => {
      const p = typeof ctx.prefix === 'string' && ctx.prefix ? ctx.prefix : '.';
      if (!isOwner(client, m, ctx)) return m.reply('⛔ Owner only.');
      const s = getSettings();
      const a = String((ctx.args && ctx.args[0]) || ctx.text || '').trim().toLowerCase();
      if (a === 'on') s.on = true;
      else if (a === 'off') s.on = false;
      else if (a === 'dm') s.dest = 'dm';
      else if (a === 'chat') s.dest = 'chat';
      else if (['all', 'groups', 'dms'].includes(a)) s.scope = a;
      else if (a && a !== 'status') return m.reply(statusText(p));
      if (a && a !== 'status') saveSettings();
      return m.reply(statusText(p));
    }
  },
  {
    command: ['bmvault'],
    aliases: ['bmviewonce'],
    description: 'Auto-save every view-once to your DM',
    category: 'owner',
    handler: async (client, m, ctx) => {
      const p = typeof ctx.prefix === 'string' && ctx.prefix ? ctx.prefix : '.';
      if (!isOwner(client, m, ctx)) return m.reply('⛔ Owner only.');
      const s = getSettings();
      const a = String((ctx.args && ctx.args[0]) || ctx.text || '').trim().toLowerCase();
      if (a === 'on') s.vv = true;
      else if (a === 'off') s.vv = false;
      else return m.reply(statusText(p));
      saveSettings();
      return m.reply(`👁️ Auto-save view-once is now *${onOff(s.vv)}*.\n${TAG}`);
    }
  }
];

for (const cmd of commands) {
  const orig = cmd.handler;
  cmd.handler = async (client, ...rest) => { ensureHooks(client); return orig(client, ...rest); };
}

module.exports = commands;
