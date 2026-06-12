module.exports = [

  {
    command: ['settings'],
    description: 'View all bot settings',
    category: 'owner',
    handler: async (client, m, { Owner, NotOwner }) => {
      if (!Owner) return m.reply(NotOwner);
      try {
        const { getSettings } = require('../database/config');
        const s = await getSettings();
        const tog = (v) => v === 'on' ? '✅ ON' : '❌ OFF';
        const msg =
          `╔══════════════════════╗\n` +
          `║     ⚙️  BOT SETTINGS     \n` +
          `╚══════════════════════╝\n\n` +
          `*🔒 Security*\n` +
          `┣ AntiLink: ${tog(s.antilink)}\n` +
          `┣ AntiLinkAll: ${tog(s.antilinkall)}\n` +
          `┣ AntiDelete: ${tog(s.antidelete)}\n` +
          `┣ AntiCall: ${tog(s.anticall)}\n` +
          `┣ AntiBot: ${tog(s.antibot)}\n` +
          `┣ AntiTag: ${tog(s.antitag)}\n` +
          `┗ BadWord: ${tog(s.badword)}\n\n` +
          `*🤖 Automation*\n` +
          `┣ AutoRead: ${tog(s.autoread)}\n` +
          `┣ AutoLike: ${tog(s.autolike)}\n` +
          `┣ AutoView: ${tog(s.autoview)}\n` +
          `┣ AutoBio: ${tog(s.autobio)}\n` +
          `┗ WelcomeGoodbye: ${tog(s.welcomegoodbye)}\n\n` +
          `*💬 Bot-Behaviour*\n` +
          `┣ GPTDM: ${tog(s.gptdm)}\n` +
          `┣ Mode: 🌐 ${(s.mode || 'public').toUpperCase()}\n` +
          `┣ Prefix: ${s.prefix || ''}\n` +
          `┣ MenuType: 📋 ${(s.menutype || 'video').toUpperCase()}\n` +
          `┗ WAPresence: 🟢 ${(s.wapresence || 'recording').toUpperCase()}`;
        await client.sendMessage(m.chat, { text: msg }, { quoted: m });
      } catch (err) {
        m.reply('❌ Failed to fetch settings. Please try again.');
      }
    }
  },

  {
    command: ['antilink'],
    description: 'Toggle anti-link protection',
    category: 'owner',
    handler: async (client, m, { reply, admin, group, isAdmin, Owner, NotOwner, text }) => {
      if (!m.isGroup) return reply(group);
      if (!isAdmin && !Owner) return reply(admin);
      const { getSettings, updateSetting } = require('../database/config');
      const settings = await getSettings();
      const current = settings.antilink;
      if (!text) return reply(`🛡️ Antilink is currently *${current.toUpperCase()}*`);
      if (!['on', 'off'].includes(text)) return reply('Usage: antilink on/off');
      if (text === current) return reply(`✅ Antilink is already *${text.toUpperCase()}*`);
      await updateSetting('antilink', text);
      reply(`✅ Antilink has been turned *${text.toUpperCase()}*`);
    }
  },

  {
    command: ['antilinkall'],
    description: 'Toggle anti-all-links protection',
    category: 'owner',
    handler: async (client, m, { reply, Owner, NotOwner, text }) => {
      if (!Owner) return m.reply(NotOwner);
      const { getSettings, updateSetting } = require('../database/config');
      const settings = await getSettings();
      const current = settings.antilinkall;
      if (!text) return reply(`🛡️ Antilinkall is currently *${current.toUpperCase()}*`);
      if (!['on', 'off'].includes(text)) return reply('Usage: antilinkall on/off');
      if (text === current) return reply(`✅ Antilinkall is already *${text.toUpperCase()}*`);
      await updateSetting('antilinkall', text);
      reply(`✅ Antilinkall has been turned *${text.toUpperCase()}*`);
    }
  },

  {
    command: ['antidelete'],
    description: 'Toggle anti-delete',
    category: 'owner',
    handler: async (client, m, { reply, Owner, NotOwner, text }) => {
      if (!Owner) return m.reply(NotOwner);
      const { getSettings, updateSetting } = require('../database/config');
      const settings = await getSettings();
      const current = settings.antidelete;
      if (!text) return reply(`😊 Antidelete is currently *${current.toUpperCase()}*`);
      if (!['on', 'off'].includes(text)) return reply('Usage: antidelete on/off');
      if (text === current) return reply(`✅ Antidelete is already *${text.toUpperCase()}*`);
      await updateSetting('antidelete', text);
      reply(`✅ Antidelete has been turned *${text.toUpperCase()}*`);
    }
  },

  {
    command: ['gptdm'],
    description: 'Toggle GPT auto-reply in DM',
    category: 'owner',
    handler: async (client, m, { reply, Owner, NotOwner, text }) => {
      if (!Owner) return m.reply(NotOwner);
      const { getSettings, updateSetting } = require('../database/config');
      const settings = await getSettings();
      const current = settings.gptdm;
      if (!text) return reply(`🙂‍↕️ gptdm is currently *${current.toUpperCase()}*`);
      if (!['on', 'off'].includes(text)) return reply('Usage: gptdm on/off');
      if (text === current) return reply(`✅ Gptdm is already *${text.toUpperCase()}*`);
      await updateSetting('gptdm', text);
      reply(`✅ Gptdm has been turned *${text.toUpperCase()}*`);
    }
  },

  {
    command: ['autoread'],
    description: 'Toggle auto-read messages',
    category: 'owner',
    handler: async (client, m, { reply, Owner, NotOwner, text }) => {
      if (!Owner) return m.reply(NotOwner);
      const { getSettings, updateSetting } = require('../database/config');
      const settings = await getSettings();
      const current = settings.autoread;
      if (!text) return reply(`📨 Autoread is currently *${current.toUpperCase()}*`);
      if (!['on', 'off'].includes(text)) return reply('Usage: autoread on/off');
      if (text === current) return reply(`✅ Autoread is already *${text.toUpperCase()}*`);
      await updateSetting('autoread', text);
      reply(`✅ Autoread has been set to *${text.toUpperCase()}*`);
    }
  },

  {
    command: ['mode'],
    description: 'Switch bot mode (public/private)',
    category: 'owner',
    handler: async (client, m, { reply, Owner, NotOwner, text }) => {
      if (!Owner) return m.reply(NotOwner);
      const { getSettings, updateSetting } = require('../database/config');
      const settings = await getSettings();
      const current = settings.mode;
      if (!text) return reply(`👥️ Mode is currently *${current.toUpperCase()}*`);
      if (!['public', 'private'].includes(text)) return reply('Usage: mode public/private');
      if (text === current) return reply(`✅ Mode is already *${text.toUpperCase()}*`);
      await updateSetting('mode', text);
      reply(`✅ Mode changed to *${text.toUpperCase()}*`);
    }
  },

  {
    command: ['prefix'],
    noprefix: ['getprefix'],
    description: 'Change bot command prefix',
    category: 'owner',
    handler: async (client, m, { reply, Owner, NotOwner, args }) => {
      if (!Owner) return m.reply(NotOwner);
      const { getSettings, updateSetting } = require('../database/config');
      const settings = await getSettings();
      const newPrefix = args[0];
      if (newPrefix === 'none') {
        if (!settings.prefix) return m.reply('✅ The bot was already prefixless.');
        await updateSetting('prefix', '');
        await m.reply('✅ The bot is now prefixless.');
      } else if (newPrefix) {
        if (settings.prefix === newPrefix) return m.reply(`✅ The prefix was already set to: ${newPrefix}`);
        await updateSetting('prefix', newPrefix);
        await m.reply(`✅ Prefix has been updated to: ${newPrefix}`);
      } else {
        await m.reply(`👤 Prefix is currently: ${settings.prefix || 'No prefix set.'}\n\nUse _${settings.prefix || '.'}prefix none to remove the prefix.`);
      }
    }
  },

  {
    command: ['autolike'],
    description: 'Toggle auto-like status',
    category: 'owner',
    handler: async (client, m, { reply, Owner, NotOwner, text }) => {
      if (!Owner) return m.reply(NotOwner);
      const { getSettings, updateSetting } = require('../database/config');
      const settings = await getSettings();
      const current = settings.autolike;
      if (!text) return reply(`🫠 Autolike is currently *${current.toUpperCase()}*`);
      if (!['on', 'off'].includes(text)) return reply('Usage: autolike on/off');
      if (text === current) return reply(`✅ Autolike is already *${text.toUpperCase()}*`);
      await updateSetting('autolike', text);
      reply(`✅ Autolike has been turned *${text.toUpperCase()}*`);
    }
  },

  {
    command: ['autobio'],
    description: 'Toggle auto bio update',
    category: 'owner',
    handler: async (client, m, { reply, Owner, NotOwner, text }) => {
      if (!Owner) return m.reply(NotOwner);
      const { getSettings, updateSetting } = require('../database/config');
      const settings = await getSettings();
      const current = settings.autobio;
      if (!text) return reply(`😇 Autobio is currently *${current.toUpperCase()}*`);
      if (!['on', 'off'].includes(text)) return reply('Usage: autobio on/off');
      if (text === current) return reply(`✅ Autobio is already *${text.toUpperCase()}*`);
      await updateSetting('autobio', text);
      reply(`✅ Autobio has been turned *${text.toUpperCase()}*`);
    }
  },

  {
    command: ['autoview'],
    description: 'Toggle auto-view status',
    category: 'owner',
    handler: async (client, m, { reply, Owner, NotOwner, text }) => {
      if (!Owner) return m.reply(NotOwner);
      const { getSettings, updateSetting } = require('../database/config');
      const settings = await getSettings();
      const current = settings.autoview;
      if (!text) return reply(`👀 Auto view status is currently *${current.toUpperCase()}*`);
      if (!['on', 'off'].includes(text)) return reply('Usage: autoview on/off');
      if (text === current) return reply(`✅ Auto view status is already *${text.toUpperCase()}*`);
      await updateSetting('autoview', text);
      reply(`✅ Auto view status updated to *${text.toUpperCase()}*`);
    }
  },

  {
    command: ['menutype'],
    description: 'Set menu display type',
    category: 'owner',
    handler: async (client, m, { reply, Owner, NotOwner, text }) => {
      if (!Owner) return m.reply(NotOwner);
      const { getSettings, updateSetting } = require('../database/config');
      const settings = await getSettings();
      const current = settings.menutype;
      if (!text) return reply(`👤 menutype is currently *${current}*`);
      if (!['video', 'image', 'link', 'text'].includes(text)) return reply('Usage: menutype video/image/link/text');
      if (text === current) return reply(`✅ menutype is already *${text}*`);
      await updateSetting('menutype', text);
      reply(`✅ menutype updated to *${text}*`);
    }
  },

  {
    command: ['wapresence'],
    description: 'Set bot WhatsApp presence',
    category: 'owner',
    handler: async (client, m, { reply, Owner, NotOwner, text }) => {
      if (!Owner) return m.reply(NotOwner);
      const { getSettings, updateSetting } = require('../database/config');
      const settings = await getSettings();
      const current = settings.wapresence;
      if (!text) return reply(`👤 Presence is currently *${current}*`);
      if (!['typing', 'online', 'offline', 'recording'].includes(text)) return reply('Usage: wapresence typing/online/offline/recording');
      if (text === current) return reply(`✅ Presence is already *${text}*`);
      await updateSetting('wapresence', text);
      reply(`✅ Presence updated to *${text}*`);
    }
  },

  {
    command: ['badword'],
    description: 'Toggle bad word filter',
    category: 'owner',
    handler: async (client, m, { reply, Owner, NotOwner, text }) => {
      if (!Owner) return m.reply(NotOwner);
      const { getSettings, updateSetting } = require('../database/config');
      const settings = await getSettings();
      const current = settings.badword;
      if (!text) return reply(`😈 Badword is currently *${current.toUpperCase()}*`);
      if (!['on', 'off'].includes(text)) return reply('Usage: badword on/off');
      if (text === current) return reply(`✅ Badword is already *${text.toUpperCase()}*`);
      await updateSetting('badword', text);
      reply(`✅ Badword has been turned *${text.toUpperCase()}*`);
    }
  },

  {
    command: ['anticall'],
    description: 'Toggle anti-call',
    category: 'owner',
    handler: async (client, m, { reply, Owner, NotOwner, text }) => {
      if (!Owner) return m.reply(NotOwner);
      const { getSettings, updateSetting } = require('../database/config');
      const settings = await getSettings();
      const current = settings.anticall;
      if (!text) return reply(`🔰 Anticall is currently *${current.toUpperCase()}*`);
      if (!['on', 'off'].includes(text)) return reply('Usage: Anticall on/off');
      if (text === current) return reply(`✅ Anticall is already *${text.toUpperCase()}*`);
      await updateSetting('anticall', text);
      reply(`✅ Anticall has been turned *${text.toUpperCase()}*`);
    }
  },

  {
    command: ['antibot'],
    description: 'Toggle anti-bot',
    category: 'owner',
    handler: async (client, m, { reply, Owner, NotOwner, text }) => {
      if (!Owner) return m.reply(NotOwner);
      const { getSettings, updateSetting } = require('../database/config');
      const settings = await getSettings();
      const current = settings.antibot;
      if (!text) return reply(`👾 Antibot is currently *${current.toUpperCase()}*`);
      if (!['on', 'off'].includes(text)) return reply('Usage: antibot on/off');
      if (text === current) return reply(`✅ Antibot is already *${text.toUpperCase()}*`);
      await updateSetting('antibot', text);
      reply(`✅ Antibot has been turned *${text.toUpperCase()}*`);
    }
  },

  {
    command: ['antitag'],
    description: 'Toggle anti-tag',
    category: 'owner',
    handler: async (client, m, { reply, Owner, NotOwner, text }) => {
      if (!Owner) return m.reply(NotOwner);
      const { getSettings, updateSetting } = require('../database/config');
      const settings = await getSettings();
      const current = settings.antitag;
      if (!text) return reply(`🤖 Antitag is currently *${current.toUpperCase()}*`);
      if (!['on', 'off'].includes(text)) return reply('Usage: antitag on/off');
      if (text === current) return reply(`✅ Antitag is already *${text.toUpperCase()}*`);
      await updateSetting('antitag', text);
      reply(`✅ Antitag has been turned *${text.toUpperCase()}*`);
    }
  },

  {
    command: ['welcomegoodbye'],
    description: 'Toggle welcome/goodbye messages',
    category: 'owner',
    handler: async (client, m, { reply, Owner, NotOwner, text }) => {
      if (!Owner) return m.reply(NotOwner);
      const { getSettings, updateSetting } = require('../database/config');
      const settings = await getSettings();
      const current = settings.welcomegoodbye;
      if (!text) return reply(`🕳 Welcomegoodbye is currently *${current.toUpperCase()}*`);
      if (!['on', 'off'].includes(text)) return reply('Usage: welcomegoodbye on/off');
      if (text === current) return reply(`✅ Welcomegoodbye is already *${text.toUpperCase()}*`);
      await updateSetting('welcomegoodbye', text);
      reply(`✅ Welcomegoodbye has been turned *${text.toUpperCase()}*`);
    }
  },

  {
    command: ['broadcast'],
    aliases: ['cast'],
    description: 'Broadcast text, image, video, or audio to all groups',
    category: 'owner',
    handler: async (client, m, { reply, Owner, NotOwner, text, msgR, mime, qmsg }) => {
        if (!Owner) return m.reply(NotOwner);

        const fs = require('fs');
        const hasMedia = !!(msgR && qmsg && mime);
        const caption = text ? `📢 *_black-md_*\n\n${text}` : '📢 *black-md broadcast*';

        if (!hasMedia && !text) return reply('Send .broadcast <message>\nor quote an image/video/audio with .broadcast');

        await reply('📢 _Broadcasting..._');

        // ── Download media ONCE before the loop ──────────────────────────────
        let mediaBuffer = null;
        let mediaType = null;

        if (hasMedia) {
            try {
                const medis = await client.downloadAndSaveMediaMessage(qmsg);
                mediaBuffer = fs.readFileSync(medis);
                fs.unlinkSync(medis);

                if (/image/.test(mime))      mediaType = 'image';
                else if (/video/.test(mime)) mediaType = 'video';
                else if (/audio/.test(mime)) mediaType = 'audio';
            } catch (e) {
                return reply('❌ Failed to download media: ' + e.message);
            }
        }

        // ── Broadcast to all groups ──────────────────────────────────────────
        const groups = await client.groupFetchAllParticipating();
        const groupIds = Object.keys(groups);
        let count = 0;

        for (const id of groupIds) {
            try {
                if (mediaType === 'image') {
                    await client.sendMessage(id, { image: mediaBuffer, caption });

                } else if (mediaType === 'video') {
                    await client.sendMessage(id, { video: mediaBuffer, caption });

                } else if (mediaType === 'audio') {
                    const isVoiceNote = /ogg|opus/.test(mime);
                    await client.sendMessage(id, {
                        audio: mediaBuffer,
                        mimetype: isVoiceNote ? 'audio/ogg; codecs=opus' : 'audio/mp4',
                        ptt: isVoiceNote
                    });

                } else {
                    // text only
                    await client.sendMessage(id, { text: caption });
                }
                count++;
            } catch {}
        }

        reply(`✅ Broadcast sent to *${count}/${groupIds.length}* groups.`);
    }
},

  {
    command: ['restart'],
    description: 'Restart the bot',
    category: 'owner',
    handler: async (client, m, { Owner, NotOwner, reply }) => {
      if (!Owner) return m.reply(NotOwner);
      const { sleep } = require('../lib/ravenfunc');
      reply('Restarting. . .');
      await sleep(3000);
      process.exit();
    }
  },
  
{
  command: ['update'],
  aliases: ['redeploy'],
  description: 'Trigger a fresh Heroku redeploy from latest GitHub code',
  category: 'owner',
  handler: async (client, m, { Owner, NotOwner, reply }) => {
    if (!Owner) return m.reply(NotOwner);

    const axios = require('axios');
    const { appname, herokuapi } = require('../set.js');

    // ── Check env vars are set ───────────────────────────────────────────
    if (!appname || !herokuapi) {
      return reply(
        `❌ *Missing Config*\n\n` +
        `Please set these in your Heroku config vars:\n` +
        `┣ \`APP_NAME\` — your Heroku app name\n` +
        `┗ \`HEROKU_API\` — your Heroku API key\n\n` +
        `Get your API key at:\nhttps://dashboard.heroku.com/account`
      );
    }

    await reply('⏳ Triggering updates from GitHub...');

    try {
      const response = await axios.post(
        `https://api.heroku.com/apps/${appname}/builds`,
        {
          source_blob: {
            url: `https://github.com/Blackie254/black-super-bot/tarball/main`
          }
        },
        {
          headers: {
            Authorization: `Bearer ${herokuapi}`,
            Accept: 'application/vnd.heroku+json; version=3',
            'Content-Type': 'application/json'
          }
        }
      );

      const buildId = response.data?.id?.slice(0, 8) || 'N/A';
      const status  = response.data?.status || 'pending';

      await reply(
        `✅ *Updates Triggered!*\n\n` +
        `📦 Build ID : \`${buildId}\`\n` +
        `🔄 Status   : ${status}\n` +
        `🕒 Wait     : ~2 minutes\n\n` +
        `BLACK-MD will pull the latest code from GitHub and restart automatically.\n\n` +
        `📍 Track progress:\nhttps://dashboard.heroku.com/apps/${appname}/activity`
      );

    } catch (err) {
      const errMsg = err.response?.data?.message || err.message || 'Unknown error';
      const status = err.response?.status;

      let hint = '';
      if (status === 401) hint = '\n\n💡 *Fix:* Your `HEROKU_API` key is wrong or expired. Get a new one at https://dashboard.heroku.com/account';
      if (status === 404) hint = '\n\n💡 *Fix:* Your `APP_NAME` is wrong. Check it at https://dashboard.heroku.com/apps';
      if (status === 403) hint = '\n\n💡 *Fix:* Your API key doesn\'t have permission for this app.';

      reply(
        `❌ *Redeploy Failed*\n\n` +
        `\`${errMsg}\`` +
        hint
      );
    }
  }
},
  
{
    command: ['fullpp'],
    aliases: ['setfullpp'],
    description: 'Set bot profile picture with full resolution (Owner only)',
    category: 'owner',
    handler: async (client, m, { Owner, NotOwner, msgR, generateProfilePicture }) => {
        if (!Owner) return m.reply(NotOwner);
        const { S_WHATSAPP_NET } = require('@whiskeysockets/baileys');
        const fs = require('fs');
        try {
            if (!msgR) return m.reply('𝗤𝘂𝗼𝘁𝗲 𝗮𝗻 𝗶𝗺𝗮𝗴𝗲...');

            let media;
            if (msgR.imageMessage) {
                media = msgR.imageMessage;
            } else {
                return m.reply('𝗛𝘂𝗵 𝘁𝗵𝗶𝘀 𝗶𝘀 𝗻𝗼𝘁 𝗮𝗻 𝗶𝗺𝗮𝗴𝗲...');
            }

            var medis = await client.downloadAndSaveMediaMessage(media);

            var medisBuffer = fs.readFileSync(medis);

            var { img } = await generateProfilePicture(medisBuffer);

            await client.query({
                tag: 'iq',
                attrs: {
                    target: undefined,
                    to: S_WHATSAPP_NET,
                    type: 'set',
                    xmlns: 'w:profile:picture'
                },
                content: [{
                    tag: 'picture',
                    attrs: { type: 'image' },
                    content: img
                }]
            });

            fs.unlinkSync(medis); // clean up temp file
            m.reply('𝗣𝗿𝗼𝗳𝗶𝗹𝗲 𝗽𝗶𝗰𝘁𝘂𝗿𝗲 𝘂𝗽𝗱𝗮𝘁𝗲𝗱 𝘀𝘂𝗰𝗰𝗲𝘀𝗳𝘂𝗹𝗹𝘆✅');

        } catch (error) {
            m.reply('An error occured while updating profile photo\n' + error);
        }
    }
},
  
  {
    command: ['eval'],
    aliases: ['=>'],
    description: 'Evaluate a bot Baileys function',
    category: 'owner',
    handler: async (client, m, { body, store, budy, msgR, args, text, q, arg,        
        pushname, botNumber, itsMe, from, reply, sender,
        Owner, superUserSet, finalSuperUsers,        
        quoted, mime, qmsg, api,      
        command, prefix, menutype, cmd, mode,    
        groupMetadata, groupName, participants, groupAdmin,
        isBotAdmin, isAdmin, groupSender, standardizeJid,
        admin, botAdmin, group, NotOwner, resolveLid,
        Rspeed, date, convertTimestamp, generateProfilePicture }) => {
      if (!Owner) return m.reply(NotOwner);
      if (!text) return reply('Provide a valid Bot Baileys Function to evaluate');
  
      try { 
        let evaled = await eval(text);
        if (typeof evaled !== 'string') evaled = require('util').inspect(evaled);
        await reply(evaled);
      } catch (err) {
        await reply(String(err));
      }
    }
  },

 {
    command: ['block'],
    description: 'Block a user',
    category: 'owner',
    handler: async (client, m, { Owner, NotOwner, args, reply, standardizeJid }) => {
      if (!Owner) return m.reply(NotOwner);

      const { jidNormalizedUser } = require('@whiskeysockets/baileys');
      const { owner } = require('../set');

      let target = null;
      if (m.mentionedJid && m.mentionedJid.length > 0) {
        target = m.mentionedJid[0];
      } else if (m.quoted && m.quoted.sender) {
        target = m.quoted.sender;
      } else if (args[0]) {
        const num = args[0].replace(/[^0-9]/g, '');
        if (num) target = num + '@s.whatsapp.net';
      }

      if (!target) return reply('❌ Tag someone, reply to their message, or provide a number.\nUsage: .block @user / .block 2547xxxxxxxx');

      const isLid = target.includes('@lid') || (!target.includes('@s.whatsapp.net') && /^\d{12,}@/.test(target));
      if (isLid && m.isGroup) {
        try {
          const meta = await client.groupMetadata(m.chat);
          const tNum = target.split('@')[0].split(':')[0];
          let found = meta.participants.find(p => p.lid && p.lid.split(':')[0].split('@')[0] === tNum);
          if (!found) found = meta.participants.find(p => p.id && p.id.split(':')[0].split('@')[0] === tNum);
          if (found) {
            if (found.pn) target = found.pn + '@s.whatsapp.net';
            else if (found.id && !found.id.includes('@lid')) target = standardizeJid(found.id);
          }
        } catch (e) {}
      }

      target = standardizeJid(target);
      if (!target || target.includes('@lid')) return reply('❌ Could not resolve that user\'s real JID. Try typing their number directly.\nExample: .block 2547xxxxxxxx');

      // ──────────────────────────────────────────────────────
      const botJid = jidNormalizedUser(client.user.id);
      const ownerJids = owner.map(n => `${n}@s.whatsapp.net`);
      if (ownerJids.includes(target)) return reply('I cannot block my Owner 😡');
      if (target === botJid) return reply('I cannot block myself 😡');

      try {
        await client.updateBlockStatus(target, 'block');
        reply(`✅ *+${target.split('@')[0]}* has been blocked.`);
      } catch (err) {
        reply('❌ Error: ' + err.message);
      }
    }
  },

{
    command: ['unblock'],
    description: 'Unblock a user',
    category: 'owner',
    handler: async (client, m, { Owner, NotOwner, args, reply, standardizeJid }) => {
      if (!Owner) return m.reply(NotOwner);
      
      let target = null;
      if (m.mentionedJid && m.mentionedJid.length > 0) {
        target = m.mentionedJid[0];
      } else if (m.quoted && m.quoted.sender) {
        target = m.quoted.sender;
      } else if (args[0]) {
        const num = args[0].replace(/[^0-9]/g, '');
        if (num) target = num + '@s.whatsapp.net';
      }

      if (!target) return reply('❌ Tag someone, reply to their message, or provide a number.\nUsage: .unblock @user / .unblock 2547xxxxxxxx');
      
      const isLid = target.includes('@lid') || (!target.includes('@s.whatsapp.net') && /^\d{12,}@/.test(target));
      if (isLid && m.isGroup) {
        try {
          const meta = await client.groupMetadata(m.chat);
          const tNum = target.split('@')[0].split(':')[0];
          let found = meta.participants.find(p => p.lid && p.lid.split(':')[0].split('@')[0] === tNum);
          if (!found) found = meta.participants.find(p => p.id && p.id.split(':')[0].split('@')[0] === tNum);
          if (found) {
            if (found.pn) target = found.pn + '@s.whatsapp.net';
            else if (found.id && !found.id.includes('@lid')) target = standardizeJid(found.id);
          }
        } catch (e) {}
      }

      target = standardizeJid(target);
      if (!target || target.includes('@lid')) return reply('❌ Could not resolve that user\'s real JID. Try typing their number directly.\nExample: .unblock 2547xxxxxxxx');

      try {
        await client.updateBlockStatus(target, 'unblock');
        reply(`✅ *+${target.split('@')[0]}* has been unblocked.`);
      } catch (err) {
        reply('❌ Error: ' + err.message);
      }
    }
  },

  
  {
    command: ['blocklist'],
    description: 'Show blocked contacts (Owner only)',
    category: 'owner',
    handler: async (client, m, { Owner, NotOwner }) => {
      if (!Owner) return m.reply(NotOwner);
      try {
        let blocked = await client.fetchBlocklist();
        if (!blocked || blocked.length === 0) return m.reply('You have no blocked contacts.');
        let list = `*Blocked Contacts (${blocked.length})*\n\n`;
        blocked.forEach((jid, i) => { list += `${i + 1}. +${jid.replace(/@.+/, '')}\n`; });
        m.reply(list.trim());
      } catch (err) {
        m.reply('Error fetching blocklist: ' + err.message);
      }
    }
  },

  {
  command: ['getcmd'],
  aliases: ['getcode'],
  description: 'Get the source code of any command',
  category: 'owner',
  handler: async (client, m, { Owner, NotOwner, text }) => {
    if (!Owner) return m.reply(NotOwner);
    if (!text) return m.reply('Usage: .getcmd <commandname>\nExample: .getcmd sticker');

    const fs = require('fs');
    const path = require('path');

    function extractBlock(content, cmdName) {
      const pattern = `'${cmdName}'`;
      const altPattern = `"${cmdName}"`;

      let cmdIdx = content.indexOf(pattern);
      if (cmdIdx === -1) cmdIdx = content.indexOf(altPattern);
      if (cmdIdx === -1) return null;

      const before = content.substring(Math.max(0, cmdIdx - 60), cmdIdx);
      if (!/command\s*:\s*\[/.test(before) && !/,\s*$/.test(before.trimEnd())) {
      
        const cmdRegex = new RegExp(`command\\s*:\\s*\\[[^\\]]*['"]${cmdName}['"]`);
        const m2 = cmdRegex.exec(content);
        if (!m2) return null;
        cmdIdx = m2.index;
      }

      let braceStart = cmdIdx;
      while (braceStart > 0 && content[braceStart] !== '{') braceStart--;

      let depth = 0;
      let braceEnd = braceStart;
      for (let i = braceStart; i < content.length; i++) {
        if (content[i] === '{') depth++;
        else if (content[i] === '}') {
          depth--;
          if (depth === 0) { braceEnd = i; break; }
        }
      }

      return content.substring(braceStart, braceEnd + 1);
    }

    const pluginsDir = path.join(__dirname);
    const files = fs.readdirSync(pluginsDir).filter(f => f.endsWith('.js'));

    let found = null;
    let foundFile = null;
    const cmd = text.trim().replace(/^\./, '');

    for (const file of files) {
      const content = fs.readFileSync(path.join(pluginsDir, file), 'utf8');
      const block = extractBlock(content, cmd);
      if (block) {
        found = block;
        foundFile = file;
        break;
      }
    }

    if (!found) {
      return m.reply(`❌ Command *.${cmd}* not found in any plugin file.`);
    }

    const header = `📄 *Command:* .${cmd}\n📁 *File:* plugins/${foundFile}\n\n`;
    const code = `\`\`\`\n${found.trim()}\n\`\`\``;
    const output = header + code;

    if (output.length > 10000) {
      return m.reply(header + `\`\`\`\n${found.trim().substring(0, 9800)}\n...[code too long, showing first part]\n\`\`\``);
    }

    m.reply(output);
  }
},

  {
  command: ['getfile'],
  aliases: ['sendfile', 'sourcefile'],
  description: 'Get a bot file sent as a document',
  category: 'owner',
  handler: async (client, m, { Owner, NotOwner, text, reply }) => {
    if (!Owner) return m.reply(NotOwner);
    if (!text) {
      return reply(
        `📁 *Usage:* .getfile <filename>`
      );
    }

    const fs   = require('fs');
    const path = require('path');

    // ── Blocked files
    const blocked = [
      'set.js',
      'session',
      'creds.json',
      'antidelete.js',
      '.Env',
      'package-lock.json',
      'node_modules'
    ];

    const reqPath = text.trim().replace(/\\/g, '/');
    const isBlocked = blocked.some(b =>
      reqPath.includes(b) || path.basename(reqPath) === b
    );
    if (isBlocked) {
      return reply(`🚫 That file is restricted and cannot be sent.`);
    }

    const botRoot  = path.join(__dirname, '..');
    const filePath = path.resolve(botRoot, reqPath);

    if (!filePath.startsWith(botRoot)) {
      return reply(`🚫 Access denied. You can only access files inside the bot folder.`);
    }

    if (!fs.existsSync(filePath)) {
      return reply(`❌ File not found: \`${reqPath}\`\n\nMake sure the path is correct.`);
    }

    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      const items = fs.readdirSync(filePath);
      const list  = items.map(i => {
        const full   = path.join(filePath, i);
        const isDir  = fs.statSync(full).isDirectory();
        return `${isDir ? '📁' : '📄'} ${i}`;
      }).join('\n');

      return reply(
        `📁 *Contents of \`${reqPath}\`:*\n\n${list}\n\n` +
        `Use .getfile ${reqPath}/<filename> to get a specific file.`
      );
    }

    if (stat.size > 10 * 1024 * 1024) {
      return reply(`❌ File too large to send (${(stat.size / 1024 / 1024).toFixed(1)} MB). Max is 10MB.`);
    }

const mime     = require('mime-types');
const buffer   = fs.readFileSync(filePath);
const fileName = path.basename(filePath);
const fileSize = (stat.size / 1024).toFixed(1) + ' KB';
const mimeType = mime.lookup(filePath) || 'application/octet-stream';

await client.sendMessage(m.chat, {
  document: buffer,
  mimetype: mimeType,
  fileName: fileName,
  caption:
    `📄 *${fileName}*\n` +
    `📁 Path: \`${reqPath}\`\n` +
    `📦 Size: ${fileSize}\n` +
    `🗂️ Type: ${mimeType}`
      }, { quoted: m });
  }
},

  {
    command: ['shell', '$', 'exec'],
    aliases: ['sh'],
    description: 'Run a shell command (owner only)',
    category: 'owner',
    handler: async (client, m, { reply, Owner, NotOwner, text }) => {
      if (!Owner) return reply(NotOwner);
      if (!text) return reply('Usage: .shell <command>\nExample: .shell ls -la');

      const { exec } = require('child_process');
      await reply('⏳ Running...');

      exec(text, { timeout: 15000, maxBuffer: 1024 * 512 }, async (err, stdout, stderr) => {
        const out = (stdout || '').trim();
        const errOut = (stderr || '').trim();
        const result = [
          out && `📤 *Output:*\n\`\`\`\n${out}\n\`\`\``,
          errOut && `⚠️ *Stderr:*\n\`\`\`\n${errOut}\n\`\`\``,
          err && !errOut && `❌ *Error:* ${err.message}`,
        ].filter(Boolean).join('\n\n');

        await reply(result || '✅ Command ran with no output.');
      });
    }
  },

  {
    command: ['cat'],
    aliases: ['readfile'],
    description: 'Read a file from the server (owner only)',
    category: 'owner',
    handler: async (client, m, { reply, Owner, NotOwner, text }) => {
      if (!Owner) return reply(NotOwner);
      if (!text) return reply('Usage: .cat <filepath>\nExample: .cat set.js');

      const fs = require('fs');
      const path = require('path');

      const filePath = path.resolve(process.cwd(), text.trim());

      try {
        if (!fs.existsSync(filePath)) return reply(`❌ File not found: ${text}`);
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) return reply(`❌ That's a directory, not a file.`);
        if (stat.size > 100 * 1024) return reply(`❌ File too large (${(stat.size/1024).toFixed(1)} KB). Max is 100 KB.`);

        const content = fs.readFileSync(filePath, 'utf8');
        const ext = path.extname(filePath).replace('.', '') || 'txt';
        await reply(`📄 *${path.basename(filePath)}*\n\`\`\`${ext}\n${content}\n\`\`\``);
      } catch (e) {
        reply(`❌ Error reading file: ${e.message}`);
      }
    }
  },

  {
    command: ['addsudo'],
    aliases: ['asudo'],
    description: 'Add a user as sudo (Owner only)',
    category: 'owner',
    handler: async (client, m, { Owner, NotOwner, args, reply, standardizeJid }) => {
      if (!Owner) return m.reply(NotOwner);

      const { addSudo } = require('../database/config');

      let target = null;
      if (m.mentionedJid && m.mentionedJid.length > 0) {
        target = m.mentionedJid[0];
      } else if (m.quoted && m.quoted.sender) {
        target = m.quoted.sender;
      } else if (args[0]) {
        const num = args[0].replace(/[^0-9]/g, '');
        if (num) target = num + '@s.whatsapp.net';
      }

      if (!target) return reply('❌ Tag someone, reply to their message, or provide a number.\nUsage: .addsudo @user / .addsudo 2547xxxxxxxx');

      const isLid = target.includes('@lid') || (!target.includes('@s.whatsapp.net') && /^\d{12,}@/.test(target));
      if (isLid && m.isGroup) {
        try {
          const meta = await client.groupMetadata(m.chat);
          const tNum = target.split('@')[0].split(':')[0];
          let found = null;

          found = meta.participants.find(p => p.lid && p.lid.split(':')[0].split('@')[0] === tNum);
          
          if (!found) found = meta.participants.find(p => p.id && p.id.split(':')[0].split('@')[0] === tNum);

          if (found) {
            if (found.pn) {
              target = found.pn + '@s.whatsapp.net';
            } else if (found.id && !found.id.includes('@lid')) {
              target = standardizeJid(found.id);
            }
          }
        } catch (e) {}
      }

      target = standardizeJid(target);
      if (!target) return reply('❌ Could not resolve that user\'s JID.');

      const done = await addSudo(target);
      const display = target.split('@')[0];

      if (done) {
        reply(`✅ *+${display}* has been added as sudo.`);
      } else {
        reply(`⚠️ *+${display}* is already a sudo user.`);
      }
    }
  },


    {
    command: ['removesudo'],
    aliases: ['rsudo', 'delsudo'],
    description: 'Remove a sudo user (Owner only)',
    category: 'owner',
    handler: async (client, m, { Owner, NotOwner, args, reply, standardizeJid }) => {
      if (!Owner) return m.reply(NotOwner);

      const { removeSudo } = require('../database/config');

      let target = null;
      if (m.mentionedJid && m.mentionedJid.length > 0) {
        target = m.mentionedJid[0];
      } else if (m.quoted && m.quoted.sender) {
        target = m.quoted.sender;
      } else if (args[0]) {
        const num = args[0].replace(/[^0-9]/g, '');
        if (num) target = num + '@s.whatsapp.net';
      }

      if (!target) return reply('❌ Tag someone, reply to their message, or provide a number.\nUsage: .removesudo @user / .removesudo 2547xxxxxxxx');

      const isLid = target.includes('@lid') || (!target.includes('@s.whatsapp.net') && /^\d{12,}@/.test(target));
      if (isLid && m.isGroup) {
        try {
          const meta = await client.groupMetadata(m.chat);
          const tNum = target.split('@')[0].split(':')[0];
          let found = null;

          found = meta.participants.find(p => p.lid && p.lid.split(':')[0].split('@')[0] === tNum);
          if (!found) found = meta.participants.find(p => p.id && p.id.split(':')[0].split('@')[0] === tNum);

          if (found) {
            if (found.pn) {
              target = found.pn + '@s.whatsapp.net';
            } else if (found.id && !found.id.includes('@lid')) {
              target = standardizeJid(found.id);
            }
          }
        } catch (e) {}
      }

      target = standardizeJid(target);
      if (!target) return reply('❌ Could not resolve that user\'s JID.');

      const done = await removeSudo(target);
      const display = target.split('@')[0];

      if (done) {
        reply(`✅ *+${display}* has been removed from sudo.`);
      } else {
        reply(`⚠️ *+${display}* was not a sudo user.`);
      }
    }
  },

  {
    command: ['checksudo'],
    aliases: ['sudos'],
    description: 'List all current sudo users (Owner only)',
    category: 'owner',
    handler: async (client, m, { Owner, NotOwner, reply }) => {
      if (!Owner) return m.reply(NotOwner);

      const { getSudos } = require('../database/config');
      const sudos = await getSudos();

      if (sudos.length === 0) {
        return reply('📋 No sudo users set.\n\nUse .addsudo @user to add one.');
      }

      const list = sudos
        .map((jid, i) => `${i + 1}. +${jid.split('@')[0]}`)
        .join('\n');

      reply(
        `══════════════════\n` +
        `  CURRENT SUDO USERS      \n` +
        `══════════════════\n\n` +
        `${list}\n\n` +
        `Total: *${sudos.length}*`
      );
    }
  },

  {
    command: ['clearsudos'],
    aliases: ['removeallsudos', 'delsudos', 'rsudos'],
    description: 'Remove all sudo users at once (Owner only)',
    category: 'owner',
    handler: async (client, m, { Owner, NotOwner, reply }) => {
      if (!Owner) return m.reply(NotOwner);

      const { clearAllSudos } = require('../database/config');
      const count = await clearAllSudos();

      if (count === -1) return reply('❌ Failed to clear sudos. Check database connection.');
      if (count === 0) return reply('📋 No sudo users to remove.');

      reply(
        `✅ All sudo users have been removed.\n` +
        `🗑️ *${count}* user(s) cleared.`
      );
    }
  },
  
  {
  command: ['fetch'],
  aliases: ['curl'],
  description: 'Fetch and display content from a URL',
  category: 'owner',
  handler: async (client, m, { Owner, NotOwner, text, reply }) => {
    if (!Owner) return m.reply(NotOwner);
    if (!text) return reply('❌ Provide a valid URL to fetch.');
    const axios = require('axios');

    try {
      const response = await axios.get(text, { responseType: 'arraybuffer', timeout: 20000 });
      const contentType = response.headers['content-type'] || '';
      const buffer = Buffer.from(response.data);
      const filename = text.split('/').pop() || 'file';

      if (contentType.includes('application/json')) {
        const json = JSON.parse(buffer.toString());
        return reply('```json\n' + JSON.stringify(json, null, 2).slice(0, 4000) + '\n```');
      }

      if (contentType.includes('text/html')) {
        return reply(buffer.toString().slice(0, 4000));
      }

      if (contentType.includes('image')) {
        return client.sendMessage(m.chat, { image: buffer, caption: text }, { quoted: m });
      }

      if (contentType.includes('video')) {
        return client.sendMessage(m.chat, { video: buffer, caption: text }, { quoted: m });
      }

      if (contentType.includes('audio')) {
        return client.sendMessage(m.chat, {
          audio: buffer,
          mimetype: 'audio/mpeg',
          fileName: filename
        }, { quoted: m });
      }

      if (contentType.includes('application/pdf')) {
        return client.sendMessage(m.chat, {
          document: buffer,
          mimetype: 'application/pdf',
          fileName: filename
        }, { quoted: m });
      }

      if (contentType.includes('application/')) {
        return client.sendMessage(m.chat, {
          document: buffer,
          mimetype: contentType,
          fileName: filename
        }, { quoted: m });
      }

      if (contentType.includes('text/')) {
        return reply(buffer.toString().slice(0, 4000));
      }

      return reply('❌ Unsupported or unknown content type: ' + contentType);
    } catch (err) {
      return reply('❌ Failed to fetch: ' + (err.message || 'Unknown error'));
    }
  }
},
  
  {
    command: ['groupstatus'],
    aliases: ['togroupstatus', 'statusgroup', 'gcstatus'],
    noprefix: ['gss', 'gcs'],
    description: 'Send a message/media to group status',
    category: 'owner',
    handler: async (client, m, { reply, Owner, NotOwner, group, text }) => {
      if (!Owner) return m.reply(NotOwner);
      if (!m.isGroup) return reply(group);
      if (!text && !m.quoted) {
        return m.reply(
          '📌 Usage:\n' +
          '• togroupstatus <text>\n' +
          '• Reply to an image/video/audio/document/sticker with togroupstatus <caption>\n' +
          '• Or just togroupstatus to forward quoted media without caption'
        );
      }
      try {
        const fs = require('fs');
        let payload = { groupStatusMessage: {} };
        if (m.quoted) {
          const qtype = m.quoted.mtype || '';
          if (qtype === 'imageMessage') {
            const caption = text || m.quoted.msg?.caption || '';
            const filePath = await client.downloadAndSaveMediaMessage(m.quoted);
            payload.groupStatusMessage.image = { url: filePath };
            if (caption) payload.groupStatusMessage.caption = caption;
          } else if (qtype === 'videoMessage') {
            const caption = text || m.quoted.msg?.caption || '';
            const filePath = await client.downloadAndSaveMediaMessage(m.quoted);
            payload.groupStatusMessage.video = { url: filePath };
            if (caption) payload.groupStatusMessage.caption = caption;
          } else if (qtype === 'audioMessage') {
            const filePath = await client.downloadAndSaveMediaMessage(m.quoted);
            const opusPath = filePath + '_converted.ogg';
            await new Promise((resolve, reject) => {
              require('fluent-ffmpeg')(filePath)
                .audioCodec('libopus')
                .audioBitrate(128)
                .toFormat('ogg')
                .on('end', resolve)
                .on('error', reject)
                .save(opusPath);
            });
            try { fs.unlinkSync(filePath); } catch (e) {}
            payload.groupStatusMessage.audio = { url: opusPath };
            payload._opusCleanup = opusPath;
          } else if (qtype === 'documentMessage') {
            const filePath = await client.downloadAndSaveMediaMessage(m.quoted);
            payload.groupStatusMessage.document = { url: filePath };
          } else if (qtype === 'stickerMessage') {
            const filePath = await client.downloadAndSaveMediaMessage(m.quoted);
            payload.groupStatusMessage.sticker = { url: filePath };
          } else if (m.quoted.text) {
            payload.groupStatusMessage.text = m.quoted.text;
          }
          if (text && !payload.groupStatusMessage.caption) {
            payload.groupStatusMessage.caption = text;
          }
        } else {
          payload.groupStatusMessage.text = text;
        }
        const opusCleanup = payload._opusCleanup;
        delete payload._opusCleanup;
        await client.sendMessage(m.chat, payload, { quoted: m });
        if (opusCleanup) try { fs.unlinkSync(opusCleanup); } catch (e) {}
      } catch (err) {
        m.reply(`❌ Error sending group status: ${err.message}`);
      }
    }
  },

];
