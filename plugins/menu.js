'use strict';

const fetch = require('node-fetch');
const handler = require('../lib/handler');
const { runtime } = require('../lib/ravenfunc');

function toBold(str) {
  return str.split('').map(c => {
    const code = c.charCodeAt(0);
    if (code >= 65 && code <= 90) return String.fromCodePoint(0x1D5D4 + code - 65);
    if (code >= 97 && code <= 122) return String.fromCodePoint(0x1D5EE + code - 97);
    if (code >= 48 && code <= 57) return String.fromCodePoint(0x1D7EC + code - 48);
    return c;
  }).join('');
}
function formatCmd(name) {
  if (!name) return '';
  return toBold(name.charAt(0).toUpperCase() + name.slice(1));
}

// Download media into a Buffer (more reliable than letting WhatsApp fetch the URL).
// Returns null if the host is down/blocked so the menu can still be sent as text.
async function getBuffer(url, timeout = 25000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36' }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = await res.buffer();
    if (!buf || buf.length < 1000) throw new Error('Empty/invalid media');
    return buf;
  } catch (e) {
    console.error(`[menu] media download failed (${url}): ${e.message}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const MENU_VIDEO = 'https://files.catbox.moe/yi3wkc.mp4';
const MENU_IMAGE = 'https://files.catbox.moe/t03s77.jpg';
const MENU_THUMB = 'https://files.catbox.moe/hzlqe0.jpg';

module.exports = [

  {
    command: ['menu', 'help'],
    description: 'Show command list',
    category: 'menu',
    handler: async (client, m, { prefix, mode, menutype, pushname, Rspeed }) => {

      const byCategory = {};
      const fs = require('fs');
      const path = require('path');
      const pluginsDir = path.join(__dirname);
      const files = fs.readdirSync(pluginsDir).filter(f => f.endsWith('.js') && f !== 'menu.js');
      for (const file of files) {
        try {
          const list = require(path.join(pluginsDir, file));
          const arr = Array.isArray(list) ? list : [list];
          for (const plugin of arr) {
            const cat = plugin.category || 'misc';
            if (!byCategory[cat]) byCategory[cat] = [];
            const cmds = Array.isArray(plugin.command) ? plugin.command : [plugin.command];
            byCategory[cat].push({ commands: cmds, description: plugin.description });
          }
        } catch {}
      }

      const totalCommands = Object.values(byCategory).reduce((sum, arr) => sum + arr.length, 0);

      const categoryIcons = {
        group: '👥',
        media: '🎆',
        ai: '🤖',
        downloads: '📥',
        converter: '🔃',
        coding: '🎭',
        utility: '🔧',
        owner: '👑',
        effects: '❄️',
        football: '⚽️',
        stalk: '☸️',
        others: '☣️',
        misc: '📦',
      };
      const categorySymbols = {
        downloads: '✦',
        media:     '◇',
        converter: '◈',
        owner:     '✥',
        football:  '❅',
        ai:        '✫',
        group:     '✧',
        coding:    '◎',
        utility:   '○',
        effects:   '✪',
        stalk:     '☆',
        others:    '✬',
        misc:      '✠',
      };

      let menu = `╔═════════════════╗\n`;
      menu += `║    ☆  𝐁𝐋𝐀𝐂𝐊-𝐌𝐃  ☆ \n`;
      menu += `╚═════════════════╝\n\n`;
      menu += `👤 *User:* ${pushname}\n`;
      menu += `🪩 *Mode:* ${mode.toUpperCase()}\n`;
      menu += `⚡️ *Speed:* ${Rspeed.toFixed(4)} Ms\n`;
      menu += `🔑 *Prefix:* ${prefix}\n`;
      menu += `📦 *Total Commands:* ${totalCommands}\n`;
      menu += `═══════════════════\n\n`;

      for (const [cat, plugins] of Object.entries(byCategory)) {
        const icon = categoryIcons[cat] || '📌';
        const symbol = categorySymbols[cat] || '✠';
        menu += `> ${icon}  *${toBold(cat.toUpperCase())}*\n`;
        menu += `╔══════════════════╗\n`;
        for (const p of plugins) {
          menu += `║${symbol}┃ ${formatCmd(p.commands[0])}\n`;
        }
        menu += `╚══════════════════╝\n`;
        menu += '\n';
      }
      menu += `━━━━━━━━━━━━━━━━━━━━\n`;
      menu += `𝗠𝗮𝗱𝗲 𝗼𝗻 𝗲𝗮𝗿𝘁𝗵 𝗯𝘆 𝗛𝘂𝗺𝗮𝗻𝘀🔥!\n`;
      menu += `━━━━━━━━━━━━━━━━━━━━`;

      // WhatsApp limits media captions (far shorter than this menu), so for
      // image/video modes we send the media with a short caption and then
      // send the full menu as a normal text message right after it.
      const shortCaption =
        `☆ 𝐁𝐋𝐀𝐂𝐊-𝐌𝐃 ☆\n\n` +
        `👤 *User:* ${pushname}\n` +
        `🪩 *Mode:* ${mode.toUpperCase()}\n` +
        `🔑 *Prefix:* ${prefix}\n` +
        `📦 *Total Commands:* ${totalCommands}`;

      const sendText = () => client.sendMessage(m.chat, { text: menu }, { quoted: m });

      try {
        if (menutype === 'video' || menutype === 'image') {
          const isVideo = menutype === 'video';
          // Try the URL directly first (fast, same as the original behaviour);
          // if that fails, download it ourselves and retry from a buffer.
          const makeContent = (src, caption) => isVideo
            ? { video: src, mimetype: 'video/mp4', caption, gifPlayback: true }
            : { image: src, caption };
          const mediaUrl = isVideo ? MENU_VIDEO : MENU_IMAGE;

          let sent = false;
          try {
            await client.sendMessage(m.chat, makeContent({ url: mediaUrl }, menu), { quoted: m });
            sent = true;
          } catch (e) {
            console.error(`[menu] direct ${menutype} send failed: ${e.message}`);
          }

          if (!sent) {
            const buffer = await getBuffer(mediaUrl, isVideo ? 40000 : 25000);
            if (buffer) {
              try {
                await client.sendMessage(m.chat, makeContent(buffer, menu), { quoted: m });
                sent = true;
              } catch (e) {
                console.error(`[menu] buffer ${menutype} send failed: ${e.message}`);
                // Caption may be too long: media with short caption, then full menu as text
                await client.sendMessage(m.chat, makeContent(buffer, shortCaption), { quoted: m });
                await sendText();
                sent = true;
              }
            }
          }

          // Media host down: never leave the user without a menu
          if (!sent) await sendText();

        } else if (menutype === 'link') {
          await client.sendMessage(m.chat, {
            text: menu,
            contextInfo: {
              externalAdReply: {
                showAdAttribution: true,
                title: `𝐁𝐋𝐀𝐂𝐊-𝐌𝐃`,
                body: `${runtime(process.uptime())}`,
                thumbnailUrl: MENU_THUMB,
                sourceUrl: 'https://wa.me/254114283550?text=Hello👋+blackmerchant+Nihostie+Bot+Mkuu+😔',
                mediaType: 1,
                renderLargerThumbnail: true
              }
            }
          }, { quoted: m });

        } else {
          // 'text' or any unknown value
          await sendText();
        }
      } catch (err) {
        console.error('[menu] send failed:', err);
        // Last resort so the user always gets a menu
        try { await sendText(); } catch (e) { console.error('[menu] text fallback failed:', e); }
      }
    }
  },

];
