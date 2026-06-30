'use strict';

const fs = require('fs');
const path = require('path');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { jidNormalizedUser } = require('@whiskeysockets/baileys');

const cleanupIntervals = new Map();
const dataDir = path.join(__dirname, '..', 'data');

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

function getSessionDirs() {
  const sessionDir = path.join(dataDir, 'session');
  const privateDir = path.join(sessionDir, 'private');
  const groupsDir  = path.join(sessionDir, 'groups');
  const statusDir  = path.join(sessionDir, 'status');
  [sessionDir, privateDir, groupsDir, statusDir].forEach(d => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  });
  return { sessionDir, privateDir, groupsDir, statusDir };
}

function isDeleteMessage(mek) {
  const REVOKE_TYPE = 0;
  const hasProtocol = mek.message && mek.message.protocolMessage;
  return hasProtocol && mek.message.protocolMessage.type === REVOKE_TYPE;
}

function getMessageCategory(mek) {
  const remoteJid = mek.key.remoteJid;
  const { privateDir, groupsDir, statusDir } = getSessionDirs();
  if (remoteJid === 'status@broadcast') return { type: 'status', dir: statusDir };
  if (remoteJid.endsWith('@g.us'))       return { type: 'group',  dir: groupsDir };
  return { type: 'private', dir: privateDir };
}

