'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { exec, execSync } = require('child_process');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const webp = require('node-webpmux');

const {
  packname: configuredPackname,
  author: configuredAuthor
} = require('../set.js');

const MAX_FILE_SIZE = 50 * 1024 * 1024;

/*
 * FFmpeg resolver
 */
const CANDIDATES = [
  (() => {
    try {
      return execSync('which ffmpeg', {
        encoding: 'utf8'
      }).trim();
    } catch {
      return null;
    }
  })(),

  '/usr/bin/ffmpeg',
  '/usr/local/bin/ffmpeg',

  path.join(
    __dirname,
    '..',
    'data',
    'ffmpeg',
    'ffmpeg'
  ),

  (() => {
    try {
      const binary = require('ffmpeg-static');
      return binary && fs.existsSync(binary)
        ? binary
        : null;
    } catch {
      return null;
    }
  })()
];

let cachedFfmpeg = null;

function resolveFfmpegPath() {
  if (cachedFfmpeg) {
    if (
      cachedFfmpeg !== 'ffmpeg' &&
      fs.existsSync(cachedFfmpeg)
    ) {
      return cachedFfmpeg;
    }

    cachedFfmpeg = null;
  }

  cachedFfmpeg =
    CANDIDATES.find(
      file =>
        file &&
        file !== 'ffmpeg' &&
        fs.existsSync(file)
    ) || 'ffmpeg';

  return cachedFfmpeg;
}

