// BLACK-MD v3

const { jidNormalizedUser } = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');
const util = require('util');
const fetch = require('node-fetch');
global.axios = require('axios').default;
const chalk = require('chalk');
const speed = require('performance-now');
const api = 'https://ravenn.site';
const fetchSettings = require('./database/fetchSettings');
const { antiDeleteHandler } = require('./lib/antidelete');
const { botname, author, packname, mycode, admin, botAdmin, dev, group, bad, owner, NotOwner } = require('./set.js');
const { smsg, sleep, generateProfilePicture, fetchJson, getBuffer, } = require('./lib/ravenfunc');

// ─── Load Plugin System ───────────────────────────────────────────────────────
const handler = require('./lib/handler');
const pluginsDir = path.join(__dirname, 'plugins');
handler.loadPlugins(pluginsDir);
handler.watchPlugins(pluginsDir);

// ─── Active User Tracking ─────────────────────────────────────────────────────
if (!global.activeUserStore) global.activeUserStore = new Map();

global.trackMessage = function (groupJid, userJid) {
  if (!groupJid || !userJid) return;
  if (!global.activeUserStore.has(groupJid)) global.activeUserStore.set(groupJid, new Map());
  const group = global.activeUserStore.get(groupJid);
  group.set(userJid, (group.get(userJid) || 0) + 1);
};

