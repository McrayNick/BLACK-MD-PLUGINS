'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execSync, execFile } = require('child_process');
const { promisify } = require('util');

const sharp = require('sharp');
const {
  Sticker,
  StickerTypes
} = require('wa-sticker-formatter');

const {
  packname,
  author
} = require('../set.js');

const execFileAsync = promisify(execFile);

const MAX_FILE_SIZE = 50 * 1024 * 1024;

/*
 * Locate FFmpeg.
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
 * Configure wa-sticker-formatter to use the same FFmpeg binary.
 */
function configureStickerFfmpeg(binary) {
  try {
    const fluentFfmpeg = require('fluent-ffmpeg');
    fluentFfmpeg.setFfmpegPath(binary);
  } catch (error) {
    console.warn(
      'Could not configure fluent-ffmpeg:',
      error.message
    );
  }
}

/*
 * Safely remove temporary files.
 */
function deleteTempFile(file) {
  try {
    if (file && fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
  } catch (error) {
    console.error(
      'Temporary file cleanup failed:',
      error.message
    );
  }
}

/*
 * Unwrap WhatsApp message wrappers.
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
 * Detect media from a raw WhatsApp message.
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
 * Parse .sticker packname|author
 */
function getStickerMetadata(args) {
  const input = Array.isArray(args)
    ? args.join(' ').trim()
    : '';

  const [packArg, authorArg] = input
    ? input
        .split('|')
        .map(value => value.trim())
    : [];

  return {
    pack:
      packArg ||
      configuredPackname ||
      'supreme',

    author:
      authorArg ||
      configuredAuthor ||
      'BLACK-MD'
  };
}

/*
 * Process a video with FFmpeg.

 * Important:
 * This does NOT use libwebp because the server FFmpeg
 * build does not contain that encoder.
 */
async function prepareVideo(
  inputBuffer,
  outputPath,
  ffmpegBinary,
  isLargeFile
) {
  const inputPath = path.join(
    os.tmpdir(),
    `black_sticker_input_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2)}.input`
  );

  fs.writeFileSync(
    inputPath,
    inputBuffer
  );

  const duration = isLargeFile ? '2' : '3';
  const fps = isLargeFile ? '8' : '12';
  const crf = isLargeFile ? '32' : '28';

  const ffmpegArgs = [
    '-y',
    '-i',
    inputPath,
    '-t',
    duration,
    '-vf',
    `crop=min(iw\\,ih):min(iw\\,ih),scale=512:512,fps=${fps}`,
    '-an',
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-crf',
    crf,
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    outputPath
  ];

  try {
    const result = await execFileAsync(
      ffmpegBinary,
      ffmpegArgs,
      {
        maxBuffer: 20 * 1024 * 1024
      }
    );

    if (result.stderr) {
      console.log(
        'FFmpeg video processing:',
        result.stderr
      );
    }

    if (!fs.existsSync(outputPath)) {
      throw new Error(
        'FFmpeg did not create the processed video'
      );
    }

    const stats =
      fs.statSync(outputPath);

    if (stats.size === 0) {
      throw new Error(
        'FFmpeg created an empty processed video'
      );
    }

    return fs.readFileSync(outputPath);
  } catch (error) {
    const details =
      error.stderr ||
      error.message ||
      String(error);

    throw new Error(
      `Video preprocessing failed:\n${details}`
    );
  } finally {
    deleteTempFile(inputPath);
  }
}

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
      const tempFiles = [];

      try {
        /*
         * First check the message being replied to.
         */
        let mediaInfo = findMedia(msgR);

        /*
         * Also support:
         * .s sent as a caption on an image/video.
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
            '❌ The quoted message does not contain usable media.'
          );
        }

        /*
         * Use BLACK-MD's existing media downloader.
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

        const metadata =
          getStickerMetadata(args);

        const mimetype =
          String(media.mimetype || '')
            .toLowerCase();

        const isVideo =
          mediaType === 'videoMessage' ||
          mimetype.startsWith('video/');

        const isGif =
          mimetype.includes('gif');

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

        let stickerBuffer;

        /*
         * VIDEO
         *
         * FFmpeg creates square MP4 using libx264.
         * wa-sticker-formatter then converts it into
         * animated WebP using Sharp.
         */
        if (isVideo) {
          const videoOutputPath = path.join(
            os.tmpdir(),
            `black_sticker_video_${Date.now()}_${Math.random()
              .toString(36)
              .slice(2)}.mp4`
          );

          tempFiles.push(videoOutputPath);

          const isLargeFile =
            mediaBuffer.length / 1024 > 5000;

          configureStickerFfmpeg(
            ffmpegBinary
          );

          const preparedVideo =
            await prepareVideo(
              mediaBuffer,
              videoOutputPath,
              ffmpegBinary,
              isLargeFile
            );

          const sticker =
            new Sticker(preparedVideo, {
              pack: metadata.pack,
              author: metadata.author,
              type: StickerTypes.FULL,
              quality: isLargeFile ? 35 : 50,
              background: 'transparent'
            });

          stickerBuffer =
            await sticker.toBuffer();
        }

        /*
         * GIF
         *
         * Do not send GIF through FFmpeg's
         * libwebp encoder. Sharp handles the GIF.
         */
        else if (isGif) {
          const sticker =
            new Sticker(mediaBuffer, {
              pack: metadata.pack,
              author: metadata.author,
              type: StickerTypes.FULL,
              quality: 75,
              background: 'transparent'
            });

          stickerBuffer =
            await sticker.toBuffer();
        }

        /*
         * IMAGE OR EXISTING STICKER
         *
         * Sharp crops the image to a 512x512 square.
         */
        else {
          const squareImage =
            await sharp(mediaBuffer)
              .resize(512, 512, {
                fit: 'cover',
                position: 'centre'
              })
              .webp({
                quality: 85
              })
              .toBuffer();

          const sticker =
            new Sticker(squareImage, {
              pack: metadata.pack,
              author: metadata.author,
              type: StickerTypes.DEFAULT,
              quality: 85,
              background: 'transparent'
            });

          stickerBuffer =
            await sticker.toBuffer();
        }

        if (
          !stickerBuffer ||
          !Buffer.isBuffer(stickerBuffer) ||
          stickerBuffer.length === 0
        ) {
          throw new Error(
            'Sticker output was empty'
          );
        }

        if (stickerBuffer.length > 1024 * 1024) {
          return reply(
            `❌ Sticker is too large: ${(stickerBuffer.length / 1024 / 1024).toFixed(2)}MB. Try a shorter video or smaller image.`
          );
        }

        await client.sendMessage(
          m.chat,
          {
            sticker: stickerBuffer
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

        const message =
          error?.message ||
          String(error);

        await reply(
          `❌ Sticker conversion failed:\n${message.split('\n')[0]}`
        );
      } finally {
        tempFiles.forEach(deleteTempFile);
      }
    }
  }
];
