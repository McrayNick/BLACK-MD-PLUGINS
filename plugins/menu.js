'use strict';

const fs = require('fs');
const path = require('path');
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

// ─── Menu media ──────────────────────────────────────────────────────────
// Order of preference (no external hosting needed):
//   1. Your own files in <repo>/media/  ->  menu.jpg (or .png)  and  menu.mp4
//   2. Auto-generated banner image / short video (made with jimp + ffmpeg-static)
//   3. Remote URLs below (last resort)

const MEDIA_DIR = path.join(__dirname, '..', 'media');
const MENU_VIDEO_URL = 'https://files.catbox.moe/yi3wkc.mp4';
const MENU_IMAGE_URL = 'https://files.catbox.moe/t03s77.jpg';
const MENU_THUMB = 'https://files.catbox.moe/hzlqe0.jpg';

const GEN_IMAGE = path.join(MEDIA_DIR, 'menu-generated.jpg');
const GEN_VIDEO = path.join(MEDIA_DIR, 'menu-generated.mp4');

function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms); })
  ]).finally(() => clearTimeout(timer));
}

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

async function generateBanner(outPath) {
  const Jimp = require('jimp');
  const W = 1280, H = 720;
  const img = new Jimp(W, H, 0x0b0f1aff);
  img.scan(0, 0, W, H, function (x, y, idx) {
    const t = y / H;
    this.bitmap.data[idx] = Math.round(11 + 30 * t);
    this.bitmap.data[idx + 1] = Math.round(15 + 10 * t);
    this.bitmap.data[idx + 2] = Math.round(26 + 80 * t);
    this.bitmap.data[idx + 3] = 255;
  });
  const big = await Jimp.loadFont(Jimp.FONT_SANS_128_WHITE);
  const small = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
  img.print(big, 0, H / 2 - 150, { text: 'BLACK-MD', alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER, alignmentY: Jimp.VERTICAL_ALIGN_MIDDLE }, W, 200);
  img.print(small, 0, H / 2 + 70, { text: 'WhatsApp Multi-Device Bot', alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER, alignmentY: Jimp.VERTICAL_ALIGN_MIDDLE }, W, 50);
  await img.quality(90).writeAsync(outPath);
}

function generateVideo(imagePath, outPath) {
  return new Promise((resolve, reject) => {
    const ffmpeg = require('fluent-ffmpeg');
    try { ffmpeg.setFfmpegPath(require('ffmpeg-static')); } catch {}
    ffmpeg(imagePath)
      .inputOptions(['-loop 1'])
      .outputOptions(['-t 4', '-r 24', '-pix_fmt yuv420p', '-vf scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v libx264', '-movflags +faststart', '-an'])
      .on('end', resolve)
      .on('error', reject)
      .save(outPath);
  });
}

let generating = null; // avoid generating twice if two people send .menu at once

async function getMenuMedia(type) {
  const isVideo = type === 'video';

  // 1. Files you placed in /media
  const custom = isVideo ? ['menu.mp4'] : ['menu.jpg', 'menu.jpeg', 'menu.png'];
  for (const name of custom) {
    const p = path.join(MEDIA_DIR, name);
    if (fs.existsSync(p)) return fs.readFileSync(p);
  }

  // 2. Generated locally
  try {
    fs.mkdirSync(MEDIA_DIR, { recursive: true });
    if (!generating) {
      generating = (async () => {
        if (!fs.existsSync(GEN_IMAGE)) await generateBanner(GEN_IMAGE);
        if (!fs.existsSync(GEN_VIDEO)) {
          try { await generateVideo(GEN_IMAGE, GEN_VIDEO); } catch (e) { console.error('[menu] video generation failed:', e.message); }
        }
      })().finally(() => { generating = null; });
    }
    await generating;
    const p = isVideo ? GEN_VIDEO : GEN_IMAGE;
    if (fs.existsSync(p)) return fs.readFileSync(p);
  } catch (e) {
    console.error('[menu] local media generation failed:', e.message);
  }

  // 3. Remote URL
  return await getBuffer(isVideo ? MENU_VIDEO_URL : MENU_IMAGE_URL, isVideo ? 40000 : 25000);
}

module.exports = [

  {
    command: ['menu', 'help'],
    description: 'Show command list',
    category: 'menu',
    handler: async (client, m, { prefix, mode, menutype, pushname, Rspeed }) => {

      const byCategory = {};
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
          const makeContent = (buffer, caption) => isVideo
            ? { video: buffer, mimetype: 'video/mp4', caption, gifPlayback: true }
            : { image: buffer, caption };

          let sent = false;
          let buffer = null;
          try {
            buffer = await withTimeout(getMenuMedia(menutype), 60000, 'menu media');
          } catch (e) {
            console.error(`[menu] could not prepare ${menutype}: ${e.message}`);
          }

          if (buffer) {
            try {
              // Single message: media + full menu as caption
              await withTimeout(client.sendMessage(m.chat, makeContent(buffer, menu), { quoted: m }), 60000, `${menutype} send`);
              sent = true;
            } catch (e) {
              console.error(`[menu] ${menutype} send failed: ${e.message}`);
              try {
                // Caption may have been rejected: media with short caption + full menu as text
                await withTimeout(client.sendMessage(m.chat, makeContent(buffer, shortCaption), { quoted: m }), 60000, `${menutype} short send`);
                await sendText();
                sent = true;
              } catch (e2) {
                console.error(`[menu] ${menutype} short send failed: ${e2.message}`);
              }
            }
          }

          // Never leave the user without a menu
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
          await sendText();
        }
      } catch (err) {
        console.error('[menu] send failed:', err);
        try { await sendText(); } catch (e) { console.error('[menu] text fallback failed:', e); }
      }
    }
  },

];
