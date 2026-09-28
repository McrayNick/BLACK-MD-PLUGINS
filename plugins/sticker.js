'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { exec, execSync } = require('child_process');
const webp = require('node-webpmux');

const {
  packname: configuredPackname,
  author: configuredAuthor
} = require('../set.js');

const MAX_FILE_SIZE = 50 * 1024 * 1024;

/*
 * FFmpeg path resolver
 */
const FFMPEG_CANDIDATES = [
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

let cachedFfmpegPath = null;

function resolveFfmpegPath() {
  if (
    cachedFfmpegPath &&
    cachedFfmpegPath !== 'ffmpeg' &&
    fs.existsSync(cachedFfmpegPath)
  ) {
    return cachedFfmpegPath;
  }

  cachedFfmpegPath =
    FFMPEG_CANDIDATES.find(
      file =>
        file &&
        file !== 'ffmpeg' &&
        fs.existsSync(file)
    ) || 'ffmpeg';

  return cachedFfmpegPath;
}

/*
 * Delete temporary files safely
 */
function deleteTempFile(file) {
  try {
    if (file && fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
  } catch (error) {
    console.error(
      'Could not delete temporary file:',
      file,
      error.message
    );
  }
}

/*
 * Unwrap WhatsApp message wrappers
 */
function unwrapMessage(message) {
  let current = message;

  for (let i = 0; i < 5 && current; i++) {
    if (current.ephemeralMessage?.message) {
      current = current.ephemeralMessage.message;
      continue;
    }

    if (current.viewOnceMessage?.message) {
      current = current.viewOnceMessage.message;
      continue;
    }

    if (current.viewOnceMessageV2?.message) {
      current = current.viewOnceMessageV2.message;
      continue;
    }

    if (current.viewOnceMessageV2Extension?.message) {
      current = current.viewOnceMessageV2Extension.message;
      continue;
    }

    break;
  }

  return current || {};
}

/*
 * Find media inside a WhatsApp message
 */
function findMedia(message) {
  const unwrapped = unwrapMessage(message);

  const mediaTypes = [
    'imageMessage',
    'videoMessage',
    'stickerMessage',
    'documentMessage'
  ];

  for (const type of mediaTypes) {
    if (unwrapped[type]) {
      return {
        type,
        media: unwrapped[type]
      };
    }
  }

  return null;
}

/*
 * Sticker plugin
 */
module.exports = [
  {
    command: ['sticker'],
    aliases: ['s', 'stiker'],
    description:
      'Convert an image, video, or gif into a WhatsApp sticker',
    usage:
      '.sticker reply to image/video [packname|author]',
    category: 'general',

    handler: async (
      client,
      m,
      {
        reply,
        args = [],
        msgR
      }
    ) => {
      const uniqueId =
        `${Date.now()}_${Math.random()
          .toString(36)
          .slice(2)}`;

      const tempInput = path.join(
        os.tmpdir(),
        `black_sticker_${uniqueId}.input`
      );

      const tempOutput = path.join(
        os.tmpdir(),
        `black_sticker_${uniqueId}.webp`
      );

      const tempFiles = [
        tempInput,
        tempOutput
      ];

      try {
        /*
         * First check the quoted message.
         * msgR is the raw quoted WhatsApp message
         * provided by BLACK-MD.
         */
        let mediaInfo = findMedia(msgR);

        /*
         * Also support sending an image/video directly
         * with .sticker as its caption.
         */
        if (!mediaInfo) {
          mediaInfo = findMedia(m.message);
        }

        if (!mediaInfo) {
          return reply(
            '🖼️ Reply to an image, video, or gif that you want to turn into a sticker.'
          );
        }

        const {
          type: mediaType,
          media
        } = mediaInfo;

        if (!media) {
          return reply(
            '🖼️ The quoted message does not contain usable media.'
          );
        }

        /*
         * Your bot already has its own media downloader.
         * It expects the media object itself to contain mtype.
         */
        const downloadableMedia = {
          ...media,
          mtype: mediaType
        };

        const mediaBuffer =
          await client.downloadMediaMessage(
            downloadableMedia
          );

        if (
          !mediaBuffer ||
          !Buffer.isBuffer(mediaBuffer) ||
          mediaBuffer.length === 0
        ) {
          return reply(
            '❌ Failed to download the quoted media.'
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
          mediaType === 'videoMessage' ||
          media.mimetype?.includes('video') ||
          media.mimetype?.includes('gif') ||
          Number(media.seconds || 0) > 0;

        const fileSizeKB =
          mediaBuffer.length / 1024;

        const isLargeFile =
          fileSizeKB > 5000;

        const ffmpegBinary =
          resolveFfmpegPath();

        console.log(
          'Sticker media detected:',
          mediaType
        );

        console.log(
          'Using FFmpeg:',
          ffmpegBinary
        );

        let ffmpegCommand;

        if (isAnimated) {
          if (isLargeFile) {
            ffmpegCommand =
              `"${ffmpegBinary}" ` +
              `-y ` +
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
              `"${ffmpegBinary}" ` +
              `-y ` +
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
            `"${ffmpegBinary}" ` +
            `-y ` +
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
            {
              maxBuffer: 10 * 1024 * 1024
            },
            (error, stdout, stderr) => {
              if (stdout) {
                console.log(
                  'FFmpeg output:',
                  stdout
                );
              }

              if (stderr) {
                console.log(
                  'FFmpeg log:',
                  stderr
                );
              }

              if (error) {
                return reject(
                  new Error(
                    `FFmpeg failed: ${error.message}\n${stderr || ''}`
                  )
                );
              }

              resolve();
            }
          );
        });

        if (
          !fs.existsSync(tempOutput)
        ) {
          throw new Error(
            'FFmpeg did not create the sticker output file'
          );
        }

        const outputStats =
          fs.statSync(tempOutput);

        if (outputStats.size === 0) {
          throw new Error(
            'FFmpeg created an empty sticker file'
          );
        }

        const webpBuffer =
          fs.readFileSync(tempOutput);

        console.log(
          `Sticker created: ${Math.round(webpBuffer.length / 1024)} KB`
        );

        /*
         * Add WhatsApp sticker metadata
         */
        const image = new webp.Image();

        await image.load(webpBuffer);

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

        const exifHeader = Buffer.from([
          0x49, 0x49, 0x2A, 0x00,
          0x08, 0x00, 0x00, 0x00,
          0x01, 0x00, 0x41, 0x57,
          0x07, 0x00, 0x00, 0x00,
          0x00, 0x00, 0x16, 0x00,
          0x00, 0x00
        ]);

        const metadataBuffer =
          Buffer.from(
            JSON.stringify(metadata),
            'utf8'
          );

        const exif = Buffer.concat([
          exifHeader,
          metadataBuffer
        ]);

        exif.writeUIntLE(
          metadataBuffer.length,
          14,
          4
        );

        image.exif = exif;

        const finalSticker =
          await image.save(null);

        await client.sendMessage(
          m.chat,
          {
            sticker: finalSticker
          },
          {
            quoted: m
          }
        );
      } catch (error) {
        console.error(
          'Sticker command actual error:',
          error
        );

        await reply(
          `❌ Sticker conversion failed:\n${error.message || error}`
        );
      } finally {
        tempFiles.forEach(deleteTempFile);
      }
    }
  }
];
