'use strict';

const fs = require('fs');
const Jimp = require('jimp') 
const fetch = require('node-fetch')
const axios = global.axios || require('axios');
const { uploadToUguu, upscaleImage } = require('../lib/uploads');

module.exports = [

  {
  command: ['sticker'],
  aliases: ['s'],
  description: 'Convert image/video to sticker',
  category: 'media',
  handler: async (client, m, { reply, msgR }) => {
    const sharp = require('sharp');
    const { Sticker, StickerTypes } = require('wa-sticker-formatter');
    const pushname = m.pushName || 'BLACK-MD';

    if (!msgR) return m.reply('Quote an image or a short video.');

    let media;
    let isVideo = false;

    if (msgR.imageMessage) media = msgR.imageMessage;
    else if (msgR.videoMessage) { media = msgR.videoMessage; isVideo = true; }
    else return m.reply('❌ That is neither an image nor a short video!');

    if (isVideo) {
      const sizeMB = (media.fileLength || 0) / (1024 * 1024);
      const seconds = media.seconds || 0;
      if (sizeMB > 8) return reply(`❌ Video too large (${sizeMB.toFixed(1)} MB). Max is 8 MB.`);
      if (seconds > 12) return reply(`❌ Video too long (${seconds}s). Max is 12 seconds.`);
    }

    const result = await client.downloadAndSaveMediaMessage(media);

    try {
      let stickerBuf;

      if (isVideo) {
        const { execSync } = require('child_process');
        const os = require('os');
        const path = require('path');
        let ffmpegPath;
        try { ffmpegPath = require('ffmpeg-static'); } catch { ffmpegPath = 'ffmpeg'; }

        const id = Date.now();
        const tmpDir = os.tmpdir();

        const makeSticker = async (inputPath, fps, q) => {
          const processedPath = path.join(tmpDir, `stk_${id}_${fps}fps.mp4`);
          try {
            execSync(
              `"${ffmpegPath}" -y -i "${inputPath}" -t 6 ` +
              `-vf "scale=512:512:force_original_aspect_ratio=increase,fps=${fps},` +
              `crop=min(iw\\,ih):min(iw\\,ih),scale=512:512" ` +
              `-an -c:v libx264 -crf 28 -preset ultrafast "${processedPath}"`,
              { timeout: 30000, stdio: 'pipe' }
            );
          } catch (e) {
            fs.copyFileSync(inputPath, processedPath);
          }
          const sticker = new Sticker(fs.readFileSync(processedPath), {
            pack: pushname,
            author: 'BLACK-MD',
            type: StickerTypes.FULL,
            quality: q,
          });
          const buf = await sticker.toBuffer();
          try { fs.unlinkSync(processedPath); } catch {}
          return buf;
        };

        try {
          stickerBuf = await makeSticker(result, 10, 40);
          if (!stickerBuf || stickerBuf.length < 500) throw new Error('Output buffer empty — ffmpeg may be unavailable on this server.');

          if (stickerBuf.length > 950 * 1024) {
            const retryBuf = await makeSticker(result, 5, 25);
            if (retryBuf && retryBuf.length >= 500) stickerBuf = retryBuf;
          }

          if (stickerBuf.length > 1024 * 1024) {
            return reply(
              `❌ Sticker is still too large (${(stickerBuf.length / 1024 / 1024).toFixed(2)} MB) after compression.\n` +
              `💡 *Tip:* Try a shorter clip (< 4s) or send an image instead.`
            );
          }
        } catch (videoErr) {
          return reply(`❌ Video sticker failed.\nReason: ${videoErr.message}\n\n💡 *Tip:* Send a GIF or image instead — those always work.`);
        }

      } else {
        const meta = await sharp(result).metadata();
        const { width = 512, height = 512 } = meta;
        const ratio = Math.max(width, height) / Math.min(width, height);
        const fitMode = ratio < 1.2 ? 'cover' : 'contain';
        const webpBuf = await sharp(result)
          .resize(512, 512, {
            fit: fitMode,
            background: { r: 0, g: 0, b: 0, alpha: 0 },
            position: 'centre',
          })
          .webp({ quality: 85 })
          .toBuffer();
        const sticker = new Sticker(webpBuf, {
          pack: pushname,
          author: 'BLACK-MD',
          type: StickerTypes.DEFAULT,
          quality: 85,
        });
        stickerBuf = await sticker.toBuffer();
      }

      await client.sendMessage(m.chat, { sticker: stickerBuf }, { quoted: m });
    } catch (e) {
      reply('❌ Error: ' + e.message);
    } finally {
      try { fs.unlinkSync(result); } catch {}
    }
  }
},


  {
  command: ['take'],
  aliases: ['steal'],
  description: 'Retake/rewatermark a sticker',
  category: 'media',
  handler: async (client, m, { reply, msgR }) => {
    const { Sticker, StickerTypes } = require('wa-sticker-formatter');
    const Jimp = require('jimp');
    const fs = require('fs');
    const pushname = m.pushName || 'No Name';

    if (!msgR) return m.reply('Quote an image, a short video or a sticker to change watermark.');

    let media;
    let isVideo = false;
    let isAnimatedSticker = false;

    if (msgR.imageMessage) media = msgR.imageMessage;
    else if (msgR.videoMessage) { media = msgR.videoMessage; isVideo = true; }
    else if (msgR.stickerMessage) {
      media = msgR.stickerMessage;
      isAnimatedSticker = !!msgR.stickerMessage.isAnimated;
    }
    else return m.reply('This is neither a sticker, image nor a video...');

    let result = await client.downloadAndSaveMediaMessage(media);

    try {
      let buf;

      if (isVideo) {
        const { execSync } = require('child_process');
        const os = require('os');
        const path = require('path');
        let ffmpegPath;
        try { ffmpegPath = require('ffmpeg-static'); } catch { ffmpegPath = 'ffmpeg'; }

        const id = Date.now();
        const tmpDir = os.tmpdir();

        const makeSticker = async (inputPath, fps, q) => {
          const processedPath = path.join(tmpDir, `take_${id}_${fps}fps.mp4`);
          try {
            execSync(
              `"${ffmpegPath}" -y -i "${inputPath}" -t 6 ` +
              `-vf "scale=512:512:force_original_aspect_ratio=decrease,fps=${fps},` +
              `pad=512:512:(ow-iw)/2:(oh-ih)/2:color=black@0" ` +
              `-an -c:v libx264 -crf 28 -preset ultrafast "${processedPath}"`,
              { timeout: 30000, stdio: 'pipe' }
            );
          } catch (e) {
            fs.copyFileSync(inputPath, processedPath);
          }
          const sticker = new Sticker(fs.readFileSync(processedPath), {
            pack: pushname,
            author: 'BLACK-MD',
            type: StickerTypes.DEFAULT,
            quality: q,
          });
          const out = await sticker.toBuffer();
          try { fs.unlinkSync(processedPath); } catch {}
          return out;
        };

        buf = await makeSticker(result, 10, 40);
        if (!buf || buf.length < 500) return reply('❌ Video sticker failed — ffmpeg may be unavailable on this server.');

        if (buf.length > 950 * 1024) {
          const retryBuf = await makeSticker(result, 5, 25);
          if (retryBuf && retryBuf.length >= 500) buf = retryBuf;
        }

        if (buf.length > 1024 * 1024) {
          return reply(
            `❌ Sticker still too large (${(buf.length / 1024 / 1024).toFixed(2)} MB) after compression.\n` +
            `💡 *Tip:* Try a shorter clip (< 4s) or send an image instead.`
          );
        }

      } else if (isAnimatedSticker) {
        const sticker = new Sticker(fs.readFileSync(result), {
          pack: pushname,
          author: 'BLACK-MD',
          type: StickerTypes.FULL,
          quality: 70,
        });
        buf = await sticker.toBuffer();

        if (!buf || buf.length < 500) return reply('❌ Failed to re-pack animated sticker.');

        if (buf.length > 1024 * 1024) {
          return reply(
            `❌ Animated sticker too large (${(buf.length / 1024 / 1024).toFixed(2)} MB).\n` +
            `💡 *Tip:* WhatsApp stickers must be under 1 MB.`
          );
        }

      } else {
        const sharp = require('sharp');
        const os = require('os');
        const path = require('path');
        const stickerSize = 512;
        let img;
        try {
          img = await Jimp.read(result);
        } catch (e) {
          const id = Date.now();
          const pngPath = path.join(os.tmpdir(), `take_${id}.png`);
          await sharp(result).png().toFile(pngPath);
          img = await Jimp.read(pngPath);
          try { fs.unlinkSync(pngPath); } catch {}
        }
        const padded = img.clone()
          .contain(stickerSize, stickerSize)
          .background(0x00000000);
        const paddedBuffer = await padded.getBufferAsync(Jimp.MIME_PNG);
        const sticker = new Sticker(paddedBuffer, {
          pack: pushname,
          author: 'BLACK-MD',
          type: StickerTypes.DEFAULT,
          categories: ['🤩', '🎉'],
          quality: 100,
          background: 'transparent',
        });
        buf = await sticker.toBuffer();
      }

      await client.sendMessage(m.chat, { sticker: buf }, { quoted: m });
    } catch (e) {
      reply('❌ Error: ' + e.message);
    } finally {
      try { fs.unlinkSync(result); } catch {}
    }
  }
},
  
  
{
    command: ['mix'],
    aliases: ['emojimix'],
    description: 'Mix two emojis into a sticker',
    category: 'media',
    handler: async (client, m, { reply, text }) => {
      const { Sticker, StickerTypes } = require('wa-sticker-formatter');
      const { botname } = require('../set');
      if (!text) return m.reply('No emojis provided?');
      const emojis = text.split('+');
      if (emojis.length !== 2) return m.reply("Specify the emojis and separate with '+'");
      const emoji1 = emojis[0].trim();
      const emoji2 = emojis[1].trim();
      try {
        const response = await global.axios.get(`https://levanter.onrender.com/emix?q=${emoji1}${emoji2}`);
        if (response.data.status === true) {
          let stickerMess = new Sticker(response.data.result, {
            pack: botname,
            type: StickerTypes.CROPPED,
            categories: ['🤩', '🎉'],
            id: '12345',
            quality: 70,
            background: 'transparent'
          });
          const stickerBuffer = await stickerMess.toBuffer();
          client.sendMessage(m.chat, { sticker: stickerBuffer }, { quoted: m });
        } else {
          m.reply('Unable to create emoji mix.');
        }
      } catch (error) {
        m.reply('An error occurred while creating the emoji mix.' + error);
      }
    }
  },

  {
    command: ['toimg'],
    aliases: ['photo', 'toimage'],
    description: 'Convert a sticker to image',
    category: 'media',
    handler: async (client, m, { reply, mime, quoted }) => {
      const { exec } = require('child_process');
      if (!quoted) return m.reply('Tag a static video with the command!');
      if (!/webp/.test(mime)) return m.reply(`Tag a sticker to convert to photo`);
      const media = await client.downloadAndSaveMediaMessage(quoted);
      const hikari = `./tmp_${Date.now()}.png`;
      exec(`ffmpeg -i ${media} ${hikari}`, (err) => {
        try { fs.unlinkSync(media); } catch {}
        if (err) return m.reply("❌ Conversion failed.");
        const buffer = fs.readFileSync(hikari);
        client.sendMessage(m.chat, { image: buffer, caption: `𝗖𝗼𝗻𝘃𝗲𝗿𝘁𝗲𝗱 𝗯𝘆 𝐁𝐋𝐀𝐂𝐊-𝐌𝐃` }, { quoted: m });
        try { fs.unlinkSync(hikari); } catch {}
      });
    }
  },

  {
  command: ['smeme'],
  aliases: ['write'],
  description: 'Add words to a sticker',
  category: 'media',
  handler: async (client, m, { reply, text, mime, pushname, qmsg }) => {
    const respond = `Quote an image or sticker with text separated by |\nExample: .smeme top text|bottom text`;
    if (!/image|webp/.test(mime)) return reply(respond);
    if (!text) return reply(respond);

    const atas = text.split('|')[0]?.trim() || '';
    const bawah = text.split('|')[1]?.trim() || '';

    const sharp = require('sharp');
    const { Sticker, StickerTypes } = require('wa-sticker-formatter');
    const fs = require('fs');

    let dwnld = await client.downloadAndSaveMediaMessage(qmsg);

    try {
      let imgBuf;
      try {
        imgBuf = await sharp(dwnld).png().toBuffer();
      } catch (e) {
        return reply('❌ Could not read the image: ' + e.message);
      }

      const meta = await sharp(imgBuf).metadata();
      const w = meta.width || 512;
      const h = meta.height || 512;

      // ── Font sizing ────────────────────────────────────────────────────
      const fontSize = Math.max(28, Math.floor(w / 12));
      const lineHeight = Math.floor(fontSize * 1.2);
      const strokeW = Math.max(3, Math.floor(fontSize / 9));
      const maxW = Math.floor(w * 0.92);

      const charPx = fontSize * 0.48;
      const maxChars = Math.max(8, Math.floor(maxW / charPx));

      const wrapText = (txt) => {
        const words = txt.toUpperCase().split(' ');
        const lines = [];
        let current = '';
        for (const word of words) {
          const test = current ? `${current} ${word}` : word;
          if (test.length > maxChars && current) {
            lines.push(current);
            current = word;
          } else {
            current = test;
          }
        }
        if (current) lines.push(current);
        return lines;
      };

      // XML-safe escape
      const esc = (s) => s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

      // Build SVG lines; textLength ensures no line ever clips at edges
      const buildLines = (txt, anchorY, direction) => {
        if (!txt) return '';
        const lines = wrapText(txt);
        return lines.map((line, i) => {
          const y = direction === 'top'
            ? anchorY + i * lineHeight
            : anchorY - (lines.length - 1 - i) * lineHeight;
          // Estimated natural width; cap to maxW to prevent clipping
          const estW = Math.round(line.length * charPx);
          const tlAttr = estW > maxW
            ? `textLength="${maxW}" lengthAdjust="spacingAndGlyphs"`
            : '';
          return `<text x="${w / 2}" y="${y}" ${tlAttr}>${esc(line)}</text>`;
        }).join('\n');
      };

      const topStartY = fontSize + 8;
      const bottomAnchorY = h - 12;

      const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <style>
    text {
      font-family: Impact, "Arial Black", "Franklin Gothic Heavy", sans-serif;
      font-size: ${fontSize}px;
      font-weight: 900;
      text-anchor: middle;
      paint-order: stroke fill;
      stroke: #000000;
      stroke-width: ${strokeW}px;
      stroke-linejoin: round;
      fill: #FFFFFF;
    }
  </style>
  ${buildLines(atas, topStartY, 'top')}
  ${buildLines(bawah, bottomAnchorY, 'bottom')}
</svg>`;

      const withText = await sharp(imgBuf)
        .composite([{ input: Buffer.from(svg), gravity: 'northwest' }])
        .png()
        .toBuffer();

      const resized = await sharp(withText)
        .resize(512, 512, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toBuffer();

      const sticker = new Sticker(resized, {
        pack: pushname,
        author: 'BLACK-MD',
        type: StickerTypes.DEFAULT,
        quality: 100,
        background: 'transparent',
      });
      const stickerBuffer = await sticker.toBuffer();
      await client.sendMessage(m.chat, { sticker: stickerBuffer }, { quoted: m });
    } catch (e) {
      reply('❌ Error: ' + e.message);
    } finally {
      try { fs.unlinkSync(dwnld); } catch {}
    }
  }
},

  
                
  {
    command: ['vv'],
    aliases: ['retrieve'],
    description: 'Retrieve a view-once message (to chat)',
    category: 'media',
    handler: async (client, m) => {
      if (!m.quoted) return m.reply('Quote a viewonce message');
      const quotedMessage = m.msg?.contextInfo?.quotedMessage;
      if (!quotedMessage) return m.reply('Could not find the viewonce message.');
      if (quotedMessage.imageMessage) {
        let imageCaption = quotedMessage.imageMessage.caption;
        let imageUrl = await client.downloadAndSaveMediaMessage(quotedMessage.imageMessage);
        client.sendMessage(m.chat, { image: { url: imageUrl }, caption: `Retrieved by 𝐁𝐋𝐀𝐂𝐊-𝐌𝐃!\n${imageCaption}` }, { quoted: m });
      }
      if (quotedMessage.videoMessage) {
        let videoCaption = quotedMessage.videoMessage.caption;
        let videoUrl = await client.downloadAndSaveMediaMessage(quotedMessage.videoMessage);
        client.sendMessage(m.chat, { video: { url: videoUrl }, caption: `Retrieved by 𝐁𝐋𝐀𝐂𝐊-𝐌𝐃!\n${videoCaption}` }, { quoted: m });
      }
    }
  },

  {
    command: ['vv2'],
    aliases: ['mmh', 'uhm'], 
    noprefix: ['😂', '😍', '🌚', '🌝', '😊', '😉', '🙄', '😅', '🫠', '🙂', '🥰', '😘', '🤩', '😙', '🤢', '🤔', '🫣'],
    description: 'Retrieve a view-once message (to DM)',
    category: 'media',
    handler: async (client, m, { Owner }) => {
      if (!m.quoted) return;
      if (!Owner) return;
      const quotedMessage = m.msg?.contextInfo?.quotedMessage;
      if (!quotedMessage) await client.sendMessage(client.user.id, { text: 'Could not find the viewonce message.'});
      if (quotedMessage.imageMessage) {
        let imageCaption = quotedMessage.imageMessage.caption;
        let imageUrl = await client.downloadAndSaveMediaMessage(quotedMessage.imageMessage);
        client.sendMessage(client.user.id, { image: { url: imageUrl }, caption: `Retrieved by Blackie!\n${imageCaption}` }, { quoted: m });
      }
      if (quotedMessage.videoMessage) {
        let videoCaption = quotedMessage.videoMessage.caption;
        let videoUrl = await client.downloadAndSaveMediaMessage(quotedMessage.videoMessage);
        client.sendMessage(client.user.id, { video: { url: videoUrl }, caption: `Retrieved by Blackie!\n${videoCaption}` }, { quoted: m });
      }
    }
  },

  {
    command: ['botpp'],
    aliases: ['botdp'],
    description: 'Get or change the bot profile picture',
    category: 'media',
    handler: async (client, m, { Owner, NotOwner, quoted, mime, reply }) => {
      if (!Owner) return reply(NotOwner);
      if (!quoted) {
        let pp;
        try { pp = await client.profilePictureUrl(client.user.id, 'image'); }
        catch { pp = 'https://tinyurl.com/yx93l6da'; }
        return client.sendMessage(m.chat, { image: { url: pp }, caption: "Bot's current profile picture" }, { quoted: m });
      }
      if (!/image/.test(mime)) return reply('Send an image to change the bot profile picture');
      let media = await client.downloadAndSaveMediaMessage(quoted);
      await client.updateProfilePicture(client.user.id, { url: media }).catch(() => {});
      reply('Bot profile picture updated!');
    }
  },

  {
    command: ['getpfp'],
    aliases: ['dp', 'getpp'],
    description: 'Get the profile picture of any number',
    category: 'media',
    handler: async (client, m, { reply, text }) => {
      let jid = text ? text.replace(/[^0-9]/g, '') + '@s.whatsapp.net' : m.quoted?.sender || m.sender;
      let pp;
      try { pp = await client.profilePictureUrl(jid, 'image'); }
      catch { return reply('Could not fetch profile picture. The number has hidden their profile picture or not registered on WhatsApp.'); }
      client.sendMessage(m.chat, { image: { url: pp }, caption: `Profile picture of @${jid.split('@')[0]}` }, { quoted: m });
    }
  },

  {
  command: ['tovideo'],
  aliases: ['mp4', 'tovid'],
  description: 'Convert animated sticker to video',
  category: 'media',
  handler: async (client, m, { reply, prefix, command }) => {
    if (!m.quoted) return reply(`📎 Reply to an *animated sticker* with *${prefix + command}*`);
    const mime = (m.quoted.msg || m.quoted).mimetype || '';
    if (!/webp/.test(mime)) return reply(`⚠️ That's not a sticker.`);
    try {
      await m.reply('🎬 _Converting sticker to video..._');
      const buf = await m.quoted.download();
      const sharp = require('sharp');
      const os = require('os');
      const path = require('path');
      const { execSync } = require('child_process');
      const ffmpegPath = require('ffmpeg-static');
      const id = Date.now();
      const tmpDir = os.tmpdir();
      const framesDir = path.join(tmpDir, `frames_${id}`);
      const outputPath = path.join(tmpDir, `video_${id}.mp4`);
      fs.mkdirSync(framesDir, { recursive: true });
      
      const image = sharp(buf, { animated: true });
      const metadata = await image.metadata();
      const pages = metadata.pages || 1;
      if (pages <= 1) return reply('⚠️ This is a *static* sticker, not animated!');
      
      for (let i = 0; i < pages; i++) {
        const frameBuf = await sharp(buf, { animated: false, page: i })
          .png()
          .toBuffer();
        const framePath = path.join(framesDir, `frame_${String(i).padStart(4, '0')}.png`);
        fs.writeFileSync(framePath, frameBuf);
      }
      
      try {
        execSync(
          `"${ffmpegPath}" -y -framerate 15 -i "${framesDir}/frame_%04d.png" -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" -pix_fmt yuv420p -movflags faststart "${outputPath}"`,
          { timeout: 60000, stdio: 'pipe' }
        );
      } catch (e) {
        return m.reply('❌ ffmpeg error: ' + e.stderr?.toString()?.slice(0, 200));
      }
      if (!fs.existsSync(outputPath)) return m.reply('❌ Output file not created');
      const videoBuffer = fs.readFileSync(outputPath);
      await client.sendMessage(m.chat, {
        video: videoBuffer,
        caption: '*Sticker converted successfully to Video*'
      }, { quoted: m });
      
      try { fs.rmSync(framesDir, { recursive: true }); } catch {}
      try { fs.unlinkSync(outputPath); } catch {}
    } catch (err) {
      m.reply('❌ Error: ' + err.message);
    }
  }
},

  {
    command: ['toaudio'],
    aliases: ['audioe'],
    description: 'Convert video to audio',
    category: 'media',
    handler: async (client, m, { reply, quoted, mime }) => {
      if (!quoted) return reply('Reply to a video message to convert it to audio.');
      if (!/video/.test(mime)) return reply('Reply to a *video* message.');
      await reply('🎵 _Converting video to audio..._');
      const buffer = await client.downloadMediaMessage(quoted);
      const tmpIn = `tmp_in_${Date.now()}.mp4`;
      const tmpOut = `tmp_out_${Date.now()}.mp3`;
      fs.writeFileSync(tmpIn, buffer);
      const { exec } = require('child_process');
      exec(`ffmpeg -i ${tmpIn} -vn -acodec libmp3lame ${tmpOut}`, async (err) => {
        if (err) {
          m.reply('❌ Conversion failed.');
        } else {
          await client.sendMessage(m.chat, { audio: fs.readFileSync(tmpOut), mimetype: 'audio/mpeg', fileName: 'audio.mp3' }, { quoted: m });
        }
        try { fs.unlinkSync(tmpIn); } catch {}
        try { fs.unlinkSync(tmpOut); } catch {}
      });
    }
  },
  
  {
    command: ['removebg'],
    aliases: ['rbg'],
    description: 'remove background of a picture',
    category: 'media',
    handler: async (client, m, { reply, api }) => {
    try {
      const mime = m.quoted.mimetype || '';
      if (!m.quoted) return m.reply('Reply to an image to remove its background.');
      if (!/image/.test(mime)) return m.reply('That is not an image. Quote an image and try again.');

      m.reply('A moment, removing the background...');

      const filePath = await client.downloadAndSaveMediaMessage(m.quoted);
      const uploaded = await uploadToUguu(filePath);
      try { require('fs').unlinkSync(filePath); } catch(e) {}

      const res = await axios.get(`${api}/ai/removebg?url=${encodeURIComponent(uploaded)}`);
      if (!res.data || !res.data.result) return m.reply('Failed to remove background. Try again.');

      await client.sendMessage(m.chat, {
        image: { url: res.data.result },
        caption: 'Edited by BLACK-MD'
      }, { quoted: m });

    } catch (err) {
      m.reply('An error occurred: ' + err.message);
    }
  }
  },
  
  {
  command: ['similarimage'],
  aliases: ['reverseimage', 'ri'],
  description: 'Find similar images using reverse image search',
  category: 'media',
  handler: async (client, m, { reply, from, api, mime }) => {
    if (!m.quoted) return m.reply('Reply to an image only.');
    if (!/image/.test(mime)) return reply('📌 That is not an image!');
    try {
      await reply('🔎 Searching for similar images...');
      
      const buf = await client.downloadAndSaveMediaMessage(m.quoted);
      
      const imageUrl = await uploadToUguu(buf);
      
      const res = await global.axios.get(`${api}/search/reverseimage?url=${encodeURIComponent(imageUrl)}`);
      const data = res.data;
      if (!data?.result?.similarImages?.length) return reply('❌ No similar images found.');
      const similarImages = data.result.similarImages.slice(0, 10);
      
      const album = [];
      for (let i = 0; i < similarImages.length; i++) {
        const img = similarImages[i];
        const url = img.thumbnailUrl || img.url;
        if (url) {
          album.push({
            image: { url },
            caption: i === 0 ? `🔍 *Similar Images Found*\n📸 ${similarImages.length} results` : undefined
          });
        }
      }
      if (!album.length) return reply('❌ Failed to load similar images.');
      await client.sendMessage(from, { album }, { quoted: m });
    } catch (err) {
      await reply('❌ Error: ' + err.message);
    }
  }
},

  {
  command: ['imageedit'],
  aliases: ['editimg', 'aiedit', 'editi'],
  description: 'Edit an image using AI prompt',
  category: 'media',
  handler: async (client, m, { reply, text, msgR }) => {
    if (!msgR) return reply('📌 Reply to an image with a prompt.\n\nExample: .imageedit make the background red');
    if (!text) return reply('📌 Provide a prompt.\n\nExample: .imageedit make the background red');
    if (!msgR.imageMessage) return reply('❌ Reply to an *image* only!');
    const result = await client.downloadAndSaveMediaMessage(msgR.imageMessage);
    try {
      await m.reply('🎨 _Editing your image... this may take up to 2 minutes_');
      const { uploadToUguu } = require('../lib/uploads');
      const imageUrl = await uploadToUguu(result);
      const res = await global.axios.get(
        `https://ravenn.site/ai/imageedit?url=${encodeURIComponent(imageUrl)}&q=${encodeURIComponent(text)}`,
        { timeout: 180000 }
      );
      const data = res.data;
      if (!data?.status) return reply('❌ Failed: ' + (data?.error || 'Unknown error'));
      const resultUrl = data?.result || data?.url || data?.image || data?.data;
      if (!resultUrl) return reply('❌ No result returned: ' + JSON.stringify(data));
      await client.sendMessage(m.chat, {
        image: { url: resultUrl },
        caption: `🎨 *Image Edited*\n📝 *Prompt:* ${text}`
      }, { quoted: m });
    } catch (err) {
      reply('❌ Error: ' + err.message);
    } finally {
      try { fs.unlinkSync(result); } catch {}
    }
  }
},

  {
  command: ['remini'],
  aliases: ['upscale', 'enhance', 'hd'],
  description: 'Enhance a quoted image using AI (Remini)',
  category: 'media',
  handler: async (client, m, { reply, mime }) => {
    if (!m.quoted) return reply('📌 Reply to an image with the command to enhance it.');
    if (!/image/.test(m.quoted.mimetype || mime || '')) return reply('❌ Only image messages can be enhanced. Reply to a photo.');

    try {
      reply('⏳ Enhancing your image with AI... Please wait.');

      const filePath = await client.downloadAndSaveMediaMessage(m.quoted);
      if (!filePath || !fs.existsSync(filePath)) return reply('❌ Failed to download image.');

      const imageUrl = await uploadToUguu(filePath);
      try { fs.unlinkSync(filePath); } catch (_) {}

      const res = await fetch(`https://apis.davidcyril.name.ng/remini?url=${encodeURIComponent(imageUrl)}`);
      if (!res.ok) return reply('❌ Failed to enhance image. Try again.');
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('image')) return reply('❌ API did not return an image. Try again.');
      const arrayBuf = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuf);

      await client.sendMessage(m.chat, {
        image: buffer,
        mimetype: 'image/png',
        caption: '✨ *Image Upscaled To HD*\n_Powered by BLACK-MD_',
      }, { quoted: m });

    } catch (err) {
      reply('❌ Failed to enhance image. Make sure you replied to a clear photo and try again.');
    }
  }
},

