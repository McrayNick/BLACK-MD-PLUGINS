'use strict';

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

      if (menutype === 'video') {

                   client.sendMessage(m.chat, {
                        video: fs.readFileSync('./Media/blacky.mp4'),
                        caption: menu,
                        gifPlayback: true
                    }, {
                        quoted: m
                    })
                } else if (menutype === 'text') {
client.sendMessage(m.chat, { text: menu }, {quoted: m})

} else if (menutype === 'image') {
client.sendMessage(m.chat, { image: { url: 'https://files.catbox.moe/t03s77.jpg' }, caption: menu }, { quoted: m })
} else if (menutype === 'link') {
client.sendMessage(m.chat, {
                        text: menu,
                        contextInfo: {
                            externalAdReply: {
                                showAdAttribution: true,
                                title: `𝐁𝐋𝐀𝐂𝐊-𝐌𝐃`,
                                body: `${runtime(process.uptime())}`,
                                thumbnail: fs.readFileSync('./Media/blackmachant.jpg'),
                                sourceUrl: 'https://wa.me/254114283550?text=Hello👋+blackmerchant+Nihostie+Bot+Mkuu+😔',
                                mediaType: 1,
                                renderLargerThumbnail: true
                            }
                        }
                    }, {
                        quoted: m
                    })

    }
    }
  },

];
