'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, execFile } = require('child_process');
const { promisify } = require('util');
const { Sticker, StickerTypes } = require('wa-sticker-formatter');
const { packname, author } = require('../set.js');

const execFileAsync = promisify(execFile);
const MAX_FILE_SIZE = 50 * 1024 * 1024;

// ── Locate FFmpeg ─────────────────────────────────────────────
const FFMPEG_CANDIDATES = [
  (() => { try { return execSync('which ffmpeg', { encoding: 'utf8' }).trim(); } catch { return null; } })(),
  '/usr/bin/ffmpeg',
  '/usr/local/bin/ffmpeg',
  path.join(__dirname, '..', 'data', 'ffmpeg', 'ffmpeg'),
  (() => { try { const b = require('ffmpeg-static'); return b && fs.existsSync(b) ? b : null; } catch { return null; } })()
];

let cachedFfmpegPath = null;
function resolveFfmpegPath() {
  if (cachedFfmpegPath && cachedFfmpegPath !== 'ffmpeg' && fs.existsSync(cachedFfmpegPath)) return cachedFfmpegPath;
  cachedFfmpegPath = FFMPEG_CANDIDATES.find(f => f && f !== 'ffmpeg' && fs.existsSync(f)) || 'ffmpeg';
  return cachedFfmpegPath;
}

function configureStickerFfmpeg(binary) {
  try { require('fluent-ffmpeg').setFfmpegPath(binary); } catch (e) { console.warn('fluent-ffmpeg config failed:', e.message); }
}

function deleteTempFile(file) {
  try { if (file && fs.existsSync(file)) fs.unlinkSync(file); } catch (e) { console.error('Cleanup failed:', e.message); }
}

function unwrapMessage(message) {
  let current = message;
  for (let i = 0; i < 5 && current; i++) {
    if (current.ephemeralMessage?.message) { current = current.ephemeralMessage.message; continue; }
    if (current.viewOnceMessage?.message) { current = current.viewOnceMessage.message; continue; }
    if (current.viewOnceMessageV2?.message) { current = current.viewOnceMessageV2.message; continue; }
    if (current.viewOnceMessageV2Extension?.message) { current = current.viewOnceMessageV2Extension.message; continue; }
    break;
  }
  return current || {};
}

function findMedia(message) {
  const unwrapped = unwrapMessage(message);
  for (const type of ['imageMessage', 'videoMessage', 'stickerMessage', 'documentMessage']) {
    if (unwrapped[type]) return { type, media: unwrapped[type] };
  }
  return null;
}

function getStickerMetadata(args) {
  const input = Array.isArray(args) ? args.join(' ').trim() : '';
  const [packArg, authorArg] = input ? input.split('|').map(v => v.trim()) : [];
  return {
    pack: packArg || packname || 'BLACK-MD',
    author: authorArg || author || 'BLACK-MD'
  };
}

// ── Convert image to webp using ffmpeg ────────────────────────
async function imageToWebp(inputBuffer, ffmpegBinary) {
  const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const inputPath = path.join(os.tmpdir(), `sticker_in_${id}`);
  const outputPath = path.join(os.tmpdir(), `sticker_out_${id}.webp`);
  fs.writeFileSync(inputPath, inputBuffer);
  try {
    await execFileAsync(ffmpegBinary, [
      '-y', '-i', inputPath,
      '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000',
      '-vcodec', 'libwebp',
      '-lossless', '0',
      '-compression_level', '6',
      '-q:v', '85',
      '-loop', '0',
      '-preset', 'default',
      '-an', '-vsync', '0',
      outputPath
    ], { maxBuffer: 20 * 1024 * 1024 });
    if (!fs.existsSync(outputPath)) throw new Error('FFmpeg did not create output webp');
    return fs.readFileSync(outputPath);
  } finally {
    deleteTempFile(inputPath);
    deleteTempFile(outputPath);
  }
}