function deleteTempFile(file) {
  try {
    if (file && fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
  } catch {}
}

function getQuotedMessage(message) {
  return (
    message.message?.extendedTextMessage?.contextInfo
      ?.quotedMessage ||
    message.message?.buttonsResponseMessage?.contextInfo
      ?.quotedMessage ||
    message.message?.listResponseMessage?.contextInfo
      ?.quotedMessage ||
    null
  );
}

function resolveMedia(message) {
  const messageType = Object.keys(
    message.message || {}
  )[0];

  if (
    messageType === 'imageMessage' ||
    messageType === 'stickerMessage' ||
    messageType === 'videoMessage' ||
    messageType === 'documentMessage'
  ) {
    return {
      type: messageType,
      media: message.message[messageType]
    };
  }

  const quoted = getQuotedMessage(message);

  if (!quoted) {
    return null;
  }

  const quotedType = Object.keys(quoted || {})[0];

  if (
    quotedType === 'imageMessage' ||
    quotedType === 'stickerMessage' ||
    quotedType === 'videoMessage' ||
    quotedType === 'documentMessage'
  ) {
    return {
      type: quotedType,
      media: quoted[quotedType]
    };
  }

  return null;
}

module.exports = [
  {
    command: ['sticker'],
    aliases: ['s', 'stiker'],
    description:
      'Convert image/video/gif to a perfect square sticker',
    usage:
      '.sticker (reply to image/video/gif) [packname|author]',
    category: 'general',

    handler: async (
      client,
      m,
      {
        reply,
        args = {}
      }
    ) => {
      const tmpDir = os.tmpdir();

      const uniqueId = `${Date.now()}_${Math.random()
        .toString(36)
        .slice(2)}`;

      const tempInput = path.join(
        tmpDir,
        `black_sticker_${uniqueId}.input`
      );

      const tempOutput = path.join(
        tmpDir,
        `black_sticker_${uniqueId}.webp`
      );

      const tempFiles = [
        tempInput,
        tempOutput
      ];

      try {
        const messageToQuote = m;
        let targetMessage = m;

        const quotedInfo =
          m.message?.extendedTextMessage
            ?.contextInfo;

        if (quotedInfo?.quotedMessage) {
          targetMessage = {
            key: {
              remoteJid: m.chat,
              id: quotedInfo.stanzaId,
              participant: quotedInfo.participant
            },
            message: quotedInfo.quotedMessage
          };
        }

        const mediaInfo = resolveMedia(targetMessage);

        if (!mediaInfo) {
          return reply(
            '🖼️ Reply to an image, video, or gif that you want to turn into a sticker.'
          );
        }

        const {
          type,
          media
        } = mediaInfo;

        if (!media) {
          return reply(
            '🖼️ Please reply to an image/video/gif with .sticker, or send one with .sticker as the caption.'
          );
        }

        const mediaBuffer =
          await downloadMediaMessage(
            targetMessage,
            'buffer',
            {},
            {
              logger: undefined,
              reuploadRequest:
                client.updateMediaMessage
            }
          );

        if (!mediaBuffer) {
          return reply(
            '❌ Failed to download media. Please try again.'
          );
        }

        if (mediaBuffer.length > MAX_FILE_SIZE) {
          return reply(
            `❌ File too large: ${(mediaBuffer.length / 1024 / 1024).toFixed(2)}MB. Max: 50MB.`
          );
        }

        fs.writeFileSync(
          tempInput,
          mediaBuffer
        );

        const isAnimated =
          media.mimetype?.includes('gif') ||
          media.mimetype?.includes('video') ||
          media.seconds > 0 ||
          type === 'videoMessage';

        const fileSizeKB =
          mediaBuffer.length / 1024;

        const isLargeFile =
          fileSizeKB > 5000;

        let ffmpegCommand;

        if (isAnimated) {
          if (isLargeFile) {
            ffmpegCommand =
              `"${resolveFfmpegPath()}" ` +
              `-i "${tempInput}" ` +
              `-t 2 ` +
              `-vf "crop=min(iw\\,ih):min(iw\\,ih),scale=512:512,fps=8" ` +
              `-c:v libwebp ` +
              `-preset default ` +
              `-loop 0 ` +
              `-vsync 0 ` +
              `-pix_fmt yuva420p ` +
              `-quality 30 ` +
              `-compression_level 6 ` +
              `-b:v 100k ` +
              `-max_muxing_queue_size 1024 ` +
              `"${tempOutput}"`;
          } else {
            ffmpegCommand =
              `"${resolveFfmpegPath()}" ` +
              `-i "${tempInput}" ` +
              `-t 3 ` +
              `-vf "crop=min(iw\\,ih):min(iw\\,ih),scale=512:512,fps=12" ` +
              `-c:v libwebp ` +
              `-preset default ` +
              `-loop 0 ` +
              `-vsync 0 ` +
              `-pix_fmt yuva420p ` +
              `-quality 50 ` +
              `-compression_level 6 ` +
              `-b:v 150k ` +
              `-max_muxing_queue_size 1024 ` +
              `"${tempOutput}"`;
          }
        } else {
          ffmpegCommand =
            `"${resolveFfmpegPath()}" ` +
            `-i "${tempInput}" ` +
            `-vf "crop=min(iw\\,ih):min(iw\\,ih),scale=512:512,format=rgba" ` +
            `-c:v libwebp ` +
            `-preset default ` +
            `-loop 0 ` +
            `-vsync 0 ` +
            `-pix_fmt yuva420p ` +
            `-quality 75 ` +
            `-compression_level 6 ` +
            `"${tempOutput}"`;
        }

        await new Promise((resolve, reject) => {
          exec(
            ffmpegCommand,
            (error, stdout, stderr) => {
              if (error) {
                console.error(
                  'FFmpeg error:',
                  error
                );

                console.error(
                  'FFmpeg stderr:',
                  stderr
                );

                return reject(error);
              }

              console.log(
                'FFmpeg stdout:',
                stdout
              );

              resolve();
            }
          );
        });

        if (
          !fs.existsSync(tempOutput)
        ) {
          throw new Error(
            'FFmpeg failed to create output file'
          );
        }

        const outputStats =
          fs.statSync(tempOutput);

        if (outputStats.size === 0) {
          throw new Error(
            'FFmpeg created empty output file'
          );
        }

        const webpBuffer =
          fs.readFileSync(tempOutput);

        const finalSizeKB =
          webpBuffer.length / 1024;

        console.log(
          `Final sticker size: ${Math.round(finalSizeKB)} KB`
        );

        if (finalSizeKB > 1000) {
          console.log(
            `Warning: Sticker size is ${Math.round(finalSizeKB)} KB`
          );
        }

        const img = new webp.Image();

        await img.load(webpBuffer);

        const input = Array.isArray(args)
          ? args.join(' ').trim()
          : '';

        const [
          packArg,
          authorArg
        ] = input
          ? input
              .split('|')
              .map(value => value.trim())
          : [];

        const metadata = {
          'sticker-pack-id':
            crypto.randomBytes(32).toString('hex'),

          'sticker-pack-name':
            packArg ||
            configuredPackname ||
            'supreme',

          'sticker-pack-publisher':
            authorArg ||
            configuredAuthor ||
            '',

          emojis: ['🖼️']
        };

        const exifAttr = Buffer.from([
          0x49, 0x49, 0x2A, 0x00,
          0x08, 0x00, 0x00, 0x00,
          0x01, 0x00, 0x41, 0x57,
          0x07, 0x00, 0x00, 0x00,
          0x00, 0x00, 0x16, 0x00,
          0x00, 0x00
        ]);

        const jsonBuffer = Buffer.from(
          JSON.stringify(metadata),
          'utf8'
        );

        const exif = Buffer.concat([
          exifAttr,
          jsonBuffer
        ]);

        exif.writeUIntLE(
          jsonBuffer.length,
          14,
          4
        );

        img.exif = exif;

        const finalBuffer =
          await img.save(null);

        await client.sendMessage(
          m.chat,
          {
            sticker: finalBuffer
          },
          {
            quoted: messageToQuote
          }
        );
      } catch (error) {
        console.error(
          'Sticker command error:',
          error
        );

        await reply(
          '❌ Failed to create sticker! Try with an image, video, or gif.'
        );
      } finally {
        tempFiles.forEach(deleteTempFile);
      }
    }
  }
];
