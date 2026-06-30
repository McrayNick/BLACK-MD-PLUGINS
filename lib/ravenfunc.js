'use strict';

const { proto, delay, getContentType, jidNormalizedUser } = require('@whiskeysockets/baileys');
const fs   = require('fs');
const chalk = require('chalk');
const axios = require('axios');
const Jimp  = require('jimp');

// ── sleep ─────────────────────────────────────────────────────────────────────
exports.sleep = (ms) => delay(ms);

// ── runtime ───────────────────────────────────────────────────────────────────
exports.runtime = function (seconds) {
  seconds = Number(seconds);
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor(seconds % (3600 * 24) / 3600);
  const m = Math.floor(seconds % 3600 / 60);
  const s = Math.floor(seconds % 60);
  const dDisplay = d > 0 ? d + (d == 1 ? ' 𝗱𝗮𝘆, '    : ' 𝗗𝗮𝘆𝘀, ')    : '';
  const hDisplay = h > 0 ? h + (h == 1 ? ' 𝗵𝗼𝘂𝗿, '   : ' 𝗛𝗼𝘂𝗿𝘀, ')   : '';
  const mDisplay = m > 0 ? m + (m == 1 ? ' 𝗺𝗶𝗻𝘂𝘁𝗲, ' : ' 𝗠𝗶𝗻𝘂𝘁𝗲𝘀, ') : '';
  const sDisplay = s > 0 ? s + (s == 1 ? ' 𝘀𝗲𝗰𝗼𝗻𝗱'   : ' 𝗦𝗲𝗰𝗼𝗻𝗱𝘀')   : '';
  return dDisplay + hDisplay + mDisplay + sDisplay;
};

// ── getBuffer ─────────────────────────────────────────────────────────────────
exports.getBuffer = async (url, options = {}) => {
  try {
    const res = await axios({
      method: 'get',
      url,
      headers: { 'DNT': 1, 'Upgrade-Insecure-Request': 1 },
      ...options,
      responseType: 'arraybuffer'
    });
    return res.data;
  } catch (err) {
    return err;
  }
};

// ── fetchJson ─────────────────────────────────────────────────────────────────
exports.fetchJson = async (url, options = {}) => {
  try {
    const res = await axios({
      method: 'GET',
      url,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/95.0.4638.69 Safari/537.36'
      },
      ...options
    });
    return res.data;
  } catch (err) {
    return err;
  }
};

// ── generateProfilePicture ────────────────────────────────────────────────────
exports.generateProfilePicture = async (buffer) => {
  const jimp    = await Jimp.read(buffer);
  const min     = jimp.getWidth();
  const max     = jimp.getHeight();
  const cropped = jimp.crop(0, 0, min, max);
  return {
    img:     await cropped.scaleToFit(720, 720).getBufferAsync(Jimp.MIME_JPEG),
    preview: await cropped.scaleToFit(720, 720).getBufferAsync(Jimp.MIME_JPEG)
  };
};

// ── smsg ──────────────────────────────────────────────────────────────────────
exports.smsg = (client, m, store) => {
  if (!m) return m;
  const M = proto.WebMessageInfo;

  if (m.key) {
    m.id        = m.key.id;
    m.isBaileys = m.id.startsWith('BAE5') && m.id.length === 16;
    m.chat      = m.key.remoteJid;
    m.fromMe    = m.key.fromMe;
    m.isGroup   = m.chat.endsWith('@g.us');
    m.sender    = jidNormalizedUser(m.fromMe && client.user.id || m.participant || m.key.participant || m.chat || '');
    if (m.isGroup) m.participant = jidNormalizedUser(m.key.participant) || '';
  }

  if (m.message) {
    m.mtype = getContentType(m.message);
    m.msg   = m.mtype === 'viewOnceMessage'
      ? m.message[m.mtype].message[getContentType(m.message[m.mtype].message)]
      : m.message[m.mtype];

   if (!m.msg) m.msg = {};

    m.body =
      m.message.conversation ||
      m.msg?.caption ||
      m.msg?.text ||
      (m.mtype === 'listResponseMessage'    && m.msg?.singleSelectReply?.selectedRowId) ||
      (m.mtype === 'buttonsResponseMessage' && m.msg?.selectedButtonId) ||
      (m.mtype === 'viewOnceMessage'        && m.msg?.caption) ||
      m.text || '';

    m.mentionedJid = m.msg?.contextInfo?.mentionedJid || [];

    let quoted = m.quoted = m.msg?.contextInfo?.quotedMessage || null;
    if (m.quoted) {
      let type = getContentType(quoted);
      m.quoted  = m.quoted[type];
      if (['productMessage'].includes(type)) {
        type     = getContentType(m.quoted);
        m.quoted = m.quoted[type];
      }
      if (typeof m.quoted === 'string') m.quoted = { text: m.quoted };

      m.quoted.mtype    = type;
      m.quoted.id       = m.msg.contextInfo.stanzaId;
      m.quoted.chat     = m.msg.contextInfo.remoteJid || m.chat;
      m.quoted.isBaileys = m.quoted.id ? m.quoted.id.startsWith('BAE5') && m.quoted.id.length === 16 : false;
      m.quoted.sender   = jidNormalizedUser(m.msg.contextInfo.participant);
      m.quoted.fromMe   = m.quoted.sender === (client.user && client.user.id);
      m.quoted.text     = m.quoted.text || m.quoted.caption || m.quoted.conversation || m.quoted.contentText || m.quoted.selectedDisplayText || m.quoted.title || '';
      m.quoted.mentionedJid = m.msg.contextInfo?.mentionedJid || [];

      m.getQuotedObj = m.getQuotedMessage = async () => {
        if (!m.quoted.id) return false;
        const q = await store.loadMessage(m.chat, m.quoted.id, client);
        return exports.smsg(client, q, store);
      };

      const vM = m.quoted.fakeObj = M.fromObject({
        key: { remoteJid: m.quoted.chat, fromMe: m.quoted.fromMe, id: m.quoted.id },
        message: quoted,
        ...(m.isGroup ? { participant: m.quoted.sender } : {})
      });

      m.quoted.delete       = () => client.sendMessage(m.quoted.chat, { delete: vM.key });
      m.quoted.copyNForward = (jid, forceForward = false, options = {}) => client.copyNForward(jid, vM, forceForward, options);
      m.quoted.download     = () => client.downloadMediaMessage(m.quoted);
    }
  }

  if (m.msg?.url) m.download = () => client.downloadMediaMessage(m.msg);

  m.text  = m.msg?.text || m.msg?.caption || m.message?.conversation || m.msg?.contentText || m.msg?.selectedDisplayText || m.msg?.title || '';
  m.reply = (text, chatId = m.chat, options = {}) =>
    Buffer.isBuffer(text)
      ? client.sendMedia(chatId, text, 'file', '', m, { ...options })
      : client.sendText(chatId, text, m, { ...options });

  m.copy         = () => exports.smsg(client, M.fromObject(M.toObject(m)));
  m.copyNForward = (jid = m.chat, forceForward = false, options = {}) => client.copyNForward(jid, m, forceForward, options);

  return m;
};

// ── Hot reload ────────────────────────────────────────────────────────────────
let file = require.resolve(__filename);
fs.watchFile(file, () => {
  fs.unwatchFile(file);
  console.log(chalk.redBright(`Update ${__filename}`));
  delete require.cache[file];
  require(file);
});