// ── Convert video to mp4 using ffmpeg ─────────────────────────
async function prepareVideo(inputBuffer, outputPath, ffmpegBinary, isLargeFile) {
  const inputPath = path.join(os.tmpdir(), `sticker_vid_in_${Date.now()}.input`);
  fs.writeFileSync(inputPath, inputBuffer);
  const duration = isLargeFile ? '2' : '3';
  const fps = isLargeFile ? '8' : '12';
  const crf = isLargeFile ? '32' : '28';
  try {
    await execFileAsync(ffmpegBinary, [
      '-y', '-i', inputPath,
      '-t', duration,
      '-vf', `crop=min(iw\\,ih):min(iw\\,ih),scale=512:512,fps=${fps}`,
      '-an', '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-crf', crf,
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      outputPath
    ], { maxBuffer: 20 * 1024 * 1024 });
    if (!fs.existsSync(outputPath)) throw new Error('FFmpeg did not create processed video');
    if (fs.statSync(outputPath).size === 0) throw new Error('FFmpeg created empty video');
    return fs.readFileSync(outputPath);
  } catch (error) {
    throw new Error(`Video preprocessing failed:\n${error.stderr || error.message}`);
  } finally {
    deleteTempFile(inputPath);
  }
}

module.exports = [
  {
    command: ['sticker'],
    aliases: ['s', 'stiker'],
    description: 'Convert an image, video, or gif into a WhatsApp sticker',
    usage: '.sticker reply to image/video [packname|author]',
    category: 'general',

    handler: async (client, m, { reply, args = [], msgR }) => {
      const tempFiles = [];
      try {
        let mediaInfo = findMedia(msgR);
        if (!mediaInfo) mediaInfo = findMedia(m.message);
        if (!mediaInfo) return reply('🖼️ Reply to an image, video, or gif to turn it into a sticker.');

        const { type: mediaType, media } = mediaInfo;
        if (!media) return reply('❌ The quoted message does not contain usable media.');

        const mediaBuffer = await client.downloadMediaMessage({ ...media, mtype: mediaType });
        if (!mediaBuffer || !Buffer.isBuffer(mediaBuffer) || mediaBuffer.length === 0) return reply('❌ Failed to download the quoted media.');
        if (mediaBuffer.length > MAX_FILE_SIZE) return reply(`❌ File too large: ${(mediaBuffer.length / 1024 / 1024).toFixed(2)}MB. Max: 50MB.`);

        const metadata = getStickerMetadata(args);
        const mimetype = String(media.mimetype || '').toLowerCase();
        const isVideo = mediaType === 'videoMessage' || mimetype.startsWith('video/');
        const ffmpegBinary = resolveFfmpegPath();

        console.log('Sticker media:', mediaType, '| FFmpeg:', ffmpegBinary);

        let stickerBuffer;

        if (isVideo) {
          // VIDEO — ffmpeg → mp4 → wa-sticker-formatter
          const videoOutputPath = path.join(os.tmpdir(), `sticker_vid_out_${Date.now()}.mp4`);
          tempFiles.push(videoOutputPath);
          const isLargeFile = mediaBuffer.length / 1024 > 5000;
          configureStickerFfmpeg(ffmpegBinary);
          const preparedVideo = await prepareVideo(mediaBuffer, videoOutputPath, ffmpegBinary, isLargeFile);
          const sticker = new Sticker(preparedVideo, {
            pack: metadata.pack,
            author: metadata.author,
            type: StickerTypes.FULL,
            quality: isLargeFile ? 35 : 50,
            background: 'transparent'
          });
          stickerBuffer = await sticker.toBuffer();
        } else {
          // IMAGE / GIF / STICKER — ffmpeg converts to webp directly
          const webpBuffer = await imageToWebp(mediaBuffer, ffmpegBinary);
          const sticker = new Sticker(webpBuffer, {
            pack: metadata.pack,
            author: metadata.author,
            type: StickerTypes.DEFAULT,
            quality: 85,
            background: 'transparent'
          });
          stickerBuffer = await sticker.toBuffer();
        }

        if (!stickerBuffer || !Buffer.isBuffer(stickerBuffer) || stickerBuffer.length === 0) throw new Error('Sticker output was empty');
        if (stickerBuffer.length > 1024 * 1024) return reply(`❌ Sticker too large: ${(stickerBuffer.length / 1024 / 1024).toFixed(2)}MB. Try a shorter video or smaller image.`);

        await client.sendMessage(m.chat, { sticker: stickerBuffer }, { quoted: m });

      } catch (error) {
        console.error('Sticker error:', error);
        await reply(`❌ Sticker conversion failed:\n${(error?.message || String(error)).split('\n')[0]}`);
      } finally {
        tempFiles.forEach(deleteTempFile);
      }
    }
  }
];