{
    command: ['remini2'],
    aliases: ['upscale2', 'enhance2', 'hd2'],
    description: 'Upscale a quoted image to HD (4x)',
    category: 'media',
    handler: async (client, m, { reply, msgR }) => {

      if (!msgR) return reply(`📌 Reply to an image with ${m.prefix}hd to upscale it.`);

      const imageMsg = msgR.imageMessage || null;
      if (!imageMsg) return reply('❌ Only image messages can be upscaled. Reply to a photo.');

      let filePath;
      try {
    filePath = await client.downloadAndSaveMediaMessage(imageMsg);
    
    const buffer = require('fs').readFileSync(filePath);
    const upscaledUrl = await upscaleImage(buffer);

    await client.sendMessage(m.chat, { image: { url: upscaledUrl }, caption: "🔼 Image Upscaled to HD" }, { quoted: m });

  } catch (err) {
        
    console.error("HD Upscale error:", err);
        
    await reply("❌ Failed to upscale image. Try again.");
        
  } finally {
    if (filePath && fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch {}
    }
  }
 }
},
  
  {
    command: ['save'],
    aliases: ['forward'],
    description: 'Save a status message to DM',
    category: 'media',
    handler: async (client, m, { reply }) => {
      try {
        const quotedMessage = m.msg?.contextInfo?.quotedMessage;
        if (!quotedMessage) return m.reply('❌ Please reply to a status message');
        if (!m.quoted?.chat?.endsWith('@broadcast')) return m.reply('⚠️ That message is not a status! Please reply to a status message.');
        const mediaBuffer = await client.downloadMediaMessage(m.quoted);
        if (!mediaBuffer || mediaBuffer.length === 0) return m.reply('🚫 Could not download the status media. It may have expired.');
        let payload;
        let mediaType;
        if (quotedMessage.imageMessage) {
          mediaType = 'image';
          payload = { image: mediaBuffer, caption: quotedMessage.imageMessage.caption || '📸 Saved status image', mimetype: 'image/jpeg' };
        } else if (quotedMessage.videoMessage) {
          mediaType = 'video';
          payload = { video: mediaBuffer, caption: quotedMessage.videoMessage.caption || '🎥 Saved status video', mimetype: 'video/mp4' };
        } else {
          return m.reply('❌ Only image and video statuses can be saved!');
        }
        await client.sendMessage(m.sender, payload, { quoted: m });
        return m.reply(`✅  ${mediaType} 𝐬𝐚𝐯𝐞𝐝! Check Dm`);
      } catch (error) {
        if (error.message.includes('404') || error.message.includes('not found')) return m.reply('⚠️ The status may have expired or been deleted.');
        return m.reply('❌ Failed to save status. Error: ' + error.message);
      }
    }
  },

];