global.getActiveUsers = function (groupJid, limit = 15) {
  const group = global.activeUserStore.get(groupJid);
  if (!group || group.size === 0) return [];
  return [...group.entries()]
    .map(([jid, count]) => ({ jid, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
};
// ─────────────────────────────────────────────────────────────────────────────

const color = (text, color) => (!color ? chalk.green(text) : chalk.keyword(color)(text));

module.exports = raven = async (client, m, chatUpdate, store) => {
  try {

    const {
      wapresence,
      autoread,
      mode,
      prefix,
      antilink,
      antilinkall,
      antidelete,
      gptdm,
      menutype,
      badword,
      antibot,
      antitag
    } = await fetchSettings();

    var body =
      m.mtype === 'conversation'
        ? m.message.conversation
        : m.mtype == 'extendedTextMessage'
        ? m.message.extendedTextMessage.text
        : m.mtype == 'buttonsResponseMessage'
        ? m.message.buttonsResponseMessage.selectedButtonId
        : m.mtype == 'listResponseMessage'
        ? m.message.listResponseMessage.singleSelectReply.selectedRowId
        : m.mtype == 'templateButtonReplyMessage'
        ? m.message.templateButtonReplyMessage.selectedId
        : m.mtype === 'messageContextInfo'
        ? m.message.buttonsResponseMessage?.selectedButtonId || m.message.listResponseMessage?.singleSelectReply.selectedRowId || m.text
        : '';

    var budy = typeof m.text == 'string' ? m.text : '';
    var msgR = m.message.extendedTextMessage?.contextInfo?.quotedMessage;

    // ── Helper: standardize JID ──────────────────────────────────────────────
    function standardizeJid(jid) {
      if (!jid) return '';
      try {
        jid = typeof jid === 'string' ? jid : (jid.decodeJid ? jid.decodeJid() : String(jid));
        if (jid.includes('@g.us')) return jid.toLowerCase();
        const numPart = jid.split(':')[0].split('/')[0].replace(/@.*$/, '');
        if (!numPart) return '';
        return (numPart + '@s.whatsapp.net').toLowerCase();
      } catch (e) {
        return '';
      }
    }

    async function resolveLid(jid, client, store) {
      if (!jid) return jid;
      const isLid = jid.includes('@lid') || /^\d{10,}\.0$/.test(jid);
      if (!isLid) return jid;
      const lidKey = jid.includes('@lid') ? jid : jid + '@lid';
            if (store && store.contacts) {
        const contact = store.contacts[lidKey];
        if (contact) {
  
          if (contact.pn) return contact.pn + '@s.whatsapp.net';
          
          if (contact.id && !contact.id.includes('@lid')) return jidNormalizedUser(contact.id);
        }
      
        for (const c of Object.values(store.contacts)) {
          if (c.pn && (c.lid === lidKey || c.id === lidKey)) {
            return c.pn + '@s.whatsapp.net';
          }
        }
      }
      try {
        const numericPart = jid.split(':')[0].split('@')[0].replace('.0', '');
        const results = await client.onWhatsApp(numericPart);
        if (results && results[0] && results[0].exists && results[0].jid) return jidNormalizedUser(results[0].jid);
      } catch (e) {}
      const numericPart = jid.split(':')[0].split('@')[0].replace('.0', '');
      return numericPart + '@s.whatsapp.net';
    }

    function getBotLid(client) {
      if (!client?.user) return null;
      if (client.user.lid) {
        const lid = String(client.user.lid);
        if (lid.includes('@lid')) return lid.toLowerCase();
        return lid.split(':')[0] + '@lid';
      }
      if (client.user.id && client.user.id.includes('@lid')) return client.user.id.split(':')[0] + '@lid';
      if (client.user.id) {
        const raw = String(client.user.id);
        const numPart = raw.split(':')[0].split('@')[0];
        if (numPart.length > 12) return numPart + '@lid';
      }
      return null;
    }

    function convertTimestamp(timestamp) {
      const d = new Date(timestamp * 1000);
      const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      return {
        date: d.getDate(),
        month: new Intl.DateTimeFormat('en-US', { month: 'long' }).format(d),
        year: d.getFullYear(),
        day: daysOfWeek[d.getUTCDay()],
        time: `${d.getUTCHours()}:${d.getUTCMinutes()}:${d.getUTCSeconds()}`
      };
    }

    // ── Parse message ────────────────────────────────────────────────────────
    const mek = chatUpdate.messages[0];

    const sendr = mek.key.fromMe
      ? (client.user.id.split(':')[0] + '@s.whatsapp.net' || client.user.id)
      : (() => {
          const pn = mek.key.participantPn || mek.key.senderPn;
          if (pn) {
            const clean = String(pn).replace(/\D/g, '');
            if (clean) return clean + '@s.whatsapp.net';
          }
          return mek.key.participant || mek.key.remoteJid;
        })();
    
    const command = body.slice(prefix.length).trim().split(/ +/).shift().toLowerCase();
    const args = body.slice(prefix.length).trim().split(/ +/).slice(1);
    const pushname = m.pushName || 'No Name';
    const botNumber = jidNormalizedUser(client.user.id);
    const itsMe = m.sender == botNumber;
    let text = (q = args.join(' '));
    const arg = budy.trim().substring(budy.indexOf(' ') + 1);
    m.isBaileys = m.id.startsWith('BAE5') && m.id.length === 16;
    const from = m.chat;
    const reply = m.reply;
    const sender = sendr;

  // Track message activity
if (m.isGroup && sender) global.trackMessage(from, sender);
    
  // ── Owner check ──────────────────────────────────────────────────────────
    const botLid = getBotLid(client);
    const superUser = [botLid, standardizeJid(botNumber), ...owner.map(num => `${num}@s.whatsapp.net`)]
      .map(jid => standardizeJid(jid)).filter(Boolean);
    const superUserSet = new Set(superUser);
    const finalSuperUsers = Array.from(superUserSet);
    let senderForOwner = await resolveLid(sender, client, store);
    senderForOwner = standardizeJid(senderForOwner);
    
    const { getSudos } = require('./database/config');
const sudoList = await getSudos();
const isSudoUser = sudoList.map(j => j.toLowerCase()).includes(senderForOwner.toLowerCase());
    
const Owner = finalSuperUsers.includes(standardizeJid(senderForOwner)) || isSudoUser;
    
    // ── Quoted message ───────────────────────────────────────────────────────
    const nicki = (m.quoted || m);
    const quoted = (nicki.mtype == 'buttonsMessage') ? nicki[Object.keys(nicki)[1]]
      : (nicki.mtype == 'templateMessage') ? nicki.hydratedTemplate[Object.keys(nicki.hydratedTemplate)[1]]
      : (nicki.mtype == 'product') ? nicki[Object.keys(nicki)[0]]
      : m.quoted ? m.quoted : m;

    const mime = (quoted.msg || quoted).mimetype || '';
    const qmsg = (quoted.msg || quoted);
    const cmd = body.startsWith(prefix);
    const badwords = bad.split(',');

    // ── Group metadata ───────────────────────────────────────────────────────
    const groupMetadata = m.isGroup ? await client.groupMetadata(m.chat).catch(() => {}) : '';
    const groupName = m.isGroup && groupMetadata ? groupMetadata.subject : '';
    const participants = m.isGroup && groupMetadata
      ? groupMetadata.participants.filter(p => p.pn).map(p => p.pn)
      : [];
    const groupAdmin = m.isGroup
      ? groupMetadata.participants.filter(p => p.admin && p.pn).map(p => p.pn)
      : [];
    const isBotAdmin = m.isGroup ? groupAdmin.includes(botNumber) : false;
    const groupSender = m.isGroup && groupMetadata
      ? (() => {
          const found = groupMetadata.participants.find(p =>
            p.id === sender || jidNormalizedUser(p.id) === jidNormalizedUser(sender)
          );
          return found?.pn || sender;
        })()
      : sender;
    const isAdmin = m.isGroup ? groupAdmin.includes(groupSender) : false;

    const maindev = '254114283550';
    const timestamp = speed();
    const date = new Date()
    const Rspeed = speed() - timestamp;

    let argsLog = budy.length > 30 ? `${q.substring(0, 30)}...` : budy;

    // ── Online status ──────────────────────────────────────────────────────────
    const Grace = mek.key.remoteJid;
    if (wapresence === 'online') {
      client.sendPresenceUpdate('available', Grace);
    } else if (wapresence === 'typing') {
      client.sendPresenceUpdate('composing', Grace);
    } else if (wapresence === 'recording') {
      client.sendPresenceUpdate('recording', Grace);
    } else {
      client.sendPresenceUpdate('unavailable', Grace);
    }

    // ── Private mode ─────────────────────────────────────────────────────────
    if (cmd && mode === 'private' && !itsMe && !Owner && m.sender !== maindev) return;

    // ── Auto-read ────────────────────────────────────────────────────────────
    if (autoread === 'on' && !m.isGroup) client.readMessages([m.key]);
    if (itsMe && mek.key.id.startsWith('BAE5') && mek.key.id.length === 16 && !m.isGroup) return;

    // ── Anti-delete ──────────────────────────────────────────────────────────
    if (antidelete === 'on') {
      await antiDeleteHandler(client, mek);
    }
    // ── sendContact helper ───────────────────────────────────────────────────
    client.sendContact = async (jid, numbers, quoted = '', options = {}) => {
      const contacts = numbers.map(number => ({
        displayName: 'BLACK-MD DEV',
        vcard: [
          'BEGIN:VCARD', 'VERSION:3.0', 'FN:BLACK-MD DEV', 'N:BLACK-MD DEV',
          `TEL;waid=${number}:${number}`, 'item1.X-ABLabel:Number',
          'item2.EMAIL;type=INTERNET:dicksonnicky50@gmail.com', 'item2.X-ABLabel:Email',
          'item3.URL:https://instagram.com/n.ick_hunter', 'item3.X-ABLabel:Instagram',
          'item4.ADR:;;Kenya;;', 'item4.X-ABLabel:Region', 'END:VCARD'
        ].join('\n')
      }));
      client.sendMessage(jid, { contacts: { displayName: 'BLACK-MD DEV', contacts }, ...options }, { quoted });
    };

    // ── Anti-bot ─────────────────────────────────────────────────────────────
    if (antibot === 'on' && mek.key.id.startsWith('BAE5') && mek.key.id.length === 16 && m.isGroup && !isAdmin && isBotAdmin) {
      const kidts = sender;
      client.sendMessage(m.chat, {
        text: `BLACK-MD antibot:\n\n@${kidts.split('@')[0]} has been identified as a bot. Removed to prevent unnecessary spam!`,
        contextInfo: { mentionedJid: [kidts] }
      }, { quoted: m });
      await client.groupParticipantsUpdate(m.chat, [kidts], 'remove');
    }

    // ── Anti-tag ─────────────────────────────────────────────────────────────
    if (antitag === 'on' && !Owner && isBotAdmin && !isAdmin && m.mentionedJid && m.mentionedJid.length > 10) {
      if (itsMe) return;
      const cate = sender;
      await client.sendMessage(m.chat, { text: `@${cate.split('@')[0]}, Antitag is Active🔨`, contextInfo: { mentionedJid: [cate] } }, { quoted: m });
      await client.sendMessage(m.chat, { delete: { remoteJid: m.chat, fromMe: false, id: m.key.id, participant: cate } });
      await client.groupParticipantsUpdate(m.chat, [cate], 'remove');
    }

    // ── Bad word filter ──────────────────────────────────────────────────────
    if (badword === 'on' && isBotAdmin && !isAdmin && body &&
      (new RegExp('\\b' + badwords.join('\\b|\\b') + '\\b')).test(body.toLowerCase())) {
      reply("Hey niggah.\n\nMy owner hates usage of bad words in my presence!");
      client.groupParticipantsUpdate(from, [sender], 'remove');
    }

    // ── Anti-link ────────────────────────────────────────────────────────────
    if (antilink === 'on' && body.includes('chat.whatsapp.com') && !Owner && isBotAdmin && !isAdmin && m.isGroup) {
      const kid = sender;
      client.sendMessage(m.chat, { delete: { remoteJid: m.chat, fromMe: false, id: m.key.id, participant: kid } })
        .then(() => client.groupParticipantsUpdate(m.chat, [kid], 'remove'));
      client.sendMessage(m.chat, { text: `𝗛𝗲𝘆 @${kid.split('@')[0]}👋\n\n𝗦𝗲𝗻𝗱𝗶𝗻𝗴 𝗚𝗿𝗼𝘂𝗽 𝗟𝗶𝗻𝗸𝘀 𝗶𝘀 𝗣𝗿𝗼𝗵𝗶𝗯𝗶𝘁𝗲𝗱!`, contextInfo: { mentionedJid: [kid] } }, { quoted: m });
    }

    if (antilinkall === 'on' && body.includes('https://') && !Owner && isBotAdmin && !isAdmin && m.isGroup) {
      const ki = sender;
      client.sendMessage(m.chat, { delete: { remoteJid: m.chat, fromMe: false, id: m.key.id, participant: ki } })
        .then(() => client.groupParticipantsUpdate(m.chat, [ki], 'remove'));
      client.sendMessage(m.chat, { text: `𝗛𝗲𝘆 @${ki.split('@')[0]}👋\n\n𝗦𝗲𝗻𝗱𝗶𝗻𝗴 𝗟𝗶𝗻𝗸𝘀 𝗶𝘀 𝗣𝗿𝗼𝗵𝗶𝗯𝗶𝘁𝗲𝗱!`, contextInfo: { mentionedJid: [ki] } }, { quoted: m });
    }

    // ── Console log ──────────────────────────────────────────────────────────
    if (cmd && !m.isGroup) {
      console.log(chalk.black(chalk.bgWhite('[ 𝐁𝐋𝐀𝐂𝐊-𝐌𝐃 ]')), color(argsLog, 'turquoise'), chalk.magenta('From'), chalk.green(pushname), chalk.yellow(`[ ${m.sender.replace('@s.whatsapp.net', '')} ]`));
    } else if (cmd && m.isGroup) {
      console.log(chalk.black(chalk.bgWhite('[ LOGS ]')), color(argsLog, 'turquoise'), chalk.magenta('From'), chalk.green(pushname), chalk.yellow(`[ ${m.sender.replace('@s.whatsapp.net', '')} ]`), chalk.blueBright('IN'), chalk.green(groupName));
    }

    // ── COMMAND DISPATCH ─────────────────────────────────────────────────────
    if (cmd) {
    
      const ctx = {        
        body, budy, msgR, args, text, q, arg,        
        pushname, botNumber, itsMe, from, reply, sender,
        Owner, superUser: finalSuperUsers,        
        quoted, mime, qmsg, api, store,    
        command, prefix, menutype, cmd, mode,    
        groupMetadata, groupName, participants, groupAdmin,
        isBotAdmin, isAdmin, groupSender, standardizeJid,
        admin, botAdmin, group, NotOwner, resolveLid,
        Rspeed, date, convertTimestamp, generateProfilePicture
      };

      const handled = await handler.dispatch(command, client, m, ctx);

      if (!handled) {
        if (command && budy.toLowerCase() !== undefined) {
          if (m.chat.endsWith('broadcast')) return;
          if (m.isBaileys) return;
          if (!budy.toLowerCase()) return;
          console.log(chalk.black(chalk.bgRed('[ ERROR ]')), color('command', 'turquoise'), color(`${prefix}${command}`, 'turquoise'), color('BLACK-MD', 'turquoise'));
        }
      }
    }

    // ── NO-PREFIX COMMAND DISPATCH ─────────────────
    if (!cmd && body && body.trim()) {
      const ctx = {
        body, budy, msgR, args, text, q, arg,
        pushname, botNumber, itsMe, from, reply, sender,
        Owner, superUser: finalSuperUsers,
        quoted, mime, qmsg, api, store,
        command, prefix, menutype, cmd, mode,
        groupMetadata, groupName, participants, groupAdmin,
        isBotAdmin, isAdmin, groupSender, standardizeJid,
        admin, botAdmin, group, NotOwner, resolveLid,
        Rspeed, date, convertTimestamp, generateProfilePicture
      };
      await handler.dispatchNoPrefix(body.trim(), client, m, ctx);
      
    }
    
// ── GPTDM — AI auto-reply in private chats only ──────────────────────────────
if (gptdm === 'on' && !m.isGroup && !mek.key.fromMe && !cmd && body && body.trim()) {
  try {
    if (!global.gptDMSessions) global.gptDMSessions = new Map();
    const userJid = m.sender;

    if (!global.gptDMSessions.has(userJid)) global.gptDMSessions.set(userJid, []);
    const history = global.gptDMSessions.get(userJid);

    let prompt = '';
    if (history.length) {
      const ctx = history.map(h => `${h.role === 'user' ? 'User' : 'BLACK-MD'}: ${h.content}`).join('\n');
      prompt += `Previous conversation:\n${ctx}\n\n`;
    }

    prompt +=
      `You are BLACK-MD, a friendly and emotionally intelligent WhatsApp assistant. ` +
      `Read the user's mood from their message — if sad be comforting, if happy match their energy, ` +
      `if angry stay calm, if confused be clear and patient, if flirty be playful but respectful. ` +
      `Reply naturally like a friend texting back. Keep it short. Use emojis where natural. ` +
      `Always reply in the same language the user uses. Never say you are ChatGPT or any other AI.\n\n` +
      `User: ${body.trim()}`;

    await client.sendPresenceUpdate('composing', m.chat);

    let replyText = '';
    const aiCalls = [
      async () => {
        const r = await fetch(`https://api.bk9.dev/ai/llama?q=${encodeURIComponent(prompt)}`);
        const d = await r.json();
        return d?.BK9?.trim();
        },
      async () => {
        const r = await fetch(`https://ravenn.site/keithai?q=${encodeURIComponent(prompt)}`);
        const d = await r.json();
        return (d?.reply || d?.result || d?.response || d?.message || d?.answer)?.trim();
      },
    ];

    for (const call of aiCalls) {
      try {
        const result = await call();
        if (result) { replyText = result; break; }
      } catch { continue; }
    }

    if (!replyText) throw new Error('All AI APIs failed');

    history.push({ role: 'user', content: body.trim() });
    history.push({ role: 'assistant', content: replyText });
    if (history.length > 20) history.splice(0, 2);

    await client.sendPresenceUpdate('paused', m.chat);
    await client.sendMessage(m.chat, { text: replyText }, { quoted: m });

  } catch (err) {
    await client.sendPresenceUpdate('paused', m.chat).catch(() => {});
  }
}
    
  } catch (err) {
    console.log(util.format(err));
  }
};

let file = require.resolve(__filename);
fs.watchFile(file, () => {
  fs.unwatchFile(file);
  console.log(chalk.redBright(`Update ${__filename}`));
  delete require.cache[file];
  require(file);
});
