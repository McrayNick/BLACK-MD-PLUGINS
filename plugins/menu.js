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
function toBoldItalic(str) {
  return str.split('').map(c => {
    const code = c.charCodeAt(0);
    if (code >= 65 && code <= 90) return String.fromCodePoint(0x1D63C + code - 65);
    if (code >= 97 && code <= 122) return String.fromCodePoint(0x1D656 + code - 97);
    return c;
  }).join('');
}
function formatCmd(name) {
  if (!name) return '';
  return toBold(name.charAt(0).toUpperCase() + name.slice(1));
}

// ─── Menu media ──────────────────────────────────────────────────────────
// Order of preference:
//   1. Your own files in a media/ folder on the bot  ->  menu.jpg (or .png)  and  menu.mp4
//   2. Downloaded from your GitHub repo's media/ folder (raw link), then catbox
//   3. Auto-generated banner image / short video (made with jimp + ffmpeg-static)

const MEDIA_DIR = path.join(__dirname, '..', 'media');
// Folders searched for your own menu.jpg / menu.mp4 (first match wins)
const MEDIA_DIRS = [
  MEDIA_DIR,
  path.join(process.cwd(), 'media'),
  path.join(__dirname, 'media'),
];

// Case-insensitive search: menu.jpg, Menu.JPG, menu.png, menu.mp4 ...
function findCustomMedia(isVideo) {
  const re = isVideo ? /^menu.*\.mp4$/i : /^menu.*\.(jpe?g|png)$/i;
  for (const dir of MEDIA_DIRS) {
    try {
      const hit = fs.readdirSync(dir).find(f => re.test(f) && !/generated/i.test(f));
      if (hit) return path.join(dir, hit);
    } catch {}
  }
  return null;
}
// Your own GitHub repo (public). If your files are named differently, change these.
const RAW_BASE = 'https://raw.githubusercontent.com/McrayNick/BLACK-MD-PLUGINS/main/media';
const REMOTE_VIDEO_URLS = [`${RAW_BASE}/menu.mp4`, 'https://files.catbox.moe/yi3wkc.mp4'];
const REMOTE_IMAGE_URLS = [`${RAW_BASE}/menu.jpg`, 'https://files.catbox.moe/t03s77.jpg'];
const MENU_THUMB = `${RAW_BASE}/menu.jpg`;

const MENU_VERSION = 'r6-github-media';
const remoteCache = {}; // downloaded once, reused for every .menu until restart

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
  const customPath = findCustomMedia(isVideo);
  if (customPath) {
    console.log(`[menu] using your ${isVideo ? 'video' : 'image'}: ${customPath}`);
    return fs.readFileSync(customPath);
  }
  console.log(`[menu] your ${isVideo ? 'menu.mp4' : 'menu.jpg'} was not found in: ${MEDIA_DIRS.join(' | ')}`);

  // 2. Download from your GitHub repo (then catbox), cached in memory
  if (remoteCache[type]) return remoteCache[type];
  const urls = isVideo ? REMOTE_VIDEO_URLS : REMOTE_IMAGE_URLS;
  for (let i = 0; i < urls.length; i++) {
    const buf = await getBuffer(urls[i], i === 0 ? 30000 : 10000);
    if (buf) {
      console.log(`[menu] using ${isVideo ? 'video' : 'image'} from ${urls[i]}`);
      remoteCache[type] = buf;
      return buf;
    }
  }

  // 3. Generated locally (last resort)
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
  return null;
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

      const line = '━━━━━━━━━━━━━━━━━━━━';
      let menu = `╭${line}╮\n`;
      menu += `┃  ✨ ${toBold('BLACK-MD')} ${toBold('BOT')} ✨\n`;
      menu += `┃  ${toBoldItalic('Next-gen WhatsApp assistant')}\n`;
      menu += `╰${line}╯\n\n`;

      menu += `┏━━『 🛰 ${toBold('SYSTEM')} 』\n`;
      menu += `┃ 👤 ${toBold('User')}  ⟫  ${pushname}\n`;
      menu += `┃ 🪩 ${toBold('Mode')}  ⟫  ${mode.toUpperCase()}\n`;
      menu += `┃ ⚡ ${toBold('Speed')}  ⟫  ${Rspeed.toFixed(4)} ms\n`;
      menu += `┃ 🔑 ${toBold('Prefix')}  ⟫  [ ${prefix} ]\n`;
      menu += `┃ ⏳ ${toBold('Uptime')}  ⟫  ${runtime(process.uptime())}\n`;
      menu += `┃ 📦 ${toBold('Commands')}  ⟫  ${totalCommands}\n`;
      menu += `┗━━━━━━━━━━━━━━━━◈\n\n`;

      for (const [cat, plugins] of Object.entries(byCategory)) {
        const icon = categoryIcons[cat] || '📌';
        const symbol = categorySymbols[cat] || '✠';
        const names = plugins.map(p => p.commands[0]).filter(Boolean);
        menu += `╭─❮ ${icon} ${toBoldItalic(cat.toUpperCase())} ❯─⟦ ${names.length} ⟧\n`;
        for (const n of names) {
          menu += `│ ${symbol} ${formatCmd(n)}\n`;
        }
        menu += `╰─────────────────◈\n\n`;
      }
      menu += `${line}\n`;
      menu += `𝗠𝗮𝗱𝗲 𝗼𝗻 𝗲𝗮𝗿𝘁𝗵 𝗯𝘆 𝗛𝘂𝗺𝗮𝗻𝘀🔥!\n`;
      menu += `${line}`;

      const shortCaption =
        `✨ ${toBold('BLACK-MD')} ${toBold('BOT')} ✨\n\n` +
        `👤 ${toBold('User')}  ⟫  ${pushname}\n` +
        `🪩 ${toBold('Mode')}  ⟫  ${mode.toUpperCase()}\n` +
        `🔑 ${toBold('Prefix')}  ⟫  [ ${prefix} ]\n` +
        `📦 ${toBold('Commands')}  ⟫  ${totalCommands}`;

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

  {
    command: ['menudebug'],
    description: 'Check menu media setup',
    category: 'menu',
    handler: async (client, m, { reply }) => {
      const say = (t) => (typeof reply === 'function' ? reply(t) : m.reply(t));
      const lines = [
        `*menu.js version:* ${MENU_VERSION}`,
        `*__dirname:* ${__dirname}`,
        `*cwd:* ${process.cwd()}`,
        ''
      ];

      for (const dir of MEDIA_DIRS) {
        let info;
        try { info = fs.readdirSync(dir).join(', ') || '(empty)'; } catch { info = 'folder not found'; }
        lines.push(`📁 ${dir}\n   ${info}`);
      }

      lines.push('');
      lines.push(`🖼 image (local): ${findCustomMedia(false) || 'none'}`);
      lines.push(`🎬 video (local): ${findCustomMedia(true) || 'none'}`);
      lines.push('');

      for (const url of [...REMOTE_IMAGE_URLS, ...REMOTE_VIDEO_URLS]) {
        let status;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);
        try {
          const r = await fetch(url, { method: 'HEAD', signal: controller.signal });
          status = `HTTP ${r.status}, ${r.headers.get('content-length') || '?'} bytes`;
        } catch (e) {
          status = `ERROR: ${e.message}`;
        } finally {
          clearTimeout(timer);
        }
        lines.push(`🌐 ${url}\n   ${status}`);
      }

      await say(lines.join('\n'));
    }
  },

];