function saveMessage(mek) {
  try {
    const { dir } = getMessageCategory(mek);
    const filePath = path.join(dir, `${mek.key.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(mek, null, 2));
  } catch (err) { /* silent */ }
}

function getOriginalMessage(deletedMsgKey) {
  try {
    const messageId = deletedMsgKey.id;
    const { privateDir, groupsDir, statusDir } = getSessionDirs();
    for (const dir of [privateDir, groupsDir, statusDir]) {
      const filePath = path.join(dir, `${messageId}.json`);
      if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
      }
    }
    return null;
  } catch (err) { return null; }
}

function formatKenyanTime(timestamp) {
  const date = new Date(timestamp * 1000);
  const kenyanDate = new Date(date.toLocaleString('en-US', { timeZone: 'Africa/Nairobi' }));
  const pad = n => String(n).padStart(2, '0');
  return `${pad(kenyanDate.getDate())}/${pad(kenyanDate.getMonth() + 1)}/${kenyanDate.getFullYear()} ` +
         `${pad(kenyanDate.getHours())}:${pad(kenyanDate.getMinutes())}:${pad(kenyanDate.getSeconds())}`;
}

function formatJid(jid) {
  return jid ? jid.split('@')[0] : 'Unknown';
}

async function formatDeleteNotification(client, originalMsg, deleteMsg) {
  const { type } = getMessageCategory(originalMsg);

  let senderName = originalMsg.pushName || 'Unknown';
  let senderJid  = '';
  let locationInfo = '';
  let locationEmoji = '';

  if (type === 'status') {
    locationEmoji = '📢';
    locationInfo  = 'Status';
    senderJid     = originalMsg.key.senderPn || originalMsg.key.remoteJidAlt;
  } else if (type === 'group') {
    locationEmoji = '👥';
    let groupName = 'Unknown Group';
    try {
      const meta = await client.groupMetadata(originalMsg.key.remoteJid);
      groupName = meta.subject;
    } catch (e) { /* silent */ }
    locationInfo = `Group: ${groupName}`;
    senderJid    = originalMsg.key.participantPn || originalMsg.key.remoteJid;
  } else {
    locationEmoji = '💬';
    locationInfo  = 'Private Chat';
    senderJid     = originalMsg.key.senderPn || originalMsg.key.remoteJidAlt;
  }

  const formattedJid = formatJid(senderJid);
  const timestamp    = formatKenyanTime(originalMsg.messageTimestamp);
  const deletedAt    = formatKenyanTime(deleteMsg.messageTimestamp);

  return {
    text: `🗑️ *DELETED MESSAGE DETECTED BY BLACK-MD*\n\n` +
          `*📍 Location:* ${locationEmoji} ${locationInfo}\n` +
          `*👤 Sender Name:* ${senderName}\n` +
          `*📱 Sender ID:* @${formattedJid}\n` +
          `*⏰ Sent At:* ${timestamp}\n` +
          `*🕒 Deleted At:* ${deletedAt}`,
    mentionJid: `${formattedJid}@s.whatsapp.net`
  };
}

async function sendDeletedMedia(client, originalMsg, deleteMsg, botNumber) {
  try {
    const notificationData = await formatDeleteNotification(client, originalMsg, deleteMsg);
    const m = originalMsg.message;
    if (!m) return false;

    const getMediaReply = (mediaMessage) => ({
      caption: mediaMessage.caption
        ? `${notificationData.text}\n\n*📝 Caption:* ${mediaMessage.caption}`
        : notificationData.text,
      mentions: [notificationData.mentionJid]
    });

    if (m.imageMessage) {
      const buffer = await downloadMediaMessage(originalMsg, 'buffer', {});
      await client.sendMessage(botNumber, { image: buffer, ...getMediaReply(m.imageMessage) });
      return true;
    }
    if (m.videoMessage) {
      const buffer = await downloadMediaMessage(originalMsg, 'buffer', {});
      await client.sendMessage(botNumber, { video: buffer, ...getMediaReply(m.videoMessage) });
      return true;
    }
    if (m.stickerMessage) {
      const buffer = await downloadMediaMessage(originalMsg, 'buffer', {});
      await client.sendMessage(botNumber, { sticker: buffer });
      return true;
    }
    if (m.documentMessage) {
      const buffer = await downloadMediaMessage(originalMsg, 'buffer', {});
      await client.sendMessage(botNumber, {
        document: buffer,
        fileName: m.documentMessage.fileName,
        mimetype: m.documentMessage.mimetype,
        ...getMediaReply(m.documentMessage)
      });
      return true;
    }
    if (m.audioMessage) {
      const buffer = await downloadMediaMessage(originalMsg, 'buffer', {});
      await client.sendMessage(botNumber, {
        audio: buffer,
        mimetype: 'audio/mpeg',
        ptt: m.audioMessage.ptt === true,
        caption: notificationData.text
      });
      return true;
    }
    return false;
  } catch (err) { return false; }
}

function extractTextContent(message) {
  if (!message) return null;
  if (message.conversation) return message.conversation;
  if (message.extendedTextMessage?.text) return message.extendedTextMessage.text;
  return null;
}

async function handleDeletedMessage(client, deleteMsg) {
  try {
    const deletedKey = deleteMsg.message.protocolMessage.key;
    const originalMsg = getOriginalMessage(deletedKey);
    if (!originalMsg) return;

    const botNumber = jidNormalizedUser(client.user.id);

    if (await sendDeletedMedia(client, originalMsg, deleteMsg, botNumber)) return;

    const notificationData = await formatDeleteNotification(client, originalMsg, deleteMsg);
    const textContent = extractTextContent(originalMsg.message);

    await client.sendMessage(botNumber, {
      text: textContent
        ? `${notificationData.text}\n\n*📝 Message:*\n${textContent}`
        : notificationData.text,
      mentions: [notificationData.mentionJid]
    });
  } catch (err) { /* silent */ }
}

function cleanupOldMessages() {
  try {
    const sixHoursAgo = Date.now() - (6 * 60 * 60 * 1000);
    const { privateDir, groupsDir, statusDir } = getSessionDirs();
    for (const dir of [privateDir, groupsDir, statusDir]) {
      if (!fs.existsSync(dir)) continue;
      for (const file of fs.readdirSync(dir)) {
        try {
          const filePath = path.join(dir, file);
          const data = JSON.parse(fs.readFileSync(filePath));
          if (data.messageTimestamp * 1000 < sixHoursAgo) fs.unlinkSync(filePath);
        } catch (e) { /* silent */ }
      }
    }
  } catch (err) { /* silent */ }
}

function startPeriodicCleanup() {
  if (cleanupIntervals.has('default')) clearInterval(cleanupIntervals.get('default'));
  cleanupOldMessages();
  const interval = setInterval(cleanupOldMessages, 60 * 60 * 1000);
  cleanupIntervals.set('default', interval);
}

function stopPeriodicCleanup() {
  if (cleanupIntervals.has('default')) {
    clearInterval(cleanupIntervals.get('default'));
    cleanupIntervals.delete('default');
  }
}

async function antiDeleteHandler(client, mek) {
  try {
    if (isDeleteMessage(mek)) {
      await handleDeletedMessage(client, mek);
      return;
    }
    saveMessage(mek);
  } catch (err) { /* silent */ }
}

module.exports = {
  antiDeleteHandler,
  saveMessage,
  isDeleteMessage,
  handleDeletedMessage,
  getOriginalMessage,
  startPeriodicCleanup,
  stopPeriodicCleanup,
  cleanupOldMessages
};
